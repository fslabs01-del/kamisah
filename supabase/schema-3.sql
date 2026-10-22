-- KreatorHub tahap 3: pembatas pemakaian per pengguna (jalankan setelah schema-2.sql).
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
