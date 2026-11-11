-- SCRUM-49: the team creates events from a signed-in admin space instead of
-- running scripts. Server code checks the session and the allowed emails, then
-- calls these functions with the service key: they are not callable by guests.
-- Additive only: the code already deployed keeps working.

-- Same key for a double tap or a retry after a lost answer: one event only.
alter table public.events
  add column creation_key uuid unique;

-- Who created an event or replaced its operator link, and when. The admin is
-- kept by account id, not by email.
create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  action text not null
    check (action in ('create_event', 'reset_operator_link')),
  admin_user_id uuid not null references auth.users (id),
  created_at timestamptz not null default clock_timestamp()
);

create index admin_actions_event_id_idx
  on public.admin_actions (event_id, created_at);

alter table public.admin_actions enable row level security;
revoke all on public.admin_actions from anon, authenticated;

-- Creates the event and its operator link in one transaction. Tokens are drawn
-- by the server; only the operator link's hash is stored.
-- Returns {"result": "created" | "existing" | "invalid" | "collision",
--          "event_id": uuid}.
--   existing: this creation key was already used, the same event comes back
--             and its operator link is replaced by the new one;
--   collision: the access token or short code is taken, draw new ones.
create function public.admin_create_event(
  p_admin_user_id uuid,
  p_creation_key uuid,
  p_name text,
  p_event_date date,
  p_access_token text,
  p_short_code text,
  p_operator_token_hash text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_result text := 'created';
begin
  if p_name is null or length(trim(p_name)) = 0 or length(trim(p_name)) > 120 then
    return jsonb_build_object('result', 'invalid');
  end if;

  select id into v_event_id
  from public.events
  where creation_key = p_creation_key;

  if v_event_id is not null then
    v_result := 'existing';
  else
    begin
      insert into public.events (name, event_date, access_token, short_code, creation_key)
      values (trim(p_name), p_event_date, p_access_token, p_short_code, p_creation_key)
      returning id into v_event_id;
    exception when unique_violation then
      -- Two identical keys at the same instant: the other one won.
      select id into v_event_id
      from public.events
      where creation_key = p_creation_key;
      if v_event_id is null then
        return jsonb_build_object('result', 'collision');
      end if;
      v_result := 'existing';
    end;
  end if;

  insert into public.event_operator_tokens (event_id, token_hash)
  values (v_event_id, p_operator_token_hash)
  on conflict (event_id) do update
    set token_hash = excluded.token_hash, created_at = now();

  if v_result = 'created' then
    insert into public.admin_actions (event_id, action, admin_user_id)
    values (v_event_id, 'create_event', p_admin_user_id);
  end if;

  return jsonb_build_object('result', v_result, 'event_id', v_event_id);
end;
$$;

-- Replaces the operator link of an event: the old one stops working at once.
-- Returns {"result": "applied" | "not_found"}.
create function public.admin_reset_operator_link(
  p_admin_user_id uuid,
  p_event_id uuid,
  p_operator_token_hash text
) returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.events where id = p_event_id) then
    return jsonb_build_object('result', 'not_found');
  end if;

  insert into public.event_operator_tokens (event_id, token_hash)
  values (p_event_id, p_operator_token_hash)
  on conflict (event_id) do update
    set token_hash = excluded.token_hash, created_at = now();

  insert into public.admin_actions (event_id, action, admin_user_id)
  values (p_event_id, 'reset_operator_link', p_admin_user_id);

  return jsonb_build_object('result', 'applied');
end;
$$;

revoke all on function
  public.admin_create_event(uuid, uuid, text, date, text, text, text),
  public.admin_reset_operator_link(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function
  public.admin_create_event(uuid, uuid, text, date, text, text, text),
  public.admin_reset_operator_link(uuid, uuid, text)
  to service_role;
