-- Perfis de demonstração (rode DEPOIS do schema.sql).
-- Os UUIDs são fixos de propósito: o site de demonstração usa os mesmos.
insert into perfis (user_id, perfil, estados_permitidos, tipos_permitidos) values
  ('00000000-0000-0000-0000-000000000001', 'cidadao',  '{PE}',    '{contrato}'),
  ('00000000-0000-0000-0000-000000000002', 'analista', '{PE,BR}', '{contrato,pagamento,empenho}'),
  ('00000000-0000-0000-0000-000000000003', 'admin',    '{PE,BR}', '{contrato,pagamento,empenho}')
on conflict (user_id) do update
  set perfil = excluded.perfil,
      estados_permitidos = excluded.estados_permitidos,
      tipos_permitidos = excluded.tipos_permitidos;

-- Visitante: quem usa o chat SEM login. Acesso mínimo (só contratos de PE).
insert into perfis (user_id, perfil, estados_permitidos, tipos_permitidos) values
  ('00000000-0000-0000-0000-000000000000', 'cidadao', '{PE}', '{contrato}')
on conflict (user_id) do update
  set perfil = excluded.perfil,
      estados_permitidos = excluded.estados_permitidos,
      tipos_permitidos = excluded.tipos_permitidos;
