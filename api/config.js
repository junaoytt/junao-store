// ============================================================================
// /api/config
//
// Entrega pro site o endereço do Supabase e a chave pública (anon).
// Assim você configura tudo no painel da Vercel, sem mexer em arquivo.
//
// A chave "anon" é pública de propósito — ela sozinha não abre nada, porque
// as regras de segurança (RLS) do banco exigem login. A chave que NÃO pode
// aparecer aqui é a service_role.
// ============================================================================

module.exports = (req, res) => {
  const url = process.env.SUPABASE_URL || "";
  const anonKey = process.env.SUPABASE_ANON_KEY || "";

  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");

  if (!url || !anonKey) {
    return res.status(500).json({
      erro: "faltando_config",
      mensagem:
        "Faltam as variáveis SUPABASE_URL e SUPABASE_ANON_KEY nas " +
        "configurações do projeto na Vercel.",
    });
  }

  return res.status(200).json({ url, anonKey });
};
