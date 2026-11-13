-- SCRUM-61 — The guest writes the two lines of the band of their print.
-- A second create_print_job takes them: the two-argument one stays as it is,
-- for the code already in production and the prints asked from elsewhere
-- (gallery, "Vos tirages"), which take the event's frame text. No default
-- values on the new arguments: PostgREST never finds two candidates.
-- A photo removed by the team loses the texts of its prints too.

create function public.create_print_job(
  p_photo_id uuid,
  p_idempotency_key text,
  p_frame_line1 text,
  p_frame_line2 text
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
  v_line1 text := nullif(btrim(coalesce(p_frame_line1, '')), '');
  v_line2 text := nullif(btrim(coalesce(p_frame_line2, '')), '');
begin
  -- 30 characters a line (SCRUM-61), checked here whatever the phone sent.
  if char_length(coalesce(v_line1, '')) > 30 or char_length(coalesce(v_line2, '')) > 30 then
    return jsonb_build_object('result', 'invalid_frame_text');
  end if;

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

  -- Line 1 left empty: the trigger puts the event's frame text (SCRUM-62).
  insert into public.print_jobs
    (event_id, photo_id, guest_id, idempotency_key, frame_line1, frame_line2)
  values
    (v_photo.event_id, p_photo_id, v_guest_id, p_idempotency_key, v_line1, v_line2)
  returning id into v_job_id;

  return jsonb_build_object('result', 'created', 'job_id', v_job_id);
end;
$$;

revoke all on function public.create_print_job(uuid, text, text, text) from public, anon;
grant execute on function public.create_print_job(uuid, text, text, text) to authenticated;

create or replace function public.operator_delete_photo(
  p_event_id uuid,
  p_photo_id uuid
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_photo public.photos;
  v_paths jsonb;
begin
  -- The lock makes two simultaneous removals take turns: one applies, the
  -- other finds the photo already deleted.
  select * into v_photo
  from public.photos
  where id = p_photo_id and event_id = p_event_id
  for update;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  v_paths := to_jsonb(array_remove(array[v_photo.storage_path, v_photo.thumb_path], null));

  if v_photo.deleted_at is not null then
    return jsonb_build_object('result', 'already_deleted', 'paths', v_paths);
  end if;

  if exists (
    select 1 from public.print_jobs
    where photo_id = p_photo_id
      and status in ('PENDING', 'PRINTING', 'STUCK', 'FAILED')
  ) then
    return jsonb_build_object('result', 'print_in_progress');
  end if;

  update public.photos
  set deleted_at = now(), is_published = false
  where id = p_photo_id;

  -- The guest's texts go with the photo (SCRUM-61): possibly personal.
  update public.print_jobs
  set frame_line1 = null, frame_line2 = null
  where photo_id = p_photo_id;

  insert into public.operator_actions (event_id, action, target_id)
  values (p_event_id, 'delete_photo', p_photo_id);

  return jsonb_build_object('result', 'applied', 'paths', v_paths);
end;
$$;
