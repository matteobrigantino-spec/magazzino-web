-- ============================================================
-- STEP 20 - TAPPEZZERIA BATTELLI
-- Corregge un dimenticanza dello STEP 18: la tabella
-- production_boat_upholstery e' rimasta senza una policy RLS,
-- quindi ogni inserimento/modifica falliva con:
--   "new row violates row-level security policy for table
--    production_boat_upholstery"
--
-- Stessa policy "aperta" gia' usata per le altre tabelle di
-- produzione (il gestionale usa il login custom lato frontend,
-- non l'autenticazione di Supabase).
-- ============================================================

alter table public.production_boat_upholstery enable row level security;

drop policy if exists production_boat_upholstery_all on public.production_boat_upholstery;
create policy production_boat_upholstery_all
on public.production_boat_upholstery
for all
to anon, authenticated
using (true)
with check (true);

-- FINE STEP 20
