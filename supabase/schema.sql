-- Barbearia L.C · agenda online (uma agenda só para a barbearia). Base: modelo da BS Beauty Studio.

create extension if not exists btree_gist with schema extensions;

create table public.servicos (
  id smallint primary key,
  slug text not null unique,
  nome text not null,
  duracao_min int not null check (duracao_min between 15 and 480 and duracao_min % 15 = 0),
  ativo boolean not null default true,
  ordem int not null default 0
);

create table public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  servico_id smallint not null references public.servicos(id),
  periodo tstzrange not null,
  nome text not null check (char_length(btrim(nome)) between 2 and 80),
  telefone text not null check (telefone ~ '^[0-9]{10,13}$'),
  obs text check (obs is null or char_length(obs) <= 500),
  status text not null default 'confirmado' check (status in ('confirmado','cancelado')),
  criado_em timestamptz not null default now(),
  constraint agendamentos_sem_conflito exclude using gist (periodo with &&) where (status = 'confirmado') -- uma agenda só para a barbearia
);
create index agendamentos_periodo_idx on public.agendamentos using gist (periodo);
create index agendamentos_servico_idx on public.agendamentos (servico_id);

create table public.bloqueios (
  id uuid primary key default gen_random_uuid(),
  servico_id smallint references public.servicos(id),  -- nulo = todos os serviços
  periodo tstzrange not null,
  motivo text check (motivo is null or char_length(motivo) <= 120),
  criado_em timestamptz not null default now()
);
create index bloqueios_periodo_idx on public.bloqueios using gist (periodo);
create index bloqueios_servico_idx on public.bloqueios (servico_id);

create table public.admins (email text primary key);
comment on table public.admins is 'Somente leitura interna via is_admin(); sem acesso pela API de propósito.';

-- >>> serviços (id, slug usado em agendar.html?servico=slug, nome, duração em minutos, ordem)
insert into public.servicos (id, slug, nome, duracao_min, ordem) values
  (1, 'corte', 'Corte', 30, 1),
  (2, 'barba', 'Barba', 30, 2),
  (3, 'corte-barba', 'Corte + Barba', 60, 3),
  (4, 'sobrancelha', 'Sobrancelha', 15, 4),
  (5, 'desenho', 'Desenho / freestyle', 45, 5),
  (6, 'luzes', 'Luzes e platinado', 120, 6),
  (7, 'infantil', 'Corte infantil', 30, 7);

-- >>> administração (e-mails em minúsculas)
insert into public.admins (email) values ('johenartegrafica@gmail.com'), ('hjose5860@gmail.com');

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.email = lower(coalesce((select auth.jwt()) ->> 'email', '')));
$$;

alter table public.servicos enable row level security;
alter table public.agendamentos enable row level security;
alter table public.bloqueios enable row level security;
alter table public.admins enable row level security;

create policy "servicos ativos sao publicos" on public.servicos for select to anon using (ativo);
create policy "servicos para logados" on public.servicos for select to authenticated using (ativo or (select public.is_admin()));
create policy "admin altera servicos" on public.servicos for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin le agendamentos" on public.agendamentos for select to authenticated using ((select public.is_admin()));
create policy "admin altera agendamentos" on public.agendamentos for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin le bloqueios" on public.bloqueios for select to authenticated using ((select public.is_admin()));
create policy "admin cria bloqueios" on public.bloqueios for insert to authenticated with check ((select public.is_admin()));
create policy "admin apaga bloqueios" on public.bloqueios for delete to authenticated using ((select public.is_admin()));

-- Horários ocupados de um serviço num dia (sem dados pessoais)
create or replace function public.horarios_ocupados(p_servico smallint, p_dia date)
returns table (inicio timestamptz, fim timestamptz)
language sql stable security definer set search_path = ''
as $$
  with dia as (
    select tstzrange((p_dia::timestamp) at time zone 'America/Sao_Paulo', ((p_dia + 1)::timestamp) at time zone 'America/Sao_Paulo') as r
  )
  select lower(a.periodo), upper(a.periodo) from public.agendamentos a, dia
   where a.status = 'confirmado' and a.periodo && dia.r
  union all
  select lower(b.periodo), upper(b.periodo) from public.bloqueios b, dia
   where (b.servico_id is null or b.servico_id = p_servico) and b.periodo && dia.r;
$$;

-- Cria um agendamento validando as regras do negócio
create or replace function public.agendar(p_servico smallint, p_inicio timestamptz, p_nome text, p_telefone text, p_obs text default null)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_dur int; v_fim timestamptz; v_local timestamp; v_local_fim timestamp;
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'); v_id uuid;
begin
  select duracao_min into v_dur from public.servicos where id = p_servico and ativo;
  if v_dur is null then raise exception 'Serviço indisponível' using errcode = 'P0001'; end if;
  v_fim := p_inicio + make_interval(mins => v_dur);
  v_local := p_inicio at time zone 'America/Sao_Paulo';
  v_local_fim := v_fim at time zone 'America/Sao_Paulo';

  if p_inicio < now() + interval '30 minutes' then raise exception 'Escolha um horário com pelo menos 30 minutos de antecedência' using errcode = 'P0001'; end if;
  if p_inicio > now() + interval '45 days' then raise exception 'A agenda abre com até 45 dias de antecedência' using errcode = 'P0001'; end if;
  -- >>> dias fechados (isodow: 1=seg … 7=dom)
  if extract(isodow from v_local) = 7 then raise exception 'Não atendemos aos domingos' using errcode = 'P0001'; end if;
  -- >>> horário de funcionamento
  -- seg a qui 9h, sex e sáb 8h; fecha 18h45
  if v_local::time < (case when extract(isodow from v_local) in (5, 6) then time '08:00' else time '09:00' end)
     or v_local_fim::time > time '18:45' or v_local_fim::date <> v_local::date then
    raise exception 'Fora do horário de atendimento' using errcode = 'P0001'; end if;
  if extract(minute from v_local)::int % 15 <> 0 or extract(second from v_local) <> 0 then raise exception 'Horário inválido' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_nome, ''))) < 2 then raise exception 'Informe seu nome' using errcode = 'P0001'; end if;
  if v_tel !~ '^[0-9]{10,13}$' then raise exception 'Informe um WhatsApp válido com DDD' using errcode = 'P0001'; end if;
  if (select count(*) from public.agendamentos where telefone = v_tel and status = 'confirmado' and upper(periodo) > now()) >= 3 then
    raise exception 'Você já tem 3 horários marcados. Fale com a gente no WhatsApp' using errcode = 'P0001'; end if;
  if exists (select 1 from public.bloqueios b where (b.servico_id is null or b.servico_id = p_servico) and b.periodo && tstzrange(p_inicio, v_fim)) then
    raise exception 'Esse horário acabou de ser ocupado. Escolha outro' using errcode = 'P0001'; end if;
  begin
    insert into public.agendamentos (servico_id, periodo, nome, telefone, obs)
    values (p_servico, tstzrange(p_inicio, v_fim), btrim(p_nome), v_tel, nullif(btrim(coalesce(p_obs, '')), ''))
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'Esse horário acabou de ser ocupado. Escolha outro' using errcode = 'P0001';
  end;
  return v_id;
end;
$$;

revoke all on function public.agendar(smallint, timestamptz, text, text, text) from public;
revoke all on function public.horarios_ocupados(smallint, date) from public;
revoke all on function public.is_admin() from public;
grant execute on function public.agendar(smallint, timestamptz, text, text, text) to anon, authenticated;
grant execute on function public.horarios_ocupados(smallint, date) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;
