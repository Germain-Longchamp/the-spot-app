-- SCRUM-53: "2 photos avant la vôtre".
--
-- For each print request of the signed-in guest still waiting (PENDING,
-- approved by the team or not), how many requests of the same event wait
-- before it. Same order as the numbered queue of the operator panel
-- (SCRUM-48): first come, first served, on created_at. A print under way is
-- not counted: 0 means "next".
--
-- security definer: the guest cannot read the other guests' requests (RLS),
-- yet the count needs them. The function only hands back numbers, for the
-- caller's own requests: no photo, guest or request of anyone else.

create function public.guest_queue_positions(p_event_id uuid)
returns table (photo_id uuid, ahead integer)
language sql
stable
security definer
set search_path = ''
as $$
  select mine.photo_id,
    (
      select count(*)::integer
      from public.print_jobs other
      where other.event_id = mine.event_id
        and other.status = 'PENDING'
        and (other.created_at, other.id) < (mine.created_at, mine.id)
    ) as ahead
  from public.print_jobs mine
  join public.guests g on g.id = mine.guest_id
  where mine.event_id = p_event_id
    and mine.status = 'PENDING'
    and g.event_id = p_event_id
    and g.auth_user_id = (select auth.uid());
$$;

revoke all on function public.guest_queue_positions(uuid) from public, anon, authenticated;
grant execute on function public.guest_queue_positions(uuid) to authenticated;
