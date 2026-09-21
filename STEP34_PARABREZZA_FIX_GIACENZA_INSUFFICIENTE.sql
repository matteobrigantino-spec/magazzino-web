-- ============================================================
-- STEP 34 - PARABREZZA: FIX ERRORE "GIACENZA ARTICOLO
-- INSUFFICIENTE" ALL'ESECUZIONE DELLO STEP 33
--
-- CAUSA DEL PROBLEMA:
-- quando un kit veniva liberato da un battello (unassign), la
-- funzione aumentava PRIMA la giacenza generale dell'articolo
-- (items.stock) e SOLO DOPO segnava il kit come "di nuovo in
-- giacenza" (windshield_kits.status = 'stock'). Il trigger
-- automatico dello STEP 32 pero' scatta ESATTAMENTE nel momento in
-- cui items.stock sale, quindi vedeva la giacenza gia' aumentata
-- ma il kit liberato ancora segnato come "assegnato": pensava che
-- fosse arrivato un pezzo NUOVO, ne creava un altro (fantasma) e lo
-- assegnava subito al primo battello in attesa. Risultato: un kit
-- di troppo tracciato rispetto alla giacenza reale, e la prima
-- volta che qualcosa provava a riassegnare esplicitamente il kit
-- originale liberato, la giacenza risultava a 0 -> errore "Giacenza
-- articolo insufficiente" (questo e' successo durante la pulizia
-- dello STEP 33, mandando indietro tutto lo script, funzione
-- compresa: sotto viene rifatta anche quella).
--
-- FIX:
--  1) unassign_windshield_kit_from_boat: ora segna PRIMA il kit
--     come di nuovo "in giacenza" e SOLO DOPO aumenta items.stock,
--     cosi' quando il trigger scatta il kit e' gia' contato.
--  2) windshield_kits_from_stock_increase (il trigger dello STEP
--     32): non calcola piu' un "delta" alla cieca (giacenza nuova
--     meno giacenza vecchia), ma controlla quanti pezzi mancano
--     davvero rispetto a quelli gia' tracciati in giacenza e crea
--     solo quelli. Cosi' e' sempre corretto, qualunque cosa abbia
--     fatto salire items.stock e in qualunque ordine.
--  3) Rifatta la funzione remove_stale_windshield_requirements e
--     la pulizia una tantum dello STEP 33 (annullate insieme al
--     resto quando lo script e' andato in errore, quindi non sono
--     mai state applicate).
--  4) Riconciliazione finale di sicurezza, come nello STEP 32, per
--     sistemare subito eventuali giacenze tracciate rimaste
--     indietro.
-- ============================================================

-- ------------------------------------------------------------
-- 1) unassign_windshield_kit_from_boat: kit segnato "in giacenza"
--    PRIMA di aumentare items.stock.
-- ------------------------------------------------------------
create or replace function public.unassign_windshield_kit_from_boat(
  p_kit_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit public.windshield_kits%rowtype;
begin
  select * into v_kit
  from public.windshield_kits
  where id = p_kit_id
  for update;

  if not found then
    raise exception 'Kit non trovato.';
  end if;

  if v_kit.status <> 'out' or v_kit.boat_id is null then
    raise exception 'Questo kit non risulta assegnato a un battello.';
  end if;

  update public.production_boat_windshield
  set kit_id = null
  where kit_id = p_kit_id;

  update public.windshield_kits
  set
    status = 'stock',
    out_at = null,
    boat_id = null,
    boat_registration = null
  where id = p_kit_id;

  update public.items
  set stock = coalesce(stock, 0) + 1
  where id::text = v_kit.item_id;
end;
$$;

-- ------------------------------------------------------------
-- 2) Trigger dello STEP 32: invece del delta alla cieca, ricalcola
--    quanti pezzi tracciati mancano rispetto alla giacenza generale
--    e crea solo quelli. Idempotente e sicuro qualunque sia
--    l'ordine delle operazioni che ha fatto salire items.stock.
-- ------------------------------------------------------------
create or replace function public.windshield_kits_from_stock_increase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id text;
  v_is_windshield_item boolean;
  v_tracked integer;
  v_missing integer;
  v_kit_id uuid;
  v_i integer;
