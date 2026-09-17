-- ============================================================
-- STEP 8 - PRODUZIONE
-- Reparti + avanzamento giornaliero + storico + medie mensili
--
-- Primo reparto inserito automaticamente:
--   Spruzzatura resina
--
-- Il sistema usa sempre lo stesso Numero d'Ordine per seguire
-- il battello attraverso tutti i reparti.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- REPARTI
-- ------------------------------------------------------------

create table if not exists public.production_departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 10,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists production_departments_name_lower_uidx
on public.production_departments (lower(trim(name)));

-- ------------------------------------------------------------
-- BATTELLI / ORDINI DI PRODUZIONE
-- ------------------------------------------------------------

create table if not exists public.production_boats (
  id uuid primary key default gen_random_uuid(),
  progressive_no integer not null,
  order_number text not null,
  model_boat text not null,
  hull text not null default '',
  stringers text not null default '',
  deck text not null default '',
  accessories text not null default '',
  note text null,
  status text not null default 'active',
  created_by text null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint production_boats_status_check
    check (status in ('active','completed','cancelled')),
  constraint production_boats_progressive_check
    check (progressive_no > 0)
);

create unique index if not exists production_boats_progressive_uidx
on public.production_boats (progressive_no);

create unique index if not exists production_boats_order_number_lower_uidx
on public.production_boats (lower(trim(order_number)));

-- ------------------------------------------------------------
-- PASSAGGI NEI REPARTI
-- ------------------------------------------------------------

create table if not exists public.production_department_steps (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.production_boats(id) on delete cascade,
  department_id uuid not null references public.production_departments(id),
  status text not null default 'queued',
  current_note text null,
  entered_at timestamptz not null default now(),
  started_at timestamptz null,
  completed_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint production_department_steps_status_check
    check (status in ('queued','working','waiting','blocked','completed')),
  constraint production_department_steps_unique
    unique (boat_id, department_id)
);

create index if not exists production_department_steps_department_idx
on public.production_department_steps (department_id, status);

create index if not exists production_department_steps_boat_idx
on public.production_department_steps (boat_id);

-- ------------------------------------------------------------
-- STORICO GIORNALIERO DEGLI STATI
-- ------------------------------------------------------------

create table if not exists public.production_status_history (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.production_department_steps(id) on delete cascade,
  status text not null,
  note text null,
  changed_by text null,
  changed_at timestamptz not null default now(),
  constraint production_status_history_status_check
    check (status in ('queued','working','waiting','blocked','completed'))
);

create index if not exists production_status_history_step_idx
on public.production_status_history (step_id, changed_at desc);

-- ------------------------------------------------------------
-- UPDATED_AT
-- ------------------------------------------------------------

create or replace function public.touch_production_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_production_departments_updated_at
on public.production_departments;

create trigger trg_production_departments_updated_at
before update on public.production_departments
for each row execute function public.touch_production_updated_at();

drop trigger if exists trg_production_boats_updated_at
on public.production_boats;

create trigger trg_production_boats_updated_at
before update on public.production_boats
for each row execute function public.touch_production_updated_at();

drop trigger if exists trg_production_steps_updated_at
on public.production_department_steps;

create trigger trg_production_steps_updated_at
before update on public.production_department_steps
for each row execute function public.touch_production_updated_at();

-- ------------------------------------------------------------
-- PRIMO REPARTO
-- ------------------------------------------------------------

insert into public.production_departments (name, sort_order, active)
select 'Spruzzatura resina', 10, true
where not exists (
  select 1
  from public.production_departments
  where lower(trim(name)) = lower('Spruzzatura resina')
);

-- ------------------------------------------------------------
-- NUMERO PROGRESSIVO SUCCESSIVO
-- ------------------------------------------------------------

create or replace function public.next_production_progressive()
returns integer
language sql
security definer
set search_path = public
as $$
  select coalesce(max(progressive_no), 0) + 1
  from public.production_boats;
$$;

-- ------------------------------------------------------------
-- CREA BATTELLO E LO METTE NEL PRIMO REPARTO
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
  p_created_by text default null
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
  v_progressive integer;
