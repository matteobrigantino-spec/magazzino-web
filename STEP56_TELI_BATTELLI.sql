-- ============================================================
-- STEP 56 - TELI (modulo unico per i 4 tipi rimanenti)
--
-- Stesso identico principio di Bimini (STEP54): kit fisico in
-- giacenza con Matricola Kit, stato ASSEGNATA/NON ASSEGNATA,
-- assegna/annulla dalla scheda battello, fornitore sempre
-- D'Amico Arredamenti Navali. A differenza di Bimini, un unico
-- modulo "Teli" raggruppa i 4 tipi rimasti (invece di 4 moduli
-- separati), scelti con un campo Tipo dentro al kit:
--   Bimini di poppa, Copriconsolle, Copriseduta, Copribattello
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- TIPI AMMESSI
-- ------------------------------------------------------------

-- (nessuna tabella enum: validato con check constraint, piu'
-- semplice da gestire lato applicazione)

-- ------------------------------------------------------------
-- GIACENZA KIT TELI
-- ------------------------------------------------------------

create table if not exists public.teli_kits (
  id uuid primary key default gen_random_uuid(),
  supplier_id text not null,
  item_id text not null,
  tipo text not null,
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
  constraint teli_kits_unit_price_check check (unit_price >= 0),
  constraint teli_kits_matricola_unique unique (supplier_id, matricola),
  constraint teli_kits_tipo_check check (
    tipo in ('Bimini di poppa', 'Copriconsolle', 'Copriseduta', 'Copribattello')
  )
);

create index if not exists teli_kits_item_idx
  on public.teli_kits (supplier_id, item_id);

create index if not exists teli_kits_status_idx
  on public.teli_kits (status);

create index if not exists teli_kits_tipo_idx
  on public.teli_kits (tipo);

alter table public.teli_kits enable row level security;

drop policy if exists teli_kits_all on public.teli_kits;
create policy teli_kits_all
on public.teli_kits
for all
to anon, authenticated
using (true)
with check (true);

-- ------------------------------------------------------------
-- COLORI CONFIGURABILI PER FORNITORE (come bimini_options,
-- condivisi tra i 4 tipi: stesso tessuto/colore per tutti)
-- ------------------------------------------------------------

create table if not exists public.teli_options (
  id uuid primary key default gen_random_uuid(),
  supplier_id text not null,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0
);

create index if not exists teli_options_supplier_idx
  on public.teli_options (supplier_id);

alter table public.teli_options enable row level security;

drop policy if exists teli_options_all on public.teli_options;
create policy teli_options_all
on public.teli_options
for all
to anon, authenticated
using (true)
with check (true);

