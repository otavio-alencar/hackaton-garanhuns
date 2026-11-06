// Configuração do site (nenhum segredo aqui — pode ir para o git).
window.CONFIG = {
  // URL do webhook do n8n. Teste local: http://localhost:5678/webhook/transparencia
  // (use /webhook-test/transparencia enquanto o workflow estiver em modo "Test")
  CHAT_URL: "http://localhost:5678/webhook/transparencia",
  // Perfis de DEMONSTRAÇÃO — os mesmos UUIDs de supabase/seed.sql
  PERFIS: [
    { id: "00000000-0000-0000-0000-000000000001", nome: "Cidadão (PE · só contratos)" },
    { id: "00000000-0000-0000-0000-000000000002", nome: "Analista (PE+BR · tudo)" },
    { id: "00000000-0000-0000-0000-000000000003", nome: "Admin (PE+BR · tudo)" },
  ],
};
