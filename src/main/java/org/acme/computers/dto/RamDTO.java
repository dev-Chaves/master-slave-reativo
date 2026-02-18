package org.acme.computers.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/**
 * DTO para Memória RAM
 */
public class RamDTO {

    @JsonProperty("modulos")
    private List<ModuloRamDTO> modulos;

    @JsonProperty("capacidade_total_gb")
    private Integer capacidadeTotalGb;

    public RamDTO() {
    }

    public RamDTO(List<ModuloRamDTO> modulos, Integer capacidadeTotalGb) {
        this.modulos = modulos;
        this.capacidadeTotalGb = capacidadeTotalGb;
    }

    // Getters and Setters
    public List<ModuloRamDTO> getModulos() {
        return modulos;
    }

    public void setModulos(List<ModuloRamDTO> modulos) {
        this.modulos = modulos;
    }

    public Integer getCapacidadeTotalGb() {
        return capacidadeTotalGb;
    }

    public void setCapacidadeTotalGb(Integer capacidadeTotalGb) {
        this.capacidadeTotalGb = capacidadeTotalGb;
    }

    /**
     * DTO interno para representar um módulo de RAM
     */
    public static class ModuloRamDTO {

        @JsonProperty("modelo")
        private String modelo;

        @JsonProperty("fabricante")
        private String fabricante;

        @JsonProperty("capacidade_gb")
        private Integer capacidadeGb;

        @JsonProperty("tipo")
        private String tipo; // DDR4, DDR5

        @JsonProperty("frequencia_mhz")
        private Integer frequenciaMhz;

        @JsonProperty("latencia")
        private String latencia; // CL16, CL18, etc.

        public ModuloRamDTO() {
        }

        public ModuloRamDTO(String modelo, String fabricante, Integer capacidadeGb,
                           String tipo, Integer frequenciaMhz, String latencia) {
            this.modelo = modelo;
            this.fabricante = fabricante;
            this.capacidadeGb = capacidadeGb;
            this.tipo = tipo;
            this.frequenciaMhz = frequenciaMhz;
            this.latencia = latencia;
        }

        // Getters and Setters
        public String getModelo() {
            return modelo;
        }

        public void setModelo(String modelo) {
            this.modelo = modelo;
        }

        public String getFabricante() {
            return fabricante;
        }

        public void setFabricante(String fabricante) {
            this.fabricante = fabricante;
        }

        public Integer getCapacidadeGb() {
            return capacidadeGb;
        }

        public void setCapacidadeGb(Integer capacidadeGb) {
            this.capacidadeGb = capacidadeGb;
        }

        public String getTipo() {
            return tipo;
        }

        public void setTipo(String tipo) {
            this.tipo = tipo;
        }

        public Integer getFrequenciaMhz() {
            return frequenciaMhz;
        }

        public void setFrequenciaMhz(Integer frequenciaMhz) {
            this.frequenciaMhz = frequenciaMhz;
        }

        public String getLatencia() {
            return latencia;
        }

        public void setLatencia(String latencia) {
            this.latencia = latencia;
        }
    }
}

