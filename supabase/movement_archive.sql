/*
  ============================================================
  ARCHIVIO LOTTI MOVIMENTI
  ============================================================
*/

create table if not exists public.movement_batches (
  id uuid primary key default gen_random_uuid(),

  batch_date date not null default current_date,

  batch_type text not null default 'MISTO'
    check (
      batch_type in (
        'CARICO',
        'SCARICO',
        'MISTO'
      )
    ),

  total_rows integer not null default 0,
  processed integer not null default 0,
  missing integer not null default 0,
  insufficient integer not null default 0,

  pdf_path text,
  pdf_url text,

  created_at timestamptz not null default now()
);


/*
  ============================================================
  RIGHE DI OGNI LOTTO

  Qui salviamo TUTTO:
  - movimento riuscito
  - codice non trovato
  - scarico bloccato
  ============================================================
*/

create table if not exists public.movement_batch_rows (
  id uuid primary key default gen_random_uuid(),

  batch_id uuid not null
    references public.movement_batches(id)
    on delete cascade,

  movement_date date not null,

  movement_type text not null
    check (
      movement_type in (
        'CARICO',
        'SCARICO'
      )
    ),

  code text not null,

  qty numeric not null,

  result text not null
    check (
      result in (
        'PROCESSED',
        'MISSING',
        'INSUFFICIENT'
      )
    ),

  stock_before numeric,
  stock_after numeric,

  created_at timestamptz not null default now()
);


/*
  ============================================================
  RLS

  Il gestionale attuale usa accesso anon,
  quindi manteniamo lo stesso comportamento.
  ============================================================
*/

alter table public.movement_batches
disable row level security;

alter table public.movement_batch_rows
disable row level security;


/*
  ============================================================
  NUOVA VERSIONE DELLA FUNZIONE MOVIMENTI
  ============================================================
*/

create or replace function public.process_warehouse_movements(
  p_rows jsonb
)
returns jsonb
language plpgsql
as $$
declare
  r jsonb;

  v_item_id uuid;
  v_stock numeric;
  v_qty numeric;

  v_type text;
  v_code text;
  v_date date;

  v_new_stock numeric;

  v_processed integer := 0;

  v_missing jsonb := '[]'::jsonb;
  v_insufficient jsonb := '[]'::jsonb;

  /*
    NUOVI DATI LOTTO
  */
  v_batch_id uuid;

  v_total_rows integer := 0;
  v_missing_count integer := 0;
  v_insufficient_count integer := 0;

  v_has_carico boolean := false;
  v_has_scarico boolean := false;

  v_batch_type text := 'MISTO';
  v_batch_date date;

