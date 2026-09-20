-- ============================================================
-- STEP 22 - KIT TROVATO IN GIACENZA: PRIORITÀ PER CONSEGNA
--
-- Quando registri un kit che hai già fisicamente in azienda
-- ("+ Registra kit") e più battelli aspettano lo stesso articolo
-- dello stesso fornitore, il kit va in automatico al battello con
-- la consegna richiesta più vicina — perché è disponibile subito.
--
-- Se quel battello aveva già una riga d'ordine "in arrivo"
-- prenotata (STEP 21), viene liberata e ridata automaticamente al
-- battello successivo in ordine di consegna (che nel frattempo può
-- aspettare l'ordine, avendo più tempo).
--
-- La scelta manuale "Assegna a battello" resta disponibile come
-- override: se scegli tu un battello preciso, questa priorità
-- automatica non entra in gioco.
-- ============================================================

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

  -- Battello con la consegna richiesta più vicina tra quelli ancora
  -- senza un kit fisico assegnato, per lo stesso fornitore/articolo.
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

  -- Libera l'eventuale riga d'ordine già prenotata per questo
  -- battello: il kit fisico appena trovato la sostituisce subito.
  update public.order_items
  set boat_upholstery_id = null
  where boat_upholstery_id = v_target_id;

  perform public.assign_upholstery_kit_to_boat(p_kit_id, v_target_id);

  -- Ridà la riga d'ordine liberata (se c'era) al prossimo battello
  -- in attesa della stessa esigenza.
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

-- FINE STEP 22
