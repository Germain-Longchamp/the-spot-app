-- SCRUM-57: the guest home shows the event date above its name.
-- join_event hands it back with the rest of the event; nothing else changes.

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
      'gallery_visible', v_event.gallery_visible
    )
  );
end;
$$;
