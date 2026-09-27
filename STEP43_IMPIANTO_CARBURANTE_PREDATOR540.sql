-- ============================================================
-- STEP 43 - Sezione "Impianto carburante" per Predator 540,
-- popolata cercando gli articoli per codice (stesso procedimento
-- degli STEP 41/42)
--
-- Sezione OPTIONAL: si sceglie battello per battello.
--
-- Una riga dello screenshot ("valvola a sfera a leva 3/8" FF -
-- ottone" di CM Forniture Srl) non ha un codice articolo: viene
-- inserita come riga libera (senza collegamento al catalogo, quindi
-- senza controllo di giacenza per quella riga), esattamente come le
-- altre righe libere gia' previste dalla distinta base.
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

  -- Righe con codice articolo: codice, unita' di misura, quantita'.
  v_rows text[][] := array[
    array['BO2151',         'PZ', '1'],
    array['TP2186',         'PZ', '1'],
    array['crdsrb',         'CP', '2'],
    array['47063',          'PZ', '1'],
    array['31517',          'PZ', '1'],
    array['16.104.15',      'PZ', '1'],
    array['18.029.02',      'PZ', '4'],
    array['06.709.25',      'PZ', '2'],
    array['17.224.00',      'PZ', '1'],
    array['17.227.00',      'PZ', '1'],
    array['17.198.04',      'PZ', '2'],
    array['TMIIT038050000', 'MT', '1.40'],
    array['TLMLN010019000', 'MT', '1.20'],
    array['TLMLN016026000', 'MT', '2.40'],
    array['WC421048051000', 'PZ', '2'],
    array['W4B12016027000', 'PZ', '4'],
    array['HPSR0087',       'PZ', '1']
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
    and name = 'Impianto carburante';

  if v_section_id is null then
    insert into public.production_bom_sections (model_boat, name, kind)
    values (v_model, 'Impianto carburante', 'optional')
    returning id into v_section_id;
  end if;

  -- 3) Righe con codice: cercate nel catalogo.
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

  -- 4) Riga libera senza codice (CM Forniture Srl): nessun
  --    collegamento al catalogo possibile, si inserisce solo la
  --    descrizione.
  if not exists (
    select 1 from public.production_bom_items
    where section_id = v_section_id
      and item_id is null
      and description = 'Valvola a sfera a leva 3/8" FF - ottone (CM Forniture Srl)'
  ) then
    insert into public.production_bom_items (section_id, item_id, description, unit, qty)
    values (
      v_section_id, null,
      'Valvola a sfera a leva 3/8" FF - ottone (CM Forniture Srl)',
      'PZ', 1
    );
  end if;

  if array_length(v_not_found, 1) > 0 then
    raise notice 'ATTENZIONE: questi codici NON sono stati trovati nel catalogo articoli e vanno controllati/aggiunti a mano dalla pagina Distinta base: %', v_not_found;
  else
    raise notice 'Fatto: tutti i codici sono stati trovati e collegati (piu'' la riga libera senza codice).';
  end if;
end $$;

-- FINE STEP 43
