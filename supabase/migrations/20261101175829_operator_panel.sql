-- SCRUM-25: the operator panel. Also replaces the per-guest quota with one
-- print limit per event (decision by Germain, 2026-11-01).

alter type public.print_job_status add value 'CANCELLED';

alter table public.events drop column print_quota_per_guest;

-- Total prints allowed for the event. Null means no limit.
alter table public.events
  add column print_limit integer check (print_limit >= 0);

-- Kept apart from events, which guests can read. Only a hash is stored: a
-- database leak must not give access to the panel.
create table public.event_operator_tokens (
  event_id uuid primary key references public.events (id),
  token_hash text not null unique,
  created_at timestamptz not null default now()
);

alter table public.event_operator_tokens enable row level security;
revoke all on public.event_operator_tokens from anon, authenticated;

create table public.operator_actions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  action text not null
    check (action in ('start', 'retry', 'cancel', 'pause', 'resume')),
  target_id uuid,
  created_at timestamptz not null default clock_timestamp()
);

create index operator_actions_event_id_idx
  on public.operator_actions (event_id, created_at);

alter table public.operator_actions enable row level security;
revoke all on public.operator_actions from anon, authenticated;

-- Returns {"result": <code>, "job_id": <uuid, only when the job exists>}.
-- Codes: created, print_limit_reached, printing_paused, event_closed,
-- photo_not_found, invalid_request, request_cancelled.
--
-- The limit covers the whole event, so locking the event row is what makes the
-- count atomic across guests. The key is checked before the limit and the
-- pause: a replayed request must get its job back, even when the limit is now
-- reached or printing has been paused since. A cancelled job gives its print
-- back, so it is not counted.
create or replace function public.create_print_job(
  p_photo_id uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo public.photos;
  v_guest_id uuid;
  v_event public.events;
  v_existing public.print_jobs;
  v_used integer;
  v_job_id uuid;
begin
  if p_idempotency_key is null
    or length(p_idempotency_key) not between 1 and 128 then
    return jsonb_build_object('result', 'invalid_request');
  end if;

  -- Key share blocks a concurrent delete of the photo until we commit.
  select * into v_photo
  from public.photos
  where id = p_photo_id
  for key share;

  -- Someone else's photo gets the same answer as a missing one.
  select id into v_guest_id
  from public.guests
  where id = v_photo.guest_id and auth_user_id = auth.uid();

  if v_guest_id is null then
    return jsonb_build_object('result', 'photo_not_found');
  end if;

  select * into v_event
  from public.events
  where id = v_photo.event_id
  for update;

  select * into v_existing
  from public.print_jobs
  where guest_id = v_guest_id and idempotency_key = p_idempotency_key;

  if found then
    if v_existing.photo_id <> p_photo_id then
      return jsonb_build_object('result', 'invalid_request');
    end if;
    if v_existing.status = 'CANCELLED' then
      return jsonb_build_object('result', 'request_cancelled');
    end if;
    return jsonb_build_object('result', 'created', 'job_id', v_existing.id);
  end if;

  if v_event.status <> 'open' then
    return jsonb_build_object('result', 'event_closed');
  end if;

  if v_event.printing_paused then
    return jsonb_build_object('result', 'printing_paused');
  end if;

  if v_event.print_limit is not null then
    -- Failed jobs count: an operator retry reuses the job.
    select count(*) into v_used
    from public.print_jobs
    where event_id = v_event.id and status <> 'CANCELLED';

    if v_used >= v_event.print_limit then
      return jsonb_build_object('result', 'print_limit_reached');
    end if;
  end if;

  insert into public.print_jobs
    (event_id, photo_id, guest_id, idempotency_key)
  values
    (v_photo.event_id, p_photo_id, v_guest_id, p_idempotency_key)
  returning id into v_job_id;

  return jsonb_build_object('result', 'created', 'job_id', v_job_id);
end;
$$;

-- Same rules as SCRUM-22, plus CANCELLED: an operator can cancel anything that
-- is not printing. CANCELLED is final, like DONE. A job already printing cannot
-- be cancelled: the paper is on its way.
create or replace function public.transition_print_job(
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
    when v_from in ('PENDING', 'STUCK', 'FAILED') and p_to = 'CANCELLED' then
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
      when p_to in ('DONE', 'FAILED', 'CANCELLED') then now()
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

-- The operator's "Lancer". Authorizes one job; the agent then picks it up.
-- Returns {"result": ...}: started, busy, paused, agent_offline, not_pending or
-- not_found. Locks the event like claim_print_job, so two operators pressing
-- at once are served one after the other. A job authorized but not yet picked
-- up counts as busy: otherwise one operator could queue several in a row.
create function public.start_print_job(
  p_event_id uuid,
  p_job_id uuid
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_paused boolean;
begin
  select printing_paused into v_paused
  from public.events
  where id = p_event_id
  for update;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  if not exists (
    select 1 from public.print_jobs
    where id = p_job_id and event_id = p_event_id
  ) then
    return jsonb_build_object('result', 'not_found');
  end if;

  if v_paused then
    return jsonb_build_object('result', 'paused');
  end if;

  if not public.get_printer_status(p_event_id) then
    return jsonb_build_object('result', 'agent_offline');
  end if;

  if exists (
    select 1 from public.print_jobs
    where event_id = p_event_id
      and (
        status = 'PRINTING'
        or (status = 'PENDING' and authorized_at is not null)
      )
  ) then
    return jsonb_build_object('result', 'busy');
  end if;

  update public.print_jobs
  set authorized_at = now()
  where id = p_job_id and status = 'PENDING';

  if not found then
    return jsonb_build_object('result', 'not_pending');
  end if;

  insert into public.operator_actions (event_id, action, target_id)
  values (p_event_id, 'start', p_job_id);

  return jsonb_build_object('result', 'started');
end;
$$;

-- Retry or cancel, for a job of this event only. Same answers as
-- transition_print_job. Each applied action is logged.
create function public.operator_job_action(
  p_event_id uuid,
  p_job_id uuid,
  p_action text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_outcome jsonb;
begin
  if p_action not in ('retry', 'cancel') then
    return jsonb_build_object('result', 'refused');
  end if;

  if not exists (
    select 1 from public.print_jobs
    where id = p_job_id and event_id = p_event_id
  ) then
    return jsonb_build_object('result', 'not_found');
  end if;

  v_outcome := public.transition_print_job(
    p_job_id,
    case
      when p_action = 'retry' then 'PENDING'::public.print_job_status
      else 'CANCELLED'::public.print_job_status
    end,
    'operator'
  );

  if v_outcome ->> 'result' = 'applied' then
    insert into public.operator_actions (event_id, action, target_id)
    values (p_event_id, p_action, p_job_id);
  end if;

  return v_outcome;
end;
$$;

create function public.set_printing_paused(
  p_event_id uuid,
  p_paused boolean
) returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  update public.events
  set printing_paused = p_paused
  where id = p_event_id;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  insert into public.operator_actions (event_id, action)
  values (p_event_id, case when p_paused then 'pause' else 'resume' end);

  return jsonb_build_object('result', 'applied');
end;
$$;

-- Server code only: the panel's browser never talks to the database.
revoke all on function
  public.start_print_job(uuid, uuid),
  public.operator_job_action(uuid, uuid, text),
  public.set_printing_paused(uuid, boolean)
  from public, anon, authenticated;

grant execute on function
  public.start_print_job(uuid, uuid),
  public.operator_job_action(uuid, uuid, text),
  public.set_printing_paused(uuid, boolean)
  to service_role;