begin

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception
      'Formato movimenti non valido';
  end if;


  if jsonb_array_length(p_rows) = 0 then
    raise exception
      'Nessun movimento da elaborare';
  end if;


  /*
    DATA DEL LOTTO

    Prendiamo la data della prima riga.
  */
  v_batch_date :=
    (
      p_rows -> 0 ->> 'movement_date'
    )::date;


  /*
    CREIAMO SUBITO IL LOTTO
  */
  insert into public.movement_batches (
    batch_date
  )
  values (
    v_batch_date
  )
  returning id
  into v_batch_id;


  /*
    ELABORAZIONE RIGHE
  */
  for r in
    select *
    from jsonb_array_elements(p_rows)
  loop

    v_item_id := null;
    v_stock := null;

    v_code :=
      trim(r ->> 'code');

    v_type :=
      upper(
        trim(
          r ->> 'movement_type'
        )
      );

    v_qty :=
      (r ->> 'qty')::numeric;

    v_date :=
      (r ->> 'movement_date')::date;


    /*
      CONTROLLO DATI
    */
    if v_code is null or v_code = '' then
      continue;
    end if;

    if v_type not in (
      'CARICO',
      'SCARICO'
    ) then
      continue;
    end if;

    if v_qty is null or v_qty <= 0 then
      continue;
    end if;


    /*
      CONTATORI TIPO LOTTO
    */
    if v_type = 'CARICO' then
      v_has_carico := true;
    end if;

    if v_type = 'SCARICO' then
      v_has_scarico := true;
    end if;

    v_total_rows :=
      v_total_rows + 1;


    /*
      CERCA ARTICOLO
    */
    select
      id,
      stock
    into
      v_item_id,
      v_stock
    from public.items
    where code = v_code
    limit 1
    for update;


    /*
      ========================================================
      CODICE NON TROVATO
      ========================================================
    */
    if v_item_id is null then

      v_missing_count :=
        v_missing_count + 1;

      v_missing :=
        v_missing ||
        jsonb_build_array(
          jsonb_build_object(
            'date',
            v_date,

            'movement',
            v_type,

            'code',
            v_code,

            'qty',
            v_qty
          )
        );


      /*
        DA ORA LO SALVIAMO ANCHE NEL DATABASE
      */
      insert into public.movement_batch_rows (
        batch_id,
        movement_date,
        movement_type,
        code,
        qty,
        result,
        stock_before,
        stock_after
      )
      values (
        v_batch_id,
        v_date,
        v_type,
        v_code,
        v_qty,
        'MISSING',
        null,
        null
      );

      continue;

    end if;


    /*
      ========================================================
      CALCOLO NUOVA GIACENZA
      ========================================================
    */
    if v_type = 'CARICO' then

      v_new_stock :=
        coalesce(v_stock, 0)
        +
        v_qty;

    else

      v_new_stock :=
        coalesce(v_stock, 0)
        -
        v_qty;

    end if;


    /*
      ========================================================
      SCARICO CON GIACENZA INSUFFICIENTE
      ========================================================
    */
    if v_new_stock < 0 then

      v_insufficient_count :=
        v_insufficient_count + 1;

      v_insufficient :=
        v_insufficient ||
        jsonb_build_array(
          jsonb_build_object(
            'date',
            v_date,

            'movement',
            v_type,

            'code',
            v_code,

            'qty',
            v_qty,

            'stock',
            coalesce(v_stock, 0)
          )
        );


      /*
        SALVIAMO ANCHE LO SCARICO BLOCCATO
      */
      insert into public.movement_batch_rows (
        batch_id,
        movement_date,
        movement_type,
        code,
        qty,
        result,
        stock_before,
        stock_after
      )
      values (
        v_batch_id,
        v_date,
        v_type,
        v_code,
        v_qty,
        'INSUFFICIENT',
        coalesce(v_stock, 0),
        coalesce(v_stock, 0)
      );

      continue;

    end if;


    /*
      ========================================================
      MOVIMENTO RIUSCITO
      ========================================================
    */

    update public.items
    set stock =
      v_new_stock
    where id =
      v_item_id;


    /*
      STORICO MOVIMENTI ESISTENTE
    */
    insert into public.movements (
      movement_type,
      code,
      qty,
      movement_date,
      note
    )
    values (
      v_type,
      v_code,
      v_qty,
      v_date,
      'Inserimento da pagina Movimenti'
    );


    /*
      STORICO DEL NUOVO LOTTO
    */
    insert into public.movement_batch_rows (
      batch_id,
      movement_date,
      movement_type,
      code,
      qty,
      result,
      stock_before,
      stock_after
    )
    values (
      v_batch_id,
      v_date,
      v_type,
      v_code,
      v_qty,
      'PROCESSED',
      coalesce(v_stock, 0),
      v_new_stock
    );


    v_processed :=
      v_processed + 1;

  end loop;


  /*
    TIPO DEL LOTTO
  */
  if
    v_has_carico
    and not v_has_scarico
  then

    v_batch_type :=
      'CARICO';

  elsif
    v_has_scarico
    and not v_has_carico
  then

    v_batch_type :=
      'SCARICO';

  else

    v_batch_type :=
      'MISTO';

  end if;


  /*
    AGGIORNIAMO RIEPILOGO LOTTO
  */
  update public.movement_batches
  set
    batch_type =
      v_batch_type,

    total_rows =
      v_total_rows,

    processed =
      v_processed,

    missing =
      v_missing_count,

    insufficient =
      v_insufficient_count

  where id =
    v_batch_id;


  /*
    RISPOSTA ALLA PAGINA
  */
  return jsonb_build_object(
    'batch_id',
    v_batch_id,

    'batch_date',
    v_batch_date,

    'batch_type',
    v_batch_type,

    'processed',
    v_processed,

    'missing',
    v_missing,

    'insufficient',
    v_insufficient
  );

end;
$$;


/*
  ============================================================
  AUTORIZZAZIONE GESTIONALE
  ============================================================
*/

grant execute
on function public.process_warehouse_movements(
  jsonb
)
to anon, authenticated;