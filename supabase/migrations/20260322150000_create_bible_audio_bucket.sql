-- Create Supabase Storage bucket for self-hosted Bible audio files
-- Audio files are stored at: bible-audio/{translationId}/{bookId}/{chapter}.mp3
-- Example: bible-audio/bsb/GEN/1.mp3

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bible-audio',
  'bible-audio',
  true,  -- Public so app can download without auth
  52428800,  -- 50 MB per file limit
  array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav']
)
on conflict (id) do nothing;

-- Anyone can read (download) audio files
create policy "Public read access for Bible audio"
  on storage.objects for select
  using (bucket_id = 'bible-audio');

-- Only service role can upload (admin uploads via script)
create policy "Service role upload for Bible audio"
  on storage.objects for insert
  with check (bucket_id = 'bible-audio' and auth.role() = 'service_role');

create policy "Service role delete for Bible audio"
  on storage.objects for delete
  using (bucket_id = 'bible-audio' and auth.role() = 'service_role');
