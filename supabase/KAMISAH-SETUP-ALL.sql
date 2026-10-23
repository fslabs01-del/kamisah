
-- Kamisah: public bucket for temporary AI reference media.
-- Uploads are performed server-side using SUPABASE_SERVICE_ROLE_KEY.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'video-references',
  'video-references',
  true,
  209715200,
  array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Authenticated users may upload only inside their own UUID folder.
-- The bucket is public so the video provider can fetch reference URLs; never store private media here.
drop policy if exists "Kamisah users upload own video references" on storage.objects;
create policy "Kamisah users upload own video references"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'video-references'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- KAMISAH: MIGRASI DATABASE LENGKAP
-- Jalankan hanya setelah memeriksa backup dan project Supabase yang benar.
-- Dibuat kompatibel secara aditif dengan tabel profiles/credit_transactions yang sudah dibuat.
-- Jalankan SEKALI melalui SQL Editor. Jika gagal di tengah, baca error sebelum mengulang.


-- ===== BAGIAN ASAL: schema.sql =====
-- Kamisah: jalankan SEKALI di Supabase > SQL Editor.
create table if not exists public.wallets (
  user_id uuid primary key references auth.users on delete cascade,
  balance int not null default 0 check (balance >= 0));
create table if not exists public.ledger (
  id bigserial primary key, user_id uuid not null references auth.users on delete cascade,
  delta int not null, reason text not null, ref text, created_at timestamptz not null default now());
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  provider_id text, model text not null, cost int not null,
  status text not null default 'processing', refunded boolean not null default false,
  created_at timestamptz not null default now());

-- Pengguna hanya boleh MEMBACA datanya sendiri. Tidak ada policy tulis: hanya server (service role) yang bisa mengubah saldo.
alter table public.wallets enable row level security;
alter table public.ledger  enable row level security;
alter table public.jobs    enable row level security;
drop policy if exists "wallet sendiri" on public.wallets;
create policy "wallet sendiri" on public.wallets for select using (auth.uid() = user_id);
drop policy if exists "ledger sendiri" on public.ledger;
create policy "ledger sendiri" on public.ledger  for select using (auth.uid() = user_id);
drop policy if exists "job sendiri" on public.jobs;
create policy "job sendiri"    on public.jobs    for select using (auth.uid() = user_id);


-- Perbaikan akses baca saldo: pengguna hanya dapat membaca dompet miliknya sendiri.
grant usage on schema public to authenticated;
grant select on public.wallets to authenticated;
grant select on public.ledger to authenticated;
grant select on public.jobs to authenticated;
drop policy if exists "wallet sendiri" on public.wallets;
create policy "wallet sendiri" on public.wallets for select to authenticated using (auth.uid() = user_id);
drop policy if exists "ledger sendiri" on public.ledger;
create policy "ledger sendiri" on public.ledger for select to authenticated using (auth.uid() = user_id);
drop policy if exists "job sendiri" on public.jobs;
create policy "job sendiri" on public.jobs for select to authenticated using (auth.uid() = user_id);

-- Dompet otomatis (saldo 0) untuk setiap pengguna baru
create or replace function public.new_wallet() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.wallets(user_id) values (new.id) on conflict do nothing; return new; end $$;
drop trigger if exists on_new_user on auth.users;
create trigger on_new_user after insert on auth.users for each row execute function public.new_wallet();
insert into public.wallets(user_id) select id from auth.users on conflict do nothing;

-- Potong kredit secara atomik + buat job
create or replace function public.charge_credits(p_user uuid, p_cost int, p_model text) returns uuid
language plpgsql security definer set search_path = public as $$
declare j uuid;
begin
  if p_cost <= 0 then raise exception 'BAD_COST'; end if;
  update wallets set balance = balance - p_cost where user_id = p_user and balance >= p_cost;
  if not found then raise exception 'INSUFFICIENT'; end if;
  insert into jobs(user_id, model, cost) values (p_user, p_model, p_cost) returning id into j;
  insert into ledger(user_id, delta, reason, ref) values (p_user, -p_cost, 'generate', j::text);
  return j;
end $$;

