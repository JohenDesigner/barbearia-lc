/* Site Cinematográfico · © 2026 Labrego IA · LBG-SC-2026-v1 */
window.SITE = {
  nome: "Barbearia L.C",
  assinatura: "LBG-SC-20261104-086B96C0A0",

  whatsapp: {
    numero: "5511940453278",
    mensagem: "Gostaria de fazer agendamento",
  },

  contato: {
    email: "johenartegrafica@gmail.com",
    web3formsChave: "7fd1863f-4882-43a4-af5a-5fbcd02917f3",
    assunto: "Novo contato pelo site Barbearia L.C",
  },

  // Agenda online (Supabase). A chave anon é pública por natureza; a segurança fica nas regras (RLS) do banco.
  agenda: {
    url: "https://emfopioitbzvjxdfriyg.supabase.co",
    chave: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZm9waW9pdGJ6dmp4ZGZyaXlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4MDI5MTAsImV4cCI6MjEwOTM3ODkxMH0.QIk1qp7M2u5wQEP9L7PIzi08xgooqWAv8jyn0FnT3Hk",
    abre: "09:00",
    abrePorDia: { 5: "08:00", 6: "08:00" }, // sexta e sábado abrem às 8h (0 = domingo)
    fecha: "18:45",
    passoMin: 15,
    antecedenciaMin: 30,
    diasAFrente: 45,
  },

  frames: {
    total: 130,
    desktop: "assets/frames/desktop/f_{n}.webp?v=1",
    mobile: "assets/frames/mobile/f_{n}.webp?v=1",
  },
};
