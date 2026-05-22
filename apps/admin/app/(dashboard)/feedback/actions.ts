'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAdminIdentity } from '@/lib/admin-auth';
import { writeAdminAuditLog } from '@/lib/audit-log';
import { normalizeOptionalString } from '@/lib/format';
import { createAdminServiceClient } from '@/lib/supabase/service';

function normalizeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/feedback')) {
    return '/feedback';
  }

  return value;
}

export async function markChapterFeedbackScriptureCouncilFixedAction(formData: FormData) {
  const admin = await requireAdminIdentity();
  const feedbackId = normalizeOptionalString(formData.get('feedbackId'));
  const returnTo = normalizeReturnTo(normalizeOptionalString(formData.get('returnTo')));
  const note = normalizeOptionalString(formData.get('note'));

  if (!feedbackId) {
    redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}error=Missing feedback id`);
  }

  const service = createAdminServiceClient();
  const fixedAt = new Date().toISOString();
  const { data, error } = await service
    .from('chapter_feedback_submissions')
    .update({
      scripture_council_fixed_at: fixedAt,
      scripture_council_fixed_by: admin.id,
      scripture_council_fixed_note: note,
    })
    .eq('id', feedbackId)
    .eq('sentiment', 'down')
    .select('id, translation_id, book_id, chapter')
    .single<{ id: string; translation_id: string; book_id: string; chapter: number }>();

  if (error || !data) {
    redirect(
      `${returnTo}${returnTo.includes('?') ? '&' : '?'}error=${encodeURIComponent(
        error?.message ?? 'Unable to mark feedback fixed'
      )}`
    );
  }

  await writeAdminAuditLog({
    action: 'chapter_feedback.scripture_council_fix.mark_fixed',
    actorEmail: admin.email,
    actorUserId: admin.id,
    entityId: data.id,
    entityType: 'chapter_feedback_submission',
    metadata: {
      bookId: data.book_id,
      chapter: data.chapter,
      fixedAt,
      note,
      translationId: data.translation_id,
    },
    summary: `Marked Scripture Council feedback fixed for ${data.translation_id} ${data.book_id} ${data.chapter}.`,
  });

  revalidatePath('/feedback');
  redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}notice=Feedback marked fixed`);
}
