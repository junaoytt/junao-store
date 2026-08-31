// ============================================================================
// /api/bootstrap-owner
//
// Garante que exista uma conta principal de DONO no Supabase Auth e na tabela
// public.perfis. A senha nunca vai para o navegador e nunca fica escrita no
// index.html: ela vem exclusivamente da variável OWNER_PASSWORD da Vercel.
//
// A rota é idempotente. Pode ser chamada em toda abertura do site; depois de
// configurada ela só faz uma checagem rápida e sai.
// ============================================================================

const crypto = require("crypto");

function primeira(...valores) {
  for (const valor of valores) {
    if (typeof valor === "string" && valor.trim()) return valor.trim();
  }
  return "";
}

const URL_SB = primeira(
  process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.VITE_SUPABASE_URL
);
const SERVICE = primeira(process.env.SUPABASE_SERVICE_ROLE_KEY);

// O e-mail principal pode ser trocado por variável, mas já vem com o padrão
// solicitado. A senha NÃO tem fallback de propósito: hardcode de senha no
// GitHub/HTML seria uma falha de segurança.
const OWNER_EMAIL = primeira(process.env.OWNER_EMAIL, "junaoyt@gmail.com").toLowerCase();
const OWNER_NAME = primeira(process.env.OWNER_NAME, "JunãoYT");
const OWNER_PASSWORD = typeof process.env.OWNER_PASSWORD === "string"
  ? process.env.OWNER_PASSWORD
  : "";

const PERMISSOES_TOTAIS = {
  orcamentos: true,
  funil: true,
  clientes: true,
  valores: true,
  financeiro: true,
  relatorios: true,
  ajustes: true,
};

async function admin(caminho, opcoes = {}) {
  const r = await fetch(URL_SB + caminho, {
    ...opcoes,
    headers: {
      apikey: SERVICE,
      Authorization: "Bearer " + SERVICE,
      "Content-Type": "application/json",
      ...(opcoes.headers || {}),
    },
  });
  const texto = await r.text();
  let corpo = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch (e) {
    corpo = texto;
  }
  return { ok: r.ok, status: r.status, corpo };
}

function listaUsuarios(corpo) {
  if (Array.isArray(corpo)) return corpo;
  if (corpo && Array.isArray(corpo.users)) return corpo.users;
  return [];
}

async function acharUsuarioPorEmail() {
  // Para um painel pequeno, 1000 cobre com muita folga e evita depender de
  // parâmetros de filtro que variam entre versões do GoTrue.
  const r = await admin("/auth/v1/admin/users?per_page=1000&page=1");
  if (!r.ok) return { erro: "Não foi possível consultar os usuários do Supabase Auth." };
  const usuario = listaUsuarios(r.corpo).find(
    (u) => String(u && u.email || "").trim().toLowerCase() === OWNER_EMAIL
  );
  return { usuario: usuario || null };
}

function idDoUsuario(corpo) {
  if (!corpo) return "";
  if (corpo.id) return corpo.id;
  if (corpo.user && corpo.user.id) return corpo.user.id;
  return "";
}

async function perfilDonoAtual() {
  const q =
    "/rest/v1/perfis?email=eq." + encodeURIComponent(OWNER_EMAIL) +
    "&papel=eq.dono&ativo=eq.true&select=id,email,papel,ativo&limit=1";
  const r = await admin(q);
  const linha = r.ok && Array.isArray(r.corpo) ? r.corpo[0] : null;
  return linha || null;
}

async function marcadorBootstrap() {
  const r = await admin(
    "/rest/v1/config?chave=eq.owner_bootstrap&select=chave,valor&limit=1"
  );
  const linha = r.ok && Array.isArray(r.corpo) ? r.corpo[0] : null;
  return linha || null;
}

function fingerprint() {
  // Não gravamos senha nem hash simples da senha no banco. O HMAC só serve para
  // saber se a configuração de ambiente mudou e precisa ser reaplicada.
  return crypto
    .createHmac("sha256", SERVICE)
    .update(OWNER_EMAIL + "\0" + OWNER_PASSWORD)
    .digest("hex");
}

