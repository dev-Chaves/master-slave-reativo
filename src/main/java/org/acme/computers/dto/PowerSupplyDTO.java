package org.acme.computers.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * DTO para Fonte de Alimentação (Power Supply)
 */
public class PowerSupplyDTO {

    @JsonProperty("modelo")
    private String modelo;

    @JsonProperty("potencia_watts")
    private Integer potenciaWatts;

    @JsonProperty("certificacao")
    private String certificacao; // 80 Plus Bronze, Silver, Gold, Platinum, Titanium

    @JsonProperty("modular")
    private Boolean modular;

    @JsonProperty("fabricante")
    private String fabricante;

    public PowerSupplyDTO() {
    }

    public PowerSupplyDTO(String modelo, Integer potenciaWatts, String certificacao, Boolean modular, String fabricante) {
        this.modelo = modelo;
        this.potenciaWatts = potenciaWatts;
        this.certificacao = certificacao;
        this.modular = modular;
        this.fabricante = fabricante;
    }

    // Getters and Setters
    public String getModelo() {
        return modelo;
    }

    public void setModelo(String modelo) {
        this.modelo = modelo;
    }

    public Integer getPotenciaWatts() {
        return potenciaWatts;
    }

    public void setPotenciaWatts(Integer potenciaWatts) {
        this.potenciaWatts = potenciaWatts;
    }

    public String getCertificacao() {
        return certificacao;
    }

    public void setCertificacao(String certificacao) {
        this.certificacao = certificacao;
    }

    public Boolean getModular() {
        return modular;
    }

    public void setModular(Boolean modular) {
        this.modular = modular;
    }

    public String getFabricante() {
        return fabricante;
    }

    public void setFabricante(String fabricante) {
        this.fabricante = fabricante;
    }
}

