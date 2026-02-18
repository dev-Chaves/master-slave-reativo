package org.acme.computers.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * DTO para Placa de Vídeo (Video Card/GPU)
 */
public class VideoCardDTO {

    @JsonProperty("modelo")
    private String modelo;

    @JsonProperty("fabricante")
    private String fabricante;

    @JsonProperty("chipset")
    private String chipset; // RTX 4090, RX 7900 XTX, etc.

    @JsonProperty("memoria_gb")
    private Integer memoriaGb;

    @JsonProperty("tipo_memoria")
    private String tipoMemoria; // GDDR6, GDDR6X

    @JsonProperty("clock_mhz")
    private Integer clockMhz;

    @JsonProperty("tdp_watts")
    private Integer tdpWatts;

    @JsonProperty("interface")
    private String interfaceType; // PCIe 4.0 x16, PCIe 5.0 x16

    public VideoCardDTO() {
    }

    public VideoCardDTO(String modelo, String fabricante, String chipset, Integer memoriaGb,
                        String tipoMemoria, Integer clockMhz, Integer tdpWatts, String interfaceType) {
        this.modelo = modelo;
        this.fabricante = fabricante;
        this.chipset = chipset;
        this.memoriaGb = memoriaGb;
        this.tipoMemoria = tipoMemoria;
        this.clockMhz = clockMhz;
        this.tdpWatts = tdpWatts;
        this.interfaceType = interfaceType;
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

    public String getChipset() {
        return chipset;
    }

    public void setChipset(String chipset) {
        this.chipset = chipset;
    }

    public Integer getMemoriaGb() {
        return memoriaGb;
    }

    public void setMemoriaGb(Integer memoriaGb) {
        this.memoriaGb = memoriaGb;
    }

    public String getTipoMemoria() {
        return tipoMemoria;
    }

    public void setTipoMemoria(String tipoMemoria) {
        this.tipoMemoria = tipoMemoria;
    }

    public Integer getClockMhz() {
        return clockMhz;
    }

    public void setClockMhz(Integer clockMhz) {
        this.clockMhz = clockMhz;
    }

    public Integer getTdpWatts() {
        return tdpWatts;
    }

    public void setTdpWatts(Integer tdpWatts) {
        this.tdpWatts = tdpWatts;
    }

    public String getInterfaceType() {
        return interfaceType;
    }

    public void setInterfaceType(String interfaceType) {
        this.interfaceType = interfaceType;
    }
}

