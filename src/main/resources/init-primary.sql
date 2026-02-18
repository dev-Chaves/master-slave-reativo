1 -- Criação do usuário de replicação
CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'replicator_password';
-- Criação do slot de replicação (opcional, mas recomendado para evitar perda de dados se a réplica cair)
SELECT pg_create_physical_replication_slot('replication_slot_1');