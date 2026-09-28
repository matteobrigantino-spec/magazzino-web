-- ============================================================
-- STEP 45 - Completa la sezione "Battello con dotazioni di serie"
-- (gia' esistente) per Predator 540, popolandola con gli articoli
-- dello screenshot di riferimento
--
-- Diverso dagli STEP 41/42/43/44: qui la sezione esiste gia' (creata
-- a mano dall'utente), quindi lo script la RIUSA per nome e NON la
-- crea. Per ogni riga:
--  - se il codice viene trovato nel catalogo (items.code /
--    items.supplier_code), la riga viene collegata all'articolo
--    (come negli STEP precedenti);
--  - se il codice NON viene trovato (o manca del tutto, come per
--    "targa dati Italboats"), la riga viene inserita comunque come
--    riga LIBERA (senza collegamento al catalogo), con la
--    descrizione letta dallo screenshot. Cosi' compare comunque in
--    Distinta base con Fornitore/Cod. Articolo a "-" e Giacenza
--    "n/d": sono le righe da creare come articoli veri in un
--    secondo momento.
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
    array['P4EPA2003',      'MT', '7',    'piatto mousse EPDM ades. sez.20x3 RT 20'],
    array['BOX Q.E 4T',     'PZ', '1',    'box quadri elettrici doppia mappa'],
    array['CHIAVE ZAMA',    'PZ', '1',    'chiave zama per box doppia mappa'],
    array['LEVETTA/INOX',   'PZ', '1',    'linguetta inox box giussani'],
    array['43543',          'PZ', '2',    'boccola di scarico 1" x 70mm p/lg 30mm...'],
    array['43158',          'PZ', '1',    'cuffia passacavo in gomma diam. 70mm...'],
    array['31519',          'PZ', '1',    'orecchietta proteggi scarichi bianca...'],
    array['47122',          'PZ', '3',    'scarico a mare 1" x 70mm bianco'],
    array['45324',          'PZ', '1',    'tavoletta proteggi poppa con fenditur...'],
    array['44671',          'PZ', '2',    'valvola a sfera plastica 1" smontabile'],
    array['45393',          'PZ', '2',    'valvola di non ritorno per scarichi a...'],
    array['175.46',         'PZ', '2',    'cerniera inox 1,5mm 44x46mm n.s. rett...'],
    array['175.44',         'PZ', '4',    'cerniera inox 1,5mm 68x46mm n.s. esag...'],
    array['40.132.15',      'PZ', '3',    'bitta americana 150 mm'],
    array['38.421.66',      'PZ', '1',    'compasso inox 260mm'],
    array['53.273.27',      'PZ', '2',    'griglia presa d''aria ABS 85x85mm bianca'],
    array['17.234.07',      'PZ', '2',    'portagomma maschio polipro. 1" x 30 mm'],
    array['54.409.01',      'PZ', '2',    'targhetta per matricola CE 140x13 mm'],
    array['CEM03000000000', 'MT', '1.66', 'CORDSTEEL ALIMENTI P.L. D 30'],
    array['W4B12025040000', 'PZ', '4',    'fascetta inox AISI 304 nastro banda 1...'],
    array['6120050',        'PZ', '1',    'pompa a mano flusso continuo mod. BRA...'],
    array['K6501491',       'PZ', '2',    'remo mod. RSP 160/Z smontabile alu/po...'],
    array['M3500058',       'PZ', '1',    'chiusura inox per gavoni a pulsante c...'],
    array['N3060000',       'PZ', '1',    'farma pagliolo inox 60 mm']
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
    and name = 'Battello con dotazioni di serie';

  if v_section_id is null then
    raise exception 'Sezione "Battello con dotazioni di serie" non trovata per il modello %. Controlla il nome esatto in Produzione -> Distinta base (deve coincidere carattere per carattere) e rilancia lo script.', v_model;
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

  -- 4) Riga senza codice (M&F snc): sempre libera.
  if not exists (
    select 1 from public.production_bom_items
    where section_id = v_section_id
      and item_id is null
      and description = 'Targa dati Italboats CE 106x100mm (M&F snc)'
  ) then
    insert into public.production_bom_items (section_id, item_id, description, unit, qty)
    values (
      v_section_id, null,
      'Targa dati Italboats CE 106x100mm (M&F snc)',
      'PZ', 1
    );
  end if;

  if array_length(v_not_found, 1) > 0 then
    raise notice 'DA CREARE A CATALOGO: questi codici non sono stati trovati e sono stati inseriti come righe libere (senza collegamento). Vanno creati come articoli veri e poi ricollegati dalla pagina Distinta base: %', v_not_found;
  else
    raise notice 'Fatto: tutti i codici sono stati trovati e collegati.';
  end if;
end $$;

-- FINE STEP 45
