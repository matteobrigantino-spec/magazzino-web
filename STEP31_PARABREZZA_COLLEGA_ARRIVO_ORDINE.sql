-- ============================================================
-- STEP 31 - PARABREZZA: L'ARRIVO ORDINE AGGANCIA DA SOLO LA GIACENZA
--
-- Finora un parabrezza arrivava in due modi SCOLLEGATI:
--   1) "Arrivo ordine" nella pagina Ordini -> aggiorna items.stock
--   2) "Registra un arrivo" (o "Converti da giacenza generale")
--      nella pagina Parabrezza -> crea un pezzo tracciato e
--      aggiorna items.stock di nuovo
-- Se ricevi l'ordine da Paris Plast e poi lo registri ANCHE nella
-- pagina Parabrezza, la giacenza viene contata due volte.
--
-- Da qui in poi: quando ricevi un ordine (parziale o completo) che
-- contiene articoli mappati come parabrezza, il sistema crea da
-- solo i pezzi tracciati per la quantita' ricevuta e prova subito
-- ad assegnarli ai battelli in attesa - esattamente come "Registra
-- un arrivo", ma senza doverlo rifare a mano. Non serve piu' fare
-- nulla nella pagina Parabrezza per un arrivo normale da ordine.
--
-- "Registra un arrivo" e "Converti da giacenza generale" restano
-- disponibili solo per i casi fuori dal normale flusso ordini
-- (es. un pezzo arrivato senza passare da un ordine registrato qui).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Mattoncino: crea N pezzi tracciati per un articolo appena
--    ricevuto (solo se l'articolo e' mappato come parabrezza) e
--    prova ad assegnarli subito. Non tocca items.stock: la
--    quantita' ricevuta e' gia' aggiornata da receive_order_atomic.
-- ------------------------------------------------------------
create or replace function public.create_windshield_kits_on_receipt(
  p_item_id text,
  p_quantity integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_windshield_item boolean;
  v_kit_id uuid;
  v_i integer;
  v_created integer := 0;
begin
  if p_quantity is null or p_quantity <= 0 then
    return 0;
  end if;

  select exists (
    select 1
    from public.production_windshield_matrix
    where item_id = p_item_id
  )
  into v_is_windshield_item;

  if not v_is_windshield_item then
    return 0;
  end if;

  for v_i in 1..p_quantity loop
    insert into public.windshield_kits (item_id, status, note, received_at)
    values (p_item_id, 'stock', 'Arrivato da ordine ricevuto', now())
    returning id into v_kit_id;

    v_created := v_created + 1;

    perform public.assign_windshield_stock_kit_by_priority(v_kit_id);
  end loop;

  return v_created;
end;
$$;

grant execute
on function public.create_windshield_kits_on_receipt(text, integer)
to anon, authenticated;

-- ------------------------------------------------------------
-- 2) receive_order_atomic ricreata identica, con l'unica aggiunta
--    della chiamata sopra dopo ogni riga ricevuta (sia nell'arrivo
--    completo che in quello parziale). Chiamata in un blocco che
--    non fa mai fallire la ricezione dell'ordine se il sistema
--    parabrezza avesse un problema.
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

        begin
          perform public.create_windshield_kits_on_receipt(
            v_line.item_id::text,
            v_remaining::integer
          );
        exception when others then
          null;
        end;

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

      begin
        perform public.create_windshield_kits_on_receipt(
          v_line.item_id::text,
          v_qty::integer
        );
      exception when others then
        null;
      end;

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

-- FINE STEP 31
