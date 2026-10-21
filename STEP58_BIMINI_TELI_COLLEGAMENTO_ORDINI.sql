-- ============================================================
-- STEP 58 - BIMINI/TELI: collegamento al sistema ordini
--
-- Stesso identico meccanismo gia' usato da Teak (vedi funzione
-- sync_teak_order_links esistente, copiata qui parola per parola
-- solo cambiando la tabella): una richiesta battello ancora senza
-- kit assegnato E senza riga d'ordine collegata deve entrare nella
-- proposta automatica d'ordine anche se la giacenza generale
-- dell'articolo e' gia' sopra la scorta minima. Quando un ordine
-- viene confermato, sync_bimini_order_links/sync_teli_order_links
-- abbinano in automatico le righe d'ordine appena create alle
-- richieste battello ancora aperte, nell'ordine di consegna piu'
-- vicina.
-- ============================================================

alter table public.production_boat_bimini
  add column if not exists order_item_id uuid references public.order_items(id) on delete set null;

alter table public.production_boat_teli
  add column if not exists order_item_id uuid references public.order_items(id) on delete set null;

create index if not exists production_boat_bimini_order_item_idx
  on public.production_boat_bimini (order_item_id);

create index if not exists production_boat_teli_order_item_idx
  on public.production_boat_teli (order_item_id);

-- ------------------------------------------------------------
-- sync_bimini_order_links - copia esatta di sync_teak_order_links
-- ------------------------------------------------------------
create or replace function public.sync_bimini_order_links(
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
        from public.production_boat_bimini pbb2
        where pbb2.order_item_id = oi.id
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

      select pbb.id
      into v_request_id
      from public.production_boat_bimini pbb
      join public.production_boats pb on pb.id = pbb.boat_id
      where pbb.supplier_id = p_supplier_id
        and pbb.item_id = p_item_id
        and pbb.kit_id is null
        and pbb.order_item_id is null
      order by pb.requested_delivery_date asc nulls last, pb.created_at asc
      limit 1
      for update of pbb skip locked;

      exit when v_request_id is null;

      update public.production_boat_bimini
      set order_item_id = v_line.order_item_id
      where id = v_request_id;

      v_count := v_count + 1;
      v_capacity := v_capacity - 1;
    end loop;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.sync_bimini_order_links(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- sync_teli_order_links - stessa copia esatta, su production_boat_teli
-- (il campo "tipo" non serve qui: ogni articolo Teli e' gia' un
-- prodotto specifico, quindi l'abbinamento per item_id basta da solo)
-- ------------------------------------------------------------
create or replace function public.sync_teli_order_links(
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
        from public.production_boat_teli pbt2
        where pbt2.order_item_id = oi.id
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

      select pbt.id
      into v_request_id
      from public.production_boat_teli pbt
      join public.production_boats pb on pb.id = pbt.boat_id
      where pbt.supplier_id = p_supplier_id
        and pbt.item_id = p_item_id
        and pbt.kit_id is null
        and pbt.order_item_id is null
      order by pb.requested_delivery_date asc nulls last, pb.created_at asc
      limit 1
      for update of pbt skip locked;

      exit when v_request_id is null;

      update public.production_boat_teli
      set order_item_id = v_line.order_item_id
      where id = v_request_id;

      v_count := v_count + 1;
      v_capacity := v_capacity - 1;
    end loop;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.sync_teli_order_links(text, text) to anon, authenticated;

-- FINE STEP 58
