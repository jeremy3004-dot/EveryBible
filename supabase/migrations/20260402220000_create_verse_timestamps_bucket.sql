-- Create Supabase Storage bucket for verse timestamp JSON files.
-- Timestamp files are stored at: verse-timestamps/{translationId}/{bookId}/{chapter}.json
-- Example: verse-timestamps/npiulb/JHN/3.json

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verse-timestamps',
  'verse-timestamps',
  true,
  1048576,
  array['application/json']
)
on conflict (id) do nothing;

drop policy if exists "Public read access for verse timestamps" on storage.objects;
create policy "Public read access for verse timestamps"
  on storage.objects for select
  using (bucket_id = 'verse-timestamps');

drop policy if exists "Service role upload for verse timestamps" on storage.objects;
create policy "Service role upload for verse timestamps"
  on storage.objects for insert
  with check (bucket_id = 'verse-timestamps' and auth.role() = 'service_role');

drop policy if exists "Service role delete for verse timestamps" on storage.objects;
create policy "Service role delete for verse timestamps"
  on storage.objects for delete
  using (bucket_id = 'verse-timestamps' and auth.role() = 'service_role');
