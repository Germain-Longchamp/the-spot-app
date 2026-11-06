-- SCRUM-28: publishing a photo to the event gallery.
--
-- Two settings, two meanings:
--   gallery_enabled: the event has a gallery, guests may choose to publish;
--   gallery_visible: the gallery is open, guests may look at it.
-- A photo published while the gallery is still hidden is recorded as published
-- and shows up the day the gallery opens.

alter table public.events
  add column gallery_enabled boolean not null default true;

-- Same as SCRUM-15, plus gallery_enabled for the preview screen.
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
      'gallery_enabled', v_event.gallery_enabled,
      'gallery_visible', v_event.gallery_visible
    )
  );
end;
$$;

-- Same as SCRUM-19/20, except that publishing now depends on the event having
-- a gallery, not on the gallery being open yet.
create or replace function public.register_photo(
  p_photo_id uuid,
  p_event_id uuid,
  p_published boolean default false
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
begin
  select id into v_guest_id
  from public.guests
  where event_id = p_event_id and auth_user_id = auth.uid();

  if v_guest_id is null then
    return jsonb_build_object('result', 'refused');
  end if;

  select status, gallery_enabled into v_status, v_gallery
  from public.events
  where id = p_event_id;

  if v_status <> 'open' then
    return jsonb_build_object('result', 'event_closed');
  end if;

  insert into public.photos (id, event_id, guest_id, storage_path, is_published)
  values (
    p_photo_id,
    p_event_id,
    v_guest_id,
    p_event_id || '/' || v_guest_id || '/' || p_photo_id || '.jpg',
    -- No gallery for this event: nothing can be published, whatever is sent.
    coalesce(p_published, false) and v_gallery
  )
  on conflict do nothing;

  select guest_id into v_owner from public.photos where id = p_photo_id;

  if v_owner <> v_guest_id then
    return jsonb_build_object('result', 'refused');
  end if;

  return jsonb_build_object('result', 'created');
end;
$$;
