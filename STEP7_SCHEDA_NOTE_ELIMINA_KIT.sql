-- ============================================================
-- STEP 7 - TAPPEZZERIE
-- SCHEDA KIT + NOTE + ELIMINAZIONE SICURA
--
-- Include anche la struttura Matricola Battello / Vendita,
-- così questo file può essere eseguito anche se lo STEP 6
-- non è stato ancora eseguito.
--
-- La funzione delete_upholstery_kit:
-- - elimina SOLO un kit ancora in giacenza
-- - diminuisce di 1 la giacenza dell'articolo collegato
-- - non permette di cancellare direttamente un kit venduto
-- ============================================================


-- ------------------------------------------------------------
-- MATRICOLA BATTELLO
-- ------------------------------------------------------------

alter table public.upholstery_kits
add column if not exists boat_registration text null;


-- ------------------------------------------------------------
-- VENDITA KIT
-- ------------------------------------------------------------

create or replace function public.sell_upholstery_kit(
  p_kit_id uuid,
  p_boat_registration text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit public.upholstery_kits%rowtype;
  v_current_stock numeric;
begin
  if coalesce(trim(p_boat_registration), '') = '' then
    raise exception
      'Matricola Battello obbligatoria.';
  end if;

  select *
  into v_kit
  from public.upholstery_kits
  where id = p_kit_id
  for update;

  if not found then
    raise exception
      'Kit non trovato.';
  end if;

  if v_kit.status <> 'stock' then
    raise exception
      'Il kit non è attualmente in giacenza.';
  end if;

  select coalesce(i.stock, 0)
  into v_current_stock
  from public.items i
  where i.id::text = v_kit.item_id
  for update;

  if v_current_stock is null then
    raise exception
      'Articolo collegato non trovato.';
  end if;

  if v_current_stock <= 0 then
    raise exception
      'Giacenza articolo insufficiente per registrare la vendita.';
  end if;

  update public.items
  set stock = stock - 1
  where id::text = v_kit.item_id;

  update public.upholstery_kits
  set
    boat_registration = trim(p_boat_registration),
    status = 'out',
    out_at = now()
  where id = p_kit_id;
end;
$$;


create or replace function public.restore_upholstery_kit(
  p_kit_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit public.upholstery_kits%rowtype;
begin
  select *
  into v_kit
  from public.upholstery_kits
  where id = p_kit_id
  for update;

  if not found then
    raise exception
      'Kit non trovato.';
  end if;

  if v_kit.status <> 'out'
     or coalesce(trim(v_kit.boat_registration), '') = '' then
    raise exception
      'Questo kit non risulta venduto tramite Matricola Battello.';
  end if;

  update public.items
  set stock = coalesce(stock, 0) + 1
  where id::text = v_kit.item_id;

  if not found then
    raise exception
      'Articolo collegato non trovato.';
  end if;

  update public.upholstery_kits
  set
    boat_registration = null,
    status = 'stock',
    out_at = null
  where id = p_kit_id;
end;
$$;


-- ------------------------------------------------------------
-- ELIMINA KIT IN GIACENZA
-- ------------------------------------------------------------

create or replace function public.delete_upholstery_kit(
  p_kit_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit public.upholstery_kits%rowtype;
  v_current_stock numeric;
begin
  select *
  into v_kit
  from public.upholstery_kits
  where id = p_kit_id
  for update;

  if not found then
    raise exception
      'Kit non trovato.';
  end if;

  if v_kit.status <> 'stock' then
    raise exception
      'Un kit venduto non può essere eliminato. Prima annulla la vendita.';
  end if;

  select coalesce(i.stock, 0)
  into v_current_stock
  from public.items i
  where i.id::text = v_kit.item_id
  for update;

  if v_current_stock is null then
    raise exception
      'Articolo collegato non trovato.';
  end if;

  if v_current_stock <= 0 then
    raise exception
      'La giacenza dell''articolo è già a zero. Eliminazione bloccata per sicurezza.';
  end if;

  update public.items
  set stock = stock - 1
  where id::text = v_kit.item_id;

  delete from public.upholstery_kits
  where id = p_kit_id;
end;
$$;


grant execute
on function public.sell_upholstery_kit(
  uuid,
  text
)
to anon, authenticated;


grant execute
on function public.restore_upholstery_kit(
  uuid
)
to anon, authenticated;


grant execute
on function public.delete_upholstery_kit(
  uuid
)
to anon, authenticated;


-- FINE STEP 7
