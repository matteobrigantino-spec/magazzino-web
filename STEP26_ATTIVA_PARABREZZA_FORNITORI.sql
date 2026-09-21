-- ============================================================
-- STEP 26 - ATTIVA IL RIQUADRO "GESTIONE PARABREZZA"
-- SULLE SCHEDE FORNITORE PARIS PLAST E D'AMICO
--
-- Stesso meccanismo gia' usato per le tappezzerie
-- (ATTIVA_TAPPEZZERIE_DAMICO.sql): una colonna su suppliers che
-- fa comparire un riquadro con un pulsante verso la gestione,
-- questa volta verso /produzione/parabrezza.
--
-- Il riquadro compare solo sui fornitori con windshield_enabled
-- = true. Qui la attiviamo su Paris Plast e su D'Amico; se in
-- futuro serve su un altro fornitore, basta un altro UPDATE
-- uguale a questi due.
-- ============================================================

alter table public.suppliers
  add column if not exists windshield_enabled boolean not null default false;

update public.suppliers
set windshield_enabled = true
where upper(trim(replace(name, '’', ''''))) like '%PARIS PLAST%';

update public.suppliers
set windshield_enabled = true
where upper(trim(replace(name, '’', ''''))) =
      'D''AMICO ARREDAMENTI NAVALI';

-- Controllo finale
select id, name, windshield_enabled
from public.suppliers
order by name;

-- FINE STEP 26
