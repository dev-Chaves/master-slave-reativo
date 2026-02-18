package org.acme.computers.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;

/**
 * DTO principal que representa a descrição completa de um computador
 * Contém todos os componentes: fonte, placa mãe, placa de vídeo, RAM, armazenamento e gabinete
 */
public class ComputerDescriptionDTO {

    private String name;

    private BigDecimal price;

    @JsonProperty("fonte")
    private PowerSupplyDTO fonte;

    @JsonProperty("placa_mae")
    private MotherboardDTO placaMae;

    @JsonProperty("placa_video")
    private VideoCardDTO placaVideo;

    @JsonProperty("memoria_ram")
    private RamDTO memoriaRam;

    @JsonProperty("armazenamento")
    private StorageDTO armazenamento;

    @JsonProperty("gabinete")
    private CaseDTO gabinete;

    @JsonProperty("observacoes")
    private String observacoes;

    public ComputerDescriptionDTO() {
    }

    public ComputerDescriptionDTO(PowerSupplyDTO fonte, MotherboardDTO placaMae,
                                 VideoCardDTO placaVideo, RamDTO memoriaRam,
                                 StorageDTO armazenamento, CaseDTO gabinete,
                                 String observacoes) {
        this.fonte = fonte;
        this.placaMae = placaMae;
        this.placaVideo = placaVideo;
        this.memoriaRam = memoriaRam;
        this.armazenamento = armazenamento;
        this.gabinete = gabinete;
        this.observacoes = observacoes;
    }

    // Getters and Setters


    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }

    public PowerSupplyDTO getFonte() {
        return fonte;
    }

    public void setFonte(PowerSupplyDTO fonte) {
        this.fonte = fonte;
    }

    public MotherboardDTO getPlacaMae() {
        return placaMae;
    }

    public void setPlacaMae(MotherboardDTO placaMae) {
        this.placaMae = placaMae;
    }

    public VideoCardDTO getPlacaVideo() {
        return placaVideo;
    }

    public void setPlacaVideo(VideoCardDTO placaVideo) {
        this.placaVideo = placaVideo;
    }

    public RamDTO getMemoriaRam() {
        return memoriaRam;
    }

    public void setMemoriaRam(RamDTO memoriaRam) {
        this.memoriaRam = memoriaRam;
    }

    public StorageDTO getArmazenamento() {
        return armazenamento;
    }

    public void setArmazenamento(StorageDTO armazenamento) {
        this.armazenamento = armazenamento;
    }

    public CaseDTO getGabinete() {
        return gabinete;
    }

    public void setGabinete(CaseDTO gabinete) {
        this.gabinete = gabinete;
    }

    public String getObservacoes() {
        return observacoes;
    }

    public void setObservacoes(String observacoes) {
        this.observacoes = observacoes;
    }
}

