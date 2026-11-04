-- SCRUM-19 and SCRUM-20: storing guest photos, and telling a guest whether
-- printing is possible before they press the button.

alter table public.photos
  add column is_published boolean not null default false;

-- Private: files are only reached through signed URLs or the policies below.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 15728640, array['image/jpeg'])
on conflict (id) do nothing;

-- Files live under <event id>/<guest id>/<photo id>.jpg. A guest can only touch
-- their own folder, and only in the event they joined.
create policy photos_upload_own_folder on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and exists (
      select 1 from public.guests g
      where g.auth_user_id = (select auth.uid())
        and g.event_id::text = (storage.foldername(name))[1]
        and g.id::text = (storage.foldername(name))[2]
    )
  );

create policy photos_read_own_folder on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and exists (
      select 1 from public.guests g
      where g.auth_user_id = (select auth.uid())
        and g.event_id::text = (storage.foldername(name))[1]
        and g.id::text = (storage.foldername(name))[2]
    )
  );

-- Records a photo once its file is stored. The id is chosen by the phone, which
-- makes a repeated call harmless: it can only ever create one photo. Returns
-- {"result": ...}: created, event_closed or refused.
create function public.register_photo(
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

  select status, gallery_visible into v_status, v_gallery
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

-- Tells a guest what to expect before they press "Imprimer". Only an event's
-- guests get an answer. create_print_job still decides: this is for display.
create function public.get_print_availability(p_event_id uuid) returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  if not exists (
    select 1 from public.guests
    where event_id = p_event_id and auth_user_id = auth.uid()
  ) then
    return 'unknown';
  end if;

  select * into v_event from public.events where id = p_event_id;

  if v_event.status <> 'open' then
    return 'closed';
  end if;
  if v_event.printing_paused then
    return 'paused';
  end if;
  if v_event.print_limit is not null and (
    select count(*) from public.print_jobs
    where event_id = p_event_id and status <> 'CANCELLED'
  ) >= v_event.print_limit then
    return 'limit_reached';
  end if;
  return 'available';
end;
$$;

revoke all on function
  public.register_photo(uuid, uuid, boolean),
  public.get_print_availability(uuid)
  from public, anon, authenticated;

grant execute on function
  public.register_photo(uuid, uuid, boolean),
  public.get_print_availability(uuid)
  to authenticated;
