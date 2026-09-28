-- ============================================================
-- STEP 44 - Sezione "Timoneria idraulica" per Predator 540,
-- popolata cercando gli articoli per codice (stesso procedimento
-- degli STEP 41/42/43)
--
-- Sezione OPTIONAL: si sceglie battello per battello.
--
-- Lo screenshot di riferimento aveva 7 righe, ma 3 con quantita'
-- negativa (-1.00: monocavo M66, timoneria rotativa T71 F.C., X34
-- coprimozzo 90G) che sembravano una sostituzione/reso nell'altro
-- programma, non articoli da costruire: su indicazione dell'utente
-- sono state escluse. Restano le 4 righe con quantita' positiva.
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
    array['43515D', 'PZ', '1'],
    array['43048Y', 'PZ', '1'],
    array['41708E', 'PZ', '1'],
    array['43180Y', 'PZ', '1']
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
    and name = 'Timoneria idraulica';

  if v_section_id is null then
    insert into public.production_bom_sections (model_boat, name, kind)
    values (v_model, 'Timoneria idraulica', 'optional')
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

-- FINE STEP 44
