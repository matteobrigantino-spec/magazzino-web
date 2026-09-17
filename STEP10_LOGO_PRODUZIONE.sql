-- ============================================================
-- STEP 10 - PRODUZIONE
-- LOGO AZIENDALE CENTRALIZZATO PER IL PDF
--
-- Prima il logo per il PDF di produzione veniva salvato solo nel
-- browser (localStorage): su un altro PC/telefono o browser andava
-- ricaricato ogni volta. Con questa tabella il logo si carica una
-- sola volta, da "Produzione -> Configurazioni", e viene riletto da
-- qualunque dispositivo.
-- ============================================================

create table if not exists public.production_settings (
  id smallint primary key default 1,
  pdf_logo text,
  updated_at timestamptz not null default now(),
  constraint production_settings_singleton check (id = 1)
);

insert into public.production_settings (id)
values (1)
on conflict (id) do nothing;

create or replace function public.touch_production_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_production_settings_updated_at
on public.production_settings;

create trigger trg_production_settings_updated_at
before update on public.production_settings
for each row execute function public.touch_production_settings_updated_at();

alter table public.production_settings enable row level security;

drop policy if exists production_settings_all
on public.production_settings;

create policy production_settings_all
on public.production_settings
for all
to anon, authenticated
using (true)
with check (true);

grant select, insert, update, delete
on public.production_settings
to anon, authenticated;

-- FINE STEP 10
