-- ============================================================
-- STEP 59 - PARABREZZA: riconcilia giacenza non tracciata
--
-- BUG TROVATO: quando mappi un NUOVO articolo come parabrezza
-- (pagina Parabrezza, "+ Aggiungi mappatura"), se quell'articolo ha
-- GIA' della giacenza generale arrivata PRIMA di essere mappato
-- (items.stock > 0), quella giacenza non diventa mai un pezzo
-- tracciato (windshield_kits): il trigger di STEP32 scatta solo sui
-- NUOVI aumenti di giacenza da quel momento in poi, e la
-- riconciliazione una tantum di STEP32 copriva solo gli articoli
-- gia' mappati in quel momento (non quelli mappati dopo).
--
-- Risultato concreto: Modelplast attivato con STEP52, poi mappato
-- "Predator 700" -> IB.700.01 con giacenza gia' a 8 pezzi. Quegli
-- 8 pezzi restano invisibili al sistema parabrezza: i battelli
-- Predator 700 gia' in produzione (es. 2277) risultano "da
-- ordinare" nella pagina Parabrezza e nel pannello dashboard,
-- anche se la giacenza generale mostra chiaramente 8 pezzi
-- disponibili.
--
-- FIX: una funzione riutilizzabile che confronta la giacenza
-- generale di un articolo con quanta ne e' gia' tracciata, crea i
-- pezzi mancanti e prova subito ad assegnarli per priorita' di
-- consegna (stessa identica logica del blocco "una tantum" di
-- STEP32, ma richiamabile in ogni momento, non solo una volta).
-- Sicura da rieseguire: conta sempre la DIFFERENZA tra giacenza
-- generale e pezzi gia' tracciati, non crea mai doppioni.
--
-- Applicata subito a tutti gli articoli gia' in mappa (risolve
-- anche il caso Modelplast/Predator 700 gia' in corso), e agganciata
-- al codice di "+ Aggiungi mappatura" / cambio articolo mappato,
-- cosi' non si ripresenta piu' in futuro.
-- ============================================================

create or replace function public.reconcile_windshield_stock_for_item(
  p_item_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock numeric;
  v_tracked integer;
  v_untracked integer;
  v_kit_id uuid;
  v_i integer;
begin
  select coalesce(stock, 0)
  into v_stock
  from public.items
  where id::text = p_item_id;

  if v_stock is null then
    return 0;
  end if;

  select count(*)
  into v_tracked
  from public.windshield_kits
  where item_id = p_item_id
    and status = 'stock';

  v_untracked := greatest(v_stock::integer - coalesce(v_tracked, 0), 0);

  for v_i in 1..v_untracked loop
    insert into public.windshield_kits (item_id, status, note, received_at)
    values (
      p_item_id,
      'stock',
      'Giacenza pre-esistente riconciliata (STEP 59)',
      now()
    )
    returning id into v_kit_id;

    perform public.assign_windshield_stock_kit_by_priority(v_kit_id);
  end loop;

  return v_untracked;
end;
$$;

grant execute
on function public.reconcile_windshield_stock_for_item(text)
to anon, authenticated;

-- ------------------------------------------------------------
-- Riconciliazione immediata: applica il fix adesso a tutti gli
-- articoli gia' presenti in mappa (risolve subito anche Modelplast
-- / Predator 700 / battello 2277 e qualsiasi altro caso uguale).
-- ------------------------------------------------------------
do $$
declare
  v_row record;
begin
  for v_row in
    select distinct item_id from public.production_windshield_matrix
  loop
    perform public.reconcile_windshield_stock_for_item(v_row.item_id);
  end loop;
end $$;

-- Controllo finale: battelli ancora "da ordinare" dopo la
-- riconciliazione (nessun kit assegnato e nessun ordine aperto
-- collegato). Se la lista è vuota, tutto risolto.
select
  pb.order_number,
  pb.model_boat,
  pb.requested_delivery_date,
  pbw.item_id
from public.production_boat_windshield pbw
join public.production_boats pb on pb.id = pbw.boat_id
where pbw.kit_id is null
  and pbw.order_item_id is null
  and pb.status = 'active'
order by pb.requested_delivery_date asc nulls last;

-- FINE STEP 59
