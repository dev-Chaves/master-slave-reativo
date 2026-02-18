package org.acme.computers.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.hibernate.reactive.panache.common.WithTransaction;
import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.acme.computers.ComputerEntity;
import org.acme.computers.dto.ComputerDescriptionDTO;

/**
 * Service responsável por operações de ESCRITA.
 * Utiliza o banco primário (master).
 */
@ApplicationScoped
public class ComputerWriteService {

    @Inject
    ObjectMapper objectMapper;

    @WithTransaction
    public Uni<ComputerEntity> create(ComputerDescriptionDTO dto) {
        ComputerEntity entity = new ComputerEntity();
        entity.setName(dto.getName());
        entity.setPrice(dto.getPrice());

        try {
            String jsonDescription = objectMapper.writeValueAsString(dto);
            entity.setDescription(jsonDescription);
        } catch (JsonProcessingException e) {
            return Uni.createFrom().failure(
                    new RuntimeException("Failed to serialize ComputerDescriptionDTO to JSON", e));
        }

        return entity.persist();
    }

    @WithTransaction
    public Uni<Long> deleteByName(String name) {
        return ComputerEntity.delete("name", name);
    }
}
