-- ============================================================
-- STEP 57 - TELI: rimuove il tipo "Bimini di poppa"
--
-- Il modulo Teli resta con i 3 tipi: Copriconsolle, Copriseduta,
-- Copribattello. Prima di stringere il vincolo, sposta sul tipo
-- corretto ("Copriconsolle") gli eventuali kit/richieste gia'
-- salvati con tipo "Bimini di poppa" (es. l'articolo
-- "COPRI CONSOLLE..." registrato per errore con quel tipo),
-- cosi' non vengono persi.
-- ============================================================

update public.teli_kits
set tipo = 'Copriconsolle'
where tipo = 'Bimini di poppa';

update public.production_boat_teli
set tipo = 'Copriconsolle'
where tipo = 'Bimini di poppa';

alter table public.teli_kits
  drop constraint if exists teli_kits_tipo_check;

alter table public.teli_kits
  add constraint teli_kits_tipo_check check (
    tipo in ('Copriconsolle', 'Copriseduta', 'Copribattello')
  );

alter table public.production_boat_teli
  drop constraint if exists production_boat_teli_tipo_check;

alter table public.production_boat_teli
  add constraint production_boat_teli_tipo_check check (
    tipo in ('Copriconsolle', 'Copriseduta', 'Copribattello')
  );

-- create_teli_stock_kit valida il Tipo anche dentro la funzione
-- (STEP56): stessa funzione, solo con la lista Tipo ridotta a 3.
create or replace function public.create_teli_stock_kit(
  p_supplier_id text,
  p_item_id text,
  p_tipo text,
  p_matricola integer,
  p_scanner_code text,
  p_unit_price numeric,
  p_color text,
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
  v_supplier_enabled boolean;
begin
  if p_tipo not in ('Copriconsolle', 'Copriseduta', 'Copribattello') then
    raise exception 'Tipo non valido: %', p_tipo;
  end if;

  if p_matricola is null or p_matricola < 1 or p_matricola > 10000 then
    raise exception 'Matricola Kit non valida. Deve essere compresa tra 1 e 10000.';
  end if;

  if coalesce(trim(p_scanner_code), '') = '' then
    raise exception 'Codice scanner obbligatorio.';
  end if;

  if coalesce(trim(p_color), '') = '' then
    raise exception 'Colore obbligatorio.';
  end if;

  if p_unit_price is null or p_unit_price < 0 then
    raise exception 'Prezzo kit non valido.';
  end if;

  select coalesce(s.teli_enabled, false)
  into v_supplier_enabled
  from public.suppliers s
  where s.id::text = p_supplier_id
  limit 1;

  if coalesce(v_supplier_enabled, false) = false then
    raise exception 'Gestione Teli non attiva per questo fornitore.';
  end if;

  select exists (
    select 1
    from public.items i
    where i.id::text = p_item_id
      and i.supplier_id::text = p_supplier_id
  )
  into v_item_exists;

  if not v_item_exists then
    raise exception 'Articolo non appartenente al fornitore selezionato.';
  end if;

  if exists (
    select 1
    from public.teli_kits k
    where k.supplier_id = p_supplier_id
      and k.matricola = p_matricola
  ) then
    raise exception 'Matricola Kit già utilizzata: %', p_matricola;
  end if;

  insert into public.teli_kits (
    supplier_id, item_id, tipo, matricola, scanner_code,
    unit_price, color, status, note, received_at
  )
  values (
    p_supplier_id, p_item_id, p_tipo, p_matricola, trim(p_scanner_code),
    p_unit_price, trim(p_color), 'stock',
    nullif(trim(coalesce(p_note, '')), ''), now()
  )
  returning id into v_kit_id;

  update public.items
  set stock = coalesce(stock, 0) + 1
  where id::text = p_item_id
    and supplier_id::text = p_supplier_id;

  return v_kit_id;
end;
$$;

grant execute on function public.create_teli_stock_kit(
  text, text, text, integer, text, numeric, text, text
) to anon, authenticated;

-- Verifica: non deve restare nessuna riga con il vecchio tipo.
select count(*) as righe_bimini_di_poppa_rimaste
from (
  select tipo from public.teli_kits where tipo = 'Bimini di poppa'
  union all
  select tipo from public.production_boat_teli where tipo = 'Bimini di poppa'
) t;

-- FINE STEP 57