-- Kembalikan kredit jika job gagal (hanya sekali, hanya jika belum selesai)
create or replace function public.refund_job(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r jobs%rowtype;
begin
  update jobs set status = 'failed', refunded = true
   where id = p_job and refunded = false and status = 'processing' returning * into r;
  if found then
    update wallets set balance = balance + r.cost where user_id = r.user_id;
    insert into ledger(user_id, delta, reason, ref) values (r.user_id, r.cost, 'refund', p_job::text);
  end if;
end $$;

-- Tambah kredit (top-up manual sekarang; webhook pembayaran nanti)
create or replace function public.add_credits(p_user uuid, p_amount int, p_ref text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_amount <= 0 then raise exception 'BAD_AMOUNT'; end if;
  update wallets set balance = balance + p_amount where user_id = p_user;
  insert into ledger(user_id, delta, reason, ref) values (p_user, p_amount, 'topup', p_ref);
end $$;

-- Fungsi saldo HANYA boleh dipanggil server
revoke execute on function public.charge_credits(uuid,int,text) from public, anon, authenticated;
revoke execute on function public.refund_job(uuid)              from public, anon, authenticated;
revoke execute on function public.add_credits(uuid,int,text)    from public, anon, authenticated;
grant  execute on function public.charge_credits(uuid,int,text) to service_role;
grant  execute on function public.refund_job(uuid)              to service_role;
grant  execute on function public.add_credits(uuid,int,text)    to service_role;

-- Isi saldo manual untuk uji (ganti email dan jumlah):
-- select public.add_credits((select id from auth.users where email='emailmu@contoh.com'), 100, 'manual');


-- ===== BAGIAN ASAL: schema-2.sql =====
-- Kamisah tahap 2: jalankan SETELAH schema.sql (SQL Editor > Run).

-- 1) Aturan pendaftaran: blokir email sekali pakai + satu orang satu email (alias Gmail titik/+tag dianggap sama)
create table if not exists public.blocked_domains (domain text primary key);
insert into public.blocked_domains values ('mailinator.com'),('guerrillamail.com'),('10minutemail.com'),('tempmail.com'),
 ('temp-mail.org'),('yopmail.com'),('trashmail.com'),('sharklasers.com'),('getnada.com'),('dispostable.com'),
 ('maildrop.cc'),('throwawaymail.com'),('fakeinbox.com') on conflict do nothing;
create table if not exists public.account_keys (email_norm text primary key, user_id uuid not null);
alter table public.blocked_domains enable row level security;   -- tanpa policy: hanya server
alter table public.account_keys    enable row level security;

create or replace function public.guard_signup() returns trigger language plpgsql security definer set search_path = public as $$
declare l text; d text;
begin
  if new.email is null then return new; end if;
  l := lower(split_part(new.email,'@',1)); d := lower(split_part(new.email,'@',2));
  if exists (select 1 from blocked_domains where domain = d) then raise exception 'DISPOSABLE_EMAIL'; end if;
  if d in ('gmail.com','googlemail.com') then l := replace(split_part(l,'+',1),'.',''); d := 'gmail.com';
  else l := split_part(l,'+',1); end if;
  begin insert into account_keys(email_norm, user_id) values (l||'@'||d, new.id);
  exception when unique_violation then raise exception 'DUPLICATE_EMAIL'; end;
  return new;
end $$;
drop trigger if exists guard_signup_t on auth.users;
create trigger guard_signup_t after insert on auth.users for each row execute function public.guard_signup();

-- 2) Saklar verifikasi nomor HP (nyalakan setelah OTP HP terpasang: update settings set value='true' where key='require_phone';)
create table if not exists public.settings (key text primary key, value text not null);
insert into public.settings values ('require_phone','false') on conflict do nothing;
alter table public.settings enable row level security;

create or replace function public.charge_credits(p_user uuid, p_cost int, p_model text) returns uuid
language plpgsql security definer set search_path = public as $$
declare j uuid;
begin
  if p_cost <= 0 then raise exception 'BAD_COST'; end if;
  if (select value from settings where key='require_phone') = 'true'
     and not exists (select 1 from auth.users where id = p_user and phone_confirmed_at is not null)
  then raise exception 'PHONE_REQUIRED'; end if;
  update wallets set balance = balance - p_cost where user_id = p_user and balance >= p_cost;
  if not found then raise exception 'INSUFFICIENT'; end if;
  insert into jobs(user_id, model, cost) values (p_user, p_model, p_cost) returning id into j;
  insert into ledger(user_id, delta, reason, ref) values (p_user, -p_cost, 'generate', j::text);
  return j;
end $$;

-- 3) Top-up QRIS: kredit = nominal / 100, dihitung server; konfirmasi idempoten (satu pembayaran = satu kali kredit)
create table if not exists public.topups (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  amount_idr int not null check (amount_idr >= 10000), credits int not null,
  status text not null default 'pending', provider_ref text unique, qr_url text,
  expires_at timestamptz, created_at timestamptz not null default now(), paid_at timestamptz);
alter table public.topups enable row level security;
drop policy if exists "topup sendiri" on public.topups;
create policy "topup sendiri" on public.topups for select using (auth.uid() = user_id);

