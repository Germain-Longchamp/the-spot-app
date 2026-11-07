-- SCRUM-41: one place to find what went wrong, in the guests' phones and in
-- the print agent. Read from the Supabase dashboard or scripts/recent-errors.mjs.
--
-- Never a photo or personal data: screens are stored without their secret
-- link, messages are short technical texts, and the reporter is the anonymous
-- session id, only kept to limit how much one phone can write.

create table public.app_errors (
  id bigint generated always as identity primary key,
  -- Server time, whatever the phone's clock says.
  created_at timestamptz not null default now(),
  source text not null check (source in ('web', 'agent')),
  event_id uuid,
  job_id uuid,
  screen text,
  browser text,
  message text not null,
  reporter uuid
);

create index app_errors_created_at_idx on public.app_errors (created_at desc);
create index app_errors_event_idx on public.app_errors (event_id, created_at desc);

alter table public.app_errors enable row level security;
revoke all on public.app_errors from anon, authenticated;

-- The only way for a phone to write an error. Nobody but the server can read
-- them. A looping error cannot flood the table: 20 entries a minute per
-- session, 300 a minute for everybody; the rest is dropped silently.
create function public.log_app_error(
  p_event_id uuid,
  p_screen text,
  p_browser text,
  p_message text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reporter uuid := auth.uid();
begin
  if (
    select count(*) from public.app_errors
    where source = 'web' and created_at > now() - interval '1 minute'
  ) >= 300 then
    return;
  end if;

  if (
    select count(*) from public.app_errors
    where source = 'web'
      and reporter is not distinct from v_reporter
      and created_at > now() - interval '1 minute'
  ) >= 20 then
    return;
  end if;

  insert into public.app_errors (source, event_id, screen, browser, message, reporter)
  values (
    'web',
    p_event_id,
    left(p_screen, 200),
    left(p_browser, 300),
    left(coalesce(p_message, 'Erreur sans message'), 500),
    v_reporter
  );
end;
$$;

revoke all on function public.log_app_error(uuid, text, text, text) from public;
grant execute on function public.log_app_error(uuid, text, text, text)
  to anon, authenticated;
