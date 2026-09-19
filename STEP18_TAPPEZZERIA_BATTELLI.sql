-- ============================================================
-- STEP 18 - PRODUZIONE + TAPPEZZERIE
-- COLLEGAMENTO TAPPEZZERIA <-> BATTELLO
--
-- Da qui in poi un battello puo' avere una o piu' "richieste"
-- di tappezzeria (es. cuscineria + un altro articolo), ognuna
-- con il proprio stato:
--
--   ASSEGNATA   -> collegata a un kit fisico in giacenza (kit_id)
--   IN ORDINE   -> nessun kit ancora, ma una riga d'ordine la
--                  aspetta (order_items.boat_upholstery_id)
--   DA ORDINARE -> nessuna delle due cose sopra
--
-- Lo stato NON viene salvato in una colonna a parte: si calcola
-- ogni volta guardando kit_id e le righe ordine collegate, cosi'
-- non puo' mai andare fuori sincrono.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.production_boat_upholstery (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.production_boats(id) on delete cascade,
  supplier_id text not null,
  item_id text not null,
  color text not null,
  details_logos text not null,
  stitching text not null,
  quilting text not null,
  note text,
  kit_id uuid references public.upholstery_kits(id),
  created_at timestamptz not null default now()
);

create index if not exists production_boat_upholstery_boat_idx
  on public.production_boat_upholstery (boat_id);

create index if not exists production_boat_upholstery_item_idx
  on public.production_boat_upholstery (supplier_id, item_id);

alter table public.upholstery_kits
  add column if not exists boat_id uuid references public.production_boats(id);

alter table public.order_items
  add column if not exists boat_upholstery_id uuid
    references public.production_boat_upholstery(id);

-- ------------------------------------------------------------
-- Assegna un kit gia' in giacenza a una richiesta tappezzeria
-- di un battello: il kit passa da 'stock' a 'out', si collega
-- al battello (kit.boat_id + kit.boat_registration, come gia'
-- avviene per una vendita) e la richiesta registra il kit_id.
-- ------------------------------------------------------------
create or replace function public.assign_upholstery_kit_to_boat(
  p_kit_id uuid,
  p_boat_upholstery_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit public.upholstery_kits%rowtype;
  v_req public.production_boat_upholstery%rowtype;
  v_boat public.production_boats%rowtype;
  v_current_stock numeric;
begin
  select * into v_kit
  from public.upholstery_kits
  where id = p_kit_id
  for update;

  if not found then
    raise exception 'Kit non trovato.';
  end if;

  if v_kit.status <> 'stock' then
    raise exception 'Il kit non è attualmente in giacenza.';
  end if;

  select * into v_req
  from public.production_boat_upholstery
  where id = p_boat_upholstery_id
  for update;

  if not found then
    raise exception 'Richiesta tappezzeria del battello non trovata.';
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

  update public.upholstery_kits
  set
    status = 'out',
    out_at = now(),
    boat_id = v_req.boat_id,
    boat_registration = v_boat.order_number
  where id = p_kit_id;

  update public.production_boat_upholstery
  set kit_id = p_kit_id
  where id = p_boat_upholstery_id;
end;
$$;


-- ------------------------------------------------------------
-- Annulla l'assegnazione: il kit torna in giacenza (come
-- "Annulla vendita" gia' esistente), la richiesta torna libera.
-- ------------------------------------------------------------
create or replace function public.unassign_upholstery_kit_from_boat(
  p_kit_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit public.upholstery_kits%rowtype;
begin
  select * into v_kit
  from public.upholstery_kits
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

  update public.production_boat_upholstery
  set kit_id = null
  where kit_id = p_kit_id;

  update public.upholstery_kits
  set
    status = 'stock',
    out_at = null,
    boat_id = null,
    boat_registration = null
  where id = p_kit_id;
end;
$$;

grant execute
on function public.assign_upholstery_kit_to_boat(uuid, uuid)
to anon, authenticated;

grant execute
on function public.unassign_upholstery_kit_from_boat(uuid)
to anon, authenticated;

-- FINE STEP 18
