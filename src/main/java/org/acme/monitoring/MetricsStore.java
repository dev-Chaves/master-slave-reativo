package org.acme.monitoring;

import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.operators.multi.processors.BroadcastProcessor;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedDeque;

/**
 * Armazena os últimos 20 snapshots de métricas em memória
 * e expõe um stream reativo para SSE.
 */
@ApplicationScoped
public class MetricsStore {

    private static final int MAX_SNAPSHOTS = 20;

    private final ConcurrentLinkedDeque<MetricsSnapshot> snapshots = new ConcurrentLinkedDeque<>();

    // Hot stream: emite cada novo snapshot para todos os subscribers SSE conectados
    private final BroadcastProcessor<MetricsSnapshot> processor = BroadcastProcessor.create();

    public void addSnapshot(MetricsSnapshot snapshot) {
        snapshots.addLast(snapshot);
        while (snapshots.size() > MAX_SNAPSHOTS) {
            snapshots.pollFirst();
        }
        processor.onNext(snapshot);
    }

    public List<MetricsSnapshot> getAll() {
        return new ArrayList<>(snapshots);
    }

    /**
     * Stream reativo que emite um snapshot a cada vez que o job coleta um novo.
     * Usado pelo endpoint SSE — cada cliente conectado recebe o push imediatamente.
     */
    public Multi<MetricsSnapshot> stream() {
        return processor;
    }
}
