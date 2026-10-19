-- ============================================================
-- STEP 54 - BIMINI BATTELLI
--
-- Primo modulo "teloneria" (dopo tappezzeria e teak): Bimini.
-- Stesso identico principio della tappezzeria - kit fisico in
-- giacenza con Matricola Kit, stato ASSEGNATA/NON ASSEGNATA,
-- assegna/annulla dalla scheda battello - ma piu' semplice: solo
-- colore (niente dettagli/cucitura/trapuntatura o copertura), e
-- fornitore sempre D'Amico Arredamenti Navali (niente scelta del
-- fornitore nei form).
--
-- Se questo primo modulo funziona bene, lo stesso schema verra'
-- replicato identico per: Bimini di poppa, Copriconsolle,
-- Copriseduta, Copribattello.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- GIACENZA KIT BIMINI
-- ------------------------------------------------------------

create table if not exists public.bimini_kits (
  id uuid primary key default gen_random_uuid(),
  supplier_id text not null,
  item_id text not null,
  matricola integer not null,
  scanner_code text not null,
  unit_price numeric(12,2) not null default 0,
  color text not null,
  note text,
  status text not null default 'stock',
  received_at timestamptz not null default now(),
  boat_id uuid references public.production_boats(id),
  boat_registration text,
  out_at timestamptz,
  constraint bimini_kits_unit_price_check check (unit_price >= 0),
  constraint bimini_kits_matricola_unique unique (supplier_id, matricola)
);

create index if not exists bimini_kits_item_idx
  on public.bimini_kits (supplier_id, item_id);

create index if not exists bimini_kits_status_idx
  on public.bimini_kits (status);

alter table public.bimini_kits enable row level security;

drop policy if exists bimini_kits_all on public.bimini_kits;
create policy bimini_kits_all
on public.bimini_kits
for all
to anon, authenticated
using (true)
with check (true);

-- ------------------------------------------------------------
-- COLORI CONFIGURABILI PER FORNITORE (come teak_options)
-- ------------------------------------------------------------

create table if not exists public.bimini_options (
  id uuid primary key default gen_random_uuid(),
  supplier_id text not null,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0
);

create index if not exists bimini_options_supplier_idx
  on public.bimini_options (supplier_id);

alter table public.bimini_options enable row level security;

drop policy if exists bimini_options_all on public.bimini_options;
create policy bimini_options_all
on public.bimini_options
for all
to anon, authenticated
using (true)
with check (true);

