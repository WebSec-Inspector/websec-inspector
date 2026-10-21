-- Execute uma vez em bancos que ainda utilizam os papéis históricos USER/ADMIN.
-- UserRoleConverter também mantém leitura compatível durante a transição.
BEGIN;

UPDATE users SET role = 'CLIENTE' WHERE role = 'USER';
UPDATE users SET role = 'ADMINISTRADOR' WHERE role = 'ADMIN';

COMMIT;
