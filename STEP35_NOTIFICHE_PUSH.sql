-- ============================================================
-- STEP 35 - NOTIFICHE PUSH (battelli a rischio consegna + scorte
-- sotto minimo)
--
-- Aggiunge:
--  1) push_subscriptions: un dispositivo (telefono o PC) che ha
--     attivato le notifiche, con le chiavi necessarie per
--     mandargli una notifica push del browser (si attiva dalla
--     pagina Impostazioni).
--  2) push_notification_log: tiene traccia di cosa e' gia' stato
--     notificato oggi, cosi' lo stesso avviso non arriva ogni
--     mezz'ora ma una volta al giorno.
--  3) pg_cron + pg_net: un job dentro il database che ogni 30
--     minuti chiama l'indirizzo dell'app che controlla battelli a
--     rischio e scorte basse e manda le notifiche push a chi le ha
--     attivate.
--
-- IMPORTANTE - da fare prima/dopo aver eseguito questo file:
--  a) su Vercel (impostazioni del progetto -> Environment
--     Variables) vanno aggiunte: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
--     NEXT_PUBLIC_VAPID_PUBLIC_KEY (stesso valore di VAPID_PUBLIC_KEY)
--     e NOTIFICHE_CRON_SECRET = 9a11f7b8418274cf2b3b8edf66702f7b789ef57d634486f5
--     (i valori esatti te li do io in chat, sono gia' generati).
--  b) qui sotto, nel blocco "select cron.schedule(...)", verifica
--     che l'indirizzo dopo "url :=" sia davvero quello che usi per
--     aprire il gestionale (segnato "<-- VERIFICA"); il secret e'
--     gia' lo stesso di NOTIFICHE_CRON_SECRET, non toccarlo.
-- Se l'esecuzione di "create extension pg_cron" o "pg_net" da
-- errore di permessi, vanno attivate da Supabase, sezione
-- Database -> Extensions, poi si puo' rilanciare il resto del file.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Dispositivi iscritti alle notifiche
-- ------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_all on public.push_subscriptions;
create policy push_subscriptions_all
on public.push_subscriptions
for all
to anon, authenticated
using (true)
with check (true);

-- ------------------------------------------------------------
-- 2) Log di cosa e' gia' stato notificato oggi (evita di
--    rimandare lo stesso avviso ogni 30 minuti)
-- ------------------------------------------------------------
create table if not exists public.push_notification_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null,              -- 'rischio_consegna' oppure 'scorta_bassa'
  ref_id text not null,            -- id del battello o dell'articolo
  notified_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (kind, ref_id, notified_on)
);

alter table public.push_notification_log enable row level security;

drop policy if exists push_notification_log_all on public.push_notification_log;
create policy push_notification_log_all
on public.push_notification_log
for all
to anon, authenticated
using (true)
with check (true);

-- ------------------------------------------------------------
-- 3) pg_cron + pg_net: il "motorino" che ogni 30 minuti chiama
--    l'app per far controllare battelli a rischio e scorte basse.
-- ------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Toglie un eventuale job con lo stesso nome creato in precedenza,
-- cosi' questo file si puo' rilanciare senza errori.
select cron.unschedule(jobid)
from cron.job
where jobname = 'notifiche-push-controllo';

select cron.schedule(
  'notifiche-push-controllo',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://magazzinoitb.vercel.app/api/notifiche/controlla',   -- <-- VERIFICA: deve essere l'indirizzo che usi davvero per aprire il gestionale
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '9a11f7b8418274cf2b3b8edf66702f7b789ef57d634486f5'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- FINE STEP 35
