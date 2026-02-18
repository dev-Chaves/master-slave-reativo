package org.acme.computers.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * DTO para Placa Mãe (Motherboard)
 */
public class MotherboardDTO {

    @JsonProperty("modelo")
    private String modelo;

    @JsonProperty("fabricante")
    private String fabricante;

    @JsonProperty("socket")
    private String socket; // AM4, LGA1700, etc.

    @JsonProperty("chipset")
    private String chipset;

    @JsonProperty("formato")
    private String formato; // ATX, Micro-ATX, Mini-ITX

    @JsonProperty("slots_ram")
    private Integer slotsRam;

    @JsonProperty("ram_max_gb")
    private Integer ramMaxGb;

    @JsonProperty("slots_pcie")
    private Integer slotsPcie;

    public MotherboardDTO() {
    }

    public MotherboardDTO(String modelo, String fabricante, String socket, String chipset,
                          String formato, Integer slotsRam, Integer ramMaxGb, Integer slotsPcie) {
        this.modelo = modelo;
        this.fabricante = fabricante;
        this.socket = socket;
        this.chipset = chipset;
        this.formato = formato;
        this.slotsRam = slotsRam;
        this.ramMaxGb = ramMaxGb;
        this.slotsPcie = slotsPcie;
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

    public String getSocket() {
        return socket;
    }

    public void setSocket(String socket) {
        this.socket = socket;
    }

    public String getChipset() {
        return chipset;
    }

    public void setChipset(String chipset) {
        this.chipset = chipset;
    }

    public String getFormato() {
        return formato;
    }

    public void setFormato(String formato) {
        this.formato = formato;
    }

    public Integer getSlotsRam() {
        return slotsRam;
    }

    public void setSlotsRam(Integer slotsRam) {
        this.slotsRam = slotsRam;
    }

    public Integer getRamMaxGb() {
        return ramMaxGb;
    }

    public void setRamMaxGb(Integer ramMaxGb) {
        this.ramMaxGb = ramMaxGb;
    }

    public Integer getSlotsPcie() {
        return slotsPcie;
    }

    public void setSlotsPcie(Integer slotsPcie) {
        this.slotsPcie = slotsPcie;
    }
}

