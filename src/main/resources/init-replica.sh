#!/bin/bash
set -e

PGDATA="${PGDATA:-/var/lib/postgresql/18/main}"

echo "Aguardando o primary ficar disponível..."
until pg_isready -h postgres-primary -p 5432 -U quarkus_user; do
  echo "Primary ainda não está pronto. Aguardando 2s..."
  sleep 2
done

echo "Primary disponível. Verificando se réplica já foi inicializada..."

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "Executando pg_basebackup para $PGDATA..."
  mkdir -p "$PGDATA"
  PGPASSWORD=replicator_password pg_basebackup \
    -h postgres-primary \
    -p 5432 \
    -U replicator \
    -D "$PGDATA" \
    -R \
    --slot=replication_slot_1 \
    -P \
    --wal-method=stream

  chown -R postgres:postgres "$PGDATA"
  chmod 0700 "$PGDATA"
  echo "pg_basebackup concluído com sucesso."
else
  echo "Réplica já inicializada. Pulando pg_basebackup."
fi

echo "Iniciando PostgreSQL como réplica (hot standby)..."
exec gosu postgres postgres -D "$PGDATA" -c hot_standby=on
