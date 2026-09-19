-- ============================================================
-- STEP 16 - ORDINI FORNITORE
-- DATA DI CONSEGNA RICHIESTA (facoltativa)
--
-- Da qui in poi, quando si crea un ordine, si puo' indicare una
-- data di consegna richiesta (facoltativa). Viene salvata
-- sull'ordine, stampata nel PDF ("Consegna richiesta: GG/MM/AAAA")
-- e mostrata nella lista ordini e nel dettaglio ordine.
--
-- E' un campo inserito manualmente (non un progressivo automatico
-- come il numero ordine), quindi basta aggiungere la colonna: non
-- serve nessuna sequence e non tocca create_order_atomic.
-- ============================================================

alter table public.orders
  add column if not exists requested_delivery_date date;

-- FINE STEP 16
