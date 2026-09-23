#!/bin/sh
set -eu
test "$POSTGRES_DB" = academy_auth_test
psql -v ON_ERROR_STOP=1 --username postgres --dbname "$POSTGRES_DB" \
  -v auth_password="$AUTH_DB_PASSWORD" -v rest_password="$REST_DB_PASSWORD" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE auth_admin LOGIN CREATEROLE PASSWORD :'auth_password';
CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD :'rest_password';
GRANT anon, authenticated, service_role TO authenticator;
CREATE SCHEMA auth AUTHORIZATION auth_admin;
ALTER ROLE auth_admin SET search_path = auth, public;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO service_role;
SQL
