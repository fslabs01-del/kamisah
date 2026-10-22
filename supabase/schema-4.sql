-- KreatorHub tahap 4: Chat AI (1 kredit/pesan), bonus 10 kredit setelah OTP HP, paket top-up Rp5.000. Jalankan setelah schema-3.sql.

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
