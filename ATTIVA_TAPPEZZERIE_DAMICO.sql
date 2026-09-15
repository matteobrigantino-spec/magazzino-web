-- MODULO TAPPEZZERIE
-- Il fornitore corretto è D'AMICO ARREDAMENTI NAVALI.
-- Disattiva il modulo sugli altri fornitori e lo attiva solo qui.

update public.suppliers
set upholstery_enabled = false;

update public.suppliers
set upholstery_enabled = true
where upper(trim(replace(name, '’', ''''))) =
      'D''AMICO ARREDAMENTI NAVALI';

-- Controllo finale
select id, name, upholstery_enabled
from public.suppliers
order by name;
