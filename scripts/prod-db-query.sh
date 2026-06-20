#!/usr/bin/env bash
# Runs an arbitrary read/write query against the prod Postgres instance
# (loopback-only, published on POSTGRES_HOST_PORT) and prints the result as
# a JSON array of row objects, suitable for piping into jq.
#
# Usage: scripts/prod-db-query.sh "SELECT * FROM cards LIMIT 5"

set -euo pipefail

if [[ $# -ne 1 || -z "$1" ]]; then
  echo "Usage: $0 \"<SQL QUERY>\"" >&2
  exit 1
fi

QUERY="$1"

POSTGRES_USER="${POSTGRES_USER:-spanish_cards}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-spanish_cards}"
POSTGRES_DB="${POSTGRES_DB:-spanish_cards}"
POSTGRES_HOST_PORT="${POSTGRES_HOST_PORT:-5434}"

# Wrapping the query in json_agg lets any SELECT (or RETURNING clause) come
# back as a single JSON array, instead of psql's default tabular output.
JSON_QUERY="SELECT COALESCE(json_agg(row_to_json(q)), '[]'::json) FROM (${QUERY%;}) q;"

PGPASSWORD="$POSTGRES_PASSWORD" psql \
  --host=127.0.0.1 \
  --port="$POSTGRES_HOST_PORT" \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --quiet \
  --tuples-only \
  --no-align \
  --command="$JSON_QUERY"
