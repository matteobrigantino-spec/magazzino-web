-- ============================================================
-- STEP 25 - SCARICO AUTOMATICO PARABREZZA
--
-- Stesso meccanismo delle tappezzerie (kit in giacenza + priorita'
-- per consegna), ma con una differenza: qui non scegli nulla a
-- mano. Ogni modello di battello ha UN parabrezza abbinato in una
-- mappa (production_windshield_matrix). Quando crei un battello,
-- il sistema:
--   1) guarda il modello del battello nella mappa
--   2) se c'e' un articolo abbinato, crea la "richiesta" parabrezza
--      per quel battello
--   3) se un pezzo e' gia' in giacenza, lo assegna subito (priorita'
--      al battello con consegna piu' vicina, tra TUTTI quelli in
--      attesa dello stesso articolo - non necessariamente questo)
--   4) altrimenti lo aggancia a una riga d'ordine gia' aperta con lo
--      stesso fornitore, sempre per priorita' di consegna
--
-- Se un modello non ha ancora un parabrezza in mappa, il battello
-- si crea comunque normalmente: semplicemente non viene tracciato
-- nessun parabrezza per lui finche' non completi la mappa.
--
-- Stato di ogni richiesta (calcolato, non salvato):
--   ASSEGNATO   -> kit_id valorizzato (pezzo fisico assegnato)
--   IN ORDINE   -> order_item_id valorizzato (riga d'ordine aperta)
--   DA ORDINARE -> nessuno dei due
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1) Mappa modello battello -> articolo parabrezza
-- ------------------------------------------------------------
create table if not exists public.production_windshield_matrix (
  id uuid primary key default gen_random_uuid(),
  model_boat text not null unique,
  item_id text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.production_windshield_matrix enable row level security;

drop policy if exists production_windshield_matrix_all on public.production_windshield_matrix;
create policy production_windshield_matrix_all
on public.production_windshield_matrix
for all
to anon, authenticated
using (true)
with check (true);

-- ------------------------------------------------------------
-- 2) Pezzi fisici di parabrezza in giacenza (come upholstery_kits,
--    ma senza colore/cucitura: un parabrezza e' gia' identificato
--    dall'articolo, che la mappa sceglie in base al modello).
-- ------------------------------------------------------------
create table if not exists public.windshield_kits (
  id uuid primary key default gen_random_uuid(),
  item_id text not null,
  matricola text,
  unit_price numeric,
  status text not null default 'stock' check (status in ('stock', 'out')),
  note text,
  boat_id uuid references public.production_boats(id),
  boat_registration text,
  received_at timestamptz not null default now(),
  out_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists windshield_kits_item_idx
  on public.windshield_kits (item_id);

create index if not exists windshield_kits_status_idx
  on public.windshield_kits (status);

alter table public.windshield_kits enable row level security;

drop policy if exists windshield_kits_all on public.windshield_kits;
create policy windshield_kits_all
on public.windshield_kits
for all
to anon, authenticated
using (true)
with check (true);

-- ------------------------------------------------------------
-- 3) Richiesta parabrezza del battello: una sola per battello,
--    presa automaticamente dalla mappa (nessuna scelta manuale).
-- ------------------------------------------------------------
create table if not exists public.production_boat_windshield (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null unique references public.production_boats(id) on delete cascade,
  item_id text not null,
  kit_id uuid references public.windshield_kits(id),
  order_item_id uuid references public.order_items(id),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists production_boat_windshield_item_idx
  on public.production_boat_windshield (item_id);

create index if not exists production_boat_windshield_order_item_idx
  on public.production_boat_windshield (order_item_id);

alter table public.production_boat_windshield enable row level security;

drop policy if exists production_boat_windshield_all on public.production_boat_windshield;
create policy production_boat_windshield_all
on public.production_boat_windshield
for all
to anon, authenticated
using (true)
with check (true);

-- ------------------------------------------------------------
-- 4) Assegna un kit gia' in giacenza a una richiesta battello:
--    il kit passa da 'stock' a 'out', si collega al battello e
--    scarica di 1 la giacenza dell'articolo. Stessa logica di
--    assign_upholstery_kit_to_boat (STEP 18).
-- ------------------------------------------------------------
create or replace function public.assign_windshield_kit_to_boat(
  p_kit_id uuid,
  p_boat_windshield_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit public.windshield_kits%rowtype;
  v_req public.production_boat_windshield%rowtype;
  v_boat public.production_boats%rowtype;
  v_current_stock numeric;
begin
  select * into v_kit
  from public.windshield_kits
  where id = p_kit_id
  for update;

  if not found then
    raise exception 'Kit non trovato.';
  end if;

  if v_kit.status <> 'stock' then
    raise exception 'Il kit non è attualmente in giacenza.';
  end if;

  select * into v_req
  from public.production_boat_windshield
  where id = p_boat_windshield_id
  for update;

  if not found then
    raise exception 'Richiesta parabrezza del battello non trovata.';
  end if;

  if v_req.kit_id is not null then
    raise exception 'Questa richiesta ha già un kit assegnato.';
  end if;

  select * into v_boat
  from public.production_boats
  where id = v_req.boat_id;

  if not found then
    raise exception 'Battello non trovato.';
  end if;

  select coalesce(i.stock, 0)
  into v_current_stock
  from public.items i
  where i.id::text = v_kit.item_id
  for update;

  if v_current_stock is null or v_current_stock <= 0 then
    raise exception 'Giacenza articolo insufficiente.';
  end if;

  update public.items
  set stock = stock - 1
  where id::text = v_kit.item_id;

  update public.windshield_kits
  set
    status = 'out',
    out_at = now(),
    boat_id = v_req.boat_id,
    boat_registration = v_boat.order_number
  where id = p_kit_id;

  update public.production_boat_windshield
  set kit_id = p_kit_id
  where id = p_boat_windshield_id;
end;
$$;

-- ------------------------------------------------------------
-- 5) Annulla l'assegnazione: il kit torna in giacenza, la
--    richiesta torna libera. Override manuale disponibile dalla
--    pagina Parabrezza.
-- ------------------------------------------------------------
create or replace function public.unassign_windshield_kit_from_boat(
  p_kit_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit public.windshield_kits%rowtype;
begin
  select * into v_kit
  from public.windshield_kits
  where id = p_kit_id
  for update;

  if not found then
    raise exception 'Kit non trovato.';
  end if;

  if v_kit.status <> 'out' or v_kit.boat_id is null then
    raise exception 'Questo kit non risulta assegnato a un battello.';
  end if;

  update public.items
  set stock = coalesce(stock, 0) + 1
  where id::text = v_kit.item_id;

  update public.production_boat_windshield
  set kit_id = null
  where kit_id = p_kit_id;

  update public.windshield_kits
  set
    status = 'stock',
    out_at = null,
    boat_id = null,
    boat_registration = null
  where id = p_kit_id;
end;
$$;

-- ------------------------------------------------------------
-- 6) Registra un pezzo fisico in giacenza (arrivo in azienda):
--    aumenta di 1 la giacenza dell'articolo. La priorita' per
--    consegna (punto 7) va chiamata subito dopo dal client.
-- ------------------------------------------------------------
create or replace function public.create_windshield_stock_kit(
  p_item_id text,
  p_matricola text default null,
  p_unit_price numeric default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit_id uuid;
  v_item_exists boolean;
begin
  select exists (
    select 1 from public.items i where i.id::text = p_item_id
  )
  into v_item_exists;

  if not v_item_exists then
    raise exception 'Articolo non trovato.';
  end if;

  insert into public.windshield_kits (
    item_id,
    matricola,
    unit_price,
    status,
    note,
    received_at
  )
  values (
    p_item_id,
    nullif(trim(coalesce(p_matricola, '')), ''),
    p_unit_price,
    'stock',
    nullif(trim(coalesce(p_note, '')), ''),
    now()
  )
  returning id
  into v_kit_id;

  update public.items
  set stock = coalesce(stock, 0) + 1
  where id::text = p_item_id;

  return v_kit_id;
end;
$$;

-- ------------------------------------------------------------
-- 6bis) Elimina un kit inserito per errore (solo se ancora in
--       giacenza, mai se gia' assegnato a un battello): riporta
--       indietro la giacenza dell'articolo.
-- ------------------------------------------------------------
create or replace function public.delete_windshield_stock_kit(
  p_kit_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit public.windshield_kits%rowtype;
begin
  select * into v_kit
  from public.windshield_kits
  where id = p_kit_id
  for update;

  if not found then
    raise exception 'Kit non trovato.';
  end if;

  if v_kit.status <> 'stock' then
    raise exception 'Questo kit è già assegnato a un battello: liberalo prima di eliminarlo.';
  end if;

  update public.items
  set stock = greatest(coalesce(stock, 0) - 1, 0)
  where id::text = v_kit.item_id;

  delete from public.windshield_kits
  where id = p_kit_id;
end;
$$;

-- ------------------------------------------------------------
-- 7) Quando un kit e' in giacenza e piu' battelli aspettano lo
--    stesso articolo, va al battello con la consegna richiesta
--    piu' vicina. Se quel battello aveva gia' una riga d'ordine
--    prenotata, la libera per il prossimo in attesa. Stessa
--    logica di assign_stock_kit_by_priority (STEP 22/23).
-- ------------------------------------------------------------
create or replace function public.assign_windshield_stock_kit_by_priority(
  p_kit_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit public.windshield_kits%rowtype;
  v_target_id uuid;
begin
  select * into v_kit
  from public.windshield_kits
  where id = p_kit_id
  for update;

  if not found then
    raise exception 'Kit non trovato.';
  end if;

  if v_kit.status <> 'stock' then
    raise exception 'Il kit non è attualmente in giacenza.';
  end if;

  select pbw.id
  into v_target_id
  from public.production_boat_windshield pbw
  join public.production_boats pb on pb.id = pbw.boat_id
  where pbw.item_id = v_kit.item_id
    and pbw.kit_id is null
  order by pb.requested_delivery_date asc nulls last, pb.created_at asc
  limit 1
  for update of pbw;

  if v_target_id is null then
    return null;
  end if;

  update public.production_boat_windshield
  set order_item_id = null
  where id = v_target_id;

  perform public.assign_windshield_kit_to_boat(p_kit_id, v_target_id);

  perform public.sync_windshield_order_links(v_kit.item_id);

  return v_target_id;
end;
$$;

-- ------------------------------------------------------------
-- 8) Aggancia le richieste ancora libere alle righe d'ordine
--    gia' aperte per lo stesso articolo, fino ad esaurire la
--    quantita' ancora libera di ogni riga, sempre dando la
--    precedenza al battello con consegna piu' vicina. Stessa
--    logica di sync_upholstery_order_links (STEP 21/23), ma qui
--    basta l'articolo: il fornitore e' gia' fissato dall'articolo
--    stesso, non serve passarlo a parte.
-- ------------------------------------------------------------
create or replace function public.sync_windshield_order_links(
  p_item_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line record;
  v_request_id uuid;
  v_capacity integer;
  v_count integer := 0;
begin
  for v_line in
    select
      oi.id as order_item_id,
      oi.qty,
      coalesce(oi.received_qty, 0) as received_qty,
      (
        select count(*)
        from public.production_boat_windshield pbw2
        where pbw2.order_item_id = oi.id
      ) as already_linked
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.item_id::text = p_item_id
      and oi.qty > coalesce(oi.received_qty, 0)
    order by o.order_date asc nulls last, o.created_at asc, oi.id asc
  loop
    v_capacity :=
      (v_line.qty - v_line.received_qty) - v_line.already_linked;

    while v_capacity > 0 loop
      v_request_id := null;

      select pbw.id
      into v_request_id
      from public.production_boat_windshield pbw
      join public.production_boats pb on pb.id = pbw.boat_id
      where pbw.item_id = p_item_id
        and pbw.kit_id is null
        and pbw.order_item_id is null
      order by pb.requested_delivery_date asc nulls last, pb.created_at asc
      limit 1
      for update of pbw skip locked;

      exit when v_request_id is null;

      update public.production_boat_windshield
      set order_item_id = v_line.order_item_id
      where id = v_request_id;

      v_count := v_count + 1;
      v_capacity := v_capacity - 1;
    end loop;
  end loop;

  return v_count;
end;
$$;

-- ------------------------------------------------------------
-- 9) Crea (se manca) la richiesta parabrezza di un battello,
--    leggendo l'articolo dalla mappa in base al modello, e prova
--    subito l'assegnazione automatica. Non fa nulla (nessun
--    errore) se il modello non e' ancora in mappa, o se la
--    richiesta esiste gia'.
-- ------------------------------------------------------------
create or replace function public.create_windshield_boat_requirement(
  p_boat_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_model text;
  v_item_id text;
  v_req_id uuid;
  v_kit_id uuid;
begin
  select model_boat into v_model
  from public.production_boats
  where id = p_boat_id;

  if v_model is null then
    return null;
  end if;

  select item_id into v_item_id
  from public.production_windshield_matrix
  where model_boat = v_model;

  if v_item_id is null then
    return null;
  end if;

  insert into public.production_boat_windshield (boat_id, item_id)
  values (p_boat_id, v_item_id)
  on conflict (boat_id) do nothing;

  select id into v_req_id
  from public.production_boat_windshield
  where boat_id = p_boat_id;

  if v_req_id is null then
    return null;
  end if;

  select id into v_kit_id
  from public.windshield_kits
  where item_id = v_item_id
    and status = 'stock'
  limit 1;

  if v_kit_id is not null then
    perform public.assign_windshield_stock_kit_by_priority(v_kit_id);
  else
    perform public.sync_windshield_order_links(v_item_id);
  end if;

  return v_req_id;
end;
$$;

-- ------------------------------------------------------------
-- 10) Aggancia il punto 9 alla creazione del battello: stessa
--     funzione dello STEP 19, con l'unica aggiunta della chiamata
--     finale (isolata: se per qualsiasi motivo fallisse, il
--     battello si crea comunque).
-- ------------------------------------------------------------
create or replace function public.create_production_boat(
  p_progressive_no integer,
  p_order_number text,
  p_model_boat text,
  p_hull text,
  p_stringers text,
  p_deck text,
  p_accessories text,
  p_note text default null,
  p_created_by text default null,
  p_requested_delivery_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_boat_id uuid;
  v_department_id uuid;
  v_step_id uuid;
begin
  if coalesce(trim(p_order_number), '') = '' then
    raise exception 'Numero d''ordine obbligatorio.';
  end if;

  if coalesce(trim(p_model_boat), '') = '' then
    raise exception 'Modello battello obbligatorio.';
  end if;

  if p_progressive_no is not null and p_progressive_no <= 0 then
    raise exception 'Numero progressivo non valido.';
  end if;

  select id
  into v_department_id
  from public.production_departments
  where active = true
  order by sort_order asc, name asc
  limit 1;

  if v_department_id is null then
    raise exception 'Nessun reparto di produzione attivo.';
  end if;

  insert into public.production_boats (
    progressive_no,
    order_number,
    model_boat,
    hull,
    stringers,
    deck,
    accessories,
    note,
    status,
    created_by,
    requested_delivery_date
  )
  values (
    p_progressive_no,
    trim(p_order_number),
    trim(p_model_boat),
    coalesce(trim(p_hull), ''),
    coalesce(trim(p_stringers), ''),
    coalesce(trim(p_deck), ''),
    coalesce(trim(p_accessories), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    'active',
    nullif(trim(coalesce(p_created_by, '')), ''),
    p_requested_delivery_date
  )
  returning id into v_boat_id;

  insert into public.production_department_steps (
    boat_id,
    department_id,
    status,
    current_note
  )
  values (
    v_boat_id,
    v_department_id,
    'queued',
    'Inserito nel programma di produzione'
  )
  returning id into v_step_id;

  insert into public.production_status_history (
    step_id,
    status,
    note,
    changed_by
  )
  values (
    v_step_id,
    'queued',
    'Ingresso nel reparto',
    nullif(trim(coalesce(p_created_by, '')), '')
  );

  begin
    perform public.create_windshield_boat_requirement(v_boat_id);
  exception when others then
    -- Non deve mai bloccare la creazione del battello: se la mappa
    -- parabrezza ha un problema, il battello si crea comunque.
    null;
  end;

  return v_boat_id;
end;
$$;

grant execute on function public.assign_windshield_kit_to_boat(uuid, uuid) to anon, authenticated;
grant execute on function public.unassign_windshield_kit_from_boat(uuid) to anon, authenticated;
grant execute on function public.delete_windshield_stock_kit(uuid) to anon, authenticated;
grant execute on function public.create_windshield_stock_kit(text, text, numeric, text) to anon, authenticated;
grant execute on function public.assign_windshield_stock_kit_by_priority(uuid) to anon, authenticated;
grant execute on function public.sync_windshield_order_links(text) to anon, authenticated;
grant execute on function public.create_windshield_boat_requirement(uuid) to anon, authenticated;
grant execute on function public.create_production_boat(integer, text, text, text, text, text, text, text, text, date) to anon, authenticated;

-- FINE STEP 25
