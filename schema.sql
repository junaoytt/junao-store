create table if not exists public.app_data (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_data enable row level security;
-- O painel acessa esta tabela somente pela API da Vercel usando SERVICE_ROLE.
-- Não crie policies públicas de SELECT/INSERT/UPDATE/DELETE.
