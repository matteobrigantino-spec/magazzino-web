-- ============================================================
-- STEP 14 - TAPPEZZERIE / ORDINI
-- Colore e dettagli scelti riga per riga negli ordini fornitore.
--
-- Non tocca la funzione create_order_atomic già esistente: la
-- quantità totale di un articolo nell'ordine resta calcolata
-- come prima. Questa tabella aggiunge solo, dopo che l'ordine è
-- già stato creato, la SUDDIVISIONE per colore/dettagli di quella
-- quantità (facoltativa, solo per gli articoli dei fornitori con
-- Gestione Tappezzerie attiva).
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.order_item_variants (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  qty integer not null default 0,
  color text null,
  details_logos text null,
  stitching text null,
  quilting text null,
  note text null,
  created_at timestamptz not null default now(),
  constraint order_item_variants_qty_check check (qty > 0)
);

create index if not exists order_item_variants_order_item_idx
on public.order_item_variants (order_item_id);

alter table public.order_item_variants enable row level security;

drop policy if exists order_item_variants_all on public.order_item_variants;

create policy order_item_variants_all
on public.order_item_variants
for all
to anon, authenticated
using (true)
with check (true);

grant select, insert, update, delete
on public.order_item_variants
to anon, authenticated;

-- FINE STEP 14