begin
  begin
    if new.stock is null or old.stock is null or new.stock <= old.stock then
      return new;
    end if;

    v_item_id := new.id::text;

    select exists (
      select 1
      from public.production_windshield_matrix
      where item_id = v_item_id
    )
    into v_is_windshield_item;

    if not v_is_windshield_item then
      return new;
    end if;

    select count(*)
    into v_tracked
    from public.windshield_kits
    where item_id = v_item_id
      and status = 'stock';

    v_missing := greatest(new.stock::integer - coalesce(v_tracked, 0), 0);

    for v_i in 1..v_missing loop
      insert into public.windshield_kits (item_id, status, note, received_at)
      values (v_item_id, 'stock', 'Giacenza aggiornata automaticamente', now())
      returning id into v_kit_id;

      perform public.assign_windshield_stock_kit_by_priority(v_kit_id);
    end loop;
  exception when others then
    null;
  end;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 3) Rifatta (mai applicata per il rollback dello STEP 33):
--    rimuove le richieste di un modello per un articolo preciso,
--    liberando prima il pezzo assegnato o la riga d'ordine
--    agganciata.
-- ------------------------------------------------------------
create or replace function public.remove_stale_windshield_requirements(
  p_model_boat text,
  p_item_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select pbw.id, pbw.kit_id
    from public.production_boat_windshield pbw
    join public.production_boats pb on pb.id = pbw.boat_id
    where pb.model_boat = p_model_boat
      and pbw.item_id = p_item_id
      and pb.status = 'active'
    for update of pbw
  loop
    if v_row.kit_id is not null then
      perform public.unassign_windshield_kit_from_boat(v_row.kit_id);
    end if;

    delete from public.production_boat_windshield
    where id = v_row.id;

    v_count := v_count + 1;

    if v_row.kit_id is not null then
      perform public.assign_windshield_stock_kit_by_priority(v_row.kit_id);
    end if;
  end loop;

  perform public.sync_windshield_order_links(p_item_id);

  return v_count;
end;
$$;

grant execute
on function public.remove_stale_windshield_requirements(text, text)
to anon, authenticated;

-- ------------------------------------------------------------
-- 4) Pulizia una tantum (mai applicata per il rollback dello STEP
--    33): qualsiasi richiesta gia' esistente per un battello attivo
--    il cui (modello, articolo) non e' piu' nella mappa viene tolta
--    adesso, liberando prima pezzo/riga d'ordine.
-- ------------------------------------------------------------
do $$
declare
  v_row record;
begin
  for v_row in
    select pbw.id, pbw.kit_id, pbw.item_id
    from public.production_boat_windshield pbw
    join public.production_boats pb on pb.id = pbw.boat_id
    where pb.status = 'active'
      and not exists (
        select 1
        from public.production_windshield_matrix pwm
        where pwm.model_boat = pb.model_boat
          and pwm.item_id = pbw.item_id
      )
  loop
    if v_row.kit_id is not null then
      perform public.unassign_windshield_kit_from_boat(v_row.kit_id);
    end if;

    delete from public.production_boat_windshield
    where id = v_row.id;

    if v_row.kit_id is not null then
      perform public.assign_windshield_stock_kit_by_priority(v_row.kit_id);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 5) Riconciliazione finale di sicurezza: eventuale giacenza
--    generale non ancora tracciata (per un articolo mappato come
--    parabrezza) viene tracciata e assegnata adesso. Sicura da
--    rieseguire piu' volte.
-- ------------------------------------------------------------
do $$
declare
  v_row record;
  v_tracked integer;
  v_missing integer;
  v_kit_id uuid;
  v_i integer;
begin
  for v_row in
    select distinct pwm.item_id, i.stock
    from public.production_windshield_matrix pwm
    join public.items i on i.id::text = pwm.item_id
  loop
    select count(*)
    into v_tracked
    from public.windshield_kits
    where item_id = v_row.item_id
      and status = 'stock';

    v_missing := greatest(coalesce(v_row.stock, 0)::integer - coalesce(v_tracked, 0), 0);

    for v_i in 1..v_missing loop
      insert into public.windshield_kits (item_id, status, note, received_at)
      values (v_row.item_id, 'stock', 'Giacenza pre-esistente tracciata automaticamente', now())
      returning id into v_kit_id;

      perform public.assign_windshield_stock_kit_by_priority(v_kit_id);
    end loop;
  end loop;
end $$;

-- FINE STEP 34
