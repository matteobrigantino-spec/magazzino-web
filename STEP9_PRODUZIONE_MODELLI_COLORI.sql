-- ============================================================
-- STEP 9 - PRODUZIONE
-- CONFIGURAZIONI MODELLI E COLORI
--
-- Come Tappezzerie:
-- - inserisci una volta Modelli battello e Colori
-- - poi vengono riutilizzati nei menu a tendina
-- - Carena, Ragno/Longheroni e Coperta usano lo stesso archivio Colori
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.production_options (
  id uuid primary key default gen_random_uuid(),
  option_type text not null,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_options_type_check
    check (option_type in ('model','color'))
);

create unique index if not exists production_options_type_name_lower_uidx
on public.production_options (
  option_type,
  lower(trim(name))
);

create or replace function public.touch_production_option_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_production_options_updated_at
on public.production_options;

create trigger trg_production_options_updated_at
before update on public.production_options
for each row execute function public.touch_production_option_updated_at();

alter table public.production_options enable row level security;

drop policy if exists production_options_all
on public.production_options;

create policy production_options_all
on public.production_options
for all
to anon, authenticated
using (true)
with check (true);

grant select, insert, update, delete
on public.production_options
to anon, authenticated;

-- FINE STEP 9
