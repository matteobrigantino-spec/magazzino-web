-- ============================================================
-- STEP 53 - MEDIA CONSUMO MENSILE PER ARTICOLO
--
-- Nuova funzione di sola lettura che riassume, per ogni codice
-- articolo, quanto e' stato scaricato dal magazzino nel tempo,
-- usando lo storico dei movimenti (tabella movement_batch_rows,
-- gia' popolata dalla pagina Movimenti).
--
-- Conta SOLO gli scarichi realmente applicati alla giacenza:
--   movement_type = 'SCARICO' and result = 'PROCESSED'
-- Gli scarichi con result = 'INSUFFICIENT' sono stati bloccati
-- dal sistema (giacenza non sufficiente: nessun movimento reale
-- e' stato applicato) e vanno quindi esclusi, altrimenti la
-- media verrebbe calcolata anche su quantita' mai davvero uscite
-- dal magazzino.
--
-- Il calcolo dei mesi trascorsi e la media mensile vengono fatti
-- lato applicazione (pagina /consumo-medio), qui si restituisce
-- solo il totale scaricato e la data del primo scarico per ogni
-- codice: cosi' la pagina funziona anche per gli articoli che
-- oggi hanno giacenza zero (gia' completamente scaricati), perche'
-- la fonte e' lo storico dei movimenti e non la giacenza attuale.
--
-- Sicuro da rieseguire (create or replace).
-- ============================================================

create or replace function public.get_item_consumption_summary()
returns table (
  code text,
  total_qty numeric,
  first_movement_date date,
  movement_count integer
)
language sql
stable
as $$
  select
    code,
    sum(qty) as total_qty,
    min(movement_date) as first_movement_date,
    count(*)::integer as movement_count
  from public.movement_batch_rows
  where movement_type = 'SCARICO'
    and result = 'PROCESSED'
  group by code;
$$;

grant execute on function public.get_item_consumption_summary()
to anon, authenticated;

-- FINE STEP 53
