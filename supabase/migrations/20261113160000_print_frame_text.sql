-- SCRUM-60 — The band below the photo carries the event's name (and, later,
-- the guest's own text, SCRUM-61, and the organiser's default, SCRUM-62).
-- claim_print_job also returns the texts to print, read at claim time.
-- Not destructive: same signature, same grants, one field more.

create or replace function public.claim_print_job(
  p_event_id uuid,
  p_agent_id text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_paused boolean;
  v_event_name text;
  v_job_id uuid;
  v_job public.print_jobs;
  v_photo public.photos;
begin
  select printing_paused, name into v_paused, v_event_name
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
    'frame', jsonb_build_object('line1', v_event_name, 'line2', null)
  );
end;
$$;