async function salvarMarcador(fp, id) {
  return admin("/rest/v1/config", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      chave: "owner_bootstrap",
      valor: {
        email: OWNER_EMAIL,
        user_id: id,
        fingerprint: fp,
        atualizado_em: new Date().toISOString(),
      },
      atualizado_em: new Date().toISOString(),
    }),
  });
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, erro: "Use POST." });
  }

  if (!URL_SB || !SERVICE) {
    return res.status(500).json({
      ok: false,
      erro: "Faltam SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY na Vercel.",
    });
  }

  if (!OWNER_PASSWORD || OWNER_PASSWORD.length < 6) {
    // Mantém o cadastro manual funcionando como plano B, mas avisa o frontend
    // que a conta principal automática ainda não foi configurada.
    return res.status(200).json({
      ok: false,
      pronto: false,
      motivo: "owner_password_ausente",
      email: OWNER_EMAIL,
    });
  }

  try {
    const fp = fingerprint();
    const [perfilAtual, marcador] = await Promise.all([
      perfilDonoAtual(),
      marcadorBootstrap(),
    ]);

    if (
      perfilAtual &&
      marcador &&
      marcador.valor &&
      marcador.valor.fingerprint === fp &&
      marcador.valor.user_id === perfilAtual.id
    ) {
      return res.status(200).json({
        ok: true,
        pronto: true,
        criado: false,
        email: OWNER_EMAIL,
      });
    }

    let achado = await acharUsuarioPorEmail();
    if (achado.erro) return res.status(500).json({ ok: false, erro: achado.erro });
    let usuario = achado.usuario;
    let criado = false;

    if (!usuario) {
      const rCriar = await admin("/auth/v1/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: OWNER_EMAIL,
          password: OWNER_PASSWORD,
          email_confirm: true,
          user_metadata: {
            nome: OWNER_NAME,
            conta_principal: true,
          },
        }),
      });

      if (!rCriar.ok) {
        const msg = String(
          (rCriar.corpo && (rCriar.corpo.msg || rCriar.corpo.message || rCriar.corpo.error)) || ""
        );
        // Corrida rara: outro request criou a conta entre o GET e o POST.
        if (/already|registered|exists/i.test(msg)) {
          achado = await acharUsuarioPorEmail();
          usuario = achado.usuario;
        } else {
          return res.status(500).json({
            ok: false,
            erro: msg || "Não foi possível criar a conta principal no Supabase Auth.",
          });
        }
      } else {
        const id = idDoUsuario(rCriar.corpo);
        usuario = id ? { ...(rCriar.corpo.user || rCriar.corpo), id } : null;
        criado = true;
      }
    }

    if (!usuario || !usuario.id) {
      return res.status(500).json({
        ok: false,
        erro: "A conta principal não pôde ser localizada no Supabase Auth.",
      });
    }

    // Se a conta já existia (inclusive uma tentativa antiga sem confirmação),
    // garante a senha configurada no servidor e confirma o e-mail sem mandar link.
    if (!criado) {
      const metaAnterior = usuario.user_metadata && typeof usuario.user_metadata === "object"
        ? usuario.user_metadata
        : {};
      const rAtualizar = await admin("/auth/v1/admin/users/" + usuario.id, {
        method: "PUT",
        body: JSON.stringify({
          password: OWNER_PASSWORD,
          email_confirm: true,
          user_metadata: {
            ...metaAnterior,
            nome: OWNER_NAME,
            conta_principal: true,
          },
        }),
      });
      if (!rAtualizar.ok) {
        const msg = String(
          (rAtualizar.corpo && (rAtualizar.corpo.msg || rAtualizar.corpo.message || rAtualizar.corpo.error)) || ""
        );
        return res.status(500).json({
          ok: false,
          erro: msg || "A conta existe, mas não foi possível aplicar a senha principal.",
        });
      }
    }

    const rPerfil = await admin("/rest/v1/perfis", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        id: usuario.id,
        nome: OWNER_NAME,
        email: OWNER_EMAIL,
        papel: "dono",
        perm: PERMISSOES_TOTAIS,
        ativo: true,
        ultimo_acesso: null,
      }),
    });

    if (!rPerfil.ok) {
      const msg = String(
        (rPerfil.corpo && (rPerfil.corpo.message || rPerfil.corpo.hint || rPerfil.corpo.details)) || ""
      );
      return res.status(500).json({
        ok: false,
        erro: msg || "A conta existe no Auth, mas não foi possível criar o perfil de dono.",
      });
    }

    const rMarcador = await salvarMarcador(fp, usuario.id);
    if (!rMarcador.ok) {
      // Não bloqueia o login: a conta e o perfil já estão prontos. Só vai repetir
      // a checagem completa numa próxima abertura.
      console.warn("Não foi possível salvar owner_bootstrap:", rMarcador.corpo);
    }

    return res.status(200).json({
      ok: true,
      pronto: true,
      criado,
      email: OWNER_EMAIL,
    });
  } catch (e) {
    console.error("bootstrap-owner:", e);
    return res.status(500).json({
      ok: false,
      erro: "Falha inesperada ao preparar a conta principal.",
    });
  }
};
