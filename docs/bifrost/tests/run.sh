#!/usr/bin/env bash
# Applies the three drafts to a throwaway database and runs their checks.
# Needs a local Postgres 15+ you can create databases on, for example:
#   PGHOST=/var/run/postgresql PGUSER=postgres docs/bifrost/tests/run.sh
set -eo pipefail
cd "$(dirname "$0")"
DB="heimdallr_bifrost_test_$$"
psql -q -v ON_ERROR_STOP=1 -d postgres -c "CREATE DATABASE $DB"
trap 'psql -q -d postgres -c "DROP DATABASE IF EXISTS $DB" >/dev/null' EXIT
run() { psql -q -X -v ON_ERROR_STOP=1 -o /dev/null -d "$DB" -f "$1" 2>&1 | sed -n "s/.*NOTICE:  //p;/ERROR/p"; }
run stub.sql
run ../20261020_discord_link_step1.sql
run test_step1.sql
run ../20261020_discord_link_step2.sql
run test_step2.sql
run ../20261020_discord_link_step3.sql
run test_step3.sql
echo "All Bifröst draft checks passed"
