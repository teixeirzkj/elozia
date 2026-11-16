-- Elozia · Fase 5 · Ajustes da auditoria de segurança

-- 1. O e-mail do perfil espelha o e-mail da conta e não pode ser alterado pelo
--    usuário (evita falsificar a identidade exibida para a equipe e burlar a
--    verificação de "já faz parte da equipe" nos convites).
create function app.profiles_protect() returns trigger
language plpgsql as $$
begin
  if new.email is distinct from old.email and current_user = 'authenticated' then
    new.email = old.email;
  end if;
  new.id = old.id;
  return new;
end $$;
create trigger profiles_protect before update on public.profiles
  for each row execute function app.profiles_protect();

-- Mantém o e-mail do perfil em dia quando a conta muda de e-mail no Supabase Auth.
create function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = lower(new.email) where id = new.id;
  end if;
  return new;
end $$;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- 2. Marcações internas que só o servidor deve definir.
--    Um membro não pode transformar registros reais em "demonstração" (o que os
--    tiraria dos relatórios e dos envios) nem o contrário.
create function app.protect_is_demo() returns trigger
language plpgsql as $$
begin
  if new.is_demo is distinct from old.is_demo and current_user = 'authenticated' then
    new.is_demo = old.is_demo;
  end if;
  return new;
end $$;
create trigger contacts_protect_demo before update on public.contacts
  for each row execute function app.protect_is_demo();
create trigger opportunities_protect_demo before update on public.opportunities
  for each row execute function app.protect_is_demo();
create trigger packages_protect_demo before update on public.packages
  for each row execute function app.protect_is_demo();

grant execute on function app.profiles_protect(), app.protect_is_demo() to authenticated, service_role;
