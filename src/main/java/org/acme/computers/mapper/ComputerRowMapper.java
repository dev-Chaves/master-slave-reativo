package org.acme.computers.mapper;

import io.vertx.mutiny.sqlclient.Row;
import io.vertx.mutiny.sqlclient.RowSet;
import jakarta.enterprise.context.ApplicationScoped;
import org.acme.computers.ComputerEntity;

import java.util.ArrayList;
import java.util.List;

@ApplicationScoped
public class ComputerRowMapper {

    public ComputerEntity mapRow(Row row) {
        ComputerEntity entity = new ComputerEntity();
        entity.setId(row.getLong("id"));
        entity.setName(row.getString("name"));
        entity.setPrice(row.getBigDecimal("price"));
        entity.setDescription(row.getString("description"));
        return entity;
    }

    public List<ComputerEntity> mapRows(RowSet<Row> rows) {
        List<ComputerEntity> computers = new ArrayList<>();
        for (Row row : rows) {
            computers.add(mapRow(row));
        }
        return computers;
    }
}

