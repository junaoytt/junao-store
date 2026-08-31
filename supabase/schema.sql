-- ============================================================================
-- JUNÃO STORE — GESTÃO
-- Banco completo para Supabase (PostgreSQL)
--
-- COMO USAR:
--   1. Abra o painel do Supabase
--   2. Menu lateral -> SQL Editor -> New query
--   3. Cole ESTE ARQUIVO INTEIRO e clique em "Run"
--
-- Pode rodar mais de uma vez sem problema: tudo é "if not exists" ou
-- "create or replace". Nada é apagado.
-- ============================================================================


-- ============================================================================
-- 1. PERFIS  (colaboradores — quem entra no painel de gestão)
--    Cada perfil está amarrado a um usuário do Supabase Auth.
--    A senha NÃO fica aqui: o Supabase guarda ela criptografada em auth.users.
-- ============================================================================
create table if not exists public.perfis (
  id             uuid primary key references auth.users(id) on delete cascade,
  nome           text        not null default '',
  email          text        not null default '',
  papel          text        not null default 'colaborador',  -- 'dono' | 'colaborador'
  perm           jsonb       not null default '{}'::jsonb,
  ativo          boolean     not null default true,
  criado_em      timestamptz not null default now(),
  ultimo_acesso  timestamptz,
  constraint perfis_papel_valido check (papel in ('dono','colaborador'))
);

create index if not exists perfis_email_idx on public.perfis (lower(email));
create index if not exists perfis_papel_idx on public.perfis (papel);


-- ============================================================================
-- 2. FUNÇÕES DE APOIO
--    Usadas pelas regras de segurança (RLS) mais abaixo.
--    "security definer" = a função roda com poder de admin, então ela mesma
--    consegue ler a tabela perfis sem cair na própria regra de segurança.
-- ============================================================================

-- Está logado E o acesso está ativo?
create or replace function public.eh_equipe()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and ativo = true
  );
$$;

-- É o dono do painel?
create or replace function public.eh_dono()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and ativo = true and papel = 'dono'
  );
$$;

-- Tem a permissão X? (dono sempre tem tudo)
create or replace function public.tem_perm(chave text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid()
      and ativo = true
      and (papel = 'dono' or coalesce((perm ->> chave)::boolean, false) = true)
  );
$$;

-- Já existe um dono? (o portão usa isso pra decidir entre
-- "criar o primeiro acesso" e "entrar com e-mail")
create or replace function public.existe_dono()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.perfis where papel = 'dono');
$$;

grant execute on function public.existe_dono() to anon, authenticated;


-- ============================================================================
-- 3. TABELAS DO NEGÓCIO
--
--    Padrão de todas elas:
--      - colunas soltas  -> pra você filtrar, ordenar e olhar no painel
--      - coluna "dados"  -> o objeto completo, do jeito que o sistema usa
--
--    A coluna "dados" é a fonte da verdade. As outras são cópias, preenchidas
--    pelo próprio sistema a cada gravação. Se editar algo na mão pelo painel
--    do Supabase, edite dentro de "dados".
-- ============================================================================

