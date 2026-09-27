-- ============================================================
-- STEP 42 - Sezione "Impianto acqua dolce con doccia esterna a
-- poppa" per Predator 540, popolata cercando gli articoli per
-- codice (stesso procedimento dello STEP 41)
--
-- Sezione OPTIONAL: si sceglie battello per battello, non fa
-- sempre parte del modello.
--
-- Sicuro da rieseguire: non duplica ne' la sezione ne' le righe
-- gia' presenti.
-- ============================================================

do $$
declare
  v_model text;
  v_section_id uuid;
  v_item_id text;
  v_item_description text;
  v_not_found text[] := '{}';

  -- Righe da inserire: codice articolo, unita' di misura, quantita'.
  v_rows text[][] := array[
    array['04993450',       'PZ', '1'],
    array['43133',          'PZ', '1'],
    array['31321',          'PZ', '1'],
    array['45298',          'PZ', '1'],
    array['16.512.12',      'PZ', '1'],
    array['15.250.09',      'PZ', '1'],
    array['18.029.02',      'PZ', '2'],
    array['CEM01200000000', 'MT', '4'],
    array['CEM03800000000', 'MT', '1.50'],
    array['W4B12035050000', 'PZ', '2']
  ];
  v_row text[];
begin
  -- 1) Nome esatto del modello (case-insensitive).
  select name into v_model
  from public.production_options
  where option_type = 'model' and name ilike 'predator 540'
  limit 1;

  if v_model is null then
    raise exception 'Modello "predator 540" non trovato tra le opzioni battello (production_options, option_type=''model''). Controlla il nome esatto in Produzione -> Configurazioni e rilancia lo script.';
  end if;

  -- 2) Sezione optional (riusa quella esistente se lo script viene
  --    rilanciato).
  select id into v_section_id
  from public.production_bom_sections
  where model_boat = v_model
    and name = 'Impianto acqua dolce con doccia esterna a poppa';

  if v_section_id is null then
    insert into public.production_bom_sections (model_boat, name, kind)
    values (v_model, 'Impianto acqua dolce con doccia esterna a poppa', 'optional')
    returning id into v_section_id;
  end if;

  -- 3) Una riga per ogni articolo, cercato per codice.
  foreach v_row slice 1 in array v_rows
  loop
    select id::text, description
      into v_item_id, v_item_description
    from public.items
    where code ilike v_row[1] or supplier_code ilike v_row[1]
    limit 1;

    if v_item_id is null then
      v_not_found := array_append(v_not_found, v_row[1]);
    elsif not exists (
      select 1 from public.production_bom_items
      where section_id = v_section_id and item_id = v_item_id
    ) then
      insert into public.production_bom_items (section_id, item_id, description, unit, qty)
      values (v_section_id, v_item_id, v_item_description, v_row[2], v_row[3]::numeric);
    end if;
  end loop;

  if array_length(v_not_found, 1) > 0 then
    raise notice 'ATTENZIONE: questi codici NON sono stati trovati nel catalogo articoli e vanno controllati/aggiunti a mano dalla pagina Distinta base: %', v_not_found;
  else
    raise notice 'Fatto: tutti i codici sono stati trovati e collegati.';
  end if;
end $$;

-- FINE STEP 42
