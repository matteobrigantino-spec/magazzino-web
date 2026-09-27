-- ============================================================
-- STEP 41 - Sezione "Tubolare in tessuto hypalon / neoprene"
-- per Predator 540, popolata cercando gli articoli per codice
--
-- Richiesta: invece di cercare e aggiungere uno per uno gli
-- articoli dalla pagina Distinta base, questo script crea la
-- sezione (STANDARD) sul modello Predator 540 e ci inserisce le
-- righe cercando ogni codice articolo nel catalogo (items.code o
-- items.supplier_code). Se un codice non viene trovato, la riga
-- NON viene inserita (per non collegare per sbaglio un articolo
-- sbagliato): alla fine viene stampato un avviso con i codici da
-- controllare/aggiungere a mano.
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
    array['6729 7012/neutro', 'PZ', '4'],
    array['V828272770',       'MT', '21'],
    array['A102801',          'PZ', '5'],
    array['EI948',            'KG', '12.80'],
    array['EI243',            'KG', '7.40']
  ];
  v_row text[];
begin
  -- 1) Nome esatto del modello (case-insensitive), cosi' la sezione
  --    finisce sotto lo stesso model_boat gia' usato dal resto
  --    dell'app (dropdown "Modello battello" / Distinta base).
  select name into v_model
  from public.production_options
  where option_type = 'model' and name ilike 'predator 540'
  limit 1;

  if v_model is null then
    raise exception 'Modello "predator 540" non trovato tra le opzioni battello (production_options, option_type=''model''). Controlla il nome esatto in Produzione -> Configurazioni e rilancia lo script.';
  end if;

  -- 2) Sezione standard (riusa quella esistente se lo script viene
  --    rilanciato).
  select id into v_section_id
  from public.production_bom_sections
  where model_boat = v_model
    and name = 'Tubolare in tessuto hypalon / neoprene';

  if v_section_id is null then
    insert into public.production_bom_sections (model_boat, name, kind)
    values (v_model, 'Tubolare in tessuto hypalon / neoprene', 'standard')
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

-- FINE STEP 41
