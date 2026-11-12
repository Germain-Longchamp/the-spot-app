-- SCRUM-65 — Polaroid print: the part of each photo kept for the print.
--
-- The phone computes the zone (relative to the photo, 0 to 1) with the same
-- rule as its preview, and sends it with the photo's size. The server checks
-- that it lies inside the photo and has the print's proportions (4:5), then
-- the agent cuts it out as is. Older photos have no zone: the agent centres.
--
-- Nothing is dropped: register_photo gets a second version, with the size and
-- the zone as required arguments, next to the one in production. Phones still
-- running the previous page keep calling the old one (photo without zone,
-- centred by the agent); the new page calls the new one. No call can match
-- both, so PostgREST never finds them ambiguous. The old version can go in a
-- later migration, once no phone uses it.

alter table public.photos
  add column width integer,
  add column height integer,
  add column crop_x double precision,
  add column crop_y double precision,
  add column crop_w double precision,
  add column crop_h double precision;

-- All or nothing, and inside the photo. The proportions are checked by
-- register_photo, which knows the format of the print.
alter table public.photos
  add constraint photos_crop_check check (
    (width is null and height is null
      and crop_x is null and crop_y is null and crop_w is null and crop_h is null)
    or (
      width > 0 and height > 0
      and crop_x >= 0 and crop_y >= 0 and crop_w > 0 and crop_h > 0
      and crop_x + crop_w <= 1.000001 and crop_y + crop_h <= 1.000001
    )
  );

create function public.register_photo(
  p_photo_id uuid,
  p_event_id uuid,
  p_published boolean,
  p_with_thumb boolean,
  p_width integer,
  p_height integer,
  p_crop_x double precision,
  p_crop_y double precision,
  p_crop_w double precision,
  p_crop_h double precision
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guest_id uuid;
  v_status public.event_status;
  v_gallery boolean;
  v_owner uuid;
  v_folder text;
  v_given integer;
begin
  select id into v_guest_id
  from public.guests
  where event_id = p_event_id and auth_user_id = auth.uid();

  if v_guest_id is null then
    return jsonb_build_object('result', 'refused');
  end if;

  -- The zone: all of it or none, inside the photo, and with the print's
  -- proportions, 4:5 (8 × 10 cm), give or take 1 % of rounding.
  v_given := num_nonnulls(p_width, p_height, p_crop_x, p_crop_y, p_crop_w, p_crop_h);
  if v_given not in (0, 6)
    or (v_given = 6 and not (
      p_width > 0 and p_height > 0
      and p_crop_x >= 0 and p_crop_y >= 0 and p_crop_w > 0 and p_crop_h > 0
      and p_crop_x + p_crop_w <= 1.000001 and p_crop_y + p_crop_h <= 1.000001
      and abs((p_crop_w * p_width) / (p_crop_h * p_height) / 0.8 - 1) <= 0.01
    ))
  then
    return jsonb_build_object('result', 'invalid_crop');
  end if;

  select status, gallery_enabled into v_status, v_gallery
  from public.events
  where id = p_event_id;

  if v_status <> 'open' then
    return jsonb_build_object('result', 'event_closed');
  end if;

  v_folder := p_event_id || '/' || v_guest_id || '/';

  insert into public.photos
    (id, event_id, guest_id, storage_path, thumb_path, is_published,
     width, height, crop_x, crop_y, crop_w, crop_h)
  values (
    p_photo_id,
    p_event_id,
    v_guest_id,
    v_folder || p_photo_id || '.jpg',
    case when p_with_thumb then v_folder || p_photo_id || '-thumb.jpg' end,
    -- No gallery for this event: nothing can be published, whatever is sent.
    coalesce(p_published, false) and v_gallery,
    p_width, p_height, p_crop_x, p_crop_y, p_crop_w, p_crop_h
  )
  on conflict do nothing;

  select guest_id into v_owner from public.photos where id = p_photo_id;

  if v_owner <> v_guest_id then
    return jsonb_build_object('result', 'refused');
  end if;

  return jsonb_build_object('result', 'created');
end;
$$;

revoke all on function public.register_photo(
  uuid, uuid, boolean, boolean, integer, integer,
  double precision, double precision, double precision, double precision
) from public, anon, authenticated;
grant execute on function public.register_photo(
  uuid, uuid, boolean, boolean, integer, integer,
  double precision, double precision, double precision, double precision
) to authenticated;

-- The agent receives the zone with the photo's path. Same signature, same
-- grants: only the answer grows.
create or replace function public.claim_print_job(
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
  v_photo public.photos;
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
    ) end
  );
end;
$$;
