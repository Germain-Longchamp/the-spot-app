-- SCRUM-63: one way in, the gallery.
--
-- A guest sees, in a single list:
--   - the photos other guests shared, when the event's gallery is open;
--   - all of their own photos, shared or not, whatever the gallery state.
-- That is exactly what the existing photos policies already allow
-- (photos_select_own, photos_select_gallery): this view adds no access.
--
-- security_invoker: the view runs with the rights of the guest who reads it,
-- so those policies still decide every row.
--
-- is_mine tells the guest which photos are theirs without sending anyone's
-- guest id to the phone.

create view public.gallery_photos
with (security_invoker = true)
as
select
  p.id,
  p.event_id,
  p.storage_path,
  p.thumb_path,
  p.is_published,
  p.created_at,
  exists (
    select 1
    from public.guests g
    where g.id = p.guest_id
      and g.auth_user_id = (select auth.uid())
  ) as is_mine
from public.photos p
-- A photo removed by the team is gone for everyone, its author included.
where p.deleted_at is null;

revoke all on public.gallery_photos from public, anon, authenticated;
grant select on public.gallery_photos to authenticated;
