-- ============================================================
-- STEP 4 - TAPPEZZERIE
-- PREZZO PER SINGOLO KIT + PDF CON/SENZA IMPORTI
--
-- Aggiunge:
-- - unit_price al singolo kit
-- - prezzo obbligatorio per i nuovi kit
-- - funzione per aggiornare il prezzo dei kit già presenti
--
-- NON cancella articoli e NON cambia le giacenze esistenti.
-- Il kit di prova già presente riceverà prezzo 0,00 finché
-- non lo imposti dalla schermata "Kit in giacenza".
-- ============================================================

alter table public.upholstery_kits
add column if not exists unit_price numeric(12,2) not null default 0;

alter table public.upholstery_kits
drop constraint if exists upholstery_kits_unit_price_check;

alter table public.upholstery_kits
add constraint upholstery_kits_unit_price_check
check (unit_price >= 0);


-- Rimuoviamo la vecchia versione della funzione senza prezzo.
drop function if exists public.create_upholstery_stock_kit(
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text,
  text
);


create or replace function public.create_upholstery_stock_kit(
  p_supplier_id text,
  p_item_id text,
  p_matricola integer,
  p_scanner_code text,
  p_unit_price numeric,
  p_color text,
  p_details_logos text,
  p_stitching text,
  p_quilting text,
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
  if p_matricola is null
     or p_matricola < 1
     or p_matricola > 10000 then
    raise exception
      'Matricola Kit non valida. Deve essere compresa tra 1 e 10000.';
  end if;

  if coalesce(trim(p_scanner_code), '') = '' then
    raise exception
      'Codice scanner obbligatorio.';
  end if;

  if p_unit_price is null
     or p_unit_price <= 0 then
    raise exception
      'Prezzo kit obbligatorio e maggiore di zero.';
  end if;

  if coalesce(trim(p_color), '') = ''
     or coalesce(trim(p_details_logos), '') = ''
     or coalesce(trim(p_stitching), '') = ''
     or coalesce(trim(p_quilting), '') = '' then
    raise exception
      'Configurazione tappezzeria incompleta.';
  end if;

  select coalesce(s.upholstery_enabled, false)
  into v_supplier_enabled
  from public.suppliers s
  where s.id::text = p_supplier_id
  limit 1;

  if coalesce(v_supplier_enabled, false) = false then
    raise exception
      'Gestione tappezzerie non attiva per questo fornitore.';
  end if;

  select exists (
    select 1
    from public.items i
    where i.id::text = p_item_id
      and i.supplier_id::text = p_supplier_id
  )
  into v_item_exists;

  if not v_item_exists then
    raise exception
      'Articolo non appartenente al fornitore selezionato.';
  end if;

  if exists (
    select 1
    from public.upholstery_kits k
    where k.supplier_id = p_supplier_id
      and k.matricola = p_matricola
  ) then
    raise exception
      'Matricola Kit già utilizzata: %',
      p_matricola;
  end if;

  insert into public.upholstery_kits (
    supplier_id,
    item_id,
    matricola,
    scanner_code,
    unit_price,
    color,
    details_logos,
    stitching,
    quilting,
    status,
    note,
    received_at
  )
  values (
    p_supplier_id,
    p_item_id,
    p_matricola,
    trim(p_scanner_code),
    round(p_unit_price, 2),
    trim(p_color),
    trim(p_details_logos),
    trim(p_stitching),
    trim(p_quilting),
    'stock',
    nullif(trim(coalesce(p_note, '')), ''),
    now()
  )
  returning id
  into v_kit_id;

  update public.items
  set stock = coalesce(stock, 0) + 1
  where id::text = p_item_id
    and supplier_id::text = p_supplier_id;

  return v_kit_id;
end;
$$;


create or replace function public.update_upholstery_kit_price(
  p_kit_id uuid,
  p_unit_price numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_unit_price is null
     or p_unit_price <= 0 then
    raise exception
      'Il prezzo deve essere maggiore di zero.';
  end if;

  update public.upholstery_kits
  set unit_price = round(p_unit_price, 2)
  where id = p_kit_id;

  if not found then
    raise exception
      'Kit non trovato.';
  end if;
end;
$$;


grant execute
on function public.create_upholstery_stock_kit(
  text,
  text,
  integer,
  text,
  numeric,
  text,
  text,
  text,
  text,
  text
)
to anon, authenticated;


grant execute
on function public.update_upholstery_kit_price(
  uuid,
  numeric
)
to anon, authenticated;


-- FINE STEP 4
