-- ============================================================================
-- Storage bucket for invoice documents (PDF/JPG/PNG/TIF). Public read so the
-- in-browser PDF/image viewer can use a same-origin-style public URL; writes
-- restricted to authenticated users.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'invoice-documents', 'invoice-documents', true, 10485760,
  array['application/pdf','image/jpeg','image/png','image/tiff']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "invoice docs read" on storage.objects;
create policy "invoice docs read" on storage.objects
  for select to authenticated using (bucket_id = 'invoice-documents');

drop policy if exists "invoice docs insert" on storage.objects;
create policy "invoice docs insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'invoice-documents');

drop policy if exists "invoice docs update" on storage.objects;
create policy "invoice docs update" on storage.objects
  for update to authenticated using (bucket_id = 'invoice-documents');

drop policy if exists "invoice docs delete" on storage.objects;
create policy "invoice docs delete" on storage.objects
  for delete to authenticated using (bucket_id = 'invoice-documents');
