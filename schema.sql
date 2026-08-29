create extension if not exists pgcrypto;

create table if not exists public.app_data (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_data enable row level security;
-- O painel acessa esta tabela somente pela API da Vercel usando SERVICE_ROLE.
-- Não crie policies públicas de SELECT/INSERT/UPDATE/DELETE.

create table if not exists public.collaborators (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_salt text not null,
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.collaborators enable row level security;
-- As senhas nunca são salvas em texto puro: a API guarda somente hash scrypt + salt.
-- Esta tabela também é acessada somente pela API server-side com SERVICE_ROLE.
