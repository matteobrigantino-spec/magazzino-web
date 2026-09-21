-- ============================================================
-- STEP 28 - PARABREZZA: AGGANCIA ANCHE I BATTELLI GIA' ESISTENTI
--
-- BUG TROVATO: create_windshield_boat_requirement() (STEP 25)
-- viene chiamata solo dentro create_production_boat(), cioe' solo
-- quando un battello viene CREATO. Se mappi un modello DOPO che
-- dei battelli di quel modello esistono gia' (praticamente sempre,
-- visto che la mappa si compila col tempo), quei battelli restano
-- per sempre senza parabrezza tracciato: nessuno li ricontrolla.
--
-- Esempio concreto: 30 battelli gia' in produzione, mappi "Predator
-- 700" -> articolo. Il Predator 700 gia' in produzione NON riceve
-- automaticamente la richiesta: "Parabrezza per battello" resta 0.
--
-- FIX: una funzione che, per un modello, aggancia tutti i battelli
-- ATTIVI di quel modello che non hanno ancora una richiesta
-- parabrezza (usa la stessa create_windshield_boat_requirement,
-- quindi stessa assegnazione automatica per priorita' di consegna).
-- La pagina Parabrezza la richiama subito dopo aver salvato una
-- mappatura, nuova o modificata.
-- ============================================================

create or replace function public.backfill_windshield_requirements_for_model(
  p_model_boat text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_boat record;
  v_count integer := 0;
begin
  for v_boat in
    select pb.id
    from public.production_boats pb
    where pb.model_boat = p_model_boat
      and pb.status = 'active'
      and not exists (
        select 1
        from public.production_boat_windshield pbw
        where pbw.boat_id = pb.id
      )
  loop
    perform public.create_windshield_boat_requirement(v_boat.id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute
on function public.backfill_windshield_requirements_for_model(text)
to anon, authenticated;

-- Riconciliazione una tantum: applica subito il fix a tutte le
-- mappature gia' salvate, cosi' i battelli gia' esistenti dei
-- modelli gia' mappati si agganciano senza aspettare che tu
-- ritocchi la mappa dalla pagina.
do $$
declare
  v_row record;
begin
  for v_row in
    select model_boat from public.production_windshield_matrix
  loop
    perform public.backfill_windshield_requirements_for_model(v_row.model_boat);
  end loop;
end $$;

-- FINE STEP 28
