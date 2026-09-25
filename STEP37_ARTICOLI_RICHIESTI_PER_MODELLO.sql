-- ============================================================
-- STEP 37 - ARTICOLI RICHIESTI PER MODELLO + PDF ARTICOLI MANCANTI
--
-- Ogni modello di battello puo' avere una lista di articoli che gli
-- servono sempre (es. pompa sentina, autoclave, parabrezza...). Non
-- e' un sistema di scarico automatico come quello dei parabrezza
-- (STEP 25/29): qui NON viene creata nessuna "richiesta" per il
-- singolo battello, nessun kit, nessun aggancio a ordini. E' solo
-- una mappa modello -> articoli, di sola lettura:
--
--   - "Produzione -> Articoli richiesti" gestisce la mappa (aggiungi/
--     rimuovi articoli per modello).
--   - Quando crei un battello, il sistema guarda gli articoli
--     richiesti dal suo modello, controlla la giacenza attuale di
--     ognuno (items.stock) e genera subito un PDF con quelli che
--     risultano a 0 (o meno). La stessa lista si puo' ristampare in
--     qualsiasi momento dalla scheda del battello.
--   - Nessuna scrittura su items.stock: e' un controllo, non uno
--     scarico. La giacenza resta gestita solo dove lo e' gia' oggi
--     (arrivo ordini, kit tappezzeria/parabrezza, movimenti).
-- ============================================================

create table if not exists public.production_model_required_items (
  id uuid primary key default gen_random_uuid(),
  model_boat text not null,
  item_id text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_model_required_items_model_item_key
    unique (model_boat, item_id)
);

create index if not exists production_model_required_items_model_idx
  on public.production_model_required_items (model_boat);

alter table public.production_model_required_items enable row level security;

drop policy if exists production_model_required_items_all
  on public.production_model_required_items;

create policy production_model_required_items_all
on public.production_model_required_items
for all
to anon, authenticated
using (true)
with check (true);

-- FINE STEP 37
