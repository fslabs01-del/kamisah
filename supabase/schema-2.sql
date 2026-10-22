-- KreatorHub tahap 2: jalankan SETELAH schema.sql (SQL Editor > Run).

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