-- ------------------------------------------------------------
-- MODULO ATTIVO SOLO PER IL FORNITORE GIUSTO (D'Amico)
-- ------------------------------------------------------------

alter table public.suppliers
add column if not exists teli_enabled boolean not null default false;

update public.suppliers
set teli_enabled = true
where upper(trim(replace(name, '’', ''''))) =
      'D''AMICO ARREDAMENTI NAVALI';

-- ------------------------------------------------------------
-- COLLEGAMENTO TELI <-> BATTELLO (piu' righe per battello: es.
-- un battello puo' richiedere sia Copriconsolle che Copriseduta)
-- ------------------------------------------------------------

create table if not exists public.production_boat_teli (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.production_boats(id) on delete cascade,
  supplier_id text not null,
  item_id text not null,
  tipo text not null,
  color text not null,
  note text,
  kit_id uuid references public.teli_kits(id),
  created_at timestamptz not null default now(),
  constraint production_boat_teli_tipo_check check (
    tipo in ('Bimini di poppa', 'Copriconsolle', 'Copriseduta', 'Copribattello')
  )
);

create index if not exists production_boat_teli_boat_idx
  on public.production_boat_teli (boat_id);

create index if not exists production_boat_teli_item_idx
  on public.production_boat_teli (supplier_id, item_id);

alter table public.production_boat_teli enable row level security;

drop policy if exists production_boat_teli_all on public.production_boat_teli;
create policy production_boat_teli_all
on public.production_boat_teli
for all
to anon, authenticated
using (true)
with check (true);

-- ------------------------------------------------------------
-- MATRICOLA KIT: primo numero libero da 1 a 10000 (per
-- fornitore, condivisa tra i 4 tipi, come per Bimini)
-- ------------------------------------------------------------

create or replace function public.next_teli_matricola(
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
    from public.teli_kits k
    where k.supplier_id = p_supplier_id
      and k.matricola = candidate
  )
  order by candidate
  limit 1;
$$;

-- ------------------------------------------------------------
-- REGISTRA UN KIT GIA' FISICAMENTE IN AZIENDA
-- ------------------------------------------------------------

create or replace function public.create_teli_stock_kit(
  p_supplier_id text,
  p_item_id text,
  p_tipo text,
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
  if p_tipo not in ('Bimini di poppa', 'Copriconsolle', 'Copriseduta', 'Copribattello') then
    raise exception 'Tipo non valido: %', p_tipo;
  end if;

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

  select coalesce(s.teli_enabled, false)
  into v_supplier_enabled
  from public.suppliers s
  where s.id::text = p_supplier_id
  limit 1;

  if coalesce(v_supplier_enabled, false) = false then
    raise exception 'Gestione Teli non attiva per questo fornitore.';
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
    from public.teli_kits k
    where k.supplier_id = p_supplier_id
      and k.matricola = p_matricola
  ) then
    raise exception 'Matricola Kit già utilizzata: %', p_matricola;
  end if;

  insert into public.teli_kits (
    supplier_id, item_id, tipo, matricola, scanner_code,
    unit_price, color, status, note, received_at
  )
  values (
    p_supplier_id, p_item_id, p_tipo, p_matricola, trim(p_scanner_code),
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
-- ASSEGNA UN KIT IN GIACENZA A UNA RICHIESTA TELI DI UN BATTELLO
-- ------------------------------------------------------------

create or replace function public.assign_teli_kit_to_boat(
  p_kit_id uuid,
  p_boat_teli_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit public.teli_kits%rowtype;
  v_req public.production_boat_teli%rowtype;
  v_boat public.production_boats%rowtype;
  v_current_stock numeric;
begin
  select * into v_kit
  from public.teli_kits
  where id = p_kit_id
  for update;

  if not found then
    raise exception 'Kit non trovato.';
  end if;

  if v_kit.status <> 'stock' then
    raise exception 'Il kit non è attualmente in giacenza.';
  end if;

  select * into v_req
  from public.production_boat_teli
  where id = p_boat_teli_id
  for update;

  if not found then
    raise exception 'Richiesta Teli del battello non trovata.';
  end if;

  if v_req.kit_id is not null then
    raise exception 'Questa richiesta ha già un kit assegnato.';
  end if;

  if v_req.tipo <> v_kit.tipo then
    raise exception 'Il kit selezionato è di tipo diverso dalla richiesta (% vs %).', v_kit.tipo, v_req.tipo;
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

  update public.teli_kits
  set
    status = 'out',
    out_at = now(),
    boat_id = v_req.boat_id,
    boat_registration = v_boat.order_number
  where id = p_kit_id;

  update public.production_boat_teli
  set kit_id = p_kit_id
  where id = p_boat_teli_id;
end;
$$;

-- ------------------------------------------------------------
-- ANNULLA L'ASSEGNAZIONE: IL KIT TORNA IN GIACENZA
-- ------------------------------------------------------------

create or replace function public.unassign_teli_kit_from_boat(
  p_kit_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit public.teli_kits%rowtype;
begin
  select * into v_kit
  from public.teli_kits
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

  update public.production_boat_teli
  set kit_id = null
  where kit_id = p_kit_id;

  update public.teli_kits
  set
    status = 'stock',
    out_at = null,
    boat_id = null,
    boat_registration = null
  where id = p_kit_id;
end;
$$;

-- ------------------------------------------------------------
-- ELIMINA KIT IN GIACENZA (stesso principio di
-- delete_bimini_kit / delete_upholstery_kit: solo se status
-- = 'stock', ripristina la giacenza dell'articolo di 1)
-- ------------------------------------------------------------

create or replace function public.delete_teli_kit(
  p_kit_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit public.teli_kits%rowtype;
  v_current_stock numeric;
begin
  select * into v_kit
  from public.teli_kits
  where id = p_kit_id
  for update;

  if not found then
    raise exception 'Kit non trovato.';
  end if;

  if v_kit.status <> 'stock' then
    raise exception
      'Un kit assegnato a un battello non può essere eliminato. Prima annulla l''assegnazione.';
  end if;

  select coalesce(i.stock, 0)
  into v_current_stock
  from public.items i
  where i.id::text = v_kit.item_id
  for update;

  if v_current_stock is null then
    raise exception 'Articolo collegato non trovato.';
  end if;

  if v_current_stock <= 0 then
    raise exception
      'La giacenza dell''articolo è già a zero. Eliminazione bloccata per sicurezza.';
  end if;

  update public.items
  set stock = stock - 1
  where id::text = v_kit.item_id;

  delete from public.teli_kits
  where id = p_kit_id;
end;
$$;

-- ------------------------------------------------------------
-- SICUREZZA ELIMINAZIONE BATTELLO (come per Bimini)
-- ------------------------------------------------------------

create or replace function public.release_teli_kits_before_boat_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.items i
  set stock = coalesce(i.stock, 0) + 1
  from public.teli_kits k
  where k.boat_id = old.id
    and k.status = 'out'
    and i.id::text = k.item_id;

  update public.teli_kits
  set
    status = 'stock',
    out_at = null,
    boat_id = null,
    boat_registration = null
  where boat_id = old.id;

  return old;
end;
$$;

drop trigger if exists release_teli_kits_before_boat_delete on public.production_boats;
create trigger release_teli_kits_before_boat_delete
before delete on public.production_boats
for each row
execute function public.release_teli_kits_before_boat_delete();

grant execute on function public.next_teli_matricola(text) to anon, authenticated;
grant execute on function public.create_teli_stock_kit(text, text, text, integer, text, numeric, text, text) to anon, authenticated;
grant execute on function public.assign_teli_kit_to_boat(uuid, uuid) to anon, authenticated;
grant execute on function public.unassign_teli_kit_from_boat(uuid) to anon, authenticated;
grant execute on function public.delete_teli_kit(uuid) to anon, authenticated;

-- Controllo finale: deve comparire D'Amico Arredamenti Navali con teli_enabled = true
select id, name, teli_enabled from public.suppliers where teli_enabled = true;

-- FINE STEP 56
