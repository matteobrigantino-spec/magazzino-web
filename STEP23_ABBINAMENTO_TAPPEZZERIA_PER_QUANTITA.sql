-- ============================================================
-- STEP 23 - ABBINAMENTO TAPPEZZERIA/ORDINE: TIENE CONTO DELLA QUANTITA'
--
-- BUG TROVATO: una riga d'ordine (order_items) con quantita' > 1
-- (es. "Ordinato: 4") poteva essere abbinata SOLO a UN battello,
-- perche' il collegamento era una colonna singola su order_items
-- (order_items.boat_upholstery_id, aggiunta in STEP 18). Anche se
-- fisicamente arrivano 4 kit uguali, solo 1 richiesta battello
-- risultava "IN ORDINE": le altre restavano "DA ORDINARE" pur
-- essendo gia' coperte dall'ordine.
--
-- Esempio reale: 5 righe d'ordine per 5 articoli diversi, quantita'
-- 2+2+4+4+2 = 14 pezzi in arrivo, ma nello "Stato tappezzerie"
-- risultavano collegate solo 5 richieste (una per riga, non una per
-- pezzo).
--
-- FIX: il collegamento si sposta da order_items (una riga -> un
-- battello) a production_boat_upholstery (una richiesta battello ->
-- una riga d'ordine): cosi' piu' richieste battello possono puntare
-- alla STESSA riga d'ordine, fino ad esaurire la sua quantita'
-- ancora aperta (qty - gia' ricevuto). L'abbinamento resta sempre
-- per priorita' di consegna (battello con consegna piu' vicina
-- prima), esattamente come STEP 21/22.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Nuovo collegamento: dalla richiesta battello alla riga
--    d'ordine (invece che il contrario). Cosi' piu' richieste
--    possono condividere la stessa riga d'ordine.
-- ------------------------------------------------------------
alter table public.production_boat_upholstery
  add column if not exists order_item_id uuid
    references public.order_items(id);

create index if not exists production_boat_upholstery_order_item_idx
  on public.production_boat_upholstery (order_item_id);

-- Migra i collegamenti gia' esistenti (fatti col vecchio sistema a
-- colonna singola su order_items) sul nuovo collegamento, prima di
-- eliminare la vecchia colonna.
update public.production_boat_upholstery pbu
set order_item_id = oi.id
from public.order_items oi
where oi.boat_upholstery_id = pbu.id
  and pbu.order_item_id is null;

alter table public.order_items
  drop column if exists boat_upholstery_id;

-- ------------------------------------------------------------
-- 2) sync_upholstery_order_links: ora scorre la quantita' ancora
--    libera di ogni riga d'ordine (qty - ricevuto - gia' collegate)
--    e abbina TANTE richieste battello quante ce ne stanno, sempre
--    dando la precedenza al battello con consegna piu' vicina.
-- ------------------------------------------------------------
create or replace function public.sync_upholstery_order_links(
  p_supplier_id text,
  p_item_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line record;
  v_request_id uuid;
  v_capacity integer;
  v_count integer := 0;
begin
  for v_line in
    select
      oi.id as order_item_id,
      oi.qty,
      coalesce(oi.received_qty, 0) as received_qty,
      (
        select count(*)
        from public.production_boat_upholstery pbu2
        where pbu2.order_item_id = oi.id
      ) as already_linked
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.item_id::text = p_item_id
      and o.supplier_id::text = p_supplier_id
      and oi.qty > coalesce(oi.received_qty, 0)
    order by o.order_date asc nulls last, o.created_at asc, oi.id asc
  loop
    v_capacity :=
      (v_line.qty - v_line.received_qty) - v_line.already_linked;

    while v_capacity > 0 loop
      v_request_id := null;

      select pbu.id
      into v_request_id
      from public.production_boat_upholstery pbu
      join public.production_boats pb on pb.id = pbu.boat_id
      where pbu.supplier_id = p_supplier_id
        and pbu.item_id = p_item_id
        and pbu.kit_id is null
        and pbu.order_item_id is null
      order by pb.requested_delivery_date asc nulls last, pb.created_at asc
      limit 1
      for update of pbu skip locked;

      exit when v_request_id is null;

      update public.production_boat_upholstery
      set order_item_id = v_line.order_item_id
      where id = v_request_id;

      v_count := v_count + 1;
      v_capacity := v_capacity - 1;
    end loop;
  end loop;

  return v_count;
end;
$$;

grant execute
on function public.sync_upholstery_order_links(text, text)
to anon, authenticated;

-- ------------------------------------------------------------
-- 3) assign_stock_kit_by_priority: la riga liberata (quando un kit
--    fisico sostituisce la prenotazione d'ordine) si libera sulla
--    nuova colonna.
-- ------------------------------------------------------------
create or replace function public.assign_stock_kit_by_priority(
  p_kit_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit public.upholstery_kits%rowtype;
  v_target_id uuid;
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

  select pbu.id
  into v_target_id
  from public.production_boat_upholstery pbu
  join public.production_boats pb on pb.id = pbu.boat_id
  where pbu.supplier_id = v_kit.supplier_id
    and pbu.item_id = v_kit.item_id
    and pbu.kit_id is null
  order by pb.requested_delivery_date asc nulls last, pb.created_at asc
  limit 1
  for update of pbu;

  if v_target_id is null then
    return null;
  end if;

  -- Libera l'eventuale riga d'ordine gia' prenotata per questo
  -- battello: il kit fisico appena trovato la sostituisce subito.
  update public.production_boat_upholstery
  set order_item_id = null
  where id = v_target_id;

  perform public.assign_upholstery_kit_to_boat(p_kit_id, v_target_id);

  -- Rida' la capacita' liberata (se c'era una riga d'ordine
  -- prenotata) al prossimo battello in attesa della stessa esigenza.
  perform public.sync_upholstery_order_links(
    v_kit.supplier_id,
    v_kit.item_id
  );

  return v_target_id;
end;
$$;

grant execute
on function public.assign_stock_kit_by_priority(uuid)
to anon, authenticated;

-- ------------------------------------------------------------
-- 4) Riconciliazione una tantum: rifa' subito tutti gli abbinamenti
--    con la logica nuova, cosi' la quantita' gia' in ordine adesso
--    ma rimasta "orfana" (bloccata a 1 collegamento per riga) si
--    sistema subito, senza aspettare il prossimo ordine/richiesta.
-- ------------------------------------------------------------
do $$
declare
  v_pair record;
begin
  for v_pair in
    select distinct supplier_id, item_id
    from public.production_boat_upholstery
    where kit_id is null
  loop
    perform public.sync_upholstery_order_links(
      v_pair.supplier_id,
      v_pair.item_id
    );
  end loop;
end $$;

-- FINE STEP 23
