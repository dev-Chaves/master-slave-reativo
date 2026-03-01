package org.acme.monitoring;

import io.micrometer.core.instrument.MeterRegistry;
import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.jboss.logging.Logger;

/**
 * Job agendado que coleta métricas do Master (primary) e Slave (leitura)
 * a cada 30 segundos via Micrometer e armazena no MetricsStore.
 */
@ApplicationScoped
public class MetricsCollectorJob {

    private static final Logger LOG = Logger.getLogger(MetricsCollectorJob.class);

    @Inject
    MeterRegistry registry;

    @Inject
    MetricsStore store;

    @Scheduled(every = "30s", identity = "ssr-metrics-collector")
    void collect() {
        double httpReads = sumHttpRequests("GET");
        double httpWrites = sumHttpRequests("POST") + sumHttpRequests("DELETE") + sumHttpRequests("PUT");

        // Pool reativo PostgreSQL: tag clientName identifica o datasource
        double primaryInUse = gaugeValue("postgresql.current", "clientName", "<default>");
        double primaryPending = gaugeValue("postgresql.queue.size", "clientName", "<default>");
        double replicaInUse = gaugeValue("postgresql.current", "clientName", "leitura");
        double replicaPending = gaugeValue("postgresql.queue.size", "clientName", "leitura");

        MetricsSnapshot snapshot = MetricsSnapshot.of(
                httpReads, httpWrites,
                primaryInUse, primaryPending,
                replicaInUse, replicaPending);

        store.addSnapshot(snapshot);
        LOG.infof(
                "[SSR] snapshot coletado — HTTP reads=%.0f writes=%.0f | primary in-use=%.0f pending=%.0f | replica in-use=%.0f pending=%.0f",
                httpReads, httpWrites, primaryInUse, primaryPending, replicaInUse, replicaPending);
    }

    /** Soma os contadores http.server.requests para um dado método HTTP. */
    private double sumHttpRequests(String method) {
        return registry.find("http.server.requests")
                .tag("method", method)
                .timers()
                .stream()
                .mapToDouble(t -> t.count())
                .sum();
    }

    /**
     * Lê um gauge Vert.x pool filtrando pela tag do datasource.
     * Quando datasource é "", usa o datasource default (primary).
     */
    private double gaugeValue(String meterName, String tagKey, String tagValue) {
        var search = registry.find(meterName);
        if (!tagValue.isEmpty()) {
            search = search.tag(tagKey, tagValue);
        }
        return search.gauges().stream()
                .mapToDouble(g -> g.value())
                .sum();
    }
}
