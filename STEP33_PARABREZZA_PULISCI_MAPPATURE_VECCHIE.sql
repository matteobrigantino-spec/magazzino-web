-- ============================================================
-- STEP 33 - PARABREZZA: PULISCE LE RICHIESTE RIMASTE DA MAPPATURE
-- VECCHIE O SBAGLIATE
--
-- BUG: quando cambi l'articolo abbinato a un modello (o lo rimuovi)
-- nella pagina Parabrezza, i battelli che avevano gia' una richiesta
-- creata con l'articolo VECCHIO la mantenevano per sempre: cambiare
-- o togliere una mappatura aggiornava solo la mappa, non i battelli
-- gia' agganciati con l'articolo sbagliato. Risultato: un battello
-- poteva ritrovarsi con l'articolo corretto E quello vecchio/sbagliato
-- insieme (come il caso "Selva 570" con il pannello del 600 rimasto
-- lì dopo aver corretto la mappatura).
--
-- FIX:
--  1) Una funzione che pulisce le richieste di un modello per un
--    articolo che non è (più) nella mappa: libera il pezzo assegnato
--    (torna in giacenza e viene subito riassegnato a chi lo aspetta
--    davvero) o la riga d'ordine agganciata, poi toglie la richiesta.
--    La pagina la richiama da sola quando cambi o togli una
--    mappatura.
--  2) Una pulizia una tantum di TUTTE le richieste già in questa
--    situazione, per sistemare subito quelle rimaste indietro finora
--    (non solo il caso Selva 570 già visto).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Rimuove le richieste di un modello per un articolo preciso
--    (quello appena tolto o sostituito in mappa), liberando prima
--    il pezzo assegnato o la riga d'ordine agganciata.
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
-- 2) Pulizia una tantum: qualsiasi richiesta gia' esistente per un
--    battello attivo il cui (modello, articolo) non e' PIU' nella
--    mappa viene tolta adesso, liberando prima pezzo/riga d'ordine.
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

-- FINE STEP 33
