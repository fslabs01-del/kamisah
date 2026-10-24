-- Jalankan sekali di Supabase SQL Editor.
-- Bucket video-references harus sudah ada dan disetel PUBLIC agar provider video dapat membaca URL referensi.
-- Batasi unggahan hanya ke folder user ID yang sedang login.
insert into storage.buckets (id, name, public)
values ('video-references', 'video-references', true)
on conflict (id) do update set public = true;

drop policy if exists "Kamisah users upload own references" on storage.objects;
create policy "Kamisah users upload own references"
on storage.objects for insert to authenticated
with check (bucket_id = 'video-references' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Kamisah users read own references" on storage.objects;
create policy "Kamisah users read own references"
on storage.objects for select to authenticated
using (bucket_id = 'video-references' and (storage.foldername(name))[1] = auth.uid()::text);
