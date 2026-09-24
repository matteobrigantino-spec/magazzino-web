-- ============================================================
-- STEP 36 - TEMPI DI CONSEGNA FORNITORE
--
-- Per calcolare quanto impiega davvero un fornitore a consegnare
-- (data ordine -> data arrivo) serve sapere QUANDO un ordine è
-- arrivato per intero, cosa che oggi non viene registrata da
-- nessuna parte: orders.status passa a 'received' ma non resta
-- traccia del momento in cui è successo.
--
-- Aggiunge una sola colonna (orders.received_at) e fa in modo che
-- receive_order_atomic la valorizzi da sola quando un ordine
-- risulta completamente ricevuto - stesso identico comportamento
-- di prima per il resto, solo con questa data in più registrata.
--
-- Gli ordini già ricevuti PRIMA di eseguire questo script restano
-- senza received_at (non possiamo sapere retroattivamente quando
-- sono arrivati): le statistiche sui tempi di consegna partiranno
-- da zero e si riempiranno con i prossimi arrivi registrati in poi.
-- ============================================================

alter table public.orders
  add column if not exists received_at timestamptz;

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

  /*
    NOVITÀ RISPETTO A PRIMA: quando l'ordine risulta completamente
    ricevuto, registriamo anche QUANDO è successo (received_at).
    Un arrivo parziale non tocca received_at: solo il completamento
    finale conta come "data di consegna" per le statistiche.
  */
  update public.orders
  set
    status = v_new_status,
    received_at = case
      when v_new_status = 'received' then now()
      else received_at
    end
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

-- Controllo finale
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'orders'
  and column_name = 'received_at';

-- FINE STEP 36
