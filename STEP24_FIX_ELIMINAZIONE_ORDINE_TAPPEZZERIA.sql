-- ============================================================
-- STEP 24 - FIX: ELIMINAZIONE ORDINE BLOCCATA DA TAPPEZZERIA COLLEGATA
--
-- BUG INTRODOTTO DA STEP 23: il nuovo collegamento
-- production_boat_upholstery.order_item_id (riferito a
-- order_items.id) e' stato creato senza "ON DELETE", quindi per
-- default blocca la cancellazione: se una riga d'ordine e' collegata
-- a una richiesta tappezzeria di un battello, "Elimina ordine" va in
-- errore ("violates foreign key constraint
-- production_boat_upholstery_order_item_id_fkey").
--
-- FIX: si ricrea lo stesso vincolo con ON DELETE SET NULL. Cosi',
-- se si elimina l'ordine (o la riga), la richiesta tappezzeria del
-- battello semplicemente si "slega" e torna DA ORDINARE - esattamente
-- come si comportava prima di STEP 23, quando il collegamento era
-- sulla riga d'ordine ed eliminandola spariva insieme a lei.
-- ============================================================

alter table public.production_boat_upholstery
  drop constraint if exists production_boat_upholstery_order_item_id_fkey;

alter table public.production_boat_upholstery
  add constraint production_boat_upholstery_order_item_id_fkey
  foreign key (order_item_id)
  references public.order_items(id)
  on delete set null;

-- FINE STEP 24
