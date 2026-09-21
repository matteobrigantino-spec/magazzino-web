-- ============================================================
-- STEP 32 - PARABREZZA: GIACENZA TOTALMENTE AUTOMATICA
--
-- Da qui in poi non c'e' PIU' NIENTE da registrare a mano per i
-- parabrezza. La giacenza tracciata segue sempre e comunque quella
-- generale dell'articolo (items.stock - la stessa che vedi sulla
-- scheda del fornitore, aggiornata da Movimenti, da un ordine
-- ricevuto o da qualsiasi altra modifica): appena sale, per un
-- articolo mappato come parabrezza, il sistema crea da solo i pezzi
-- tracciati per l'aumento e prova subito ad assegnarli ai battelli
-- in attesa. Un trigger sulla tabella items copre QUALSIASI origine
-- dell'aumento, non solo l'arrivo ordine.
--
-- Tolte dalla pagina Parabrezza "Registra un arrivo" e "Converti da
-- giacenza generale": non servono piu' e, tenendole, avrebbero
-- contato la giacenza due volte insieme al trigger.
--
-- Tolta anche la chiamata esplicita aggiunta in STEP31 dentro
-- receive_order_atomic (receive_order_atomic torna identica a
-- prima di STEP31): il trigger sotto copre GIA' anche l'arrivo
-- ordine, visto che aggiorna items.stock, quindi tenerla avrebbe
-- contato ogni arrivo ordine due volte.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Trigger: ogni volta che la giacenza di un articolo sale (per
--    qualsiasi motivo), se l'articolo e' mappato come parabrezza,
--    crea altrettanti pezzi tracciati e prova ad assegnarli ai
--    battelli in attesa. Non tocca mai items.stock lui stesso (lo
--    sta gia' aggiornando chi ha lanciato l'update). Qualsiasi
--    errore qui dentro viene ignorato in silenzio: non deve MAI
--    impedire l'aggiornamento della giacenza.
-- ------------------------------------------------------------
create or replace function public.windshield_kits_from_stock_increase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id text;
  v_delta integer;
  v_is_windshield_item boolean;
  v_kit_id uuid;
  v_i integer;
begin
  begin
    if new.stock is null or old.stock is null or new.stock <= old.stock then
      return new;
    end if;

    v_item_id := new.id::text;
    v_delta := (new.stock - old.stock)::integer;

    select exists (
      select 1
      from public.production_windshield_matrix
      where item_id = v_item_id
    )
    into v_is_windshield_item;

    if not v_is_windshield_item then
      return new;
    end if;

    for v_i in 1..v_delta loop
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

drop trigger if exists windshield_kits_from_stock_increase_trg on public.items;

create trigger windshield_kits_from_stock_increase_trg
after update of stock on public.items
for each row
execute function public.windshield_kits_from_stock_increase();

-- ------------------------------------------------------------
-- 2) Riconciliazione una tantum: qualsiasi giacenza generale gia'
--    esistente (arrivata prima di questo trigger) e non ancora
--    tracciata, per tutti gli articoli gia' mappati come
--    parabrezza, viene tracciata e assegnata adesso.
-- ------------------------------------------------------------
do $$
declare
  v_row record;
  v_tracked integer;
  v_untracked integer;
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

    v_untracked := greatest(coalesce(v_row.stock, 0)::integer - coalesce(v_tracked, 0), 0);

    for v_i in 1..v_untracked loop
      insert into public.windshield_kits (item_id, status, note, received_at)
      values (v_row.item_id, 'stock', 'Giacenza pre-esistente tracciata automaticamente', now())
      returning id into v_kit_id;

      perform public.assign_windshield_stock_kit_by_priority(v_kit_id);
    end loop;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 3) Non serve piu': la funzione aggiunta in STEP30 per convertire
--    a mano ("Converti da giacenza generale") e quella aggiunta in
--    STEP31 per l'hook esplicito nell'arrivo ordine.
-- ------------------------------------------------------------
drop function if exists public.convert_item_stock_to_windshield_kits(text, integer);
drop function if exists public.create_windshield_kits_on_receipt(text, integer);

