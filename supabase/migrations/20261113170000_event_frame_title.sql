-- SCRUM-62 — The organiser chooses the text printed on line 1 of the band
-- (by default, the event's name). A print keeps the text it was requested
-- with: changing it later only affects the next prints.
-- Additive: one column on events and on print_jobs, a wider list of admin
-- actions, a trigger, one new admin function; claim_print_job and join_event
-- keep their signatures and grants.

alter table public.events
  add column frame_title text
    constraint events_frame_title_check
    check (frame_title is null or (char_length(frame_title) between 1 and 30 and frame_title = btrim(frame_title)));

-- The band's texts as they were when the print was requested (SCRUM-60, 62;
-- SCRUM-61 will let the guest write them).
alter table public.print_jobs
  add column frame_line1 text,
  add column frame_line2 text;

-- The trace now also records the frame text being set.
alter table public.admin_actions
  drop constraint admin_actions_action_check,
  add constraint admin_actions_action_check
    check (action in ('create_event', 'reset_operator_link', 'set_frame_title'));

-- A new print takes the event's frame text of the moment, unless it brings
-- its own.
create function public.print_jobs_snapshot_frame() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.frame_line1 is null then
    select coalesce(frame_title, name) into new.frame_line1
    from public.events
    where id = new.event_id;
  end if;
  return new;
end;
$$;

create trigger print_jobs_snapshot_frame
  before insert on public.print_jobs
  for each row execute function public.print_jobs_snapshot_frame();

revoke all on function public.print_jobs_snapshot_frame() from public, anon, authenticated;

-- Sets the frame text of an event; empty: back to the event's name.
-- Returns {"result": "applied", "frame_title": text | null}
--       | {"result": "invalid" | "not_found"}.
create function public.admin_set_frame_title(
  p_admin_user_id uuid,
  p_event_id uuid,
  p_frame_title text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_title text := nullif(btrim(coalesce(p_frame_title, '')), '');
begin
  if v_title is not null and char_length(v_title) > 30 then
    return jsonb_build_object('result', 'invalid');
  end if;

  update public.events set frame_title = v_title where id = p_event_id;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  insert into public.admin_actions (event_id, action, admin_user_id)
  values (p_event_id, 'set_frame_title', p_admin_user_id);

  return jsonb_build_object('result', 'applied', 'frame_title', v_title);
end;
$$;

revoke all on function public.admin_set_frame_title(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_frame_title(uuid, uuid, text)
  to service_role;

-- The guest's phone shows the same text in the preview.
create or replace function public.join_event(p_token text) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_guest_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('result', 'invalid');
  end if;

  select * into v_event
  from public.events
  where access_token = p_token;

  if not found then
    return jsonb_build_object('result', 'invalid');
  end if;

  if v_event.status <> 'open' then
    return jsonb_build_object('result', 'closed');
  end if;

  insert into public.guests (event_id, auth_user_id)
  values (v_event.id, auth.uid())
  on conflict (event_id, auth_user_id) do nothing;

  select id into v_guest_id
  from public.guests
  where event_id = v_event.id and auth_user_id = auth.uid();

  return jsonb_build_object(
    'result', 'joined',
    'guest_id', v_guest_id,
    'event', jsonb_build_object(
      'id', v_event.id,
      'name', v_event.name,
      'event_date', v_event.event_date,
      'gallery_enabled', v_event.gallery_enabled,
      'gallery_visible', v_event.gallery_visible,
      'frame_title', coalesce(v_event.frame_title, v_event.name)
    )
  );
end;
$$;

-- The agent prints the text the print was requested with; prints requested
-- before this version take the event's text of the moment.
create or replace function public.claim_print_job(
  p_event_id uuid,
  p_agent_id text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_paused boolean;
  v_event_title text;
  v_job_id uuid;
  v_job public.print_jobs;
  v_photo public.photos;
begin
  select printing_paused, coalesce(frame_title, name) into v_paused, v_event_title
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
  select * into v_photo from public.photos where id = v_job.photo_id;

  return jsonb_build_object(
    'result', 'claimed',
    'job_id', v_job.id,
    'attempt', v_job.attempt,
    'photo_id', v_job.photo_id,
    'storage_path', v_photo.storage_path,
    'crop', case when v_photo.crop_w is not null then jsonb_build_object(
      'x', v_photo.crop_x, 'y', v_photo.crop_y,
      'w', v_photo.crop_w, 'h', v_photo.crop_h
    ) end,
    'frame', jsonb_build_object(
      'line1', coalesce(v_job.frame_line1, v_event_title),
      'line2', v_job.frame_line2
    )
  );
end;
$$;
