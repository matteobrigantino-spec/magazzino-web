-- ============================================================
-- STEP 40 - STORICO PREZZI ARTICOLI
--
-- Registra automaticamente ogni variazione di items.price in una
-- tabella storico, cosi' dalla scheda articolo si puo' aprire un
-- menu a scomparsa "Storico prezzi" con tutte le modifiche fatte nel
-- tempo (data, prezzo precedente, prezzo nuovo).
--
-- Il trigger scatta su QUALSIASI update di items.price, da qualunque
-- punto dell'app (scheda articolo, import prezzi da gestionale,
-- creazione articolo, ecc.): non serve modificare il codice che
-- aggiorna il prezzo, lo storico si popola da solo.
--
-- Nota: lo storico parte da quando questo STEP viene eseguito. Le
-- variazioni di prezzo avvenute PRIMA non sono mai state registrate
-- da nessuna parte, quindi non possono essere recuperate.
-- ============================================================

create table if not exists public.item_price_history (
  id uuid primary key default gen_random_uuid(),
  item_id text not null,
  old_price numeric,
  new_price numeric not null,
  changed_at timestamptz not null default now()
);

create index if not exists item_price_history_item_idx
  on public.item_price_history (item_id);

create index if not exists item_price_history_item_changed_idx
  on public.item_price_history (item_id, changed_at desc);

alter table public.item_price_history enable row level security;

drop policy if exists item_price_history_all on public.item_price_history;
create policy item_price_history_all
on public.item_price_history
for all
to anon, authenticated
using (true)
with check (true);

-- ------------------------------------------------------------
-- Trigger: ad ogni update di items dove il prezzo cambia davvero
-- (new.price is distinct from old.price), si registra la riga.
-- ------------------------------------------------------------
create or replace function public.log_item_price_change()
returns trigger
language plpgsql
as $$
begin
  if new.price is distinct from old.price then
    insert into public.item_price_history (item_id, old_price, new_price)
    values (old.id::text, old.price, new.price);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_item_price_change on public.items;
create trigger trg_log_item_price_change
after update on public.items
for each row
execute function public.log_item_price_change();

-- FINE STEP 40
