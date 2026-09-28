-- ============================================================
-- STEP 48 - Altre sezioni STANDARD per Predator 540, popolate
-- cercando gli articoli per codice (stesso procedimento degli
-- STEP 41-45/47)
--
-- Alcune di queste sezioni potrebbero gia' esistere (create a
-- mano): lo script le RIUSA per nome se le trova, altrimenti le
-- crea come STANDARD. Per ogni riga con codice: se trovata nel
-- catalogo viene collegata all'articolo; se NON trovata, viene
-- inserita comunque come riga LIBERA (senza collegamento), con la
-- descrizione letta dallo screenshot, cosi' compare in Distinta
-- base con Fornitore/Cod. Articolo "-" e Giacenza "n/d" (riga da
-- creare a catalogo in un secondo momento). Le righe senza nessun
-- codice nello screenshot sono sempre libere, con il fornitore tra
-- parentesi nella descrizione.
--
-- NOTA: la sezione "Tubolare in tessuto hypalon / neoprene" non e'
-- inclusa qui: e' la stessa gia' creata dallo STEP 41 (stessi
-- identici codici), quindi non c'e' nulla da aggiungere.
--
-- Il nome della sezione "Impianto elettrico" (cassetta porta
-- batteria + staccabatteria) e' stato confermato dall'utente.
-- Il nome "Musone di prua con rullo passacima" e' stato letto da
-- uno screenshot poco leggibile: controllare che coincida con
-- l'eventuale sezione gia' creata a mano, altrimenti lo script ne
-- crea una nuova (si vede dall'avviso finale).
--
-- Sicuro da rieseguire: non duplica ne' le sezioni ne' le righe
-- gia' presenti.
-- ============================================================

do $$
declare
  v_model text;
  v_section_id uuid;
  v_item_id text;
  v_item_description text;
  v_not_found text[] := '{}';
  v_row text[];

  -- ------------------------------------------------------------
  -- Dati di ogni sezione: nome, e righe (codice, unita', quantita',
  -- descrizione di riserva usata solo se il codice non si trova).
  -- ------------------------------------------------------------
  v_sec_name text;
  v_rows text[][];
begin
  -- 1) Nome esatto del modello (case-insensitive).
  select name into v_model
  from public.production_options
  where option_type = 'model' and name ilike 'predator 540'
  limit 1;

  if v_model is null then
    raise exception 'Modello "predator 540" non trovato tra le opzioni battello (production_options, option_type=''model''). Controlla il nome esatto in Produzione -> Configurazioni e rilancia lo script.';
  end if;

  -- ============================================================
  -- SEZIONE 1 - Corrimano lato passerella, Inox
  -- ============================================================
  v_sec_name := 'Corrimano lato passerella, Inox';
  select id into v_section_id
  from public.production_bom_sections
  where model_boat = v_model and name = v_sec_name;
  if v_section_id is null then
    insert into public.production_bom_sections (model_boat, name, kind)
    values (v_model, v_sec_name, 'standard')
    returning id into v_section_id;
  end if;

  if not exists (
    select 1 from public.production_bom_items
    where section_id = v_section_id and item_id is null
      and description = 'Maniglioni lato passerella mod. Preda... (Italboats - R.5)'
  ) then
    insert into public.production_bom_items (section_id, item_id, description, unit, qty)
    values (v_section_id, null, 'Maniglioni lato passerella mod. Preda... (Italboats - R.5)', 'PZ', 1);
  end if;

  -- ============================================================
  -- SEZIONE 2 - Musone di prua con rullo passacima
  -- ============================================================
  v_sec_name := 'Musone di prua con rullo passacima';
  select id into v_section_id
  from public.production_bom_sections
  where model_boat = v_model and name = v_sec_name;
  if v_section_id is null then
    insert into public.production_bom_sections (model_boat, name, kind)
    values (v_model, v_sec_name, 'standard')
    returning id into v_section_id;
  end if;

  select id::text, description into v_item_id, v_item_description
  from public.items where code ilike '357.00' or supplier_code ilike '357.00' limit 1;
  if v_item_id is not null then
    if not exists (select 1 from public.production_bom_items where section_id = v_section_id and item_id = v_item_id) then
      insert into public.production_bom_items (section_id, item_id, description, unit, qty)
      values (v_section_id, v_item_id, v_item_description, 'PZ', 1);
    end if;
  else
    v_not_found := array_append(v_not_found, '357.00 (Musone di prua)');
    if not exists (select 1 from public.production_bom_items where section_id = v_section_id and item_id is null and description = 'Musone prua 60x60mm') then
      insert into public.production_bom_items (section_id, item_id, description, unit, qty)
      values (v_section_id, null, 'Musone prua 60x60mm', 'PZ', 1);
    end if;
  end if;

  -- ============================================================
  -- SEZIONE 3 - Maniglia per risalita da scaletta, Inox
  -- ============================================================
  v_sec_name := 'Maniglia per risalita da scaletta, Inox';
  select id into v_section_id
  from public.production_bom_sections
  where model_boat = v_model and name = v_sec_name;
  if v_section_id is null then
    insert into public.production_bom_sections (model_boat, name, kind)
    values (v_model, v_sec_name, 'standard')
    returning id into v_section_id;
  end if;

  if not exists (
    select 1 from public.production_bom_items
    where section_id = v_section_id and item_id is null
      and description = 'Maniglia di risalita mod. Predator 540 (Italboats - R.5)'
  ) then
    insert into public.production_bom_items (section_id, item_id, description, unit, qty)
    values (v_section_id, null, 'Maniglia di risalita mod. Predator 540 (Italboats - R.5)', 'PZ', 1);
  end if;

  -- ============================================================
  -- SEZIONE 4 - Impianto elettrico (cassetta batteria + staccabatteria)
  -- ============================================================
  v_sec_name := 'Impianto elettrico';
  select id into v_section_id
  from public.production_bom_sections
  where model_boat = v_model and name = v_sec_name;
  if v_section_id is null then
    insert into public.production_bom_sections (model_boat, name, kind)
    values (v_model, v_sec_name, 'standard')
    returning id into v_section_id;
  end if;

  v_rows := array[
    array['196508',   'PZ', '1', 'Cassetta Porta Batteria Piccola 340x2...'],
    array['L0610180', 'PZ', '1', 'Staccabatteria marino Heavy duty 280A']
  ];
  foreach v_row slice 1 in array v_rows loop
    select id::text, description into v_item_id, v_item_description
    from public.items where code ilike v_row[1] or supplier_code ilike v_row[1] limit 1;
    if v_item_id is not null then
      if not exists (select 1 from public.production_bom_items where section_id = v_section_id and item_id = v_item_id) then
        insert into public.production_bom_items (section_id, item_id, description, unit, qty)
        values (v_section_id, v_item_id, v_item_description, v_row[2], v_row[3]::numeric);
      end if;
    else
      v_not_found := array_append(v_not_found, v_row[1]);
      if not exists (select 1 from public.production_bom_items where section_id = v_section_id and item_id is null and description = v_row[4]) then
        insert into public.production_bom_items (section_id, item_id, description, unit, qty)
        values (v_section_id, null, v_row[4], v_row[2], v_row[3]::numeric);
      end if;
    end if;
  end loop;

  -- ============================================================
  -- SEZIONE 5 - Pannello interruttori 8 servizi - Carling switches
  -- ============================================================
  v_sec_name := 'Pannello interruttori 8 servizi - Carling switches';
  select id into v_section_id
  from public.production_bom_sections
  where model_boat = v_model and name = v_sec_name;
  if v_section_id is null then
    insert into public.production_bom_sections (model_boat, name, kind)
    values (v_model, v_sec_name, 'standard')
    returning id into v_section_id;
  end if;

  v_rows := array[
    array['14.197.01', 'PZ', '2', 'Cornice plastica centrale'],
    array['14.197.02', 'PZ', '4', 'Cornice plastica destra/sinistra'],
    array['14.004.30', 'PZ', '3', 'Fusibile lamellare 10 A'],
    array['14.004.40', 'PZ', '1', 'Fusibile lamellare 15 A'],
    array['14.004.10', 'PZ', '2', 'Fusibile lamellare 5 A'],
    array['14.192.02', 'PZ', '1', 'Interruttore Carling Switch (ON)-OFF...'],
    array['14.192.01', 'PZ', '5', 'Interruttore Carling Switch ON-OFF 12...'],
    array['14.100.32', 'PZ', '1', 'Scatola portafusibili lamellari 6 sed...'],
    array['14.193.35', 'PZ', '1', 'Targhetta aspiratore'],
    array['14.193.38', 'PZ', '1', 'Targhetta autoclave'],
    array['14.193.32', 'PZ', '1', 'Targhetta luce fonda'],
    array['14.193.31', 'PZ', '1', 'Targhetta luci via'],
    array['14.193.37', 'PZ', '1', 'Targhetta pompa di sentina'],
    array['14.193.33', 'PZ', '1', 'Targhetta tromba']
  ];
  foreach v_row slice 1 in array v_rows loop
    select id::text, description into v_item_id, v_item_description
    from public.items where code ilike v_row[1] or supplier_code ilike v_row[1] limit 1;
    if v_item_id is not null then
      if not exists (select 1 from public.production_bom_items where section_id = v_section_id and item_id = v_item_id) then
        insert into public.production_bom_items (section_id, item_id, description, unit, qty)
        values (v_section_id, v_item_id, v_item_description, v_row[2], v_row[3]::numeric);
      end if;
    else
      v_not_found := array_append(v_not_found, v_row[1]);
      if not exists (select 1 from public.production_bom_items where section_id = v_section_id and item_id is null and description = v_row[4]) then
        insert into public.production_bom_items (section_id, item_id, description, unit, qty)
        values (v_section_id, null, v_row[4], v_row[2], v_row[3]::numeric);
      end if;
    end if;
  end loop;

  -- ============================================================
  -- SEZIONE 6 - Pompa di sentina
  -- ============================================================
  v_sec_name := 'Pompa di sentina';
  select id into v_section_id
  from public.production_bom_sections
  where model_boat = v_model and name = v_sec_name;
  if v_section_id is null then
    insert into public.production_bom_sections (model_boat, name, kind)
    values (v_model, v_sec_name, 'standard')
    returning id into v_section_id;
  end if;

  v_rows := array[
    array['44696',          'PZ', '1',    'Scarico a mare 5/8" x 40mm p/g 15mm b...'],
    array['16.122.05',      'PZ', '1',    'Elettropompa Europump II 800 12V'],
    array['CEM01600000000', 'MT', '0.70', 'CORDSTEEL ALIMENTI P.L. D 16'],
    array['W4B12016027000', 'PZ', '2',    'Fascetta inox AISI 304 nastro banda 1...']
  ];
  foreach v_row slice 1 in array v_rows loop
    select id::text, description into v_item_id, v_item_description
    from public.items where code ilike v_row[1] or supplier_code ilike v_row[1] limit 1;
    if v_item_id is not null then
      if not exists (select 1 from public.production_bom_items where section_id = v_section_id and item_id = v_item_id) then
        insert into public.production_bom_items (section_id, item_id, description, unit, qty)
        values (v_section_id, v_item_id, v_item_description, v_row[2], v_row[3]::numeric);
      end if;
    else
      v_not_found := array_append(v_not_found, v_row[1]);
      if not exists (select 1 from public.production_bom_items where section_id = v_section_id and item_id is null and description = v_row[4]) then
        insert into public.production_bom_items (section_id, item_id, description, unit, qty)
        values (v_section_id, null, v_row[4], v_row[2], v_row[3]::numeric);
      end if;
    end if;
  end loop;

  -- ============================================================
  -- SEZIONE 7 - Scaletta da bagno
  -- ============================================================
  v_sec_name := 'Scaletta da bagno';
  select id into v_section_id
  from public.production_bom_sections
  where model_boat = v_model and name = v_sec_name;
  if v_section_id is null then
    insert into public.production_bom_sections (model_boat, name, kind)
    values (v_model, v_sec_name, 'standard')
    returning id into v_section_id;
  end if;

  select id::text, description into v_item_id, v_item_description
  from public.items where code ilike '141.31' or supplier_code ilike '141.31' limit 1;
  if v_item_id is not null then
    if not exists (select 1 from public.production_bom_items where section_id = v_section_id and item_id = v_item_id) then
      insert into public.production_bom_items (section_id, item_id, description, unit, qty)
      values (v_section_id, v_item_id, v_item_description, 'PZ', 1);
    end if;
  else
    v_not_found := array_append(v_not_found, '141.31 (Scaletta da bagno)');
    if not exists (select 1 from public.production_bom_items where section_id = v_section_id and item_id is null and description = 'Scaletta telescopica 3 gradini stretta') then
      insert into public.production_bom_items (section_id, item_id, description, unit, qty)
      values (v_section_id, null, 'Scaletta telescopica 3 gradini stretta', 'PZ', 1);
    end if;
  end if;

  -- ============================================================
  -- SEZIONE 8 - Seduta di guida tipo leaning post
  -- ============================================================
  v_sec_name := 'Seduta di guida tipo leaning post';
  select id into v_section_id
  from public.production_bom_sections
  where model_boat = v_model and name = v_sec_name;
  if v_section_id is null then
    insert into public.production_bom_sections (model_boat, name, kind)
    values (v_model, v_sec_name, 'standard')
    returning id into v_section_id;
  end if;

  select id::text, description into v_item_id, v_item_description
  from public.items where code ilike '38.441.54' or supplier_code ilike '38.441.54' limit 1;
  if v_item_id is not null then
    if not exists (select 1 from public.production_bom_items where section_id = v_section_id and item_id = v_item_id) then
      insert into public.production_bom_items (section_id, item_id, description, unit, qty)
      values (v_section_id, v_item_id, v_item_description, 'PZ', 2);
    end if;
  else
    v_not_found := array_append(v_not_found, '38.441.54 (Seduta di guida)');
    if not exists (select 1 from public.production_bom_items where section_id = v_section_id and item_id is null and description = 'Cerniera inox 2,0mm 48x37mm n.s. rett...') then
      insert into public.production_bom_items (section_id, item_id, description, unit, qty)
      values (v_section_id, null, 'Cerniera inox 2,0mm 48x37mm n.s. rett...', 'PZ', 2);
    end if;
  end if;

  -- ------------------------------------------------------------
  if array_length(v_not_found, 1) > 0 then
    raise notice 'DA CREARE A CATALOGO: questi codici non sono stati trovati e sono stati inseriti come righe libere (senza collegamento). Vanno creati come articoli veri e poi ricollegati dalla pagina Distinta base: %', v_not_found;
  else
    raise notice 'Fatto: tutti i codici sono stati trovati e collegati.';
  end if;
end $$;

-- FINE STEP 48
