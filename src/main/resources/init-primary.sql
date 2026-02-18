-- Usuário de replicação
CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'replicator_password';

-- Slot de replicação (garante que o primary não descarte WAL antes da réplica consumir)
SELECT pg_create_physical_replication_slot('replication_slot_1');

-- Extensão útil
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabela principal
CREATE TABLE IF NOT EXISTS computers (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(40) NOT NULL,
    description JSONB,
    price       NUMERIC(10, 2),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_created_at ON computers(created_at);

CREATE INDEX idx_computers_description ON computers USING gin (description);