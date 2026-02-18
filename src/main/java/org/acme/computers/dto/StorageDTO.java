package org.acme.computers.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/**
 * DTO para Armazenamento (Storage)
 */
public class StorageDTO {

    @JsonProperty("dispositivos")
    private List<DispositivoArmazenamentoDTO> dispositivos;

    @JsonProperty("capacidade_total_gb")
    private Integer capacidadeTotalGb;

    public StorageDTO() {
    }

    public StorageDTO(List<DispositivoArmazenamentoDTO> dispositivos, Integer capacidadeTotalGb) {
        this.dispositivos = dispositivos;
        this.capacidadeTotalGb = capacidadeTotalGb;
    }

    // Getters and Setters
    public List<DispositivoArmazenamentoDTO> getDispositivos() {
        return dispositivos;
    }

    public void setDispositivos(List<DispositivoArmazenamentoDTO> dispositivos) {
        this.dispositivos = dispositivos;
    }

    public Integer getCapacidadeTotalGb() {
        return capacidadeTotalGb;
    }

    public void setCapacidadeTotalGb(Integer capacidadeTotalGb) {
        this.capacidadeTotalGb = capacidadeTotalGb;
    }

    /**
     * DTO interno para representar um dispositivo de armazenamento
     */
    public static class DispositivoArmazenamentoDTO {

        @JsonProperty("modelo")
        private String modelo;

        @JsonProperty("fabricante")
        private String fabricante;

        @JsonProperty("tipo")
        private String tipo; // SSD, HDD, NVMe

        @JsonProperty("capacidade_gb")
        private Integer capacidadeGb;

        @JsonProperty("interface")
        private String interfaceType; // SATA III, NVMe PCIe 4.0, NVMe PCIe 5.0

        @JsonProperty("velocidade_leitura_mbps")
        private Integer velocidadeLeituraMbps;

        @JsonProperty("velocidade_escrita_mbps")
        private Integer velocidadeEscritaMbps;

        public DispositivoArmazenamentoDTO() {
        }

        public DispositivoArmazenamentoDTO(String modelo, String fabricante, String tipo,
                                          Integer capacidadeGb, String interfaceType,
                                          Integer velocidadeLeituraMbps, Integer velocidadeEscritaMbps) {
            this.modelo = modelo;
            this.fabricante = fabricante;
            this.tipo = tipo;
            this.capacidadeGb = capacidadeGb;
            this.interfaceType = interfaceType;
            this.velocidadeLeituraMbps = velocidadeLeituraMbps;
            this.velocidadeEscritaMbps = velocidadeEscritaMbps;
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

        public String getTipo() {
            return tipo;
        }

        public void setTipo(String tipo) {
            this.tipo = tipo;
        }

        public Integer getCapacidadeGb() {
            return capacidadeGb;
        }

        public void setCapacidadeGb(Integer capacidadeGb) {
            this.capacidadeGb = capacidadeGb;
        }

        public String getInterfaceType() {
            return interfaceType;
        }

        public void setInterfaceType(String interfaceType) {
            this.interfaceType = interfaceType;
        }

        public Integer getVelocidadeLeituraMbps() {
            return velocidadeLeituraMbps;
        }

        public void setVelocidadeLeituraMbps(Integer velocidadeLeituraMbps) {
            this.velocidadeLeituraMbps = velocidadeLeituraMbps;
        }

        public Integer getVelocidadeEscritaMbps() {
            return velocidadeEscritaMbps;
        }

        public void setVelocidadeEscritaMbps(Integer velocidadeEscritaMbps) {
            this.velocidadeEscritaMbps = velocidadeEscritaMbps;
        }
    }
}

