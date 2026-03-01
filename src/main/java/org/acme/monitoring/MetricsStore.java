package org.acme.monitoring;

import jakarta.enterprise.context.ApplicationScoped;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedDeque;

/**
 * Armazena os últimos 20 snapshots de métricas em memória.
 */
@ApplicationScoped
public class MetricsStore {

    private static final int MAX_SNAPSHOTS = 20;

    private final ConcurrentLinkedDeque<MetricsSnapshot> snapshots = new ConcurrentLinkedDeque<>();

    public void addSnapshot(MetricsSnapshot snapshot) {
        snapshots.addLast(snapshot);
        while (snapshots.size() > MAX_SNAPSHOTS) {
            snapshots.pollFirst();
        }
    }

    public List<MetricsSnapshot> getAll() {
        return new ArrayList<>(snapshots);
    }
}
