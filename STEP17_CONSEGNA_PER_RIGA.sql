-- ============================================================
-- STEP 17 - ORDINI FORNITORE
-- DATA DI CONSEGNA RICHIESTA PER SINGOLO ARTICOLO
--
-- La versione precedente (STEP 16) aveva un'unica data di
-- consegna per tutto l'ordine. Da qui in poi la data si imposta
-- per ogni articolo (kit diversi possono arrivare in mesi
-- diversi): la colonna vera vive su order_items.
--
-- La colonna requested_delivery_date su "orders" (STEP 16)
-- rimane e continua ad essere usata, ma solo come riepilogo:
-- il sito ci salva automaticamente la consegna più vicina tra
-- gli articoli dell'ordine, cosi' la lista ordini mostra
-- comunque qualcosa di utile senza dover aprire ogni articolo.
-- ============================================================

alter table public.order_items
  add column if not exists requested_delivery_date date;

-- FINE STEP 17