-- ------------------------------------------------------------
-- MODULO ATTIVO SOLO PER IL FORNITORE GIUSTO (D'Amico)
-- ------------------------------------------------------------

alter table public.suppliers
add column if not exists bimini_enabled boolean not null default false;

update public.suppliers
set bimini_enabled = true
where upper(trim(replace(name, '’', ''''))) =
      'D''AMICO ARREDAMENTI NAVALI';

-- ------------------------------------------------------------
-- COLLEGAMENTO BIMINI <-> BATTELLO (una richiesta per battello)
-- ------------------------------------------------------------

create table if not exists public.production_boat_bimini (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.production_boats(id) on delete cascade,
  supplier_id text not null,
  item_id text not null,
  color text not null,
  note text,
  kit_id uuid references public.bimini_kits(id),
  created_at timestamptz not null default now()
);

create index if not exists production_boat_bimini_boat_idx
  on public.production_boat_bimini (boat_id);

create index if not exists production_boat_bimini_item_idx
  on public.production_boat_bimini (supplier_id, item_id);

alter table public.production_boat_bimini enable row level security;

drop policy if exists production_boat_bimini_all on public.production_boat_bimini;
create policy production_boat_bimini_all
on public.production_boat_bimini
for all
to anon, authenticated
using (true)
with check (true);

-- ------------------------------------------------------------
-- MATRICOLA KIT: primo numero libero da 1 a 10000
-- ------------------------------------------------------------

create or replace function public.next_bimini_matricola(
  p_supplier_id text
)
returns integer
language sql
stable
as $$
  select candidate
  from generate_series(1, 10000) as candidate
  where not exists (
    select 1
    from public.bimini_kits k
    where k.supplier_id = p_supplier_id
      and k.matricola = candidate
  )
  order by candidate
  limit 1;
$$;

-- ------------------------------------------------------------
-- REGISTRA UN KIT GIA' FISICAMENTE IN AZIENDA
-- ------------------------------------------------------------

create or replace function public.create_bimini_stock_kit(
  p_supplier_id text,
  p_item_id text,
  p_matricola integer,
  p_scanner_code text,
  p_unit_price numeric,
  p_color text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit_id uuid;
  v_item_exists boolean;
  v_supplier_enabled boolean;
begin
  if p_matricola is null or p_matricola < 1 or p_matricola > 10000 then
    raise exception 'Matricola Kit non valida. Deve essere compresa tra 1 e 10000.';
  end if;

  if coalesce(trim(p_scanner_code), '') = '' then
    raise exception 'Codice scanner obbligatorio.';
  end if;

  if coalesce(trim(p_color), '') = '' then
    raise exception 'Colore obbligatorio.';
  end if;

  if p_unit_price is null or p_unit_price < 0 then
    raise exception 'Prezzo kit non valido.';
  end if;

  select coalesce(s.bimini_enabled, false)
  into v_supplier_enabled
  from public.suppliers s
  where s.id::text = p_supplier_id
  limit 1;

  if coalesce(v_supplier_enabled, false) = false then
    raise exception 'Gestione Bimini non attiva per questo fornitore.';
  end if;

  select exists (
    select 1
    from public.items i
    where i.id::text = p_item_id
      and i.supplier_id::text = p_supplier_id
  )
  into v_item_exists;

  if not v_item_exists then
    raise exception 'Articolo non appartenente al fornitore selezionato.';
  end if;

  if exists (
    select 1
    from public.bimini_kits k
    where k.supplier_id = p_supplier_id
      and k.matricola = p_matricola
  ) then
    raise exception 'Matricola Kit già utilizzata: %', p_matricola;
  end if;

  insert into public.bimini_kits (
    supplier_id, item_id, matricola, scanner_code,
    unit_price, color, status, note, received_at
  )
  values (
    p_supplier_id, p_item_id, p_matricola, trim(p_scanner_code),
    p_unit_price, trim(p_color), 'stock',
    nullif(trim(coalesce(p_note, '')), ''), now()
  )
  returning id into v_kit_id;

  update public.items
  set stock = coalesce(stock, 0) + 1
  where id::text = p_item_id
    and supplier_id::text = p_supplier_id;

  return v_kit_id;
end;
$$;

-- ------------------------------------------------------------
-- ASSEGNA UN KIT IN GIACENZA A UNA RICHIESTA BIMINI DI UN BATTELLO
-- ------------------------------------------------------------

create or replace function public.assign_bimini_kit_to_boat(
  p_kit_id uuid,
  p_boat_bimini_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit public.bimini_kits%rowtype;
  v_req public.production_boat_bimini%rowtype;
  v_boat public.production_boats%rowtype;
  v_current_stock numeric;
begin
  select * into v_kit
  from public.bimini_kits
  where id = p_kit_id
  for update;

  if not found then
    raise exception 'Kit non trovato.';
  end if;

  if v_kit.status <> 'stock' then
    raise exception 'Il kit non è attualmente in giacenza.';
  end if;

  select * into v_req
  from public.production_boat_bimini
  where id = p_boat_bimini_id
  for update;

  if not found then
    raise exception 'Richiesta Bimini del battello non trovata.';
  end if;

  if v_req.kit_id is not null then
    raise exception 'Questa richiesta ha già un kit assegnato.';
  end if;

  select * into v_boat
  from public.production_boats
  where id = v_req.boat_id;

  if not found then
    raise exception 'Battello non trovato.';
  end if;

  select coalesce(i.stock, 0)
  into v_current_stock
  from public.items i
  where i.id::text = v_kit.item_id
  for update;

  if v_current_stock is null or v_current_stock <= 0 then
    raise exception 'Giacenza articolo insufficiente.';
  end if;

  update public.items
  set stock = stock - 1
  where id::text = v_kit.item_id;

  update public.bimini_kits
  set
    status = 'out',
    out_at = now(),
    boat_id = v_req.boat_id,
    boat_registration = v_boat.order_number
  where id = p_kit_id;

  update public.production_boat_bimini
  set kit_id = p_kit_id
  where id = p_boat_bimini_id;
end;
$$;

-- ------------------------------------------------------------
-- ANNULLA L'ASSEGNAZIONE: IL KIT TORNA IN GIACENZA
-- ------------------------------------------------------------

create or replace function public.unassign_bimini_kit_from_boat(
  p_kit_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit public.bimini_kits%rowtype;
begin
  select * into v_kit
  from public.bimini_kits
  where id = p_kit_id
  for update;

  if not found then
    raise exception 'Kit non trovato.';
  end if;

  if v_kit.status <> 'out' or v_kit.boat_id is null then
    raise exception 'Questo kit non risulta assegnato a un battello.';
  end if;

  update public.items
  set stock = coalesce(stock, 0) + 1
  where id::text = v_kit.item_id;

  update public.production_boat_bimini
  set kit_id = null
  where kit_id = p_kit_id;

  update public.bimini_kits
  set
    status = 'stock',
    out_at = null,
    boat_id = null,
    boat_registration = null
  where id = p_kit_id;
end;
$$;

-- ------------------------------------------------------------
-- SICUREZZA ELIMINAZIONE BATTELLO
--
-- bimini_kits.boat_id punta al battello SENZA "on delete
-- cascade" (di proposito, per non perdere la storia del kit
-- quando si libera). Senza questo trigger, eliminare un
-- battello con un kit Bimini ancora assegnato fallirebbe per
-- vincolo di chiave esterna: questo trigger libera prima
-- automaticamente ogni kit Bimini del battello (torna in
-- giacenza, giacenza articolo ripristinata), cosi' come gia'
-- avviene per tappezzeria/teak.
-- ------------------------------------------------------------

create or replace function public.release_bimini_kits_before_boat_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.items i
  set stock = coalesce(i.stock, 0) + 1
  from public.bimini_kits k
  where k.boat_id = old.id
    and k.status = 'out'
    and i.id::text = k.item_id;

  update public.bimini_kits
  set
    status = 'stock',
    out_at = null,
    boat_id = null,
    boat_registration = null
  where boat_id = old.id;

  return old;
end;
$$;

drop trigger if exists release_bimini_kits_before_boat_delete on public.production_boats;
create trigger release_bimini_kits_before_boat_delete
before delete on public.production_boats
for each row
execute function public.release_bimini_kits_before_boat_delete();

grant execute on function public.next_bimini_matricola(text) to anon, authenticated;
grant execute on function public.create_bimini_stock_kit(text, text, integer, text, numeric, text, text) to anon, authenticated;
grant execute on function public.assign_bimini_kit_to_boat(uuid, uuid) to anon, authenticated;
grant execute on function public.unassign_bimini_kit_from_boat(uuid) to anon, authenticated;

-- Controllo finale: deve comparire D'Amico Arredamenti Navali con bimini_enabled = true
select id, name, bimini_enabled from public.suppliers where bimini_enabled = true;

-- FINE STEP 54
