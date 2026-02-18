package org.acme.computers;

import io.quarkus.hibernate.reactive.panache.Panache;
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
public class ComputersResource {

    @Inject
    ComputerReadService readService;

    @Inject
    ComputerWriteService writeService;

    @GET
    public Uni<List<ComputerEntity>> get() {
        return readService.streamAll().collect().asList();
    }

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Uni<RestResponse<ComputerEntity>> create(ComputerDescriptionDTO dto) {
        return Panache.withTransaction(() -> writeService.create(dto))
                .map(entity -> RestResponse.status(RestResponse.Status.CREATED, entity));
    }

    @GET
    @Path("search/gpu/{search}")
    public Uni<List<ComputerEntity>> searchGPU(@PathParam("search") String search) {
        return readService.searchByGpu(search);
    }

    @GET
    @Path("search/ram/{capacity}")
    public Uni<List<ComputerEntity>> searchRAM(@PathParam("capacity") Integer capacity) {
        return readService.searchByRamCapacity(capacity);
    }

    @DELETE
    @Path("{name}")
    public Uni<RestResponse<Void>> delete(@PathParam("name") String name) {
        return Panache.withTransaction(() -> writeService.deleteByName(name))
                .map(deleted -> deleted > 0
                        ? RestResponse.noContent()
                        : RestResponse.status(RestResponse.Status.NOT_FOUND));
    }
}
