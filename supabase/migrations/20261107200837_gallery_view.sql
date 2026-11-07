-- SCRUM-29: looking at the event gallery.
--
-- Who sees a photo of someone else: a guest of the same event, only when the
-- photo is published and the event's gallery exists and is open. Nobody else.

-- Light thumbnail for the gallery grid, made on the phone when the photo is
-- published. Null for photos sent before this change: the full image is used.
alter table public.photos add column thumb_path text;

-- One place for the rule, so the photos and the files policies cannot drift
-- apart. Security definer: it reads guests and events whatever their own
-- policies say, and only ever answers yes or no for the caller.
create function public.gallery_open_to_me(p_event_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.guests g
    join public.events e on e.id = g.event_id
    where g.event_id = p_event_id
      and g.auth_user_id = (select auth.uid())
      and e.gallery_enabled
      and e.gallery_visible
  );
$$;

revoke all on function public.gallery_open_to_me(uuid) from public, anon, authenticated;
grant execute on function public.gallery_open_to_me(uuid) to authenticated;

create policy photos_select_gallery on public.photos
  for select to authenticated
  using (is_published and public.gallery_open_to_me(event_id));

-- The files of those photos, and their thumbnails.
create policy photos_read_gallery on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and exists (
      select 1 from public.photos p
      where (p.storage_path = name or p.thumb_path = name)
        and p.is_published
        and public.gallery_open_to_me(p.event_id)
    )
  );

-- Same as SCRUM-28, plus the thumbnail. The signature changes, so the old
-- function goes first: two versions would make every call ambiguous.
drop function public.register_photo(uuid, uuid, boolean);

create function public.register_photo(
  p_photo_id uuid,
  p_event_id uuid,
  p_published boolean default false,
  p_with_thumb boolean default false
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

  v_folder := p_event_id || '/' || v_guest_id || '/';

  insert into public.photos
    (id, event_id, guest_id, storage_path, thumb_path, is_published)
  values (
    p_photo_id,
    p_event_id,
    v_guest_id,
    v_folder || p_photo_id || '.jpg',
    case when p_with_thumb then v_folder || p_photo_id || '-thumb.jpg' end,
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

revoke all on function public.register_photo(uuid, uuid, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.register_photo(uuid, uuid, boolean, boolean)
  to authenticated;
