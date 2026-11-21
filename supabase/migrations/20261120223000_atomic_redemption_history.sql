-- Gift Vault F07: atomic redemption and immutable, append-only balance ledger.
-- Apply to an isolated/staging Supabase project first. Do not run on production
-- before testing owner/admin/viewer roles and existing coupon editing flows.
-- Monetary amounts are the app's existing INR values (multi-currency is separate).
--
-- Every redemption is ONE database transaction: row lock + ledger insert + update.
-- Every direct manual balance edit is recorded as an adjustment by a database
-- trigger, so existing Edit Card balance changes cannot silently bypass history.
-- Existing coupon rows with transactions cannot be physically deleted; archive
-- or mark them used instead, preserving the audit trail.

create table if not exists public.coupon_transactions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete set null,
  transaction_type text not null check (transaction_type in ('redemption', 'adjustment')),
  amount_delta numeric(12,2) not null check (amount_delta <> 0),
  balance_before numeric(12,2) not null check (balance_before >= 0),
  balance_after numeric(12,2) not null check (balance_after >= 0),
  request_id uuid,
  write_txid bigint not null default txid_current(),
  created_at timestamptz not null default now(),
  constraint coupon_transaction_balance_math check (balance_after = balance_before + amount_delta),
  constraint coupon_transaction_redemption_sign check (
    transaction_type <> 'redemption' or amount_delta < 0
  ),
  constraint coupon_transaction_request_unique unique (actor_id, request_id)
);

create index if not exists coupon_transactions_coupon_created_idx
  on public.coupon_transactions (coupon_id, created_at desc);
create index if not exists coupon_transactions_actor_created_idx
  on public.coupon_transactions (actor_id, created_at desc);

alter table public.coupon_transactions enable row level security;
revoke all on public.coupon_transactions from public, anon, authenticated;
grant select on public.coupon_transactions to authenticated;

drop policy if exists "coupon_transactions_read_members" on public.coupon_transactions;
create policy "coupon_transactions_read_members"
  on public.coupon_transactions for select
  to authenticated
  using ((select private.get_my_role()) in ('super_admin','contributor','viewer'));

-- Ensure ordinary client updates are authorized for the creator or Super Admin.
-- This augments the earlier metadata protection trigger (which did not guard
-- balance-only changes), including direct API updates outside this UI.
create or replace function private.guard_coupon_balance_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role text;
begin
  if new.amount is distinct from old.amount
     or new.status is distinct from old.status then
    select p.role into v_role
      from public.profiles p where p.id = v_uid;
    if v_uid is null or v_role not in ('super_admin','contributor') then
      raise exception 'An active contributor or administrator is required to change a balance.';
    end if;
    if v_role <> 'super_admin'
       and old.created_by is distinct from v_uid then
      raise exception 'Only the card creator or Super Admin may change this balance.';
    end if;
    if new.status = 'used' and new.amount <> 0 then
      raise exception 'A used card must have a zero balance.';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_coupon_balance_owner() from public, anon, authenticated;
drop trigger if exists trg_guard_coupon_balance_owner on public.coupons;
create trigger trg_guard_coupon_balance_owner
  before update of amount, status on public.coupons
  for each row execute function private.guard_coupon_balance_owner();

-- A balance edit made outside the redemption RPC is an adjustment. The RPC
-- inserts its redemption row before UPDATE; matching transaction IDs let this
-- trigger skip that already-recorded change without a spoofable session flag.
create or replace function private.audit_coupon_balance_adjustment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.amount is not distinct from old.amount then
    return new;
  end if;

  if not exists (
    select 1 from public.coupon_transactions t
     where t.coupon_id = new.id
       and t.balance_before = old.amount
       and t.balance_after = new.amount
       and t.write_txid = txid_current()
  ) then
    insert into public.coupon_transactions (
      coupon_id, actor_id, transaction_type,
      amount_delta, balance_before, balance_after
    ) values (
      new.id, (select auth.uid()), 'adjustment',
      new.amount - old.amount, old.amount, new.amount
    );
  end if;
  return new;
