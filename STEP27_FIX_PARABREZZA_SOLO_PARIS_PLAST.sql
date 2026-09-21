-- ============================================================
-- STEP 27 - FIX: PARABREZZA SOLO SU PARIS PLAST
--
-- Lo STEP 26 aveva attivato il riquadro "Gestione Parabrezza"
-- anche su D'Amico. Il fornitore dei parabrezza è solo Paris
-- Plast: lo disattiva ovunque tranne li'.
-- ============================================================

update public.suppliers
set windshield_enabled = false;

update public.suppliers
set windshield_enabled = true
where upper(trim(replace(name, '’', ''''))) like '%PARIS PLAST%';

-- Controllo finale
select id, name, windshield_enabled
from public.suppliers
order by name;

-- FINE STEP 27
