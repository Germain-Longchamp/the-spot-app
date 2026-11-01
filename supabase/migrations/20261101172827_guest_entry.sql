-- SCRUM-15: entering an event from its QR code, with no form.

-- Called before any session exists. Says nothing but the state of the link, so
-- that an unknown token creates no anonymous user and reveals nothing.
create function public.get_event_entry(p_token text) returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status public.event_status;
begin
  select status into v_status
  from public.events
  where access_token = p_token;

  if not found then
    return 'invalid';
  end if;
  return v_status::text;
end;
$$;

-- Attaches the anonymous session to the event of the token. Safe to repeat: a
-- second scan finds the same guest. This is the only way to become a guest,
-- and being a guest is what every RLS policy relies on.
create function public.join_event(p_token text) returns jsonb
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
      'gallery_visible', v_event.gallery_visible
    )
  );
end;
$$;

revoke all on function
  public.get_event_entry(text),
  public.join_event(text)
  from public, anon, authenticated;

grant execute on function public.get_event_entry(text) to anon, authenticated;
grant execute on function public.join_event(text) to authenticated;
