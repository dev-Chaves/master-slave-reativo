package org.acme.computers;

import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import org.acme.computers.dto.ComputerDescriptionDTO;
import org.acme.computers.service.ComputerReadService;
import org.acme.computers.service.ComputerWriteService;
import org.jboss.resteasy.reactive.RestResponse;

import java.util.List;

@Path("computer")
@ApplicationScoped
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class ComputersResource {

    @Inject
    ComputerReadService readService;

    @Inject
    ComputerWriteService writeService;

    /**
     * Lista todos os computadores — leitura via RÉPLICA (slave).
     */
    @GET
    public Uni<List<ComputerEntity>> getAll() {
        return readService.findAll();
    }

    /**
     * Cria um novo computador — escrita via PRIMARY (master).
     */
    @POST
    public Uni<RestResponse<ComputerEntity>> create(ComputerDescriptionDTO dto) {
        return writeService.create(dto)
                .map(entity -> RestResponse.status(RestResponse.Status.CREATED, entity));
    }

    /**
     * Busca computadores por modelo de GPU — leitura via RÉPLICA.
     */
    @GET
    @Path("search/gpu/{search}")
    public Uni<List<ComputerEntity>> searchGPU(@PathParam("search") String search) {
        return readService.searchByGpu(search);
    }

    /**
     * Busca computadores por capacidade de RAM — leitura via RÉPLICA.
     */
    @GET
    @Path("search/ram/{capacity}")
    public Uni<List<ComputerEntity>> searchRAM(@PathParam("capacity") Integer capacity) {
        return readService.searchByRamCapacity(capacity);
    }

    /**
     * Remove um computador pelo nome — escrita via PRIMARY (master).
     */
    @DELETE
    @Path("{name}")
    public Uni<RestResponse<Void>> delete(@PathParam("name") String name) {
        return writeService.deleteByName(name)
                .map(deleted -> deleted > 0
                        ? RestResponse.noContent()
                        : RestResponse.status(RestResponse.Status.NOT_FOUND));
    }
}
