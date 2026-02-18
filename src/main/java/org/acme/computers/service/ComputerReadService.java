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


