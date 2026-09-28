-- ============================================================
-- STEP 51 - Ripara le righe "sparite" delle sezioni create dagli
-- STEP 41-44 (Predator 540)
--
-- PROBLEMA: gli STEP 41, 42, 43 e 44 (a differenza degli STEP
-- successivi, 45/47/48) per i codici NON trovati nel catalogo si
-- limitavano a un avviso (RAISE NOTICE) senza inserire nessuna
-- riga: quei codici erano quindi completamente invisibili nella
-- Distinta base, non comparivano nemmeno come riga libera "-" /
-- "n/d". Da qui il problema segnalato: "quelli che non esistono
-- non li vedo".
--
-- RIMEDIO: questo script ripassa tutte le righe originali di
-- quelle 4 sezioni. Per ognuna:
--  - se il codice e' GIA' collegato in quella sezione, non tocca
--    nulla (nessun duplicato);
--  - se il codice si trova ORA nel catalogo (magari creato nel
--    frattempo) ma non era ancora collegato, lo collega;
--  - se il codice continua a NON trovarsi nel catalogo, inserisce
--    finalmente la riga libera (Fornitore/Cod. Articolo "-",
--    Giacenza "n/d"), con la descrizione letta dagli screenshot piu'
--    recenti e leggibili. Da quel momento la riga sara' visibile in
--    Distinta base con il pulsante "Collega articolo", pronta per
--    essere agganciata appena crei l'articolo vero a catalogo.
--
-- Sicuro da rieseguire piu' volte: non duplica nulla.
-- ============================================================

do $$
declare
  v_model text;
  v_section_id uuid;
  v_item_id text;
  v_item_description text;
  v_not_found text[] := '{}';
  v_row text[];
  v_sec_name text;
  v_rows text[][];
