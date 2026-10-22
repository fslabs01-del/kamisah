-- KreatorHub: jalankan SEKALI di Supabase > SQL Editor.
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
