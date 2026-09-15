-- ====================================================================
-- CLICK LEAD STORM - SCRIPT DEFINITIVO DE PRODUÇÃO SUPABASE
-- Execute este script no menu "SQL Editor" do seu painel Supabase
-- ====================================================================

-- 1. Habilita extensões essenciais para UUIDs e criptografia de senhas
create extension if not exists "pgcrypto";

-- 2. Tabela de Licenças de Clientes
create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  customer_name text not null,
  customer_email text not null,
  license_key text unique not null,
  machine_id text, -- Registrado na primeira ativação da máquina
  status text not null default 'active' check (status in ('active', 'blocked', 'trial', 'expired')),
  is_trial boolean default false,
  daily_limit integer default 100,
  expires_at timestamp with time zone not null,
  notes text
);

alter table public.licenses enable row level security;

-- Bloqueia leituras/escritas diretas da role anônima (acesso exclusivo via RPC)
drop policy if exists "Deny direct anon access to licenses" on public.licenses;
create policy "Deny direct anon access to licenses"
  on public.licenses
  for all
  to anon
  using (false);

-- 3. Tabela de Controle Global de Versões
create table if not exists public.app_config (
  id integer primary key default 1,
  min_version text not null default '1.0.0',
  latest_version text not null default '1.0.0',
  force_update boolean default true,
  download_url text
);

alter table public.app_config enable row level security;

drop policy if exists "Deny direct anon access to app_config" on public.app_config;
create policy "Deny direct anon access to app_config"
  on public.app_config
  for all
  to anon
  using (false);

insert into public.app_config (id, min_version, latest_version, force_update, download_url)
values (1, '1.0.0', '1.0.0', true, 'https://github.com/eduardotertuliano21-cpu/clickprospecstorm/releases')
on conflict (id) do nothing;

-- 4. Tabela de Administradores Mestres
create table if not exists public.master_admins (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  created_at timestamp with time zone default now()
);

alter table public.master_admins enable row level security;

drop policy if exists "Deny direct anon access to master_admins" on public.master_admins;
create policy "Deny direct anon access to master_admins"
  on public.master_admins
  for all
  to anon
  using (false);

-- 5. Cadastro da Conta Mestra Oficial do Desenvolvedor (eduardo.tertuliano21@gmail.com)
insert into public.master_admins (email, password_hash)
values (
  'eduardo.tertuliano21@gmail.com',
  crypt('2111993@Edu', gen_salt('bf'))
)
on conflict (email) do update set
  password_hash = crypt('2111993@Edu', gen_salt('bf'));

-- 6. Licença Vitalícia Permanente para o Desenvolvedor
insert into public.licenses (
  customer_name,
  customer_email,
  license_key,
  status,
  is_trial,
  daily_limit,
  expires_at,
  notes
)
values (
  'Eduardo Tertuliano (Master)',
  'eduardo.tertuliano21@gmail.com',
  'CLS-ADMIN-LIFETIME',
  'active',
  false,
  999999,
  '2099-12-31 23:59:59+00',
  'Conta Mestra e Licença Vitalícia do Desenvolvedor'
)
on conflict (license_key) do update set
  status = 'active',
  expires_at = '2099-12-31 23:59:59+00',
  daily_limit = 999999;

-- 7. Função RPC: validate_license (Validação Pública Segura para o Desktop App)
create or replace function public.validate_license(
  p_license_key text,
  p_machine_id text,
  p_app_version text
)
returns json
language plpgsql
security definer
as $$
declare
  v_lic record;
  v_cfg record;
begin
  -- Consulta versão mínima exigida
  select * into v_cfg from public.app_config where id = 1;

  -- Trava de versão obrigatória
  if v_cfg.force_update and p_app_version < v_cfg.min_version then
    return json_build_object(
      'valid', false,
      'force_update', true,
      'message', 'Versão descontinuada. É obrigatório atualizar o Click Lead Storm para prosseguir.'
    );
  end if;

  -- Bypass para Chave Mestre de Desenvolvedor
  if p_license_key = 'CLS-ADMIN-LIFETIME' then
    return json_build_object(
      'valid', true,
      'force_update', false,
      'status', 'active',
      'is_trial', false,
      'daily_limit', 999999,
      'expires_at', '2099-12-31T23:59:59Z',
      'customer_name', 'Eduardo Tertuliano (Master Admin)'
    );
  end if;

  -- Busca o registro da licença
  select * into v_lic from public.licenses where license_key = p_license_key;

  if not found then
    return json_build_object(
      'valid', false,
      'force_update', false,
      'message', 'Chave de licença inválida ou inexistente no sistema.'
    );
  end if;

  -- Verifica bloqueio manual/administrativo
  if v_lic.status = 'blocked' then
    return json_build_object(
      'valid', false,
      'force_update', false,
      'message', 'Seu acesso foi suspenso pelo suporte administrativo.'
    );
  end if;

  -- Verifica expiração
  if v_lic.expires_at < now() then
    return json_build_object(
      'valid', false,
      'force_update', false,
      'message', 'Sua licença ou período de testes expirou.'
    );
  end if;

  -- Amarração ou verificação de Hardware ID
  if v_lic.machine_id is null or v_lic.machine_id = '' then
    update public.licenses set machine_id = p_machine_id where id = v_lic.id;
  elsif v_lic.machine_id <> p_machine_id then
    return json_build_object(
      'valid', false,
      'force_update', false,
      'message', 'Esta licença já está ativa em outro computador. Solicite o reset ao suporte.'
    );
  end if;

  -- Retorno de Sucesso
  return json_build_object(
    'valid', true,
    'force_update', false,
    'status', v_lic.status,
    'is_trial', v_lic.is_trial,
    'daily_limit', v_lic.daily_limit,
    'expires_at', v_lic.expires_at,
    'customer_name', v_lic.customer_name
  );
end;
$$;

-- 8. Função RPC: verify_master_login (Autenticação Remota de Administrador Mestre)
create or replace function public.verify_master_login(
  p_email text,
  p_password text
)
returns json
language plpgsql
security definer
as $$
declare
  v_admin record;
begin
  select * into v_admin from public.master_admins
  where lower(email) = lower(p_email)
    and password_hash = crypt(p_password, password_hash);

  if not found then
    return json_build_object(
      'success', false,
      'message', 'E-mail ou senha mestre incorretos.'
    );
  end if;

  return json_build_object(
    'success', true,
    'email', v_admin.email,
    'role', 'master_admin'
  );
end;
$$;