begin
  select name into v_model
  from public.production_options
  where option_type = 'model' and name ilike 'predator 540'
  limit 1;

  if v_model is null then
    raise exception 'Modello "predator 540" non trovato tra le opzioni battello (production_options, option_type=''model''). Controlla il nome esatto in Produzione -> Configurazioni e rilancia lo script.';
  end if;

  -- ============================================================
  -- STEP 41 - Tubolare in tessuto hypalon / neoprene
  -- ============================================================
  v_sec_name := 'Tubolare in tessuto hypalon / neoprene';
  select id into v_section_id from public.production_bom_sections where model_boat = v_model and name = v_sec_name;
  if v_section_id is null then
    raise exception 'Sezione "%" non trovata: dovrebbe esistere gia'' dallo STEP 41.', v_sec_name;
  end if;

  v_rows := array[
    array['6729 7012/neutro', 'PZ', '4',    'Maniglia in fast rubber mod. Synthesi... (Ceredi di Ceredi...)'],
    array['V828272770',       'MT', '21',   'ORCA 828 770 ICE WHITE (Orca made by Penn...)'],
    array['A102801',          'PZ', '5',    'Valvola mod. BRAVO 2005 push-push grigio (Scoprega S.p.A.)'],
    array['EI948',            'KG', '12.80','Bottazzo h. 12,3cm - unghia vuota - g... (Teris Gomma S.r.l.)'],
    array['EI243',            'KG', '7.40', 'Virgola h. 3cm - grigio scuro RAL 7012 (Teris Gomma S.r.l.)']
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
  -- STEP 42 - Impianto acqua dolce con doccia esterna a poppa
  -- ============================================================
  v_sec_name := 'Impianto acqua dolce con doccia esterna a poppa';
  select id into v_section_id from public.production_bom_sections where model_boat = v_model and name = v_sec_name;
  if v_section_id is null then
    raise exception 'Sezione "%" non trovata: dovrebbe esistere gia'' dallo STEP 42.', v_sec_name;
  end if;

  v_rows := array[
    array['04993450',       'PZ', '1',    'Manicotto M 3/8 F 1/2 Ot (Dales s.r.l.)'],
    array['43133',          'PZ', '1',    'Anello Pass. AntiSPruzzo O89mm, Nero'],
    array['31321',          'PZ', '1',    'Serbatoio flessibile per acqua, rettangolare, 55 l, 740x750 mm, grigio'],
    array['45298',          'PZ', '1',    'Tappo Imbarco Acqua O38mm Bianco'],
    array['16.512.12',      'PZ', '1',    'Autoclave 4 valvole Europump 12-12V'],
    array['15.250.09',      'PZ', '1',    'Doccia ''Classic Evo'' a parete tubo PV...'],
    array['18.029.02',      'PZ', '2',    'Fascetta inox 08/22mm - 8mm'],
    array['CEM01200000000', 'MT', '4',    'CORDSTEEL ALIMENTI P.L. D 12'],
    array['CEM03800000000', 'MT', '1.50', 'CORDSTEEL ALIMENTI P.L. D 38'],
    array['W4B12035050000', 'PZ', '2',    'Fascetta inox AISI 304 nastro banda 1...']
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
  -- STEP 43 - Impianto carburante
  -- ============================================================
  v_sec_name := 'Impianto carburante';
  select id into v_section_id from public.production_bom_sections where model_boat = v_model and name = v_sec_name;
  if v_section_id is null then
    raise exception 'Sezione "%" non trovata: dovrebbe esistere gia'' dallo STEP 43.', v_sec_name;
  end if;

  v_rows := array[
    array['BO2151',         'PZ', '1',    'Kit bocchettone 90° (CAN-SB Marine Plastic)'],
    array['TP2186',         'PZ', '1',    'Tappo imbarco carburante 38mm plastic... (CAN-SB Marine Plastic)'],
    array['crdsrb',         'CP', '2',    'Fascette serbatoio (Italboats srl)'],
    array['47063',          'PZ', '1',    'Presa D''Aria Quad. "Top Line" 92x92mm Bianca'],
    array['31517',          'PZ', '1',    'Sfiato Serb.Ovale 90° Bianco'],
    array['16.104.15',      'PZ', '1',    'Aspiratore gas 12V 260 m3/h 3 A'],
    array['18.029.02',      'PZ', '4',    'Fascetta inox 08/22mm - 8mm'],
    array['06.709.25',      'PZ', '2',    'Fibbia inox mm 25'],
    array['17.224.00',      'PZ', '1',    'Gomito 90° ottone maschio/femmina 3/8"'],
    array['17.227.00',      'PZ', '1',    'Niples ottone doppio 1/4" x 3/8"'],
    array['17.198.04',      'PZ', '2',    'Portagomma maschio ottone 3/8" x 10 mm'],
    array['TMIIT038050000', 'MT', '1.40', 'CARBOMARINE/IT 38x50 mm'],
    array['TLMLN010019000', 'MT', '1.20', 'CARBOMARINE/LN 10x19 mm'],
    array['TLMLN016026000', 'MT', '2.40', 'CARBOMARINE/LN 16x26 mm'],
    array['WC421048051000', 'PZ', '2',    'Fascetta collare inox AISI 304 nastro...'],
    array['W4B12016027000', 'PZ', '4',    'Fascetta inox AISI 304 nastro banda 1...'],
    array['HPSR0067',       'PZ', '1',    'Serbatoio carburante 142 lt + STD (SIC Divisione Elettronica)']
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
  -- STEP 44 - Timoneria idraulica (solo le 4 righe a quantita'
  -- positiva: le altre 3 restano escluse come gia' confermato)
  -- ============================================================
  v_sec_name := 'Timoneria idraulica';
  select id into v_section_id from public.production_bom_sections where model_boat = v_model and name = v_sec_name;
  if v_section_id is null then
    raise exception 'Sezione "%" non trovata: dovrebbe esistere gia'' dallo STEP 44.', v_sec_name;
  end if;

  v_rows := array[
    array['43515D', 'PZ', '1', 'Cilindro UC95-OBF/1'],
    array['43048Y', 'PZ', '1', 'Flangia X74 per semincasso quadrata'],
    array['41708E', 'PZ', '1', 'Kit tubi flessibili OB/M-60 accorciabili'],
    array['43180Y', 'PZ', '1', 'Pompa UP20F 20cc [fino a 150HP]']
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

  if array_length(v_not_found, 1) > 0 then
    raise notice 'DA CREARE A CATALOGO: questi codici non sono ancora nel catalogo e ora compaiono come righe libere (senza collegamento) in Distinta base, pronte per "Collega articolo" appena li crei: %', v_not_found;
  else
    raise notice 'Fatto: tutti i codici sono stati trovati e collegati.';
  end if;
end $$;

-- FINE STEP 51
