-- ============================================================
-- STEP 3 - TAPPEZZERIE
-- Inserimento manuale di un singolo kit in giacenza.
--
-- Crea una funzione atomica:
-- - registra il kit con Matricola Kit
-- - salva tutte le scelte configurate
-- - aumenta di 1 la giacenza dell'articolo collegato
--
-- NON modifica altri articoli.
-- ============================================================

-- La Matricola Kit non viene mai riutilizzata:
-- anche i kit usciti o annullati mantengono la loro matricola.
create or replace function public.next_upholstery_matricola(
  p_supplier_id text
)
returns integer
language sql
stable
as $$
  select candidate
  from generate_series(1, 10000) as candidate
  where not exists (
    select 1
    from public.upholstery_kits k
    where k.supplier_id = p_supplier_id
      and k.matricola = candidate
  )
  order by candidate
  limit 1;
$$;


create or replace function public.create_upholstery_stock_kit(
  p_supplier_id text,
  p_item_id text,
  p_matricola integer,
  p_scanner_code text,
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


grant execute
on function public.create_upholstery_stock_kit(
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text,
  text
)
to anon, authenticated;

grant execute
on function public.next_upholstery_matricola(text)
to anon, authenticated;

-- FINE STEP 3
