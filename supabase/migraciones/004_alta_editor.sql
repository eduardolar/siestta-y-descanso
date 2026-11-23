-- Alta de una cuenta como editora (puede cambiar productos, ajustes y fotos).
-- Antes: crear el usuario en Authentication → Users y copiar su «User UID».
-- Cambia PON-AQUI-EL-UID por ese UID SOLO en el SQL Editor de Supabase: no lo guardes en el repositorio
-- (si se ejecuta sin cambiar, falla: «invalid input syntax for type uuid» y no hace nada).
-- Se puede ejecutar dos veces sin problema.
insert into public.editores (user_id, nombre)
values ('PON-AQUI-EL-UID', '')
on conflict (user_id) do nothing;

-- Comprobación: debe salir la cuenta con su correo.
select e.user_id, u.email, e.creado_en
  from public.editores e
  join auth.users u on u.id = e.user_id;
