# Junão Store — pronto para Vercel

## 1. Criar o banco no Supabase
Crie um projeto Supabase e abra SQL Editor. Execute todo o arquivo `schema.sql`.

## 2. Configurar a Vercel
Suba esta pasta para um repositório GitHub e importe o repositório na Vercel.
Em Settings > Environment Variables adicione:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY

Use a URL do projeto e a chave `service_role` do Supabase. Nunca coloque a service_role no HTML.

## 3. Deploy
A Vercel detecta automaticamente:
- `public/index.html`: painel
- `api/data.js`: API serverless

## Como os dados são guardados
O painel original usa chaves como `estaleiro:pedidos`, `estaleiro:clientes`, `estaleiro:funil` e anexos. Esta versão mantém exatamente esse formato, mas salva cada chave no PostgreSQL (`app_data`). Assim, o restante do JavaScript do painel continua funcionando sem precisar reescrever todas as telas.

## Importante sobre anexos
Esta primeira versão mantém anexos como os dados que o painel já envia para `DB.set`. Se houver muitas imagens grandes em base64, o banco pode crescer rapidamente. Para produção com muitos arquivos, a próxima evolução recomendada é mover os arquivos para Supabase Storage e guardar apenas URLs no banco.
