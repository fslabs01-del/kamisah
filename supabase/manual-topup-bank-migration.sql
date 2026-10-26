-- Kamisah AI: permintaan top-up manual melalui transfer Bank Mandiri
-- Jalankan satu kali di Supabase SQL Editor sebelum mengaktifkan formulir unggah bukti.

create table if not exists public.manual_topup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credits integer not null check (credits >= 10 and credits <= 100000),
  amount_idr integer not null check (amount_idr = credits * 1000),
  note text not null default '' check (char_length(note) <= 300),
  proof_path text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  admin_note text
);

alter table public.manual_topup_requests enable row level security;

drop policy if exists "Users can submit own manual topup" on public.manual_topup_requests;
create policy "Users can submit own manual topup"
  on public.manual_topup_requests
  for insert to authenticated
  with check (auth.uid() = user_id and status = 'pending');

drop policy if exists "Users can view own manual topup" on public.manual_topup_requests;
create policy "Users can view own manual topup"
  on public.manual_topup_requests
  for select to authenticated
  using (auth.uid() = user_id);

-- Tidak ada kebijakan UPDATE/DELETE untuk pengguna.
-- Persetujuan dan penambahan kredit harus dilakukan admin melalui lingkungan tepercaya.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'manual-topup-proofs',
  'manual-topup-proofs',
  false,
  2097152,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png'];

drop policy if exists "Users upload own manual topup proof" on storage.objects;
create policy "Users upload own manual topup proof"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'manual-topup-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users view own manual topup proof" on storage.objects;
create policy "Users view own manual topup proof"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'manual-topup-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users delete own manual topup proof" on storage.objects;
create policy "Users delete own manual topup proof"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'manual-topup-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
