package org.acme.computers;

import io.quarkus.hibernate.reactive.panache.Panache;
import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import org.acme.computers.dto.ComputerDescriptionDTO;
import org.jboss.resteasy.reactive.RestResponse;

import java.util.List;

@Path("computer")
@ApplicationScoped
public class ComputersResource {

    @Inject
    ComputerService computerService;

    @GET
    public Uni<List<ComputerEntity>> get(){
        return computerService.get();
    }

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Uni<RestResponse<ComputerEntity>> create(ComputerDescriptionDTO dto){

        return Panache.withTransaction(()-> computerService.create(dto))
                .map(entity -> RestResponse.status(RestResponse.Status.CREATED, entity));

    }


}
