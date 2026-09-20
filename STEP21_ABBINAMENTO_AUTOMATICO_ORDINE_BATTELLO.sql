-- ============================================================
-- STEP 21 - ABBINAMENTO AUTOMATICO ORDINE <-> BATTELLO PER DATA
--
-- Se ci sono più battelli dello stesso modello che aspettano lo
-- stesso articolo di tappezzeria (stesso fornitore + stesso
-- articolo), la riga d'ordine ancora libera (non assegnata a un
-- battello preciso con "Per battello") viene abbinata in automatico
-- al battello con la "consegna richiesta" più vicina nel tempo (i
-- battelli senza data restano per ultimi).
--
-- La funzione viene richiamata in due punti del sito:
--   1) alla conferma di un ordine fornitore, per le righe non
--      assegnate a mano con "Per battello"
--   2) quando si aggiunge una richiesta tappezzeria a un battello
--      e non c'è un kit identico già in giacenza da assegnare
--      subito
--
-- Qui sotto viene anche eseguita una volta sola, per sistemare
-- retroattivamente tutti gli abbinamenti già rimasti in sospeso
-- (es. ordine fatto prima di inserire la richiesta sul battello).
-- ============================================================

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
  v_count integer := 0;
begin
  for v_line in
    select oi.id as order_item_id
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.boat_upholstery_id is null
      and oi.item_id::text = p_item_id
      and o.supplier_id::text = p_supplier_id
      and oi.qty > coalesce(oi.received_qty, 0)
    order by o.order_date asc nulls last, o.created_at asc, oi.id asc
  loop
    v_request_id := null;

    select pbu.id
    into v_request_id
    from public.production_boat_upholstery pbu
    join public.production_boats pb on pb.id = pbu.boat_id
    where pbu.supplier_id = p_supplier_id
      and pbu.item_id = p_item_id
      and pbu.kit_id is null
      and not exists (
        select 1
        from public.order_items oi2
        where oi2.boat_upholstery_id = pbu.id
      )
    order by pb.requested_delivery_date asc nulls last, pb.created_at asc
    limit 1
    for update of pbu skip locked;

    if v_request_id is null then
      exit;
    end if;

    update public.order_items
    set boat_upholstery_id = v_request_id
    where id = v_line.order_item_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute
on function public.sync_upholstery_order_links(text, text)
to anon, authenticated;

-- ------------------------------------------------------------
-- Riconciliazione una tantum: sistema subito tutti gli
-- abbinamenti già rimasti in sospeso finora.
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

-- FINE STEP 21
