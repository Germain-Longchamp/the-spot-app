-- SCRUM-22: print job statuses. Every status change goes through
-- transition_print_job, which also keeps the history.

alter table public.print_jobs
  add column attempt integer not null default 0,
  add column claimed_by text,
  add column last_error text,
  add column last_activity_at timestamptz,
  add column started_at timestamptz,
  add column finished_at timestamptz;

-- v1 rule: one print at a time per event. The index makes it impossible,
-- whatever the code above it does.
create unique index print_jobs_one_printing_per_event
  on public.print_jobs (event_id)
  where status = 'PRINTING';

create index print_jobs_claimable_idx
  on public.print_jobs (event_id, created_at)
  where status = 'PENDING' and authorized_at is not null;

create index print_jobs_printing_idx
  on public.print_jobs (last_activity_at)
  where status = 'PRINTING';

create type public.print_job_actor as enum
  ('guest', 'agent', 'operator', 'system');

-- Refused requests are kept too (applied = false): when a print looks wrong,
-- this is what tells the operator what really happened.
create table public.print_job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.print_jobs (id),
  from_status public.print_job_status,
  to_status public.print_job_status not null,
  actor public.print_job_actor not null,
  attempt integer not null,
  applied boolean not null,
  detail text,
  created_at timestamptz not null default clock_timestamp()
);

create index print_job_events_job_id_idx
  on public.print_job_events (job_id, created_at);

-- No policy: guests never read this table. The service role bypasses RLS.
alter table public.print_job_events enable row level security;
revoke all on public.print_job_events from anon, authenticated;

create function public.log_print_job_created() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.print_job_events
    (job_id, from_status, to_status, actor, attempt, applied)
  values
    (new.id, null, new.status, 'guest', new.attempt, true);
  return null;
end;
$$;

revoke all on function public.log_print_job_created()
  from public, anon, authenticated, service_role;

create trigger print_jobs_log_created
  after insert on public.print_jobs
  for each row execute function public.log_print_job_created();

