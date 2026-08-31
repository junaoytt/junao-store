// ============================================================================
// /api/colaborador
//
// Criar, trocar a senha e remover acessos de colaboradores.
//
// Por que isso precisa rodar no servidor: criar uma conta pra OUTRA pessoa
// exige a chave service_role do Supabase, que tem poder total. Essa chave
// nunca pode ir pro navegador. Então ela fica aqui, e este arquivo confere
// antes de tudo se quem pediu é mesmo o dono do painel.
//
// Ações:
//   { acao: "criar",   nome, email, senha, perm }
//   { acao: "senha",   id, senha }
//   { acao: "remover", id }
// ============================================================================

const URL_SB = process.env.SUPABASE_URL || "";
const ANON = process.env.SUPABASE_ANON_KEY || "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// ---------------------------------------------------------------- utilidades
async function comoAdmin(caminho, opcoes = {}) {
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

// Confere o token de quem chamou e devolve o perfil dele.
async function quemChamou(req) {
  const cabecalho = req.headers.authorization || "";
  const token = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : "";
  if (!token) return null;

  const r = await fetch(URL_SB + "/auth/v1/user", {
    headers: { apikey: ANON, Authorization: "Bearer " + token },
  });
  if (!r.ok) return null;
  const usuario = await r.json();
  if (!usuario || !usuario.id) return null;

  const perfil = await comoAdmin(
    "/rest/v1/perfis?id=eq." + usuario.id + "&select=id,papel,ativo"
  );
  const linha = Array.isArray(perfil.corpo) ? perfil.corpo[0] : null;
  if (!linha || linha.ativo !== true) return null;

  return { id: usuario.id, email: usuario.email, papel: linha.papel };
}

const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || "").trim());

// ------------------------------------------------------------------ endpoint
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "Use POST." });
  }
  if (!URL_SB || !ANON || !SERVICE) {
    return res.status(500).json({
      erro:
        "Faltam variáveis de ambiente na Vercel " +
        "(SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY).",
    });
  }

  const dono = await quemChamou(req);
  if (!dono) return res.status(401).json({ erro: "Faça login de novo." });
  if (dono.papel !== "dono") {
    return res.status(403).json({ erro: "Só o dono do painel pode mexer nos acessos." });
  }

  let corpo = req.body;
  if (typeof corpo === "string") {
    try {
      corpo = JSON.parse(corpo);
    } catch (e) {
      corpo = {};
    }
  }
  corpo = corpo || {};
  const acao = corpo.acao;

  // ---------------------------------------------------------------- CRIAR
  if (acao === "criar") {
    const nome = String(corpo.nome || "").trim();
    const email = String(corpo.email || "").trim().toLowerCase();
    const senha = String(corpo.senha || "");
    const perm = corpo.perm && typeof corpo.perm === "object" ? corpo.perm : {};

    if (!nome) return res.status(400).json({ erro: "Escreva o nome." });
    if (!emailValido(email)) return res.status(400).json({ erro: "Esse e-mail não parece válido." });
    if (senha.length < 6) return res.status(400).json({ erro: "A senha precisa de pelo menos 6 caracteres." });

    const criado = await comoAdmin("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({ email, password: senha, email_confirm: true }),
    });

    if (!criado.ok) {
      const msg = (criado.corpo && (criado.corpo.msg || criado.corpo.message)) || "";
      if (/already|registered|exists/i.test(msg)) {
        return res.status(400).json({ erro: "Já existe uma conta com esse e-mail." });
      }
      return res.status(400).json({ erro: msg || "Não deu pra criar a conta." });
    }

    const idNovo = criado.corpo.id;
    const perfil = await comoAdmin("/rest/v1/perfis", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        id: idNovo,
        nome,
        email,
        papel: "colaborador",
        perm,
        ativo: true,
      }),
    });

    if (!perfil.ok) {
      // desfaz a conta pra não deixar lixo no Auth
      await comoAdmin("/auth/v1/admin/users/" + idNovo, { method: "DELETE" });
      return res.status(500).json({ erro: "Conta criada mas o perfil falhou. Tente de novo." });
    }

    const linha = Array.isArray(perfil.corpo) ? perfil.corpo[0] : perfil.corpo;
    return res.status(200).json({ ok: true, perfil: linha });
  }

  // ---------------------------------------------------------------- SENHA
  if (acao === "senha") {
    const id = String(corpo.id || "");
    const senha = String(corpo.senha || "");
    if (!id) return res.status(400).json({ erro: "Faltou dizer qual acesso." });
    if (senha.length < 6) return res.status(400).json({ erro: "A senha precisa de pelo menos 6 caracteres." });

    const r = await comoAdmin("/auth/v1/admin/users/" + id, {
      method: "PUT",
      body: JSON.stringify({ password: senha }),
    });
    if (!r.ok) return res.status(400).json({ erro: "Não deu pra trocar a senha." });
    return res.status(200).json({ ok: true });
  }

  // -------------------------------------------------------------- REMOVER
  if (acao === "remover") {
    const id = String(corpo.id || "");
    if (!id) return res.status(400).json({ erro: "Faltou dizer qual acesso." });
    if (id === dono.id) {
      return res.status(400).json({ erro: "Você não pode remover o seu próprio acesso." });
    }

    const alvo = await comoAdmin("/rest/v1/perfis?id=eq." + id + "&select=papel");
    const linha = Array.isArray(alvo.corpo) ? alvo.corpo[0] : null;
    if (linha && linha.papel === "dono") {
      return res.status(400).json({ erro: "A conta do dono não pode ser removida." });
    }

    // apagar do Auth derruba o perfil junto (on delete cascade)
    const r = await comoAdmin("/auth/v1/admin/users/" + id, { method: "DELETE" });
    if (!r.ok) return res.status(400).json({ erro: "Não deu pra remover o acesso." });
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ erro: "Ação desconhecida." });
};
