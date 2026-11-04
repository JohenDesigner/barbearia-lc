/* Barbearia L.C · Agenda online (cliente) */
(() => {
  const S = window.SITE, A = S.agenda;
  const sb = window.supabase.createClient(A.url, A.chave, { auth: { persistSession: false } });
  const $ = (s) => document.querySelector(s);
  const pad = (n) => String(n).padStart(2, "0");
  const TZ = "-03:00"; // Brasília (sem horário de verão)

  // WhatsApp flutuante e ano
  const num = String(S.whatsapp.numero).replace(/\D/g, "");
  const wa = (txt) => `https://wa.me/${num}?text=${encodeURIComponent(txt)}`;
  $(".whats").href = wa(S.whatsapp.mensagem);
  document.querySelectorAll("[data-ano]").forEach((el) => (el.textContent = new Date().getFullYear()));

  const estado = { servico: null, dia: null, hora: null, mes: null };
  let servicos = [];

  const hojeSP = () => {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    return p; // AAAA-MM-DD
  };
  const isoDia = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dataLocal = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
  const minutos = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
  const hhmm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
  const instante = (dia, min) => new Date(`${dia}T${hhmm(min)}:00${TZ}`);
  const duracaoTxt = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? pad(m % 60) : ""}` : `${m} min`);
  const diaLongo = (iso) => dataLocal(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  const mostrar = (sel, sim = true) => { const el = $(sel); el.hidden = !sim; return el; };
  const rolarPara = (el) => setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 60);

  /* 1 · Serviços */
  async function carregarServicos() {
    const caixa = $("#servicos");
    const { data, error } = await sb.from("servicos").select("id, slug, nome, duracao_min").eq("ativo", true).order("ordem");
    if (error || !data?.length) {
      caixa.innerHTML = `<p class="aviso">Não foi possível carregar a agenda agora. <a href="${wa(S.whatsapp.mensagem)}" target="_blank" rel="noopener">Agende pelo WhatsApp</a>.</p>`;
      return;
    }
    servicos = data;
    caixa.innerHTML = "";
    const pedido = new URLSearchParams(location.search).get("servico");
    for (const s of data) {
      const l = document.createElement("label");
      l.className = "opcao";
      l.innerHTML = `<input type="radio" name="servico" value="${s.id}"><strong></strong><small>${duracaoTxt(s.duracao_min)}</small>`;
      l.querySelector("strong").textContent = s.nome;
      l.querySelector("input").addEventListener("change", () => escolherServico(s));
      caixa.append(l);
      if (pedido && pedido === s.slug) { l.querySelector("input").checked = true; escolherServico(s, false); }
    }
  }

  function escolherServico(s, rolar = true) {
    estado.servico = s; estado.hora = null;
    mostrar("#etapa-dia");
    if (!estado.mes) { const h = dataLocal(hojeSP()); estado.mes = new Date(h.getFullYear(), h.getMonth(), 1); }
    desenharCalendario();
    if (estado.dia) carregarHoras(); else { mostrar("#etapa-hora", false); mostrar("#etapa-dados", false); }
    if (rolar) rolarPara($("#etapa-dia"));
  }

  /* 2 · Calendário */
  function desenharCalendario() {
    const grade = $("#cal-grade"), m = estado.mes;
    const hoje = dataLocal(hojeSP());
    const limite = new Date(hoje); limite.setDate(limite.getDate() + A.diasAFrente);
    { const t = m.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); $("#cal-mes").textContent = t.charAt(0).toUpperCase() + t.slice(1); }
    $("#cal-ant").disabled = m <= new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    $("#cal-prox").disabled = new Date(m.getFullYear(), m.getMonth() + 1, 1) > limite;
    grade.innerHTML = "";
    for (let i = 0; i < m.getDay(); i++) grade.append(document.createElement("span"));
    const dias = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= dias; d++) {
      const data = new Date(m.getFullYear(), m.getMonth(), d), iso = isoDia(data);
      const b = document.createElement("button");
      b.type = "button"; b.className = "dia"; b.textContent = d;
      b.setAttribute("aria-label", diaLongo(iso));
      b.disabled = data < hoje || data > limite || data.getDay() === 0;
      if (iso === hojeSP()) b.classList.add("hoje");
      b.setAttribute("aria-pressed", String(iso === estado.dia));
      b.addEventListener("click", () => { estado.dia = iso; estado.hora = null; desenharCalendario(); carregarHoras(true); });
      grade.append(b);
    }
  }
  $("#cal-ant").addEventListener("click", () => { estado.mes = new Date(estado.mes.getFullYear(), estado.mes.getMonth() - 1, 1); desenharCalendario(); });
  $("#cal-prox").addEventListener("click", () => { estado.mes = new Date(estado.mes.getFullYear(), estado.mes.getMonth() + 1, 1); desenharCalendario(); });

  /* 3 · Horários livres */
  async function carregarHoras(rolar = false) {
    const caixa = $("#horas"), s = estado.servico, dia = estado.dia;
    mostrar("#etapa-hora"); mostrar("#etapa-dados", false);
    caixa.classList.add("carregando");
    caixa.innerHTML = `<p class="aviso">Buscando horários livres…</p>`;
    if (rolar) rolarPara($("#etapa-hora"));
    const { data, error } = await sb.rpc("horarios_ocupados", { p_servico: s.id, p_dia: dia });
    if (estado.dia !== dia || estado.servico !== s) return; // usuária trocou no meio
    caixa.classList.remove("carregando");
    if (error) { caixa.innerHTML = `<p class="aviso">Não consegui consultar a agenda. Tente de novo em instantes.</p>`; return; }
    const ocupados = (data || []).map((o) => [new Date(o.inicio).getTime(), new Date(o.fim).getTime()]);
    const minimo = Date.now() + A.antecedenciaMin * 60000;
    const livres = [];
    const abreDia = (A.abrePorDia || {})[new Date(dia + "T12:00:00").getDay()] || A.abre;
    for (let t = minutos(abreDia); t + s.duracao_min <= minutos(A.fecha); t += A.passoMin) {
      const ini = instante(dia, t).getTime(), fim = ini + s.duracao_min * 60000;
      if (ini < minimo) continue;
      if (ocupados.some(([a, b]) => ini < b && fim > a)) continue;
      livres.push(t);
    }
    caixa.innerHTML = "";
    if (!livres.length) { caixa.innerHTML = `<p class="aviso">Sem horários livres nesse dia para ${s.nome}. Escolha outro dia.</p>`; return; }
    for (const t of livres) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "hora"; b.textContent = hhmm(t);
      b.setAttribute("aria-pressed", String(estado.hora === t));
      b.addEventListener("click", () => {
        estado.hora = t;
        caixa.querySelectorAll(".hora").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        abrirDados();
      });
      caixa.append(b);
    }
  }

  /* 4 · Dados e confirmação */
  function abrirDados() {
    const s = estado.servico, fim = estado.hora + s.duracao_min;
    $("#resumo").innerHTML = `<strong></strong><span></span>`;
    $("#resumo strong").textContent = s.nome;
    $("#resumo span").textContent = `${diaLongo(estado.dia)} · ${hhmm(estado.hora)} às ${hhmm(fim)}`;
    const el = mostrar("#etapa-dados");
    rolarPara(el);
  }

  const form = $("#form-agenda"), status = form.querySelector(".form-status"), botao = form.querySelector("button");
  const avisar = (t, tipo = "") => { status.textContent = t; status.className = `form-status campo--inteiro ${tipo}`; };

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const nome = form.nome.value.trim(), tel = form.telefone.value.replace(/\D/g, ""), obs = form.obs.value.trim();
    const telFinal = tel.length === 10 || tel.length === 11 ? `55${tel}` : tel;
    form.nome.closest(".campo").classList.toggle("erro", nome.length < 2);
    form.telefone.closest(".campo").classList.toggle("erro", !/^\d{12,13}$/.test(telFinal));
    if (nome.length < 2 || !/^\d{12,13}$/.test(telFinal)) return avisar("Confira nome e WhatsApp com DDD.", "falha");

    const s = estado.servico, inicio = instante(estado.dia, estado.hora);
    botao.disabled = true; avisar("Reservando seu horário…");
    const { error } = await sb.rpc("agendar", { p_servico: s.id, p_inicio: inicio.toISOString(), p_nome: nome, p_telefone: telFinal, p_obs: obs || null });
    botao.disabled = false;
    if (error) {
      avisar(error.message && error.code === "P0001" ? error.message : "Não foi possível reservar agora. Tente de novo ou chame no WhatsApp.", "falha");
      if (error.code === "P0001" && /ocupado/i.test(error.message)) carregarHoras();
      return;
    }

    const quando = `${diaLongo(estado.dia)}, às ${hhmm(estado.hora)}`;
    // Aviso por e-mail (não bloqueia a cliente se falhar)
    if (S.contato.web3formsChave) {
      fetch("https://api.web3forms.com/submit", {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ access_key: S.contato.web3formsChave, subject: `Novo agendamento: ${s.nome} · ${quando}`, from_name: "Agenda Barbearia L.C",
          servico: s.nome, quando, nome, whatsapp: telFinal, observacao: obs || "-" }),
      }).catch(() => {});
    }
    mostrar("#fluxo", false);
    $("#sucesso-texto").textContent = `${s.nome} · ${quando}. Te esperamos na Estrada do Alvarenga, 2047 · Jardim Pedreira.`;
    $("#sucesso-whats").href = wa(`Olá! Acabei de agendar pelo site 💈\n\nServiço: ${s.nome}\nDia: ${quando}\nNome: ${nome}${obs ? `\nObs.: ${obs}` : ""}`);
    rolarPara(mostrar("#sucesso"));
  });

  carregarServicos();
})();
