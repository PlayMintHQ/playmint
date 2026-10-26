-- PlayMint · persistent generation rate limits (October 2026 Milestone)
--
-- WHAT THIS DOES:
-- Replaces in-memory-only rate limiting counters with persistent, database-backed
-- atomic counters stored in PostgreSQL.
--
-- Why: Serverless functions (e.g. Vercel) spin up multiple stateless instances
-- across regions and cold starts. In-memory maps reset when lambdas recycle.
-- This table and RPC provide atomic (FOR UPDATE) 24-hour sliding rate limits
-- across all serverless instances.
--
-- Daily limits enforced:
--   - Guests (keyed by IP): 25 calls / 24h
--   - Authenticated Users (keyed by UUID): 200 calls / 24h

create table if not exists public.generation_usage (
  identifier   text primary key,
  count        integer not null default 0,
  reset_at     timestamptz not null default (now() + interval '24 hours'),
  updated_at   timestamptz not null default now()
);

alter table public.generation_usage enable row level security;

-- Defense-in-depth: anon and authenticated cannot directly read or tamper with usage counters.
-- Only service_role (serverless backend) has access.
revoke all on public.generation_usage from anon, authenticated;

-- Atomic check and increment stored procedure
create or replace function public.check_and_increment_rate_limit(
  p_identifier text,
  p_limit integer,
  p_window_seconds integer default 86400
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rec record;
  v_now timestamptz := now();
  v_exceeded boolean;
  v_remaining integer;
  v_window interval := (p_window_seconds || ' seconds')::interval;
begin
  -- Lock row for update to prevent concurrent race conditions
  select * into v_rec
  from public.generation_usage
  where identifier = p_identifier
  for update;

  if not found or v_now > v_rec.reset_at then
    insert into public.generation_usage (identifier, count, reset_at, updated_at)
    values (p_identifier, 1, v_now + v_window, v_now)
    on conflict (identifier) do update
      set count = 1,
          reset_at = v_now + v_window,
          updated_at = v_now
    returning * into v_rec;
  else
    update public.generation_usage
    set count = count + 1,
        updated_at = v_now
    where identifier = p_identifier
    returning * into v_rec;
  end if;

  v_exceeded := v_rec.count > p_limit;
  v_remaining := greatest(0, p_limit - v_rec.count);

  return jsonb_build_object(
    'exceeded', v_exceeded,
    'count', v_rec.count,
    'limit', p_limit,
    'remaining', v_remaining,
    'reset_at', extract(epoch from v_rec.reset_at)::bigint
  );
end;
$$;

-- Revoke public execution; only service_role (via backend API) executes this
revoke execute on function public.check_and_increment_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_and_increment_rate_limit(text, integer, integer) to service_role;
