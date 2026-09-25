-- ============================================================
-- STEP 38 - DISTINTA BASE PER MODELLO (sostituisce lo STEP 37)
--
-- Lo STEP 37 (production_model_required_items) era troppo semplice:
-- un modello -> una lista piatta di articoli, senza quantita' ne'
-- sezioni. Non e' mai stata inserita nessuna mappatura (tabella
-- vuota), quindi si sostituisce direttamente con una struttura vera
-- di distinta base, come quella gia' usata su carta/altro
-- programma: sezioni (es. "Dotazioni di serie", "Consolle con
-- parabrezza, corrimano e volante"), ognuna con le sue righe
-- articolo (fornitore/codice/descrizione/UM/quantita').
--
-- Ogni sezione e' STANDARD (fa sempre parte del modello) oppure
-- OPTIONAL (si sceglie battello per battello, all'inserimento
-- dell'ordine o in un secondo momento dalla sua scheda).
--
-- Resta un controllo di sola lettura sulla giacenza (items.stock):
-- non crea richieste, non assegna kit, non tocca mai la giacenza.
-- "Mancante" ora significa giacenza insufficiente per la quantita'
-- richiesta (stock < qty), non solo "a zero".
-- ============================================================

drop table if exists public.production_model_required_items;

-- ------------------------------------------------------------
-- 1) Sezioni della distinta base, per modello.
-- ------------------------------------------------------------
create table if not exists public.production_bom_sections (
  id uuid primary key default gen_random_uuid(),
  model_boat text not null,
  name text not null,
  kind text not null default 'standard' check (kind in ('standard', 'optional')),
  sort_order integer not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists production_bom_sections_model_idx
  on public.production_bom_sections (model_boat);

alter table public.production_bom_sections enable row level security;

drop policy if exists production_bom_sections_all on public.production_bom_sections;
create policy production_bom_sections_all
on public.production_bom_sections
for all
to anon, authenticated
using (true)
with check (true);

-- ------------------------------------------------------------
-- 2) Righe articolo di ogni sezione. item_id e' facoltativo: se
--    l'articolo non e' a catalogo (es. una targa personalizzata),
--    si inserisce solo la descrizione libera e la riga compare
--    comunque in distinta, ma senza controllo di giacenza (nessun
--    modo di sapere se "manca").
-- ------------------------------------------------------------
create table if not exists public.production_bom_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.production_bom_sections(id) on delete cascade,
  item_id text,
  description text not null,
  unit text not null default 'PZ',
  qty numeric not null default 1,
  note text,
  sort_order integer not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists production_bom_items_section_idx
  on public.production_bom_items (section_id);

create index if not exists production_bom_items_item_idx
  on public.production_bom_items (item_id);

alter table public.production_bom_items enable row level security;

drop policy if exists production_bom_items_all on public.production_bom_items;
create policy production_bom_items_all
on public.production_bom_items
for all
to anon, authenticated
using (true)
with check (true);

-- ------------------------------------------------------------
-- 3) Quali sezioni OPTIONAL sono state scelte per un singolo
--    battello (le sezioni STANDARD del suo modello si applicano
--    sempre, non serve salvarle qui).
-- ------------------------------------------------------------
create table if not exists public.production_boat_bom_sections (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.production_boats(id) on delete cascade,
  section_id uuid not null references public.production_bom_sections(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint production_boat_bom_sections_boat_section_key
    unique (boat_id, section_id)
);

create index if not exists production_boat_bom_sections_boat_idx
  on public.production_boat_bom_sections (boat_id);

alter table public.production_boat_bom_sections enable row level security;

drop policy if exists production_boat_bom_sections_all on public.production_boat_bom_sections;
create policy production_boat_bom_sections_all
on public.production_boat_bom_sections
for all
to anon, authenticated
using (true)
with check (true);

-- FINE STEP 38
