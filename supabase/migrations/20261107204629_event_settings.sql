-- SCRUM-32: the salon team adjusts the event during the day.
--
-- Each setting has its own function, called by the server once the operator
-- link is checked. Every change is written to operator_actions. The guest
-- side already reads these columns on each action (join_event, register_photo,
-- create_print_job, gallery_open_to_me), so a change applies at once.

alter table public.operator_actions
  drop constraint operator_actions_action_check;
alter table public.operator_actions
  add constraint operator_actions_action_check
  check (action in (
    'start', 'retry', 'cancel', 'pause', 'resume', 'delete_photo',
    'gallery', 'print_limit', 'close', 'reopen'
  ));

-- Gallery: enabled = guests may publish; visible = guests may look at it.
create function public.set_gallery(
  p_event_id uuid,
  p_enabled boolean,
  p_visible boolean
) returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  update public.events
  set gallery_enabled = p_enabled, gallery_visible = p_visible
  where id = p_event_id;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  insert into public.operator_actions (event_id, action)
  values (p_event_id, 'gallery');

  return jsonb_build_object('result', 'applied');
end;
$$;

-- Null means no limit. Applies to the next requests only: create_print_job
-- reads it each time, and requests already made are never touched.
create function public.set_print_limit(
  p_event_id uuid,
  p_limit integer
) returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if p_limit is not null and p_limit < 0 then
    return jsonb_build_object('result', 'invalid');
  end if;

  update public.events
  set print_limit = p_limit
  where id = p_event_id;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  insert into public.operator_actions (event_id, action)
  values (p_event_id, 'print_limit');

  return jsonb_build_object('result', 'applied');
end;
$$;

-- Closing stops new guests, new photos and new prints. Reversible until the
-- event is purged (assumption to confirm with Germain).
create function public.set_event_open(
  p_event_id uuid,
  p_open boolean
) returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  update public.events
  set status = case when p_open then 'open' else 'closed' end::public.event_status
  where id = p_event_id;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  insert into public.operator_actions (event_id, action)
  values (p_event_id, case when p_open then 'reopen' else 'close' end);

  return jsonb_build_object('result', 'applied');
end;
$$;

-- Server code only, like the other operator actions.
revoke all on function
  public.set_gallery(uuid, boolean, boolean),
  public.set_print_limit(uuid, integer),
  public.set_event_open(uuid, boolean)
  from public, anon, authenticated;

grant execute on function
  public.set_gallery(uuid, boolean, boolean),
  public.set_print_limit(uuid, integer),
  public.set_event_open(uuid, boolean)
  to service_role;