end;
$$;
revoke execute on function private.audit_coupon_balance_adjustment() from public, anon, authenticated;
drop trigger if exists trg_audit_coupon_balance_adjustment on public.coupons;
create trigger trg_audit_coupon_balance_adjustment
  after update of amount on public.coupons
  for each row execute function private.audit_coupon_balance_adjustment();

-- Client-generated request UUID makes retries safe. Same actor + UUID used
-- with different card/amount is a hard conflict, never a second deduction.
create or replace function public.redeem_coupon(
  p_coupon_id uuid,
  p_amount numeric,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role text;
  v_card record;
  v_previous numeric(12,2);
  v_remaining numeric(12,2);
  v_previous_request record;
  v_transaction_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in is required to redeem a card.';
  end if;
  if p_coupon_id is null or p_request_id is null then
    raise exception 'Card ID and request ID are required.';
  end if;
  if p_amount is null or p_amount <= 0
     or p_amount <> round(p_amount, 2)
     or p_amount > 9999999999.99 then
    raise exception 'Enter a positive amount with at most two decimal places.';
  end if;

  select p.role into v_role
  from public.profiles p where p.id = v_uid;

  if v_role not in ('super_admin','contributor') or v_role is null then
    raise exception 'Only contributors and administrators can redeem cards.';
  end if;

  -- Lock first, then check idempotency. Two concurrent retries for one card
  -- serialize on this lock; only the first request can deduct.
  select c.id, c.created_by, c.amount, c.status, c.expiry
    into v_card
    from public.coupons c
    where c.id = p_coupon_id
    for update;

  if not found then
    raise exception 'Gift card not found.';
  end if;

  if v_role <> 'super_admin' and v_card.created_by is distinct from v_uid then
    raise exception 'Only the card creator or Super Admin can redeem it.';
  end if;

  select t.id, t.coupon_id, t.amount_delta, t.balance_after
    into v_previous_request
    from public.coupon_transactions t
    where t.actor_id = v_uid
      and t.request_id = p_request_id;

  if found then
    if v_previous_request.coupon_id <> p_coupon_id
       or -v_previous_request.amount_delta <> p_amount then
      raise exception 'Request ID was already used for a different redemption.';
    end if;
    return jsonb_build_object(
      'transaction_id', v_previous_request.id,
      'coupon_id', p_coupon_id,
      'spent', p_amount,
      'remaining', v_previous_request.balance_after,
      'replayed', true
    );
  end if;

  if v_card.status <> 'active' or v_card.amount <= 0 then
    raise exception 'This card is already fully used.';
  end if;
  if v_card.expiry is not null and v_card.expiry < current_date then
    raise exception 'This card has expired.';
  end if;
  if p_amount > v_card.amount then
    raise exception 'Insufficient balance. Refresh the card and retry.';
  end if;

  v_previous := v_card.amount;
  v_remaining := v_previous - p_amount;

  insert into public.coupon_transactions (
    coupon_id, actor_id, transaction_type, amount_delta,
    balance_before, balance_after, request_id
  )
  values (
    p_coupon_id, v_uid, 'redemption', -p_amount,
    v_previous, v_remaining, p_request_id
  )
  returning id into v_transaction_id;

  update public.coupons
    set amount = v_remaining,
        status = case when v_remaining = 0 then 'used' else 'active' end,
        updated_at = now()
    where id = p_coupon_id;

  -- All writes above share the same PostgreSQL transaction; any failure
  -- rolls back the ledger entry and the card update together.
  return jsonb_build_object(
    'transaction_id', v_transaction_id,
    'coupon_id', p_coupon_id,
    'spent', p_amount,
    'remaining', v_remaining,
    'replayed', false
  );
end;
$$;

revoke execute on function public.redeem_coupon(uuid, numeric, uuid)
  from public, anon;
grant execute on function public.redeem_coupon(uuid, numeric, uuid)
  to authenticated;

-- Note: Coupon deletes referencing transactions now raise FK violations.
-- Legacy balance edits still perform absolute-value updates, but the trigger
-- records every resulting difference as an adjustment; they are not equivalent
-- to redemptions. A dedicated atomic adjustment RPC is a future hardening item.
