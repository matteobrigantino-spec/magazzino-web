-- ============================================================
-- STEP 30 - PARABREZZA: CONVERTI GIACENZA GIA' ESISTENTE
--
-- La giacenza generale di un articolo (items.stock, quella che
-- vedi anche nella pagina Movimenti o negli ordini ricevuti) e i
-- pezzi tracciati singolarmente in windshield_kits sono due
-- contatori diversi. Se dei pezzi arrivano in magazzino con
-- Movimenti (o con un ordine ricevuto) invece che con "Registra
-- un arrivo" nella pagina Parabrezza, items.stock sale ma
-- windshield_kits resta vuoto: "Parabrezza in giacenza" mostra 0
-- anche se l'articolo ha pezzi disponibili, e quei pezzi non
-- vengono mai assegnati in automatico ai battelli in attesa.
--
-- Questa funzione prende N pezzi di giacenza GIA' ESISTENTE e li
-- registra come pezzi tracciati (senza matricola, non serve),
-- pronti per l'assegnazione automatica. NON tocca items.stock:
-- quei pezzi sono gia' conteggiati li', si tratta solo di
-- "smistarli" nel sistema di tracciamento. Prova subito anche ad
-- assegnarli ai battelli in attesa, come fa "Registra un arrivo".
--
-- Non si puo' convertire piu' pezzi di quanti ne risultino ancora
-- non tracciati (giacenza generale meno pezzi gia' tracciati).
-- ============================================================

create or replace function public.convert_item_stock_to_windshield_kits(
  p_item_id text,
  p_quantity integer
)
returns table(created integer, assigned integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_stock numeric;
  v_tracked_count integer;
  v_untracked integer;
  v_kit_id uuid;
  v_assigned_req uuid;
  v_created integer := 0;
  v_assigned integer := 0;
  v_i integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantità non valida.';
  end if;

  select coalesce(i.stock, 0)
  into v_item_stock
  from public.items i
  where i.id::text = p_item_id
  for update;

  if v_item_stock is null then
    raise exception 'Articolo non trovato.';
  end if;

  select count(*)
  into v_tracked_count
  from public.windshield_kits
  where item_id = p_item_id
    and status = 'stock';

  v_untracked := greatest(v_item_stock::integer - v_tracked_count, 0);

  if p_quantity > v_untracked then
    raise exception 'Puoi convertire al massimo % pezzi non ancora tracciati per questo articolo.', v_untracked;
  end if;

  for v_i in 1..p_quantity loop
    insert into public.windshield_kits (item_id, status, note, received_at)
    values (p_item_id, 'stock', 'Convertito da giacenza generale già esistente', now())
    returning id into v_kit_id;

    v_created := v_created + 1;

    select public.assign_windshield_stock_kit_by_priority(v_kit_id)
    into v_assigned_req;

    if v_assigned_req is not null then
      v_assigned := v_assigned + 1;
    end if;
  end loop;

  return query select v_created, v_assigned;
end;
$$;

grant execute
on function public.convert_item_stock_to_windshield_kits(text, integer)
to anon, authenticated;

-- FINE STEP 30
