package org.acme.computers.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * DTO para Gabinete (Case)
 */
public class CaseDTO {

    @JsonProperty("modelo")
    private String modelo;

    @JsonProperty("fabricante")
    private String fabricante;

    @JsonProperty("tipo")
    private String tipo; // Full Tower, Mid Tower, Mini Tower, SFF

    @JsonProperty("cor")
    private String cor;

    @JsonProperty("material")
    private String material; // Aço, Alumínio, Vidro temperado

    @JsonProperty("tamanho_placa_mae_suportado")
    private String tamanhoPlacaMaeSuportado; // ATX, Micro-ATX, Mini-ITX

    @JsonProperty("slots_expansao")
    private Integer slotsExpansao;

    @JsonProperty("baias_35_polegadas")
    private Integer baias35Polegadas;

    @JsonProperty("baias_25_polegadas")
    private Integer baias25Polegadas;

    @JsonProperty("ventilacao")
    private VentilacaoDTO ventilacao;

    public CaseDTO() {
    }

    public CaseDTO(String modelo, String fabricante, String tipo, String cor, String material,
                   String tamanhoPlacaMaeSuportado, Integer slotsExpansao,
                   Integer baias35Polegadas, Integer baias25Polegadas, VentilacaoDTO ventilacao) {
        this.modelo = modelo;
        this.fabricante = fabricante;
        this.tipo = tipo;
        this.cor = cor;
        this.material = material;
        this.tamanhoPlacaMaeSuportado = tamanhoPlacaMaeSuportado;
        this.slotsExpansao = slotsExpansao;
        this.baias35Polegadas = baias35Polegadas;
        this.baias25Polegadas = baias25Polegadas;
        this.ventilacao = ventilacao;
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

    public String getCor() {
        return cor;
    }

    public void setCor(String cor) {
        this.cor = cor;
    }

    public String getMaterial() {
        return material;
    }

    public void setMaterial(String material) {
        this.material = material;
    }

    public String getTamanhoPlacaMaeSuportado() {
        return tamanhoPlacaMaeSuportado;
    }

    public void setTamanhoPlacaMaeSuportado(String tamanhoPlacaMaeSuportado) {
        this.tamanhoPlacaMaeSuportado = tamanhoPlacaMaeSuportado;
    }

    public Integer getSlotsExpansao() {
        return slotsExpansao;
    }

    public void setSlotsExpansao(Integer slotsExpansao) {
        this.slotsExpansao = slotsExpansao;
    }

    public Integer getBaias35Polegadas() {
        return baias35Polegadas;
    }

    public void setBaias35Polegadas(Integer baias35Polegadas) {
        this.baias35Polegadas = baias35Polegadas;
    }

    public Integer getBaias25Polegadas() {
        return baias25Polegadas;
    }

    public void setBaias25Polegadas(Integer baias25Polegadas) {
        this.baias25Polegadas = baias25Polegadas;
    }

    public VentilacaoDTO getVentilacao() {
        return ventilacao;
    }

    public void setVentilacao(VentilacaoDTO ventilacao) {
        this.ventilacao = ventilacao;
    }

    /**
     * DTO interno para ventilação do gabinete
     */
    public static class VentilacaoDTO {

        @JsonProperty("coolers_inclusos")
        private Integer coolersInclusos;

        @JsonProperty("suporte_radiador")
        private String suporteRadiador; // 120mm, 240mm, 360mm, etc.

        @JsonProperty("slots_ventilacao_frontal")
        private Integer slotsVentilacaoFrontal;

        @JsonProperty("slots_ventilacao_superior")
        private Integer slotsVentilacaoSuperior;

        @JsonProperty("slots_ventilacao_traseira")
        private Integer slotsVentilacaoTraseira;

        public VentilacaoDTO() {
        }

        public VentilacaoDTO(Integer coolersInclusos, String suporteRadiador,
                           Integer slotsVentilacaoFrontal, Integer slotsVentilacaoSuperior,
                           Integer slotsVentilacaoTraseira) {
            this.coolersInclusos = coolersInclusos;
            this.suporteRadiador = suporteRadiador;
            this.slotsVentilacaoFrontal = slotsVentilacaoFrontal;
            this.slotsVentilacaoSuperior = slotsVentilacaoSuperior;
            this.slotsVentilacaoTraseira = slotsVentilacaoTraseira;
        }

        // Getters and Setters
        public Integer getCoolersInclusos() {
            return coolersInclusos;
        }

        public void setCoolersInclusos(Integer coolersInclusos) {
            this.coolersInclusos = coolersInclusos;
        }

        public String getSuporteRadiador() {
            return suporteRadiador;
        }

        public void setSuporteRadiador(String suporteRadiador) {
            this.suporteRadiador = suporteRadiador;
        }

        public Integer getSlotsVentilacaoFrontal() {
            return slotsVentilacaoFrontal;
        }

        public void setSlotsVentilacaoFrontal(Integer slotsVentilacaoFrontal) {
            this.slotsVentilacaoFrontal = slotsVentilacaoFrontal;
        }

        public Integer getSlotsVentilacaoSuperior() {
            return slotsVentilacaoSuperior;
        }

        public void setSlotsVentilacaoSuperior(Integer slotsVentilacaoSuperior) {
            this.slotsVentilacaoSuperior = slotsVentilacaoSuperior;
        }

        public Integer getSlotsVentilacaoTraseira() {
            return slotsVentilacaoTraseira;
        }

        public void setSlotsVentilacaoTraseira(Integer slotsVentilacaoTraseira) {
            this.slotsVentilacaoTraseira = slotsVentilacaoTraseira;
        }
    }
}