-- The only way to change a job's status. Returns {"result": <code>}:
-- applied, refused, stale_attempt or not_found. A refusal is a normal answer,
-- not an error, so that it stays in the history instead of being rolled back.
--
-- An agent proves which attempt it is reporting on. Without that, a report
-- from a job's first attempt could close its retry.
--
-- STUCK to DONE (rule validated by Germain): an agent that comes back and
-- reports its own attempt as printed is telling the truth, and refusing it
-- would invite a retry that prints the photo twice. Once the operator has
-- retried, the attempt is no longer the current one, or the job is no longer
-- STUCK, so the report changes nothing.
create function public.transition_print_job(
  p_job_id uuid,
  p_to public.print_job_status,
  p_actor public.print_job_actor,
  p_attempt integer default null,
  p_agent_id text default null,
  p_detail text default null
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_job public.print_jobs;
  v_from public.print_job_status;
  v_allowed boolean;
  v_result text;
begin
  select * into v_job
  from public.print_jobs
  where id = p_job_id
  for update;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  v_from := v_job.status;

  v_allowed := case
    when v_from = 'PENDING' and p_to = 'PRINTING' then
      p_actor = 'agent' and v_job.authorized_at is not null
    when v_from = 'PRINTING' and p_to in ('DONE', 'FAILED') then
      p_actor = 'agent'
    when v_from = 'PRINTING' and p_to = 'STUCK' then
      p_actor = 'system'
    when v_from = 'STUCK' and p_to = 'DONE' then
      p_actor = 'agent'
    when v_from in ('STUCK', 'FAILED') and p_to = 'PENDING' then
      p_actor = 'operator'
    else false
  end;

  if p_actor = 'agent'
    and p_to <> 'PRINTING'
    and p_attempt is distinct from v_job.attempt then
    v_result := 'stale_attempt';
  elsif not v_allowed then
    v_result := 'refused';
  else
    v_result := 'applied';
  end if;

  if v_result <> 'applied' then
    insert into public.print_job_events
      (job_id, from_status, to_status, actor, attempt, applied, detail)
    values
      (p_job_id, v_from, p_to, p_actor, coalesce(p_attempt, v_job.attempt),
       false, p_detail);
    return jsonb_build_object('result', v_result);
  end if;

  update public.print_jobs
  set
    status = p_to,
    attempt = case when p_to = 'PRINTING' then attempt + 1 else attempt end,
    claimed_by = case
      when p_to = 'PRINTING' then p_agent_id
      when p_to = 'PENDING' then null
      else claimed_by
    end,
    last_activity_at = case
      when p_to = 'PRINTING' then now()
      when p_to = 'PENDING' then null
      else last_activity_at
    end,
    started_at = case
      when p_to = 'PRINTING' then now()
      when p_to = 'PENDING' then null
      else started_at
    end,
    finished_at = case
      when p_to in ('DONE', 'FAILED') then now()
      when p_to = 'PENDING' then null
      else finished_at
    end,
    last_error = case
      when p_to = 'FAILED' then p_detail
      when p_to = 'PENDING' then null
      else last_error
    end
  where id = p_job_id
  returning * into v_job;

  insert into public.print_job_events
    (job_id, from_status, to_status, actor, attempt, applied, detail)
  values
    (p_job_id, v_from, p_to, p_actor, v_job.attempt, true, p_detail);

  return jsonb_build_object('result', 'applied');
end;
$$;

-- Gives an agent the next authorized job of its event. Returns {"result": ...}:
-- claimed (with job_id, attempt, photo_id, storage_path), busy, paused, empty
-- or not_found. Locking the event row makes concurrent claims run one by one.
create function public.claim_print_job(
  p_event_id uuid,
  p_agent_id text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_paused boolean;
  v_job_id uuid;
  v_job public.print_jobs;
  v_storage_path text;
begin
  select printing_paused into v_paused
  from public.events
  where id = p_event_id
  for update;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  if v_paused then
    return jsonb_build_object('result', 'paused');
  end if;

  if exists (
    select 1 from public.print_jobs
    where event_id = p_event_id and status = 'PRINTING'
  ) then
    return jsonb_build_object('result', 'busy');
  end if;

  select id into v_job_id
  from public.print_jobs
  where event_id = p_event_id
    and status = 'PENDING'
    and authorized_at is not null
  order by created_at, id
  limit 1;

  if v_job_id is null then
    return jsonb_build_object('result', 'empty');
  end if;

  perform public.transition_print_job(
    v_job_id, 'PRINTING', 'agent', null, p_agent_id
  );

  select * into v_job from public.print_jobs where id = v_job_id;
  select storage_path into v_storage_path
  from public.photos
  where id = v_job.photo_id;

  return jsonb_build_object(
    'result', 'claimed',
    'job_id', v_job.id,
    'attempt', v_job.attempt,
    'photo_id', v_job.photo_id,
    'storage_path', v_storage_path
  );
end;
$$;

-- Called by pg_cron. Skips jobs locked by a transition already under way.
create function public.mark_stuck_jobs() returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_job_id uuid;
  v_count integer := 0;
begin
  for v_job_id in
    select id from public.print_jobs
    where status = 'PRINTING'
      and last_activity_at < now() - interval '60 seconds'
    for update skip locked
  loop
    perform public.transition_print_job(v_job_id, 'STUCK', 'system');
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- For the agent and for server code using the service role. Never for browsers.
revoke all on function
  public.transition_print_job(
    uuid, public.print_job_status, public.print_job_actor, integer, text, text
  ),
  public.claim_print_job(uuid, text),
  public.mark_stuck_jobs()
  from public, anon, authenticated;

grant execute on function
  public.transition_print_job(
    uuid, public.print_job_status, public.print_job_actor, integer, text, text
  ),
  public.claim_print_job(uuid, text),
  public.mark_stuck_jobs()
  to service_role;

-- pg_cron exists on Supabase but not on the test Postgres. Ten seconds keeps a
-- silent agent's jobs from waiting much longer than the 60-second threshold.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'mark-stuck-print-jobs',
      '10 seconds',
      'select public.mark_stuck_jobs()'
    );
  end if;
end;
$$;
