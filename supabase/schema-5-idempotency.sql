-- Kamisah tahap 5: pemotongan kredit idempoten (anti potong ganda).
-- Jalankan SEKALI di Supabase > SQL Editor SETELAH KAMISAH-SETUP-ALL.sql. Aman diulang (add column if not exists / create or replace).
-- Fungsi lama charge_credits(uuid,int,text) TIDAK dihapus; backend baru memakai versi 4 argumen di bawah.

alter table public.jobs add column if not exists client_key uuid;
create unique index if not exists jobs_user_client_key_uidx on public.jobs (user_id, client_key) where client_key is not null;

create or replace function public.charge_credits(p_user uuid, p_cost int, p_model text, p_key uuid)
returns table(job_id uuid, replayed boolean)
language plpgsql security definer set search_path = public as $$
declare j uuid;
begin
  if p_key is null then raise exception 'KEY_REQUIRED'; end if;
  if p_cost <= 0 then raise exception 'BAD_COST'; end if;
  -- Serialkan permintaan dengan kunci yang sama agar dua klik/percobaan ulang bersamaan tidak sama-sama memotong.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_key::text, 0));
  select jobs.id into j from jobs where jobs.user_id = p_user and jobs.client_key = p_key;
  if found then
    return query select j, true;
    return;
  end if;
  if (select value from settings where key='require_phone') = 'true'
     and not exists (select 1 from auth.users where id = p_user and phone_confirmed_at is not null)
  then raise exception 'PHONE_REQUIRED'; end if;
  update wallets set balance = balance - p_cost where user_id = p_user and balance >= p_cost;
  if not found then raise exception 'INSUFFICIENT'; end if;
  insert into jobs(user_id, model, cost, client_key) values (p_user, p_model, p_cost, p_key) returning id into j;
  insert into ledger(user_id, delta, reason, ref) values (p_user, -p_cost, 'generate', j::text);
  return query select j, false;
end $$;

revoke execute on function public.charge_credits(uuid,int,text,uuid) from public, anon, authenticated;
grant  execute on function public.charge_credits(uuid,int,text,uuid) to service_role;
