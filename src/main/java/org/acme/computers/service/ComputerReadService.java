package org.acme.computers.service;

import io.quarkus.reactive.datasource.ReactiveDataSource;
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.Uni;
import io.vertx.mutiny.sqlclient.Pool;
import io.vertx.mutiny.sqlclient.Tuple;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.acme.computers.ComputerEntity;
import org.acme.computers.mapper.ComputerRowMapper;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Service responsável por operações de LEITURA.
 * Utiliza a réplica (slave) do banco de dados.
 */
@ApplicationScoped
public class ComputerReadService {

    @Inject
    @ReactiveDataSource("leitura")
    Pool readClient;

    @Inject
    ComputerRowMapper mapper;

    public Multi<ComputerEntity> streamAll() {
        return readClient.query("SELECT * FROM computers").execute()
                .onItem().transformToMulti(rows -> Multi.createFrom().iterable(rows))
                .onItem().transform(mapper::mapRow);
    }

    public Uni<List<ComputerEntity>> findAll() {
        return readClient.query("SELECT * FROM computers").execute()
                .onItem().transform(mapper::mapRows);
    }

    public Uni<List<ComputerEntity>> pagination(LocalDateTime createdAt, Long id, int limit) {

        if (limit <= 0) {
            return Uni.createFrom().failure(
                    new IllegalArgumentException("limit must be greater than 0"));
        }

        LocalDateTime effectiveCreatedAt = createdAt != null ? createdAt : LocalDateTime.now();

        Long effectiveId = id != null ? id : Long.MAX_VALUE;

        return readClient.preparedQuery(
                "SELECT * FROM computers WHERE (created_at < $1 OR (created_at = $1 AND id < $2)) ORDER BY created_at DESC, id DESC LIMIT $3")
                .execute(Tuple.of(effectiveCreatedAt, effectiveId, limit))
                .onItem().transform(mapper::mapRows);
    }

    public Uni<List<ComputerEntity>> searchByGpu(String search) {
        return readClient
                .preparedQuery("""
                            SELECT * FROM computers
                            WHERE description -> 'placa_video' ->> 'modelo' ILIKE $1
                        """)
                .execute(Tuple.of("%" + search + "%"))
                .onItem().transform(mapper::mapRows);
    }

    public Uni<List<ComputerEntity>> searchByRamCapacity(Integer capacityGb) {
        return readClient
                .preparedQuery("""
                            SELECT * FROM computers
                            WHERE (description -> 'memoria_ram' ->> 'capacidade_total_gb')::int = $1
                        """)
                .execute(Tuple.of(capacityGb))
                .onItem().transform(mapper::mapRows);
    }
}
