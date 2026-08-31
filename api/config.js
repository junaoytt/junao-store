// ============================================================================
// /api/config
//
// Entrega ao navegador somente a configuração pública do Supabase.
// A service_role/secret key NUNCA é enviada por este endpoint.
// ============================================================================

function primeira(...valores) {
  for (const valor of valores) {
    if (typeof valor === "string" && valor.trim()) return valor.trim();
  }
  return "";
}

module.exports = (req, res) => {
  // Aceita os nomes usados pelo projeto e também nomes comuns de Vite/Next,
  // para evitar que uma variável já cadastrada na Vercel seja ignorada.
  const url = primeira(
    process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.VITE_SUPABASE_URL
  );

  const anonKey = primeira(
    process.env.SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY
  );

  // Não deixe um erro antigo de configuração preso no cache da Vercel/CDN.
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const faltando = [];
  if (!url) faltando.push("SUPABASE_URL");
  if (!anonKey) faltando.push("SUPABASE_ANON_KEY");

  if (faltando.length) {
    return res.status(500).json({
      erro: "faltando_config",
      faltando,
      mensagem:
        "A função /api/config foi encontrada, mas a Vercel não entregou " +
        "as variáveis de ambiente necessárias para este deployment.",
    });
  }

  return res.status(200).json({ url, anonKey });
};
