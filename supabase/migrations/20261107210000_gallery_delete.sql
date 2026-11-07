-- SCRUM-30: the salon team removes a photo from the gallery.
--
-- The row stays (print history points to it), marked deleted and unpublished
-- so it leaves the gallery at once for everyone. The server then deletes the
-- files. Every removal is written to operator_actions.

alter table public.photos add column deleted_at timestamptz;

alter table public.operator_actions
  drop constraint operator_actions_action_check;
alter table public.operator_actions
  add constraint operator_actions_action_check
  check (action in ('start', 'retry', 'cancel', 'pause', 'resume', 'delete_photo'));

-- Returns {"result": <code>, "paths": [file, thumbnail]} with the files to
-- delete, also when the photo was already deleted, so that a failed file
-- deletion can simply be tried again. Codes: applied, already_deleted,
-- print_in_progress, not_found.
--
-- A photo still waiting to print, printing, or waiting for a retry keeps its
-- file: the agent must never be left with a job and no image.
create function public.operator_delete_photo(
  p_event_id uuid,
  p_photo_id uuid
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_photo public.photos;
  v_paths jsonb;
begin
  -- The lock makes two simultaneous removals take turns: one applies, the
  -- other finds the photo already deleted.
  select * into v_photo
  from public.photos
  where id = p_photo_id and event_id = p_event_id
  for update;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  v_paths := to_jsonb(array_remove(array[v_photo.storage_path, v_photo.thumb_path], null));

  if v_photo.deleted_at is not null then
    return jsonb_build_object('result', 'already_deleted', 'paths', v_paths);
  end if;

  if exists (
    select 1 from public.print_jobs
    where photo_id = p_photo_id
      and status in ('PENDING', 'PRINTING', 'STUCK', 'FAILED')
  ) then
    return jsonb_build_object('result', 'print_in_progress');
  end if;

  update public.photos
  set deleted_at = now(), is_published = false
  where id = p_photo_id;

  insert into public.operator_actions (event_id, action, target_id)
  values (p_event_id, 'delete_photo', p_photo_id);

  return jsonb_build_object('result', 'applied', 'paths', v_paths);
end;
$$;

-- Server code only, like the other operator actions.
revoke all on function public.operator_delete_photo(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.operator_delete_photo(uuid, uuid) to service_role;
