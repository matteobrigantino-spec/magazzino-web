-- ============================================================
-- STEP 52 - ATTIVA "GESTIONE PARABREZZA" ANCHE SU MODELPLAST S.N.C.
--
-- Stesso meccanismo di STEP26/27 (colonna windshield_enabled su
-- suppliers), ma qui AGGIUNGE Modelplast come secondo fornitore
-- parabrezza invece di sostituire Paris Plast: dopo questo script
-- entrambi i fornitori hanno il riquadro "Gestione Parabrezza"
-- sulla loro scheda, ed entrambi i cataloghi compaiono nel
-- selettore articoli della pagina /produzione/parabrezza (quella
-- pagina era scritta apposta per il solo Paris Plast: il commit di
-- codice collegato a questo script la generalizza a piu' di un
-- fornitore).
--
-- Tutto il resto del sistema parabrezza (mappa modello->articolo,
-- giacenza automatica, assegnazione per priorita' di consegna,
-- aggancio agli ordini aperti) e' gia' basato sul singolo articolo,
-- non sul fornitore: non serve toccare nient'altro.
--
-- Crea il fornitore se non esiste ancora con questo nome,
-- altrimenti riusa quello gia' presente. Sicuro da rieseguire.
-- ============================================================

insert into public.suppliers (name)
select 'Modelplast s.n.c.'
where not exists (
  select 1 from public.suppliers
  where upper(trim(name)) = upper(trim('Modelplast s.n.c.'))
);

update public.suppliers
set windshield_enabled = true
where upper(trim(name)) = upper(trim('Modelplast s.n.c.'));

-- Controllo finale: tutti i fornitori con "Gestione Parabrezza" attiva
select id, name, windshield_enabled
from public.suppliers
where windshield_enabled = true
order by name;

-- FINE STEP 52
