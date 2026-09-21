-- ============================================================
-- STEP 29 - PARABREZZA: PIU' ARTICOLI PER LO STESSO MODELLO
--
-- Finora un modello poteva avere UN SOLO articolo abbinato
-- (model_boat era unique nella mappa, boat_id era unique nella
-- richiesta battello). Se un battello ha bisogno di due pezzi
-- diversi (es. parabrezza + finestrino laterale) non si poteva
-- fare.
--
-- Ora un modello puo' avere quanti articoli servono: ognuno
-- diventa una richiesta separata per il battello, con la sua
-- giacenza e la sua assegnazione automatica indipendenti. Non si
-- puo' pero' aggiungere due volte lo stesso identico articolo allo
-- stesso modello (vincolo unico su modello+articolo).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Un modello puo' comparire piu' volte in mappa (un articolo
--    diverso per riga). Resta bloccata solo la riga duplicata
--    (stesso modello + stesso articolo).
-- ------------------------------------------------------------
alter table public.production_windshield_matrix
  drop constraint if exists production_windshield_matrix_model_boat_key;

alter table public.production_windshield_matrix
  drop constraint if exists production_windshield_matrix_model_item_key;

alter table public.production_windshield_matrix
  add constraint production_windshield_matrix_model_item_key
  unique (model_boat, item_id);

-- ------------------------------------------------------------
-- 2) Un battello puo' avere piu' richieste parabrezza (una per
--    articolo). Resta bloccata solo la riga duplicata (stesso
--    battello + stesso articolo).
-- ------------------------------------------------------------
alter table public.production_boat_windshield
  drop constraint if exists production_boat_windshield_boat_id_key;

alter table public.production_boat_windshield
  drop constraint if exists production_boat_windshield_boat_item_key;

alter table public.production_boat_windshield
  add constraint production_boat_windshield_boat_item_key
  unique (boat_id, item_id);

create index if not exists production_boat_windshield_boat_idx
  on public.production_boat_windshield (boat_id);

-- ------------------------------------------------------------
-- 3) Nuovo mattoncino: crea (se manca) la richiesta per UN
--    battello + UN articolo, e prova subito l'assegnazione
--    automatica. Usato sia alla creazione del battello sia dal
--    backfill.
-- ------------------------------------------------------------
create or replace function public.ensure_windshield_boat_item_requirement(
  p_boat_id uuid,
  p_item_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req_id uuid;
  v_already_linked boolean;
  v_kit_id uuid;
begin
  insert into public.production_boat_windshield (boat_id, item_id)
  values (p_boat_id, p_item_id)
  on conflict (boat_id, item_id) do nothing;

  select id, (kit_id is not null or order_item_id is not null)
  into v_req_id, v_already_linked
  from public.production_boat_windshield
  where boat_id = p_boat_id
    and item_id = p_item_id;

  if v_req_id is null then
    return null;
  end if;

  if not coalesce(v_already_linked, false) then
    select id into v_kit_id
    from public.windshield_kits
    where item_id = p_item_id
      and status = 'stock'
    limit 1;

    if v_kit_id is not null then
      perform public.assign_windshield_stock_kit_by_priority(v_kit_id);
    else
      perform public.sync_windshield_order_links(p_item_id);
    end if;
  end if;

  return v_req_id;
end;
$$;

grant execute
on function public.ensure_windshield_boat_item_requirement(uuid, text)
to anon, authenticated;

-- ------------------------------------------------------------
-- 4) create_windshield_boat_requirement ora scorre TUTTI gli
--    articoli mappati per il modello del battello (prima ne
--    prendeva uno solo). Cambia il tipo di ritorno (quanti
--    articoli agganciati) quindi va ricreata da zero.
-- ------------------------------------------------------------
drop function if exists public.create_windshield_boat_requirement(uuid);

create or replace function public.create_windshield_boat_requirement(
  p_boat_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_model text;
  v_row record;
  v_count integer := 0;
begin
  select model_boat into v_model
  from public.production_boats
  where id = p_boat_id;

  if v_model is null then
    return 0;
  end if;

  for v_row in
    select item_id
    from public.production_windshield_matrix
    where model_boat = v_model
  loop
    perform public.ensure_windshield_boat_item_requirement(p_boat_id, v_row.item_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute
on function public.create_windshield_boat_requirement(uuid)
to anon, authenticated;

-- ------------------------------------------------------------
-- 5) backfill_windshield_requirements_for_model ora aggancia,
--    per ogni battello del modello, TUTTI gli articoli mappati
--    per quel modello che ancora gli mancano (non tocca quelli
--    che il battello ha gia').
-- ------------------------------------------------------------
create or replace function public.backfill_windshield_requirements_for_model(
  p_model_boat text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_boat record;
  v_item record;
  v_existing uuid;
  v_count integer := 0;
begin
  for v_boat in
    select id
    from public.production_boats
    where model_boat = p_model_boat
      and status = 'active'
  loop
    for v_item in
      select item_id
      from public.production_windshield_matrix
      where model_boat = p_model_boat
    loop
      select id into v_existing
      from public.production_boat_windshield
      where boat_id = v_boat.id
        and item_id = v_item.item_id;

      if v_existing is null then
        perform public.ensure_windshield_boat_item_requirement(v_boat.id, v_item.item_id);
        v_count := v_count + 1;
      end if;
    end loop;
  end loop;

  return v_count;
end;
$$;

grant execute
on function public.backfill_windshield_requirements_for_model(text)
to anon, authenticated;

-- ------------------------------------------------------------
-- 6) Riconciliazione una tantum: applica subito il fix a tutti
--    i modelli gia' mappati (nel caso qualcuno abbia gia' piu'
--    righe per lo stesso modello che finora non risultavano
--    agganciate ai battelli esistenti).
-- ------------------------------------------------------------
do $$
declare
  v_row record;
begin
  for v_row in
    select distinct model_boat from public.production_windshield_matrix
  loop
    perform public.backfill_windshield_requirements_for_model(v_row.model_boat);
  end loop;
end $$;

-- FINE STEP 29
