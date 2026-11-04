/* Barbearia L.C · Painel da agenda (administração) */
(() => {
  const A = window.SITE.agenda;
  const sb = window.supabase.createClient(A.url, A.chave, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "implicit" } });
  const $ = (s) => document.querySelector(s);
  const pad = (n) => String(n).padStart(2, "0");
  const TZ = "-03:00";
  const telas = ["#tela-login", "#tela-sem-acesso", "#tela-agenda"];
  const tela = (qual) => telas.forEach((t) => ($(t).hidden = t !== qual));

  const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const somaDias = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); const x = new Date(Date.UTC(y, m - 1, d + n)); return x.toISOString().slice(0, 10); };
  const horaSP = (date) => date.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  const lerRange = (r) => { const m = String(r).match(/["\[(]?"?([^",]+)"?\s*,\s*"?([^"\])]+)"?/); const iso = (s) => new Date(s.trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")); return [iso(m[1]), iso(m[2])]; };

  let dia = hojeSP(), barbeiros = [];

  /* Login por link no e-mail */
  $("#form-login").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const email = ev.target.email.value.trim().toLowerCase(), st = $("#login-status");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { st.textContent = "Digite um e-mail válido."; st.className = "form-status falha"; return; }
    st.textContent = "Enviando…"; st.className = "form-status";
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) { st.textContent = "Não foi possível enviar o link agora. Tente de novo em alguns minutos."; st.className = "form-status falha"; return; }
    st.textContent = "Link enviado. Abra seu e-mail neste aparelho e toque em “Log In”."; st.className = "form-status ok";
  });
  $("#sair").addEventListener("click", async () => { await sb.auth.signOut(); location.replace(location.pathname); });

  async function iniciar(sessao) {
    if (!sessao) { $("#sair").hidden = true; tela("#tela-login"); return; }
    $("#sair").hidden = false;
    const { data: ok } = await sb.rpc("is_admin");
    if (!ok) { $("#sem-acesso-texto").textContent = `${sessao.user.email} não está autorizado a ver a agenda.`; tela("#tela-sem-acesso"); return; }
    if (!barbeiros.length && !window.__carregandoBarb) { window.__carregandoBarb = true;
      const { data } = await sb.from("barbeiros").select("id, nome").order("ordem");
      barbeiros = data || [];
      for (const b of barbeiros) for (const sel of ["#b-barbeiro", "#filtro-barbeiro"]) { const o = document.createElement("option"); o.value = b.id; o.textContent = b.nome; $(sel).append(o); }
    }
    tela("#tela-agenda");
    carregarDia();
  }

  /* Agenda do dia */
  async function carregarDia() {
    $("#dia").value = dia;
    const [y, m, d] = dia.split("-").map(Number);
    $("#titulo-dia").textContent = new Date(y, m - 1, d).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
    const ini = new Date(`${dia}T00:00:00${TZ}`).toISOString(), fim = new Date(`${somaDias(dia, 1)}T00:00:00${TZ}`).toISOString();
    const faixa = `[${ini},${fim})`;
    const lista = $("#lista"), filtro = Number($("#filtro-barbeiro").value) || null;
    lista.innerHTML = `<li class="aviso">Carregando…</li>`;
    const [ag, bl] = await Promise.all([
      sb.from("agendamentos").select("id, periodo, nome, telefone, obs, status, barbeiro_id, servicos(nome), barbeiros(nome)").overlaps("periodo", faixa),
      sb.from("bloqueios").select("id, periodo, motivo, barbeiro_id, barbeiros(nome)").overlaps("periodo", faixa),
    ]);
    if (ag.error || bl.error) { lista.innerHTML = `<li class="aviso">Não consegui carregar a agenda. Atualize a página.</li>`; return; }
    const itens = [
      ...ag.data.map((a) => ({ tipo: "ag", ...a, quando: lerRange(a.periodo) })),
      ...bl.data.map((b) => ({ tipo: "bl", ...b, quando: lerRange(b.periodo) })),
    ].filter((it) => !filtro || it.barbeiro_id === null || it.barbeiro_id === filtro).sort((a, b) => a.quando[0] - b.quando[0]);
    lista.innerHTML = "";
    if (!itens.length) { lista.innerHTML = `<li class="aviso">Nenhum agendamento neste dia.</li>`; return; }
    for (const it of itens) {
      const li = document.createElement("li");
      li.className = "item" + (it.status === "cancelado" ? " cancelado" : "");
      const h = document.createElement("div"); h.className = "item-hora"; h.textContent = horaSP(it.quando[0]);
      const info = document.createElement("div"); info.className = "item-info";
      const t = document.createElement("strong"), sub = document.createElement("span");
      if (it.tipo === "ag") {
        t.textContent = `${it.nome} · ${it.servicos?.nome || ""} · ${it.barbeiros?.nome || ""}`;
        sub.append(`${horaSP(it.quando[0])} às ${horaSP(it.quando[1])} · `);
        const a = document.createElement("a"); a.href = `https://wa.me/${it.telefone}`; a.target = "_blank"; a.rel = "noopener";
        a.textContent = `+${it.telefone}`; sub.append(a);
        if (it.obs) sub.append(` · ${it.obs}`);
        if (it.status === "cancelado") sub.append(" · cancelado");
      } else {
        t.textContent = `Bloqueado · ${it.barbeiros?.nome || "barbearia toda"}`;
        sub.textContent = `${horaSP(it.quando[0])} às ${horaSP(it.quando[1])}${it.motivo ? ` · ${it.motivo}` : ""}`;
      }
      info.append(t, document.createElement("br"), sub);
      li.append(h, info);
      if (it.tipo === "bl" || it.status !== "cancelado") {
        const b = document.createElement("button");
        b.type = "button"; b.className = "botao botao--linha botao--pequeno";
        b.textContent = it.tipo === "ag" ? "Cancelar" : "Desbloquear";
        b.addEventListener("click", async () => {
          b.disabled = true;
          const r = it.tipo === "ag"
            ? await sb.from("agendamentos").update({ status: "cancelado" }).eq("id", it.id)
            : await sb.from("bloqueios").delete().eq("id", it.id);
          if (r.error) { b.disabled = false; b.textContent = "Erro, tente de novo"; return; }
          carregarDia();
        });
        li.append(b);
      }
      lista.append(li);
    }
  }

  $("#filtro-barbeiro").addEventListener("change", () => carregarDia());
  $("#dia").addEventListener("change", (e) => { if (e.target.value) { dia = e.target.value; carregarDia(); } });
  $("#dia-ant").addEventListener("click", () => { dia = somaDias(dia, -1); carregarDia(); });
  $("#dia-prox").addEventListener("click", () => { dia = somaDias(dia, 1); carregarDia(); });
  $("#dia-hoje").addEventListener("click", () => { dia = hojeSP(); carregarDia(); });

  /* Bloqueios */
  $("#form-bloqueio").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = ev.target, st = $("#bloqueio-status");
    if (!f.de.value || !f.ate.value || f.ate.value <= f.de.value) { st.textContent = "O horário final precisa ser depois do inicial."; st.className = "form-status falha"; return; }
    const ini = new Date(`${dia}T${f.de.value}:00${TZ}`).toISOString(), fim = new Date(`${dia}T${f.ate.value}:00${TZ}`).toISOString();
    const { error } = await sb.from("bloqueios").insert({ barbeiro_id: f.barbeiro.value ? Number(f.barbeiro.value) : null, periodo: `[${ini},${fim})`, motivo: f.motivo.value.trim() || null });
    if (error) { st.textContent = "Não foi possível bloquear. Tente de novo."; st.className = "form-status falha"; return; }
    st.textContent = "Horário bloqueado."; st.className = "form-status ok"; f.motivo.value = "";
    carregarDia();
  });

  sb.auth.onAuthStateChange((_ev, sessao) => { if (_ev === "SIGNED_IN" || _ev === "SIGNED_OUT") iniciar(sessao); });
  sb.auth.getSession().then(({ data }) => iniciar(data.session));
})();
