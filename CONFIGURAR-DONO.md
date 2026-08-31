# Conta principal do dono

Esta versão prepara automaticamente a conta principal no Supabase sem expor a senha no HTML.

## Vercel > Settings > Environment Variables

Cadastre para **Production**:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OWNER_EMAIL` = `junaoyt@gmail.com`
- `OWNER_NAME` = `JunãoYT`
- `OWNER_PASSWORD` = a senha principal escolhida para o dono

Depois faça **Deployments > Redeploy**.

Na primeira abertura, `/api/bootstrap-owner`:

1. procura/cria a conta no Supabase Auth;
2. confirma o e-mail sem depender de link;
3. aplica a senha configurada no servidor;
4. cria/atualiza `public.perfis` com `papel = 'dono'`, `ativo = true` e acesso total;
5. nunca devolve a senha ao navegador.

A tela de primeiro acesso também possui **Já tenho cadastro — Entrar**.
