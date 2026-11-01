-- SCRUM-14: what an event needs to be entered: an unguessable token for the QR
-- code and a short code as a fallback. The events table is empty so far, which
-- is what allows these columns to be required straight away.

alter table public.events
  add column event_date date,
  add column access_token text not null unique
    check (length(access_token) >= 32),
  add column short_code text not null unique,
  add column gallery_visible boolean not null default false;
