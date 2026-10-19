-- ============================================================
-- STEP 55 - BIMINI: ELIMINAZIONE SICURA KIT IN GIACENZA
--
-- Stesso principio di delete_upholstery_kit / delete_teak_kit:
-- - elimina SOLO un kit ancora in giacenza (status = 'stock')
-- - diminuisce di 1 la giacenza dell'articolo collegato
-- - un kit gia' assegnato a un battello (status = 'out') non si
--   puo' eliminare direttamente: va prima annullata
--   l'assegnazione dalla scheda battello (torna in giacenza),
--   poi si puo' eliminare da qui.
-- ============================================================

create or replace function public.delete_bimini_kit(
  p_kit_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit public.bimini_kits%rowtype;
  v_current_stock numeric;
begin
  select *
  into v_kit
  from public.bimini_kits
  where id = p_kit_id
  for update;

  if not found then
    raise exception 'Kit non trovato.';
  end if;

  if v_kit.status <> 'stock' then
    raise exception
      'Un kit assegnato a un battello non può essere eliminato. Prima annulla l''assegnazione.';
  end if;

  select coalesce(i.stock, 0)
  into v_current_stock
  from public.items i
  where i.id::text = v_kit.item_id
  for update;

  if v_current_stock is null then
    raise exception 'Articolo collegato non trovato.';
  end if;

  if v_current_stock <= 0 then
    raise exception
      'La giacenza dell''articolo è già a zero. Eliminazione bloccata per sicurezza.';
  end if;

  update public.items
  set stock = stock - 1
  where id::text = v_kit.item_id;

  delete from public.bimini_kits
  where id = p_kit_id;
end;
$$;

grant execute on function public.delete_bimini_kit(uuid) to anon, authenticated;

-- FINE STEP 55
