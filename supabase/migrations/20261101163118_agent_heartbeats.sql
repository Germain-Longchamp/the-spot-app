-- SCRUM-24: the agent's signs of life, and the printer status guests can see.

create table public.agent_heartbeats (
  event_id uuid not null references public.events (id),
  agent_id text not null,
  last_seen_at timestamptz not null,
  primary key (event_id, agent_id)
);

alter table public.agent_heartbeats enable row level security;

create policy agent_heartbeats_select_own_event on public.agent_heartbeats
  for select to authenticated
  using (event_id in (
    select event_id from public.guests
    where auth_user_id = (select auth.uid())
  ));

-- The time always comes from the server: the salon computer's clock may be
-- wrong. Only the job passed in is kept alive, for its exact attempt. An agent
-- that restarts under the same name passes none, so what it was printing
-- before the crash still goes STUCK.
create function public.record_agent_heartbeat(
  p_event_id uuid,
  p_agent_id text,
  p_job_id uuid default null,
  p_attempt integer default null
) returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.agent_heartbeats (event_id, agent_id, last_seen_at)
  values (p_event_id, p_agent_id, now())
  on conflict (event_id, agent_id)
  do update set last_seen_at = excluded.last_seen_at;

  update public.print_jobs
  set last_activity_at = now()
  where id = p_job_id
    and attempt = p_attempt
    and status = 'PRINTING';
end;
$$;

-- True when at least one agent of the event was heard from in the last
-- 60 seconds, measured on the server so that a phone's clock cannot matter.
-- RLS applies: someone outside the event simply gets false.
create function public.get_printer_status(p_event_id uuid) returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.agent_heartbeats
    where event_id = p_event_id
      and last_seen_at > now() - interval '60 seconds'
  );
$$;

revoke all on function
  public.record_agent_heartbeat(uuid, text, uuid, integer),
  public.get_printer_status(uuid)
  from public, anon, authenticated;

grant execute on function
  public.record_agent_heartbeat(uuid, text, uuid, integer)
  to service_role;

grant execute on function public.get_printer_status(uuid)
  to authenticated, service_role;
