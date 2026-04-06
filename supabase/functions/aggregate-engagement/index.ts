// Edge Function: aggregate-engagement
// Runs on a daily cron to refresh engagement summaries for active users.
// Can also be called manually for a specific user.
//
// Cron setup (via Supabase dashboard or CLI):
//   schedule: "0 2 * * *" (daily at 2 AM UTC)
//
// Manual invocation:
//   POST /functions/v1/aggregate-engagement
//   Body: { "user_id": "optional-specific-user-uuid" }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Check if specific user requested
    let targetUserId: string | null = null;
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      targetUserId = body.user_id || null;
    }

    // Get users to refresh (active in last 30 days, or specific user)
    let userQuery = supabase
      .from('user_progress')
      .select('user_id');

    if (targetUserId) {
      userQuery = userQuery.eq('user_id', targetUserId);
    } else {
      // Only refresh users active in last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      userQuery = userQuery.gte('last_read_date', thirtyDaysAgo.toISOString().split('T')[0]);
    }

    const { data: users, error: usersError } = await userQuery;
    if (usersError) throw usersError;

    let refreshed = 0;
    let errors = 0;

    for (const user of users || []) {
      try {
        // Count chapters from user_progress
        const { data: progress } = await supabase
          .from('user_progress')
          .select('chapters_read, streak_days, last_read_date')
          .eq('user_id', user.user_id)
          .single();

        const chaptersRead = progress?.chapters_read
          ? Object.keys(progress.chapters_read).length
          : 0;

        // Count listening minutes from analytics_events
        const { data: listeningData } = await supabase
          .from('analytics_events')
          .select('event_properties')
          .eq('user_id', user.user_id)
          .eq('event_name', 'audio_completed');

        const listeningMinutes = (listeningData || []).reduce((sum, e) => {
          const duration = (e.event_properties as Record<string, number>)?.duration_ms || 0;
          return sum + duration / 60000;
        }, 0);

        // Count reading minutes from reading_ended events
        const { data: readingData } = await supabase
          .from('analytics_events')
          .select('event_properties')
          .eq('user_id', user.user_id)
          .eq('event_name', 'reading_ended');

        const readingMinutes = (readingData || []).reduce((sum, e) => {
          const duration = (e.event_properties as Record<string, number>)?.duration_seconds || 0;
          return sum + duration / 60;
        }, 0);

        // Count unique sessions
        const { count: sessionCount } = await supabase
          .from('analytics_events')
          .select('session_id', { count: 'exact', head: true })
          .eq('user_id', user.user_id)
          .not('session_id', 'is', null);

        // Count plans completed
        const { count: plansCompleted } = await supabase
          .from('user_reading_plan_progress')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.user_id)
          .eq('is_completed', true);

        // Count prayers submitted
        const { count: prayersSubmitted } = await supabase
          .from('prayer_requests')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.user_id);

        // Count annotations
        const { count: annotationsCreated } = await supabase
          .from('user_annotations')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.user_id)
          .is('deleted_at', null);

        // Compute engagement score (0-100)
        const readingScore = Math.min(35, Math.floor((chaptersRead / 100) * 35));
        const listeningScore = Math.min(25, Math.floor((listeningMinutes / 500) * 25));
        const streakScore = Math.min(20, Math.floor(((progress?.streak_days || 0) / 30) * 20));
        const planScore = Math.min(10, (plansCompleted || 0) * 5);
        const communityScore = Math.min(10, Math.floor(
          (((prayersSubmitted || 0) + (annotationsCreated || 0)) / 20) * 10
        ));
        const engagementScore = Math.min(100, readingScore + listeningScore + streakScore + planScore + communityScore);

        // Upsert engagement summary
        const { error: upsertError } = await supabase
          .from('user_engagement_summary')
          .upsert({
            user_id: user.user_id,
            total_chapters_read: chaptersRead,
            total_listening_minutes: Math.floor(listeningMinutes),
            total_reading_minutes: Math.floor(readingMinutes),
            total_sessions: sessionCount || 0,
            avg_session_minutes: 0, // simplified for now
            current_streak_days: progress?.streak_days || 0,
            longest_streak_days: progress?.streak_days || 0,
            last_active_date: progress?.last_read_date || null,
            engagement_score: engagementScore,
            plans_completed: plansCompleted || 0,
            prayers_submitted: prayersSubmitted || 0,
            annotations_created: annotationsCreated || 0,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });

        if (upsertError) {
          console.error(`Failed to refresh user ${user.user_id}:`, upsertError);
          errors++;
        } else {
          refreshed++;
        }
      } catch (userError) {
        console.error(`Error processing user ${user.user_id}:`, userError);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        refreshed,
        errors,
        total_users: users?.length || 0,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Aggregate engagement error:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
