-- Run ONCE in the Supabase SQL Editor after creating the first user (Auth > Users > Add user).
-- Replace the email.
insert into user_roles (user_id, role)
select id, 'SUPER_ADMIN' from auth.users where email = 'YOUR-EMAIL@example.com'
on conflict do nothing;
