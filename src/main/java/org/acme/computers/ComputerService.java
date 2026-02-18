package org.acme.computers;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.panache.common.Sort;
import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.acme.computers.dto.ComputerDescriptionDTO;

import java.util.List;

@ApplicationScoped
public class ComputerService {

    @Inject
    private ObjectMapper objectMapper;

    public Uni<List<ComputerEntity>> get(){

        return ComputerEntity.listAll(Sort.by("name"));

    }

    public Uni<ComputerEntity> create(ComputerDescriptionDTO dto) {
        ComputerEntity entity = new ComputerEntity();

        entity.setName(dto.getName());

        entity.setPrice(dto.getPrice());

        try{
            String jsonDescription = objectMapper.writeValueAsString(dto);
            entity.setDescription(jsonDescription);
        }catch (JsonProcessingException e){
            throw new RuntimeException("Failed to serialize ComputerDescriptionDTO to JSON", e);
        }

        return entity.persist();

    }

    public Uni<Long> delete(String name){

        return ComputerEntity.delete("name", name);

    }


}