-- ------------------------------------------------------------
-- 4) receive_order_atomic torna identica a prima di STEP31 (senza
--    la chiamata esplicita): il trigger sopra copre gia' l'arrivo
--    ordine da solo, aggiungerla di nuovo qui conterebbe ogni
--    arrivo due volte.
-- ------------------------------------------------------------
create or replace function public.receive_order_atomic(
  p_order_id uuid,
  p_receipts jsonb default '[]'::jsonb,
  p_complete boolean default false
)
returns jsonb
language plpgsql
as $$
declare
  v_order record;
  v_line record;
  v_receipt jsonb;

  v_line_id uuid;
  v_qty bigint;
  v_remaining bigint;

  v_any_received boolean := false;
  v_all_complete boolean := false;
  v_new_status text;
begin

  /*
    BLOCCA L'ORDINE DURANTE L'OPERAZIONE
  */
  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Ordine non trovato';
  end if;

  if v_order.status = 'received' then
    raise exception 'Ordine già completamente ricevuto';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'Ordine annullato';
  end if;

  /*
    ORDINE COMPLETO
  */
  if p_complete then

    for v_line in
      select
        oi.id,
        oi.item_id,
        oi.qty,
        oi.received_qty
      from public.order_items oi
      where oi.order_id = p_order_id
      for update
    loop

      v_remaining :=
        greatest(
          0,
          coalesce(v_line.qty, 0)
          -
          coalesce(v_line.received_qty, 0)
        );

      if v_remaining > 0 then

        update public.items
        set
          stock =
            coalesce(stock, 0)
            +
            v_remaining,

          on_order =
            greatest(
              0,
              coalesce(on_order, 0)
              -
              v_remaining
            )
        where id = v_line.item_id;

        if not found then
          raise exception
            'Articolo non trovato per la riga %',
            v_line.id;
        end if;

        update public.order_items
        set
          received_qty =
            coalesce(received_qty, 0)
            +
            v_remaining
        where id = v_line.id;

        v_any_received := true;

      end if;

    end loop;

  /*
    ARRIVO PARZIALE
  */
  else

    if
      p_receipts is null
      or jsonb_typeof(p_receipts) <> 'array'
    then
      raise exception
        'Formato quantità ricevute non valido';
    end if;

    for v_receipt in
      select value
      from jsonb_array_elements(p_receipts)
    loop

      v_line_id :=
        nullif(
          v_receipt ->> 'line_id',
          ''
        )::uuid;

      v_qty :=
        coalesce(
          (v_receipt ->> 'qty')::bigint,
          0
        );

      if v_qty <= 0 then
        continue;
      end if;

      select
        oi.id,
        oi.item_id,
        oi.qty,
        oi.received_qty
      into v_line
      from public.order_items oi
      where
        oi.id = v_line_id
        and
        oi.order_id = p_order_id
      for update;

      if not found then
        raise exception
          'Riga ordine non trovata';
      end if;

      v_remaining :=
        greatest(
          0,
          coalesce(v_line.qty, 0)
          -
          coalesce(v_line.received_qty, 0)
        );

      if v_qty > v_remaining then
        raise exception
          'Quantità ricevuta superiore alla quantità mancante';
      end if;

      update public.items
      set
        stock =
          coalesce(stock, 0)
          +
          v_qty,

        on_order =
          greatest(
            0,
            coalesce(on_order, 0)
            -
            v_qty
          )
      where id = v_line.item_id;

      if not found then
        raise exception
          'Articolo non trovato';
      end if;

      update public.order_items
      set
        received_qty =
          coalesce(received_qty, 0)
          +
          v_qty
      where id = v_line.id;

      v_any_received := true;

    end loop;

  end if;

  if not v_any_received then
    raise exception
      'Nessuna quantità da ricevere';
  end if;

  select not exists (
    select 1
    from public.order_items
    where
      order_id = p_order_id
      and
      coalesce(received_qty, 0)
      <
      coalesce(qty, 0)
  )
  into v_all_complete;

  if v_all_complete then
    v_new_status := 'received';
  else
    v_new_status := 'partial';
  end if;

  update public.orders
  set status = v_new_status
  where id = p_order_id;

  return jsonb_build_object(
    'success', true,
    'status', v_new_status,
    'complete', v_all_complete
  );

end;
$$;

grant execute
on function public.receive_order_atomic(
  uuid,
  jsonb,
  boolean
)
to anon, authenticated;

-- FINE STEP 32
