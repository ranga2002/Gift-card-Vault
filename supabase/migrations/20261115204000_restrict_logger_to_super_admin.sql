-- Restrict activity_logs SELECT to Super Admin only (contributors still write audit logs)
drop policy if exists "activity_logs_select_all_members" on public.activity_logs;
drop policy if exists "activity_logs_select_super_admin_only" on public.activity_logs;
create policy "activity_logs_select_super_admin_only"
  on public.activity_logs for select
  to authenticated
  using ( (select private.get_my_role()) = 'super_admin' );
