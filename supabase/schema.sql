-- Tabela de leads (funciona como seu CRM básico)
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  email text unique,
  phone text,
  name text,
  product text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  fbclid text,
  gclid text,
  fbp text,
  fbc text,
  ga_client_id text,
  source_url text,
  last_event_name text
);

create index if not exists idx_leads_email on leads(email);
create index if not exists idx_leads_utm_campaign on leads(utm_campaign);

-- Tabela de auditoria dos eventos disparados (Meta CAPI + GA4).
-- event_id é UNIQUE de propósito: é a trava de deduplicação — o
-- dispatchEvent() confere aqui antes de reenviar (protege contra retries
-- da Hotmart e de qualquer outro webhook/cliente).
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id text not null unique,
  event_name text not null,
  lead_id uuid references leads(id),
  meta_status text,
  meta_response jsonb,
  ga4_status text,
  ga4_response jsonb,
  raw_payload jsonb
);

create index if not exists idx_events_lead_id on events(lead_id);
create index if not exists idx_events_event_name on events(event_name);

-- Contexto capturado no momento do clique em "Comprar", antes do redirect
-- pro checkout da Hotmart (ver api/checkout-redirect.ts). O "code" é o
-- valor anexado como ?sck= no link — é o que permite casar fbp/fbc/UTMs
-- com a compra quando o webhook chega, já que a Hotmart não manda esses
-- dados do pixel/GA.
create table if not exists checkout_tracking (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  code text not null unique,
  fbp text,
  fbc text,
  ga_client_id text,
  client_ip text,
  user_agent text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text
);

create index if not exists idx_checkout_tracking_code on checkout_tracking(code);

-- Visão comercial simples pro CRM/dashboard: uma linha por transação,
-- sempre com o status mais recente (upsert por transaction_id a cada
-- evento que a Hotmart manda pra essa compra).
create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  transaction_id text not null unique,
  buyer_email text,
  buyer_name text,
  product_name text,
  value numeric,
  currency text,
  payment_method text,
  status text, -- Purchase, Refund, Chargeback, PurchaseCanceled, PurchaseExpired...
  is_subscription boolean default false
);

create index if not exists idx_purchases_buyer_email on purchases(buyer_email);
create index if not exists idx_purchases_status on purchases(status);

drop trigger if exists trg_purchases_updated_at on purchases;
create trigger trg_purchases_updated_at
  before update on purchases
  for each row execute function set_updated_at();

-- Trigger simples para manter updated_at em dia
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_leads_updated_at on leads;
create trigger trg_leads_updated_at
  before update on leads
  for each row execute function set_updated_at();
