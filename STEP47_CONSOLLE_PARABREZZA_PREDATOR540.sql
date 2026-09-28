-- ============================================================
-- STEP 47 - Completa la sezione "Consolle con parabrezza,
-- corrimano e volante" (gia' esistente) per Predator 540,
-- popolandola con gli articoli dello screenshot di riferimento
--
-- Stesso procedimento dello STEP 45: la sezione esiste gia' (creata
-- a mano dall'utente), quindi lo script la RIUSA per nome e NON la
-- crea. Per ogni riga:
--  - se il codice viene trovato nel catalogo (items.code /
--    items.supplier_code), la riga viene collegata all'articolo
--    (come negli STEP precedenti);
--  - se il codice NON viene trovato (o manca del tutto, come per il
--    parabrezza e il giro consolle), la riga viene inserita comunque
--    come riga LIBERA (senza collegamento al catalogo), con la
--    descrizione letta dallo screenshot (fornitore tra parentesi
--    quando manca il codice). Cosi' compare comunque in Distinta
--    base con Fornitore/Cod. Articolo a "-" e Giacenza "n/d": sono
--    le righe da creare come articoli veri in un secondo momento.
--
-- Alcune descrizioni erano troncate nello screenshot (finiscono con
-- "..."): sono state riportate cosi' come si leggono, da completare
-- quando si crea l'articolo vero.
--
-- Sicuro da rieseguire: non duplica le righe gia' presenti.
-- ============================================================

do $$
declare
  v_model text;
  v_section_id uuid;
  v_item_id text;
  v_item_description text;
  v_not_found text[] := '{}';

  -- Righe con codice articolo: codice, unita' di misura, quantita',
  -- descrizione di riserva (usata SOLO se il codice non viene
  -- trovato nel catalogo).
  v_rows text[][] := array[
    array['43158',   'PZ', '1', 'cuffia passacavo in gomma diam. 70mm...'],
    array['196150',  'PZ', '4', 'guarnizione per basi corrimano piccola'],
    array['45163',   'PZ', '1', 'sportello ad incastro 306x356mm bianco'],
    array['280.26',  'PZ', '2', 'basetta tonda foro dritto senza fori...'],
    array['280.27',  'PZ', '2', 'basetta tonda foro inclinato 60° sen...'],
    array['175.46',  'PZ', '2', 'cerniera inox 1,5mm 44x46mm n.s. rett...'],
    array['E5620080','PZ', '5', 'distanziale porta-vite per plexiglass...'],
    array['381755B', 'PZ', '1', 'monocavo M66 da 13'', in bulk'],
    array['38867H',  'PZ', '1', 'timoneria rotativa T71 F.C.'],
    array['42347D',  'PZ', '1', 'V24W volante D.35 poliur.bianco'],
    array['36654B',  'PZ', '1', 'X34 coprimozzo 90G per T71/T73']
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

  -- 2) La sezione deve GIA' esistere (creata a mano): non viene
  --    creata da questo script.
  select id into v_section_id
  from public.production_bom_sections
  where model_boat = v_model
    and name = 'Consolle con parabrezza, corrimano e volante';

  if v_section_id is null then
    raise exception 'Sezione "Consolle con parabrezza, corrimano e volante" non trovata per il modello %. Controlla il nome esatto in Produzione -> Distinta base (deve coincidere carattere per carattere) e rilancia lo script.', v_model;
  end if;

  -- 3) Righe con codice: collegate al catalogo se trovate, altrimenti
  --    inserite come riga libera con la descrizione di riserva.
  foreach v_row slice 1 in array v_rows
  loop
    select id::text, description
      into v_item_id, v_item_description
    from public.items
    where code ilike v_row[1] or supplier_code ilike v_row[1]
    limit 1;

    if v_item_id is not null then
      if not exists (
        select 1 from public.production_bom_items
        where section_id = v_section_id and item_id = v_item_id
      ) then
        insert into public.production_bom_items (section_id, item_id, description, unit, qty)
        values (v_section_id, v_item_id, v_item_description, v_row[2], v_row[3]::numeric);
      end if;
    else
      v_not_found := array_append(v_not_found, v_row[1]);
      if not exists (
        select 1 from public.production_bom_items
        where section_id = v_section_id
          and item_id is null
          and description = v_row[4]
      ) then
        insert into public.production_bom_items (section_id, item_id, description, unit, qty)
        values (v_section_id, null, v_row[4], v_row[2], v_row[3]::numeric);
      end if;
    end if;
  end loop;

  -- 4) Righe senza codice: sempre libere (fornitore riportato tra
  --    parentesi nella descrizione, come per le altre righe libere
  --    gia' presenti nella distinta base).
  if not exists (
    select 1 from public.production_bom_items
    where section_id = v_section_id
      and item_id is null
      and description = 'Parabrezza mod. Salva D.540/ D.570 /... (Fralicciardi Vincenzo)'
  ) then
    insert into public.production_bom_items (section_id, item_id, description, unit, qty)
    values (
      v_section_id, null,
      'Parabrezza mod. Salva D.540/ D.570 /... (Fralicciardi Vincenzo)',
      'PZ', 1
    );
  end if;

  if not exists (
    select 1 from public.production_bom_items
    where section_id = v_section_id
      and item_id is null
      and description = 'Giro consolle mod. Salva 540/570 a Pr... (Italboats - R.5)'
  ) then
    insert into public.production_bom_items (section_id, item_id, description, unit, qty)
    values (
      v_section_id, null,
      'Giro consolle mod. Salva 540/570 a Pr... (Italboats - R.5)',
      'PZ', 1
    );
  end if;

  if array_length(v_not_found, 1) > 0 then
    raise notice 'DA CREARE A CATALOGO: questi codici non sono stati trovati e sono stati inseriti come righe libere (senza collegamento). Vanno creati come articoli veri e poi ricollegati dalla pagina Distinta base: %', v_not_found;
  else
    raise notice 'Fatto: tutti i codici sono stati trovati e collegati.';
  end if;
end $$;

-- FINE STEP 47
