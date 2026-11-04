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

  const estado = { servico: null, barbeiro: null, dia: null, hora: null, mes: null };
  let servicos = [], barbeiros = [];
  const SEM_PREF = { id: null, nome: "Sem preferência" };

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
    const rb = await sb.from("barbeiros").select("id, nome").eq("ativo", true).order("ordem");
    barbeiros = rb.data || [];
    desenharBarbeiros();
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

  /* 2 · Barbeiro */
  function desenharBarbeiros() {
    const caixa = $("#barbeiros"); caixa.innerHTML = "";
    const pedido = (new URLSearchParams(location.search).get("barbeiro") || "").toLowerCase();
    for (const b of [...barbeiros, SEM_PREF]) {
      const l = document.createElement("label");
      l.className = "opcao" + (b.id === null ? " opcao--qualquer" : "");
      l.innerHTML = `<input type="radio" name="barbeiro" value="${b.id ?? ""}"><strong></strong><small>${b.id === null ? "o primeiro livre" : "barbeiro"}</small>`;
      l.querySelector("strong").textContent = b.nome;
      l.querySelector("input").addEventListener("change", () => escolherBarbeiro(b));
      caixa.append(l);
      if (pedido && b.nome.toLowerCase() === pedido) { l.querySelector("input").checked = true; estado.barbeiro = b; }
    }
  }

  function escolherBarbeiro(b, rolar = true) {
    estado.barbeiro = b; estado.hora = null;
    mostrar("#etapa-dia");
    if (!estado.mes) { const h = dataLocal(hojeSP()); estado.mes = new Date(h.getFullYear(), h.getMonth(), 1); }
    desenharCalendario();
    if (estado.dia) carregarHoras(); else { mostrar("#etapa-hora", false); mostrar("#etapa-dados", false); }
    if (rolar) rolarPara($("#etapa-dia"));
  }

  function escolherServico(s, rolar = true) {
    estado.servico = s; estado.hora = null;
    mostrar("#etapa-barbeiro");
    if (estado.barbeiro) { escolherBarbeiro(estado.barbeiro, rolar); return; }
    if (rolar) rolarPara($("#etapa-barbeiro"));
  }

  /* 3 · Calendário */
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

  /* 4 · Horários livres */
  async function carregarHoras(rolar = false) {
    const caixa = $("#horas"), s = estado.servico, dia = estado.dia;
    mostrar("#etapa-hora"); mostrar("#etapa-dados", false);
    caixa.classList.add("carregando");
    caixa.innerHTML = `<p class="aviso">Buscando horários livres…</p>`;
    if (rolar) rolarPara($("#etapa-hora"));
    const bar = estado.barbeiro;
    const { data, error } = await sb.rpc("ocupados_dia", { p_dia: dia });
    if (estado.dia !== dia || estado.servico !== s || estado.barbeiro !== bar) return; // trocou no meio
    caixa.classList.remove("carregando");
    if (error) { caixa.innerHTML = `<p class="aviso">Não consegui consultar a agenda. Tente de novo em instantes.</p>`; return; }
    const ocupados = (data || []).map((o) => [o.barbeiro_id, new Date(o.inicio).getTime(), new Date(o.fim).getTime()]);
    const candidatos = bar.id === null ? barbeiros.map((b) => b.id) : [bar.id];
    const livreCom = (id, ini, fim) => !ocupados.some(([b, a, z]) => (b === null || b === id) && ini < z && fim > a);
    const minimo = Date.now() + A.antecedenciaMin * 60000;
    const livres = [];
    const abreDia = (A.abrePorDia || {})[new Date(dia + "T12:00:00").getDay()] || A.abre;
    for (let t = minutos(abreDia); t + s.duracao_min <= minutos(A.fecha); t += A.passoMin) {
      const ini = instante(dia, t).getTime(), fim = ini + s.duracao_min * 60000;
      if (ini < minimo) continue;
      if (!candidatos.some((id) => livreCom(id, ini, fim))) continue;
      livres.push(t);
    }
    caixa.innerHTML = "";
    if (!livres.length) { caixa.innerHTML = `<p class="aviso">Sem horários livres nesse dia${bar.id === null ? "" : " com o " + bar.nome}. Escolha outro dia${bar.id === null ? "" : " ou outro barbeiro"}.</p>`; return; }
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

  /* 5 · Dados e confirmação */
  function abrirDados() {
    const s = estado.servico, fim = estado.hora + s.duracao_min;
    $("#resumo").innerHTML = `<strong></strong><span></span>`;
    $("#resumo strong").textContent = s.nome;
    $("#resumo span").textContent = (estado.barbeiro.id === null ? "Barbeiro: o primeiro livre" : "Com o " + estado.barbeiro.nome) + " · " + `${diaLongo(estado.dia)} · ${hhmm(estado.hora)} às ${hhmm(fim)}`;
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
    const { data: res, error } = await sb.rpc("agendar", { p_servico: s.id, p_barbeiro: estado.barbeiro.id, p_inicio: inicio.toISOString(), p_nome: nome, p_telefone: telFinal, p_obs: obs || null });
    const barbeiro = (Array.isArray(res) ? res[0]?.barbeiro : res?.barbeiro) || estado.barbeiro.nome;
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
        body: JSON.stringify({ access_key: S.contato.web3formsChave, subject: `Novo agendamento: ${s.nome} com ${barbeiro} · ${quando}`, from_name: "Agenda Barbearia L.C",
          servico: s.nome, barbeiro, quando, nome, whatsapp: telFinal, observacao: obs || "-" }),
      }).catch(() => {});
    }
    mostrar("#fluxo", false);
    $("#sucesso-texto").textContent = `${s.nome} com o ${barbeiro} · ${quando}. Te esperamos na Estrada do Alvarenga, 2047 · Jardim Pedreira.`;
    $("#sucesso-whats").href = wa(`Olá! Acabei de agendar pelo site 💈\n\nServiço: ${s.nome}\nBarbeiro: ${barbeiro}\nDia: ${quando}\nNome: ${nome}${obs ? `\nObs.: ${obs}` : ""}`);
    rolarPara(mostrar("#sucesso"));
  });

  carregarServicos();
})();
