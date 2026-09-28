-- ============================================================
-- STEP 46 - Unita' di misura per gli articoli a catalogo
--
-- Aggiunge la colonna "unit" alla tabella items, cosi' ogni
-- articolo puo' avere la propria unita' di misura (PZ, MT, KG,
-- CP, LT, MQ, ...), scelta al momento della creazione/modifica
-- dell'articolo (pagine "Nuovo articolo" e "Dati articolo").
--
-- Valore di default "PZ" per non rompere gli articoli gia'
-- esistenti (restano "a pezzo" finche' non vengono corretti a
-- mano).
--
-- Sicuro da rieseguire: "if not exists" non duplica la colonna.
-- ============================================================

alter table public.items
  add column if not exists unit text not null default 'PZ';

-- FINE STEP 46
