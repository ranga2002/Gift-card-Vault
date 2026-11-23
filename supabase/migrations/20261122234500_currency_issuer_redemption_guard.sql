-- F04: strict INR/CAD/USD denomination protection and issuer-verified exceptions.
-- Apply AFTER 20261120223000_atomic_redemption_history.sql, only to an isolated
-- Supabase staging database first. Existing rows are explicitly backfilled INR.
-- No FX rates or worldwide brand acceptance are assumed.
--
-- Deduction amounts always remain in the card's ORIGINAL currency. A separate
-- merchant checkout currency/amount can be recorded ONLY when the issuer has
-- explicitly approved this specific card+currency pair and a Super Admin has
-- verified the evidence URL and terms. Merchant acceptance is not guaranteed.

alter table public.coupons
  add column if not exists currency_code text not null default 'INR';
alter table public.coupons
  drop constraint if exists coupons_currency_code_supported;
alter table public.coupons
  add constraint coupons_currency_code_supported
  check (currency_code in ('INR','CAD','USD'));

alter table public.coupon_transactions
  add column if not exists currency_code text not null default 'INR',
  add column if not exists settlement_currency text,
  add column if not exists settlement_amount numeric(12,2),
  add column if not exists issuer_evidence_url text;

-- All existing pre-F04 rows are INR. Older redemption rows had no separate
-- merchant charge and therefore retain same-currency metadata.
update public.coupon_transactions
   set settlement_currency = 'INR', settlement_amount = abs(amount_delta)
 where transaction_type = 'redemption' and settlement_currency is null;
alter table public.coupon_transactions
  drop constraint if exists coupon_transactions_currency_supported;
alter table public.coupon_transactions
  add constraint coupon_transactions_currency_supported
    check (currency_code in ('INR','CAD','USD')
      and (settlement_currency is null or settlement_currency in ('INR','CAD','USD'))
      and (
        (transaction_type='redemption' and settlement_currency is not null
          and settlement_amount is not null and settlement_amount > 0)
        or
        (transaction_type='adjustment' and settlement_currency is null
          and settlement_amount is null)
      ));

-- A card cannot be re-labelled to another currency after it is created.
-- This also blocks privileged app users and REST API clients.
create or replace function private.protect_coupon_currency()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.currency_code is distinct from old.currency_code then
    raise exception 'Gift card denomination is locked after creation. Create a new card instead.';
  end if;
  return new;
end;
$$;
revoke execute on function private.protect_coupon_currency() from public, anon, authenticated;
drop trigger if exists trg_protect_coupon_currency on public.coupons;
create trigger trg_protect_coupon_currency
  before update of currency_code on public.coupons
  for each row execute function private.protect_coupon_currency();

-- Card-specific, issuer-verified currency exceptions. Never infer permission
-- from the brand name alone (e.g. policies may vary by region/card product).
create table if not exists public.coupon_currency_exceptions (
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  source_currency text not null check (source_currency in ('INR','CAD','USD')),
  target_currency text not null check (target_currency in ('INR','CAD','USD')),
  evidence_url text not null check (evidence_url ~* '^https://[^[:space:]]{4,}$'),
  issuer_approval_note text not null check (length(trim(issuer_approval_note)) >= 12),
  verified_by uuid not null references public.profiles(id),
  verified_at timestamptz not null default now(),
  valid_until date,
  active boolean not null default true,
  revoked_by uuid references public.profiles(id),
  revoked_at timestamptz,
  primary key (coupon_id,target_currency),
  check (source_currency <> target_currency)
);
alter table public.coupon_currency_exceptions enable row level security;
revoke all on public.coupon_currency_exceptions from public, anon, authenticated;
grant select on public.coupon_currency_exceptions to authenticated;
drop policy if exists "coupon_currency_exceptions_members_read" on public.coupon_currency_exceptions;
create policy "coupon_currency_exceptions_members_read"
  on public.coupon_currency_exceptions for select to authenticated
  using ((select private.get_my_role()) in ('super_admin','contributor','viewer'));

