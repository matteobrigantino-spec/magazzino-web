-- ============================================================
-- STEP 19 - PRODUZIONE
-- Data di consegna richiesta (per battello) + numero progressivo
-- facoltativo e manuale
--
-- - La lista principale dei battelli in produzione si ordina per
--   "data di consegna richiesta" (facoltativa, inserita a mano
--   quando si crea il battello) invece che per numero progressivo.
-- - Il numero progressivo non viene piu' assegnato automaticamente
--   alla creazione: resta vuoto finche' non lo si inserisce a mano
--   (dalla lista principale o dalla pagina del reparto), giusto
--   prima di stampare il programma di reparto in PDF.
-- ============================================================

alter table public.production_boats
  add column if not exists requested_delivery_date date;

alter table public.production_boats
  alter column progressive_no drop not null;

-- Il vincolo "progressive_no_check (> 0)" resta valido: in Postgres
-- una riga con progressive_no NULL soddisfa comunque il CHECK.
-- L'indice univoco su progressive_no tratta piu' NULL come distinti,
-- quindi piu' battelli senza progressivo possono coesistere.

drop function if exists public.create_production_boat(
  integer, text, text, text, text, text, text, text, text
);

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

  return v_boat_id;
end;
$$;

-- FINE STEP 19
