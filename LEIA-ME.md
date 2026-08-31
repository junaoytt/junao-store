# Junão Store — Gestão

Painel de gestão pronto pra subir na **Vercel** com banco no **Supabase**.

Antes tudo ficava salvo dentro do navegador: funcionava num computador só, sumia
se limpasse o cache e não dava pra ter colaborador. Agora os dados ficam num banco
de verdade — você entra de qualquer aparelho, o cliente acompanha o pedido dele, e
cada colaborador só enxerga o que você liberou.

---

## Passo 1 — Criar o projeto no Supabase

1. Entre em <https://supabase.com> e crie uma conta (o plano grátis dá conta).
2. **New project**. Dê um nome, escolha uma senha pro banco e a região
   **South America (São Paulo)** — é a mais perto, o painel fica mais rápido.
3. Espere uns 2 minutos até o projeto ficar pronto.

## Passo 2 — Criar as tabelas

1. No menu da esquerda, clique em **SQL Editor** → **New query**.
2. Abra o arquivo `supabase/schema.sql`, copie **tudo** e cole lá.
3. Clique em **Run**.

Deve aparecer *"Success. No rows returned"*. Pronto — tabelas, regras de segurança,
funções da área do cliente e a pasta de imagens foram criadas de uma vez.

> Pode rodar esse arquivo de novo quando quiser. Ele não apaga nada.

## Passo 3 — Ajustar o login

Ainda no Supabase, vá em **Authentication → Sign In / Providers → Email**:

- **Confirm email**: deixe **desligado**. Assim você cria sua conta e já entra.
  (Se preferir manter ligado, funciona igual — só que você precisa clicar no link
  do e-mail antes de conseguir entrar na primeira vez.)

## Passo 4 — Pegar as três chaves

Vá em **Project Settings → API Keys** e anote:

| O que copiar | Onde aparece |
|---|---|
| **Project URL** | `https://xxxxx.supabase.co` |
| **anon public** | chave longa começando com `eyJ...` |
| **service_role** | outra chave `eyJ...` — está escondida atrás de "Reveal" |

> A `service_role` é a chave de administrador: ela ignora todas as regras de
> segurança. Ela nunca vai pro navegador — fica só nas configurações da Vercel.
> Nunca cole essa chave em conversa, print ou arquivo do site.

## Passo 5 — Subir na Vercel

**Pelo site (mais fácil):**

1. Suba esta pasta pro GitHub (repositório **privado**).
2. Entre em <https://vercel.com> → **Add New → Project** → escolha o repositório.
3. Não mexa em Framework Preset (deixe "Other") nem em build command.
4. Antes de clicar em Deploy, abra **Environment Variables** e cadastre:

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | o Project URL do passo 4 |
   | `SUPABASE_ANON_KEY` | a chave **anon public** |
   | `SUPABASE_SERVICE_ROLE_KEY` | a chave **service_role** |

5. **Deploy**.

**Pelo terminal:** instale o `vercel` (`npm i -g vercel`), rode `vercel` dentro
desta pasta e depois cadastre as três variáveis com `vercel env add`.

> Se subir sem as variáveis, o site abre com um aviso avisando exatamente isso.
> Cadastre as chaves e vá em **Deployments → ... → Redeploy**.

## Passo 6 — Criar a sua conta

1. Abra o endereço que a Vercel te deu.
2. Clique em **Colaborador → Criar o primeiro acesso**.
3. Preencha nome, e-mail e senha. Essa conta vira o **dono** do painel.

Depois disso, volte no Supabase em **Authentication → Sign In / Providers → Email**
e **desligue "Allow new users to sign up"**. Assim ninguém cria conta sozinho —
daí pra frente só você cria acesso, dentro do painel em *Quem tem acesso*.

---

## Como fica organizado

**Colaboradores** entram com e-mail e senha e veem o que você liberar nas
permissões. As senhas ficam criptografadas no Supabase — nem você consegue ler.

**Clientes** entram só com o Discord e o código de acesso, sem criar conta.
O código sai na ficha do cliente dentro do painel.

O que o cliente vê passa por uma função no servidor que corta valores, custos,
horas, pagamentos e as atualizações marcadas como internas. Ou seja: mesmo que
alguém saiba mexer no navegador, esses números não chegam até lá.

## As tabelas

| Tabela | O que guarda |
|---|---|
| `perfis` | colaboradores e as permissões de cada um |
| `clientes` | cadastro e código de acesso |
| `pedidos` | pedidos, etapas, linha do tempo e pagamentos |
| `anexos` | lista de arquivos de cada pedido |
| `leads` | funil de contatos |
| `custos` | saídas e gastos |
| `orcamentos` | propostas |
| `servicos` | sua tabela de preços |
| `config` | pró-labore e outros ajustes |

Cada tabela tem colunas soltas (número, cliente, etapa...) pra você filtrar
direto no **Table Editor** do Supabase, e uma coluna `dados` com o registro
completo. **A coluna `dados` é a que vale.** Se for editar algo na mão, edite
dentro dela.

As imagens dos anexos vão pro **Storage** do Supabase, no balde `anexos` — não
pro banco. Se fossem pro banco, cada print viraria centenas de KB dentro de uma
linha e você estouraria o espaço rápido.

## O que mudou no seu arquivo original

- `localStorage` saiu, entrou o Supabase — o resto do sistema continua igual,
  chamando as mesmas funções.
- O login virou Supabase Auth de verdade (a versão anterior guardava senha no
  navegador, o que não protegia nada).
- Recuperar senha agora é por link no e-mail, não mais por código anotado.
- Criar acesso pra outra pessoa passa pelo `/api/colaborador`, porque isso exige
  a chave de administrador, que não pode ficar no navegador.
- Imagens vão pro Storage em vez de virarem texto dentro do banco.

## Coisas que vale saber

**Backup.** O botão de exportar continua funcionando e baixa um `.json` com tudo.
Na restauração, os *acessos de login* não voltam — agora são contas de verdade no
Supabase. Recrie em *Quem tem acesso*. O Supabase também guarda backup automático
do banco.

**Duas pessoas ao mesmo tempo.** O sistema grava o registro inteiro de uma vez.
Se duas pessoas editarem **o mesmo pedido** no mesmo minuto, vale a última que
salvou. Pra equipe pequena isso não incomoda; é bom saber que existe.

**E-mail de recuperação.** O Supabase manda esses e-mails de graça, mas com
limite de poucos por hora. Se a equipe crescer, dá pra ligar um SMTP próprio em
*Authentication → Emails*.

**Imagens.** O balde `anexos` é público na leitura — é assim que o cliente
consegue ver os prints sem ter conta. Os endereços são aleatórios e não aparecem
em lugar nenhum, mas quem tiver o link abre a imagem. Não use pra arquivo
sigiloso; pra esses, use a aba de link do anexo.

**Custo.** Enquanto for uma loja pequena, o plano grátis dos dois (Vercel e
Supabase) aguenta bem. Fique de olho num detalhe: o Supabase grátis pausa
projetos parados por uma semana — se ficar sem acessar, é só reativar pelo painel.

## Rodar na sua máquina

```bash
npm i -g vercel
cp .env.example .env.local     # preencha as três chaves
vercel dev
```

Abrir o `index.html` com dois cliques **não funciona** — ele precisa do
`/api/config` pra saber o endereço do banco.