create or replace function public.confirm_topup(p_ref text, p_idr int) returns void
language plpgsql security definer set search_path = public as $$
declare t topups%rowtype;
begin
  update topups set status='paid', paid_at=now() where provider_ref=p_ref and status='pending' and amount_idr=p_idr returning * into t;
  if found then
    update wallets set balance = balance + t.credits where user_id = t.user_id;
    insert into ledger(user_id, delta, reason, ref) values (t.user_id, t.credits, 'topup', t.id::text);
  end if;
end $$;
revoke execute on function public.confirm_topup(text,int) from public, anon, authenticated;
grant  execute on function public.confirm_topup(text,int) to service_role;


-- ===== BAGIAN ASAL: schema-3.sql =====
-- Kamisah tahap 3: pembatas pemakaian per pengguna (jalankan setelah schema-2.sql).
create table if not exists public.usage_limits (
  user_id uuid not null, key text not null, window_start timestamptz not null, n int not null default 0,
  primary key (user_id, key, window_start));
alter table public.usage_limits enable row level security;   -- tanpa policy: hanya server

create or replace function public.hit_limit(p_user uuid, p_key text, p_max int, p_secs int) returns boolean
language plpgsql security definer set search_path = public as $$
declare w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_secs) * p_secs); c int;
begin
  insert into usage_limits(user_id, key, window_start, n) values (p_user, p_key, w, 1)
  on conflict (user_id, key, window_start) do update set n = usage_limits.n + 1 returning n into c;
  if random() < 0.02 then delete from usage_limits where window_start < now() - interval '1 day'; end if;
  return c <= p_max;
end $$;
revoke execute on function public.hit_limit(uuid,text,int,int) from public, anon, authenticated;
grant  execute on function public.hit_limit(uuid,text,int,int) to service_role;


-- ===== BAGIAN ASAL: schema-4.sql =====
-- Kamisah tahap 4: Chat AI (1 kredit/pesan), bonus 10 kredit setelah OTP HP, paket top-up Rp5.000. Jalankan setelah schema-3.sql.

-- Paket top-up mulai Rp5.000
alter table public.topups drop constraint if exists topups_amount_idr_check;
alter table public.topups add constraint topups_amount_idr_check check (amount_idr >= 5000);

-- Chat AI: potong 1 kredit per pesan, aman dari pemotongan ganda (msg_id unik)
create table if not exists public.chat_charges (msg_id uuid primary key, user_id uuid not null, created_at timestamptz not null default now());
alter table public.chat_charges enable row level security;

create or replace function public.charge_chat(p_user uuid, p_msg uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  insert into chat_charges(msg_id, user_id) values (p_msg, p_user) on conflict do nothing;
  if not found then
    -- Jangan memproses ulang ID pesan yang sama: respons tidak disimpan di server,
    -- jadi pengulangan gratis akan memungkinkan pemakaian AI tanpa batas.
    raise exception 'DUPLICATE';
  end if;
  update wallets set balance = balance - 1 where user_id = p_user and balance >= 1;
  if not found then raise exception 'INSUFFICIENT'; end if;
  insert into ledger(user_id, delta, reason, ref) values (p_user, -1, 'chat', p_msg::text);
  return true;
end $$;

create or replace function public.refund_chat(p_user uuid, p_msg uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from chat_charges where msg_id = p_msg and user_id = p_user;
  if found then
    update wallets set balance = balance + 1 where user_id = p_user;
    insert into ledger(user_id, delta, reason, ref) values (p_user, 1, 'refund', p_msg::text);
  end if;
end $$;

-- Bonus 10 kredit: otomatis saat nomor HP baru terverifikasi, SEKALI per nomor (tercatat sebagai md5, tidak bisa diklaim ulang walau akun dihapus)
create table if not exists public.bonus_claims (phone_md5 text primary key, user_id uuid not null, created_at timestamptz not null default now());
alter table public.bonus_claims enable row level security;
create or replace function public.bonus_on_phone() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.phone_confirmed_at is not null and old.phone_confirmed_at is null and coalesce(new.phone,'') <> '' then
    insert into bonus_claims(phone_md5, user_id) values (md5(new.phone), new.id) on conflict do nothing;
    if found then
      insert into wallets(user_id, balance) values (new.id, 10) on conflict (user_id) do update set balance = wallets.balance + 10;
      insert into ledger(user_id, delta, reason, ref) values (new.id, 10, 'bonus', 'signup');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists bonus_phone_t on auth.users;
create trigger bonus_phone_t after update of phone_confirmed_at on auth.users for each row execute function public.bonus_on_phone();

revoke execute on function public.charge_chat(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.refund_chat(uuid,uuid) from public, anon, authenticated;
grant  execute on function public.charge_chat(uuid,uuid) to service_role;
grant  execute on function public.refund_chat(uuid,uuid) to service_role;