create or replace function public.approve_coupon_currency_exception(
  p_coupon_id uuid, p_target_currency text, p_evidence_url text,
  p_issuer_approval_note text, p_valid_until date default null
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role text;
  v_source text;
begin
  select p.role into v_role from public.profiles p where p.id=v_uid;
  if v_uid is null or v_role is distinct from 'super_admin' then
    raise exception 'Only Super Admin can verify issuer currency exceptions.';
  end if;
  if p_target_currency not in ('INR','CAD','USD') or p_target_currency is null then
    raise exception 'Unsupported checkout currency.';
  end if;
  if p_evidence_url is null or p_evidence_url !~* '^https://[^[:space:]]{4,}$'
     or length(p_evidence_url)>2000
     or p_issuer_approval_note is null
     or length(trim(p_issuer_approval_note))<12 then
    raise exception 'Provide an issuer terms HTTPS URL and a documented verification note.';
  end if;
  if p_valid_until is not null and p_valid_until<current_date then
    raise exception 'Issuer approval cannot already be expired.';
  end if;
  select c.currency_code into v_source from public.coupons c
    where c.id=p_coupon_id for update;
  if not found then raise exception 'Card not found.'; end if;
  if p_target_currency=v_source then
    raise exception 'An exception is not needed for the card currency.';
  end if;

  insert into public.coupon_currency_exceptions(
    coupon_id,source_currency,target_currency,evidence_url,issuer_approval_note,
    verified_by,verified_at,valid_until,active,revoked_by,revoked_at
  ) values (
    p_coupon_id,v_source,p_target_currency,p_evidence_url,trim(p_issuer_approval_note),
    v_uid,now(),p_valid_until,true,null,null
  )
  on conflict (coupon_id,target_currency) do update
    set source_currency=excluded.source_currency,
        evidence_url=excluded.evidence_url,
        issuer_approval_note=excluded.issuer_approval_note,
        verified_by=v_uid,verified_at=now(),valid_until=excluded.valid_until,
        active=true,revoked_by=null,revoked_at=null;
end;
$$;
revoke execute on function public.approve_coupon_currency_exception(uuid,text,text,text,date)
  from public,anon;
grant execute on function public.approve_coupon_currency_exception(uuid,text,text,text,date)
  to authenticated;

create or replace function public.revoke_coupon_currency_exception(
  p_coupon_id uuid,p_target_currency text
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role text;
begin
  select p.role into v_role from public.profiles p where p.id=v_uid;
  if v_uid is null or v_role is distinct from 'super_admin' then
    raise exception 'Only Super Admin may revoke issuer currency exceptions.';
  end if;
  update public.coupon_currency_exceptions
     set active=false,revoked_by=v_uid,revoked_at=now()
   where coupon_id=p_coupon_id and target_currency=p_target_currency;
end;
$$;
revoke execute on function public.revoke_coupon_currency_exception(uuid,text) from public,anon;
grant execute on function public.revoke_coupon_currency_exception(uuid,text) to authenticated;

-- Retain the F07 audit trigger for direct balance edits, now capturing the
-- card's actual currency, never defaulting a CAD/USD adjustment to INR.
create or replace function private.audit_coupon_balance_adjustment()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.amount is not distinct from old.amount then return new; end if;
  if not exists (
    select 1 from public.coupon_transactions t
    where t.coupon_id=new.id and t.balance_before=old.amount
      and t.balance_after=new.amount and t.write_txid=txid_current()
  ) then
    insert into public.coupon_transactions (
      coupon_id,actor_id,transaction_type,amount_delta,
      balance_before,balance_after,currency_code
    ) values (
      new.id,(select auth.uid()),'adjustment',
      new.amount-old.amount,old.amount,new.amount,new.currency_code
    );
  end if;
  return new;
end;
$$;
revoke execute on function private.audit_coupon_balance_adjustment() from public,anon,authenticated;

-- Eliminate the old 3-argument RPC: it could bypass mandatory currency checks.
drop function if exists public.redeem_coupon(uuid,numeric,uuid);

-- p_amount is ALWAYS the amount deducted from the gift card's own currency.
-- p_spend_currency is the currency actually used at the merchant checkout.
-- p_settlement_amount is the merchant-confirmed amount in that currency.
-- Never calculate a foreign settlement from assumed FX rates.
create function public.redeem_coupon(
  p_coupon_id uuid,p_amount numeric,p_request_id uuid,
  p_spend_currency text,p_settlement_amount numeric
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role text;
  v_card record;
  v_currency text;
  v_settlement numeric(12,2);
  v_exception record;
  v_source_url text;
  v_prior record;
  v_before numeric(12,2);
  v_after numeric(12,2);
  v_tx uuid;
begin
  if v_uid is null then raise exception 'Sign in is required to redeem a card.'; end if;
  if p_coupon_id is null or p_request_id is null then
    raise exception 'Card ID and request ID are required.';
  end if;
  if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2)
     or p_amount>9999999999.99 then
    raise exception 'Enter a positive card debit with at most two decimal places.';
  end if;
  if p_spend_currency not in ('INR','CAD','USD') or p_spend_currency is null then
    raise exception 'Unsupported merchant checkout currency.';
  end if;
  select p.role into v_role from public.profiles p where p.id=v_uid;
  if v_role not in ('super_admin','contributor') or v_role is null then
    raise exception 'Only contributors and administrators can redeem cards.';
  end if;

  select c.id,c.created_by,c.amount,c.status,c.expiry,c.currency_code
  into v_card from public.coupons c where c.id=p_coupon_id for update;
  if not found then raise exception 'Gift card not found.'; end if;
  if v_role <> 'super_admin' and v_card.created_by is distinct from v_uid then
    raise exception 'Only the card creator or Super Admin can redeem it.';
  end if;
  v_currency := v_card.currency_code;
  if v_currency not in ('INR','CAD','USD') then raise exception 'Unsupported gift card currency.'; end if;

  if p_spend_currency=v_currency then
    if p_settlement_amount is not null and p_settlement_amount<>p_amount then
      raise exception 'Same-currency merchant amount must equal the card debit.';
    end if;
    v_settlement:=p_amount;
    v_source_url:=null;
  else
    if p_settlement_amount is null or p_settlement_amount<=0
       or p_settlement_amount<>round(p_settlement_amount,2)
       or p_settlement_amount>9999999999.99 then
      raise exception 'Enter the actual merchant charge with at most two decimals.';
    end if;
    select e.verified_by,e.evidence_url,e.valid_until into v_exception
      from public.coupon_currency_exceptions e
      where e.coupon_id=p_coupon_id
        and e.source_currency=v_currency
        and e.target_currency=p_spend_currency
        and e.active=true
      for share;
    if not found or (v_exception.valid_until is not null
        and v_exception.valid_until<current_date) then
      raise exception 'Cross-currency redemption blocked: issuer permission for this card and currency pair is not verified.';
    end if;
    v_settlement:=p_settlement_amount;
    v_source_url:=v_exception.evidence_url;
  end if;

  -- Lock and validate BEFORE checking duplicate request. The original intent
  -- must match both the card debit and the merchant charge on a retry.
  select t.id,t.coupon_id,t.amount_delta,t.balance_after,
         t.currency_code,t.settlement_currency,t.settlement_amount
  into v_prior from public.coupon_transactions t
  where t.actor_id=v_uid and t.request_id=p_request_id;

  if found then
    if v_prior.coupon_id<>p_coupon_id
       or -v_prior.amount_delta<>p_amount
       or v_prior.currency_code<>v_currency
       or v_prior.settlement_currency<>p_spend_currency
       or v_prior.settlement_amount<>v_settlement then
      raise exception 'Request ID already belongs to different redemption terms.';
    end if;
    return jsonb_build_object(
      'transaction_id',v_prior.id,'coupon_id',p_coupon_id,'spent',p_amount,
      'currency',v_currency,'merchant_currency',p_spend_currency,
      'merchant_amount',v_prior.settlement_amount,'remaining',v_prior.balance_after,
      'replayed',true
    );
  end if;

  if v_card.status<>'active' or v_card.amount<=0 then
    raise exception 'This card is already fully used.';
  end if;
  if v_card.expiry is not null and v_card.expiry<current_date then
    raise exception 'This card has expired.';
  end if;
  if p_amount>v_card.amount then
    raise exception 'Insufficient original-currency balance.';
  end if;

  v_before:=v_card.amount;
  v_after:=v_before-p_amount;
  insert into public.coupon_transactions(
    coupon_id,actor_id,transaction_type,amount_delta,
    balance_before,balance_after,request_id,currency_code,
    settlement_currency,settlement_amount,issuer_evidence_url
  ) values (
    p_coupon_id,v_uid,'redemption',-p_amount,
    v_before,v_after,p_request_id,v_currency,
    p_spend_currency,v_settlement,v_source_url
  ) returning id into v_tx;

  update public.coupons
    set amount=v_after,
        status=case when v_after=0 then 'used' else 'active' end,
        updated_at=now()
    where id=p_coupon_id;

  return jsonb_build_object(
    'transaction_id',v_tx,'coupon_id',p_coupon_id,'spent',p_amount,
    'currency',v_currency,'merchant_currency',p_spend_currency,
    'merchant_amount',v_settlement,'remaining',v_after,'replayed',false
  );
end;
$$;
revoke execute on function public.redeem_coupon(uuid,numeric,uuid,text,numeric)
  from public,anon;
grant execute on function public.redeem_coupon(uuid,numeric,uuid,text,numeric)
  to authenticated;

-- Using this RPC logs a user's statement of spending, NOT proof a merchant
-- accepted the card. The issuer ultimately controls real-world eligibility.