begin
  if coalesce(trim(p_order_number), '') = '' then
    raise exception 'Numero d''ordine obbligatorio.';
  end if;

  if coalesce(trim(p_model_boat), '') = '' then
    raise exception 'Modello battello obbligatorio.';
  end if;

  if p_progressive_no is null or p_progressive_no <= 0 then
    select coalesce(max(progressive_no), 0) + 1
    into v_progressive
    from public.production_boats;
  else
    v_progressive := p_progressive_no;
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
    created_by
  )
  values (
    v_progressive,
    trim(p_order_number),
    trim(p_model_boat),
    coalesce(trim(p_hull), ''),
    coalesce(trim(p_stringers), ''),
    coalesce(trim(p_deck), ''),
    coalesce(trim(p_accessories), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    'active',
    nullif(trim(coalesce(p_created_by, '')), '')
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

-- ------------------------------------------------------------
-- AGGIORNA STATO GIORNALIERO.
-- SE COMPLETATO, PASSA AL REPARTO SUCCESSIVO.
-- ------------------------------------------------------------

create or replace function public.update_production_step_status(
  p_step_id uuid,
  p_status text,
  p_note text default null,
  p_changed_by text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_step public.production_department_steps%rowtype;
  v_current_sort integer;
  v_next_department_id uuid;
  v_next_step_id uuid;
begin
  if p_status not in ('queued','working','waiting','blocked','completed') then
    raise exception 'Stato produzione non valido.';
  end if;

  select *
  into v_step
  from public.production_department_steps
  where id = p_step_id
  for update;

  if not found then
    raise exception 'Passaggio reparto non trovato.';
  end if;

  if v_step.status = 'completed' then
    raise exception 'Questo passaggio è già completato.';
  end if;

  update public.production_department_steps
  set
    status = p_status,
    current_note = nullif(trim(coalesce(p_note, '')), ''),
    started_at = case
      when p_status = 'working' and started_at is null then now()
      else started_at
    end,
    completed_at = case
      when p_status = 'completed' then now()
      else completed_at
    end
  where id = p_step_id;

  insert into public.production_status_history (
    step_id,
    status,
    note,
    changed_by
  )
  values (
    p_step_id,
    p_status,
    nullif(trim(coalesce(p_note, '')), ''),
    nullif(trim(coalesce(p_changed_by, '')), '')
  );

  if p_status = 'completed' then
    select sort_order
    into v_current_sort
    from public.production_departments
    where id = v_step.department_id;

    select id
    into v_next_department_id
    from public.production_departments
    where active = true
      and sort_order > v_current_sort
    order by sort_order asc, name asc
    limit 1;

    if v_next_department_id is not null then
      insert into public.production_department_steps (
        boat_id,
        department_id,
        status,
        current_note
      )
      values (
        v_step.boat_id,
        v_next_department_id,
        'queued',
        'Arrivato dal reparto precedente'
      )
      on conflict (boat_id, department_id)
      do nothing
      returning id into v_next_step_id;

      if v_next_step_id is not null then
        insert into public.production_status_history (
          step_id,
          status,
          note,
          changed_by
        )
        values (
          v_next_step_id,
          'queued',
          'Ingresso nel reparto',
          nullif(trim(coalesce(p_changed_by, '')), '')
        );
      end if;
    else
      update public.production_boats
      set
        status = 'completed',
        completed_at = now()
      where id = v_step.boat_id;
    end if;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RLS
-- Nota: il gestionale usa il login custom lato frontend.
-- Queste policy permettono l'uso tramite chiave anon come il resto
-- del gestionale attuale.
-- ------------------------------------------------------------

alter table public.production_departments enable row level security;
alter table public.production_boats enable row level security;
alter table public.production_department_steps enable row level security;
alter table public.production_status_history enable row level security;

drop policy if exists production_departments_all on public.production_departments;
create policy production_departments_all
on public.production_departments
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists production_boats_all on public.production_boats;
create policy production_boats_all
on public.production_boats
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists production_steps_all on public.production_department_steps;
create policy production_steps_all
on public.production_department_steps
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists production_history_all on public.production_status_history;
create policy production_history_all
on public.production_status_history
for all
to anon, authenticated
using (true)
with check (true);

grant select, insert, update, delete
on public.production_departments
to anon, authenticated;

grant select, insert, update, delete
on public.production_boats
to anon, authenticated;

grant select, insert, update, delete
on public.production_department_steps
to anon, authenticated;

grant select, insert, update, delete
on public.production_status_history
to anon, authenticated;

grant execute on function public.next_production_progressive()
to anon, authenticated;

grant execute on function public.create_production_boat(
  integer,text,text,text,text,text,text,text,text
)
to anon, authenticated;

grant execute on function public.update_production_step_status(
  uuid,text,text,text
)
to anon, authenticated;

-- FINE STEP 8