-- ---------- CLIENTES (a chave é o Discord, igual no sistema) ----------
create table if not exists public.clientes (
  discord        text primary key,
  nome           text,
  codigo         text,           -- código de acesso da área do cliente
  status         text,
  dados          jsonb       not null default '{}'::jsonb,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

-- ---------- PEDIDOS ----------
create table if not exists public.pedidos (
  id             text primary key,
  numero         integer,
  titulo         text,
  cliente        text,
  discord        text,
  etapa          integer,
  estado         text,
  prazo          text,
  valor_num      numeric,
  custo          numeric,
  dados          jsonb       not null default '{}'::jsonb,
  criado_em      timestamptz,
  atualizado_em  timestamptz not null default now()
);

create index if not exists pedidos_discord_idx  on public.pedidos (discord);
create index if not exists pedidos_numero_idx   on public.pedidos (numero);
create index if not exists pedidos_estado_idx   on public.pedidos (estado, etapa);

-- ---------- ANEXOS (uma linha por pedido, com a lista inteira) ----------
create table if not exists public.anexos (
  pedido_id      text primary key,
  itens          jsonb       not null default '[]'::jsonb,
  atualizado_em  timestamptz not null default now()
);

-- ---------- FUNIL DE CONTATOS ----------
create table if not exists public.leads (
  id             text primary key,
  nome           text,
  discord        text,
  status         text,
  dados          jsonb       not null default '{}'::jsonb,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create index if not exists leads_status_idx on public.leads (status);

-- ---------- CUSTOS / SAÍDAS ----------
create table if not exists public.custos (
  id             text primary key,
  descricao      text,
  valor          numeric,
  data           text,
  categoria      text,
  pedido         text,
  fixo           boolean,
  dados          jsonb       not null default '{}'::jsonb,
  criado_em      timestamptz not null default now()
);

create index if not exists custos_data_idx on public.custos (data);

-- ---------- ORÇAMENTOS ----------
create table if not exists public.orcamentos (
  id             text primary key,
  numero         integer,
  cliente        text,
  discord        text,
  titulo         text,
  status         text,
  dados          jsonb       not null default '{}'::jsonb,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create index if not exists orcamentos_status_idx on public.orcamentos (status);

-- ---------- TABELA DE SERVIÇOS / PREÇOS ----------
create table if not exists public.servicos (
  id             text primary key,
  nome           text,
  preco          numeric,
  horas          numeric,
  dados          jsonb       not null default '{}'::jsonb,
  atualizado_em  timestamptz not null default now()
);

-- ---------- AJUSTES DO SISTEMA (pró-labore etc.) ----------
create table if not exists public.config (
  chave          text primary key,
  valor          jsonb       not null default '{}'::jsonb,
  atualizado_em  timestamptz not null default now()
);


-- ============================================================================
-- 4. SEGURANÇA (RLS — Row Level Security)
--
--    Sem isso, qualquer pessoa com o endereço do site conseguiria ler os
--    seus clientes, valores e lucro. Com isso, a chave pública do site
--    sozinha não abre nada: só quem está logado enxerga os dados, e cada
--    colaborador enxerga apenas o que a permissão dele libera.
-- ============================================================================

alter table public.perfis     enable row level security;
alter table public.clientes   enable row level security;
alter table public.pedidos    enable row level security;
alter table public.anexos     enable row level security;
alter table public.leads      enable row level security;
alter table public.custos     enable row level security;
alter table public.orcamentos enable row level security;
alter table public.servicos   enable row level security;
alter table public.config     enable row level security;

-- Limpa políticas antigas (pra poder rodar este arquivo de novo)
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('perfis','clientes','pedidos','anexos','leads',
                        'custos','orcamentos','servicos','config')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- ---------- PERFIS ----------
-- Toda a equipe vê a lista (pra saber quem tem acesso).
create policy perfis_ler on public.perfis
  for select to authenticated using (public.eh_equipe());

-- Cada um atualiza o próprio registro (usado pra marcar o último acesso).
create policy perfis_atualizar_proprio on public.perfis
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- O dono mexe em todo mundo.
create policy perfis_dono_tudo on public.perfis
  for all to authenticated using (public.eh_dono()) with check (public.eh_dono());

-- ---------- PEDIDOS, CLIENTES E ANEXOS: toda a equipe ----------
create policy pedidos_equipe on public.pedidos
  for all to authenticated using (public.eh_equipe()) with check (public.eh_equipe());

create policy clientes_equipe on public.clientes
  for all to authenticated using (public.eh_equipe()) with check (public.eh_equipe());

create policy anexos_equipe on public.anexos
  for all to authenticated using (public.eh_equipe()) with check (public.eh_equipe());

-- ---------- O RESTO: conforme a permissão de cada um ----------
create policy leads_perm on public.leads
  for all to authenticated using (public.tem_perm('funil')) with check (public.tem_perm('funil'));

create policy custos_perm on public.custos
  for all to authenticated using (public.tem_perm('financeiro')) with check (public.tem_perm('financeiro'));

create policy orcamentos_perm on public.orcamentos
  for all to authenticated using (public.tem_perm('orcamentos')) with check (public.tem_perm('orcamentos'));

create policy servicos_perm on public.servicos
  for all to authenticated using (public.tem_perm('orcamentos')) with check (public.tem_perm('orcamentos'));

-- Ajustes: a equipe lê (precisa do pró-labore pros cálculos), só quem tem
-- a permissão "ajustes" grava.
create policy config_ler on public.config
  for select to authenticated using (public.eh_equipe());

create policy config_gravar on public.config
  for all to authenticated using (public.tem_perm('ajustes')) with check (public.tem_perm('ajustes'));


-- ============================================================================
-- 5. PRIMEIRO ACESSO — criar a conta do dono
--    Só funciona enquanto NÃO existir nenhum dono. Depois disso, novos
--    acessos só saem pela tela "Quem tem acesso" (que passa pela API).
-- ============================================================================
create or replace function public.criar_dono(p_nome text)
returns public.perfis
language plpgsql security definer set search_path = public
as $$
declare
  novo public.perfis;
  meu_email text;
begin
  if auth.uid() is null then
    raise exception 'Precisa estar logado.';
  end if;

  if exists (select 1 from public.perfis where papel = 'dono') then
    raise exception 'Este painel já tem um dono.';
  end if;

  select email into meu_email from auth.users where id = auth.uid();

  insert into public.perfis (id, nome, email, papel, perm, ativo, ultimo_acesso)
  values (auth.uid(), coalesce(p_nome,''), coalesce(meu_email,''), 'dono', '{}'::jsonb, true, now())
  returning * into novo;

  return novo;
end;
$$;

grant execute on function public.criar_dono(text) to authenticated;


-- ============================================================================
-- 6. ÁREA DO CLIENTE
--
--    O cliente entra só com Discord + código, sem conta no sistema.
--    Ele NÃO fala com as tabelas: fala com estas duas funções, que rodam no
--    servidor, conferem o código e devolvem apenas o que ele pode ver.
--
--    O que o servidor corta antes de mandar:
--      - valor, custo, lucro, horas, pagamentos
--      - atualizações marcadas como internas
--    Ou seja: mesmo mexendo no navegador, o cliente não alcança os números.
-- ============================================================================

-- Confere Discord + código. Devolve o nome, ou nada se não bater.
create or replace function public.cliente_entrar(p_discord text, p_codigo text)
returns table (discord text, nome text)
language sql stable security definer set search_path = public
as $$
  select c.discord, c.nome
  from public.clientes c
  where lower(trim(c.discord)) = lower(trim(p_discord))
    and upper(trim(c.codigo))  = upper(trim(replace(p_codigo, ' ', '')))
    and coalesce(c.status,'ativo') <> 'inativo'
  limit 1;
$$;

grant execute on function public.cliente_entrar(text, text) to anon, authenticated;

-- Devolve os pedidos do cliente, já limpos.
create or replace function public.cliente_pedidos(p_discord text, p_codigo text)
returns table (id text, dados jsonb, anexos jsonb)
language plpgsql stable security definer set search_path = public
as $$
declare
  d text;
begin
  select c.discord into d
  from public.clientes c
  where lower(trim(c.discord)) = lower(trim(p_discord))
    and upper(trim(c.codigo))  = upper(trim(replace(p_codigo, ' ', '')))
    and coalesce(c.status,'ativo') <> 'inativo'
  limit 1;

  if d is null then
    return;  -- código errado: devolve vazio
  end if;

  return query
  select
    p.id,
    -- tira os campos de dinheiro e deixa só as atualizações públicas
    (p.dados
      - 'valor' - 'valorNum' - 'custo' - 'horas' - 'horasPrev' - 'pagamentos')
      || jsonb_build_object(
           'updates',
           coalesce((
             select jsonb_agg(u)
             from jsonb_array_elements(coalesce(p.dados->'updates','[]'::jsonb)) u
             where coalesce((u->>'publico')::boolean, false) = true
           ), '[]'::jsonb)
         ) as dados,
    coalesce(a.itens, '[]'::jsonb) as anexos
  from public.pedidos p
  left join public.anexos a on a.pedido_id = p.id
  where p.discord = d;
end;
$$;

grant execute on function public.cliente_pedidos(text, text) to anon, authenticated;


-- ============================================================================
-- 7. ARQUIVOS (prints, renders)
--    As imagens vão pro Storage do Supabase, não pro banco. O banco guarda
--    só o endereço. Sem isso, cada print viraria centenas de KB dentro de
--    uma linha e o banco encheria rápido.
--
--    O balde é público na leitura: quem tiver o link abre a imagem.
--    É o que permite o cliente ver os prints sem ter conta. Os endereços
--    são aleatórios, então não dá pra adivinhar.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('anexos', 'anexos', true)
on conflict (id) do update set public = true;

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'anexos_%'
  loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
  end loop;
end $$;

create policy anexos_ler_todos on storage.objects
  for select using (bucket_id = 'anexos');

create policy anexos_equipe_envia on storage.objects
  for insert to authenticated with check (bucket_id = 'anexos' and public.eh_equipe());

create policy anexos_equipe_troca on storage.objects
  for update to authenticated using (bucket_id = 'anexos' and public.eh_equipe());

create policy anexos_equipe_apaga on storage.objects
  for delete to authenticated using (bucket_id = 'anexos' and public.eh_equipe());


-- ============================================================================
-- PRONTO.
-- Se apareceu "Success. No rows returned", deu tudo certo.
-- ============================================================================
