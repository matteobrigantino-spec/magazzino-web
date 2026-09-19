-- ============================================================
-- STEP 15 - ORDINI FORNITORE
-- NUMERO ORDINE PROGRESSIVO (UNICO TRA TUTTI I FORNITORI)
--
-- Finora ogni ordine era identificato solo da un codice lunghissimo
-- (es. e5c5d08f-c1a9-4e5b-b1f5-e790b8b48943), stampato nel PDF.
--
-- Da qui in poi ogni nuovo ordine riceve anche un numero
-- progressivo semplice, condiviso tra TUTTI i fornitori (non
-- riparte da 1 per ogni fornitore): il primo nuovo ordine sarà il
-- numero 1886, il successivo 1887 - anche se e' di un fornitore
-- diverso - e così via.
--
-- Il numero viene assegnato automaticamente dal database appena
-- l'ordine viene creato (con un DEFAULT sulla colonna): non serve
-- toccare la funzione create_order_atomic già esistente.
--
-- Gli ordini creati PRIMA di questa migrazione non hanno un
-- numero (order_number resta vuoto per loro): la numerazione
-- riparte da 1886 solo per i nuovi ordini da adesso in poi.
-- ============================================================

create sequence if not exists public.orders_order_number_seq
  start with 1886
  increment by 1;

alter table public.orders
  add column if not exists order_number integer;

alter table public.orders
  alter column order_number set default nextval('public.orders_order_number_seq');

create unique index if not exists orders_order_number_idx
  on public.orders (order_number)
  where order_number is not null;

-- FINE STEP 15
