#!/usr/bin/env bash
# Applies the migrations to a throwaway local Postgres database and runs the
# security tests. Needs psql/createdb on PATH, e.g.:
#   PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${DB:-spot_reports_test}
dropdb --if-exists "$DB" && createdb "$DB"
cat tests/supabase_shim.sql migrations/*.sql | psql -q -v ON_ERROR_STOP=1 -d "$DB"
psql -q -d "$DB" < tests/rls_test.sql
dropdb "$DB"
