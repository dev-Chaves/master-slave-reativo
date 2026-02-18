package org.acme.computers;

import io.quarkus.hibernate.reactive.panache.PanacheEntity;
import jakarta.persistence.*;

import java.math.BigDecimal;

@Entity
@Table(name = "computers")
public class ComputerEntity extends PanacheEntity {

    // Nota: 'id' já é fornecido por PanacheEntity — não redeclarar aqui.

    @Column(length = 40, nullable = false)
    public String name;

    @Column(columnDefinition = "jsonb")
    public String description;

    public BigDecimal price;

    public ComputerEntity() {
    }

    // PanacheEntity usa campos públicos por convenção.
    // Getters/setters são opcionais, mas mantidos para compatibilidade com o
    // WriteService.

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }
}
