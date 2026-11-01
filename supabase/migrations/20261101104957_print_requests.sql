-- SCRUM-21: guests request a print. Tables stay minimal: SCRUM-14, 16 and 20
-- add their own columns (access token, photo paths) when they are built.

create type public.event_status as enum ('open', 'closed');
create type public.print_job_status as enum
  ('PENDING', 'PRINTING', 'DONE', 'STUCK', 'FAILED');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status public.event_status not null default 'open',
  print_quota_per_guest integer not null default 2
    check (print_quota_per_guest >= 0),
  printing_paused boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  auth_user_id uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (event_id, auth_user_id),
  unique (id, event_id)
);

-- Composite foreign keys below make a row pointing across events impossible.
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  guest_id uuid not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  foreign key (guest_id, event_id) references public.guests (id, event_id),
  unique (id, guest_id, event_id)
);

create table public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  photo_id uuid not null,
  guest_id uuid not null,
  status public.print_job_status not null default 'PENDING',
  idempotency_key text not null,
  -- Set by the operator; the agent will require it before taking a job.
  authorized_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (photo_id, guest_id, event_id)
    references public.photos (id, guest_id, event_id),
  unique (guest_id, idempotency_key)
);

create index print_jobs_event_id_idx on public.print_jobs (event_id);

alter table public.events enable row level security;
alter table public.guests enable row level security;
alter table public.photos enable row level security;
alter table public.print_jobs enable row level security;

-- Read-only for guests, limited to their own rows. Without a write policy,
-- print_jobs can only change through create_print_job below.
create policy guests_select_own on public.guests
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

create policy events_select_own on public.events
  for select to authenticated
  using (id in (
    select event_id from public.guests
    where auth_user_id = (select auth.uid())
  ));

create policy photos_select_own on public.photos
  for select to authenticated
  using (guest_id in (
    select id from public.guests
    where auth_user_id = (select auth.uid())
  ));

create policy print_jobs_select_own on public.print_jobs
  for select to authenticated
  using (guest_id in (
    select id from public.guests
    where auth_user_id = (select auth.uid())
  ));

-- Returns {"result": <code>, "job_id": <uuid, only when the job exists>}.
-- Codes: created, quota_reached, printing_paused, event_closed,
-- photo_not_found, invalid_request.
--
-- Locking the guest row serialises all of a guest's requests, which makes the
-- quota count and the idempotency lookup atomic. The key is checked before the
-- quota and the pause: a replayed request must get its job back, even when the
-- quota is now full or printing has been paused since.
create function public.create_print_job(
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
  where id = v_photo.guest_id and auth_user_id = auth.uid()
  for update;

  if v_guest_id is null then
    return jsonb_build_object('result', 'photo_not_found');
  end if;

  select * into v_existing
  from public.print_jobs
  where guest_id = v_guest_id and idempotency_key = p_idempotency_key;

  if found then
    if v_existing.photo_id <> p_photo_id then
      return jsonb_build_object('result', 'invalid_request');
    end if;
    return jsonb_build_object('result', 'created', 'job_id', v_existing.id);
  end if;

  select * into v_event from public.events where id = v_photo.event_id;

  if v_event.status <> 'open' then
    return jsonb_build_object('result', 'event_closed');
  end if;

  if v_event.printing_paused then
    return jsonb_build_object('result', 'printing_paused');
  end if;

  -- Every job counts, failed ones included: an operator retry reuses the job.
  select count(*) into v_used
  from public.print_jobs
  where guest_id = v_guest_id;

  if v_used >= v_event.print_quota_per_guest then
    return jsonb_build_object('result', 'quota_reached');
  end if;

  insert into public.print_jobs
    (event_id, photo_id, guest_id, idempotency_key)
  values
    (v_photo.event_id, p_photo_id, v_guest_id, p_idempotency_key)
  returning id into v_job_id;

  return jsonb_build_object('result', 'created', 'job_id', v_job_id);
end;
$$;

revoke all on function public.create_print_job(uuid, text)
  from public, anon, service_role;
grant execute on function public.create_print_job(uuid, text)
  to authenticated;
