package org.acme.monitoring;

import io.quarkus.runtime.annotations.RegisterForReflection;

import java.time.Instant;

/**
 * Snapshot imutável das métricas coletadas em um dado instante.
 * Inclui contagens HTTP (reads/writes) e utilização do pool de conexões
 * por datasource (primary = Master, leitura = Slave).
 */
@RegisterForReflection
public record MetricsSnapshot(
                String timestamp,
                double httpReads,
                double httpWrites,
                double primaryPoolInUse,
                double primaryPoolPending,
                double replicaPoolInUse,
                double replicaPoolPending) {
        public static MetricsSnapshot of(
                        double httpReads,
                        double httpWrites,
                        double primaryPoolInUse,
                        double primaryPoolPending,
                        double replicaPoolInUse,
                        double replicaPoolPending) {
                return new MetricsSnapshot(
                                Instant.now().toString(),
                                httpReads,
                                httpWrites,
                                primaryPoolInUse,
                                primaryPoolPending,
                                replicaPoolInUse,
                                replicaPoolPending);
        }
}