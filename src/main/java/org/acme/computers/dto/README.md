# DTOs de Descrição de Computador

## Visão Geral

Este pacote contém DTOs (Data Transfer Objects) para representar a descrição completa de um computador, incluindo todos os seus componentes principais.

## Estrutura dos DTOs

### ComputerDescriptionDTO
DTO principal que agrega todos os componentes do computador.

**Campos:**
- `fonte` (PowerSupplyDTO): Fonte de alimentação
- `placa_mae` (MotherboardDTO): Placa mãe
- `placa_video` (VideoCardDTO): Placa de vídeo
- `memoria_ram` (RamDTO): Memória RAM
- `armazenamento` (StorageDTO): Armazenamento (SSDs/HDDs)
- `gabinete` (CaseDTO): Gabinete
- `observacoes` (String): Observações adicionais

### PowerSupplyDTO (Fonte de Alimentação)
**Campos:**
- `modelo`: Modelo da fonte
- `potencia_watts`: Potência em Watts
- `certificacao`: Certificação 80 Plus (Bronze, Silver, Gold, Platinum, Titanium)
- `modular`: Se a fonte é modular (true/false)
- `fabricante`: Fabricante da fonte

### MotherboardDTO (Placa Mãe)
**Campos:**
- `modelo`: Modelo da placa mãe
- `fabricante`: Fabricante
- `socket`: Tipo de socket (AM4, LGA1700, etc.)
- `chipset`: Chipset da placa
- `formato`: Formato (ATX, Micro-ATX, Mini-ITX)
- `slots_ram`: Número de slots de RAM
- `ram_max_gb`: Capacidade máxima de RAM em GB
- `slots_pcie`: Número de slots PCIe

### VideoCardDTO (Placa de Vídeo)
**Campos:**
- `modelo`: Modelo da placa de vídeo
- `fabricante`: Fabricante
- `chipset`: Chipset da GPU (RTX 4090, RX 7900 XTX, etc.)
- `memoria_gb`: Quantidade de memória em GB
- `tipo_memoria`: Tipo de memória (GDDR6, GDDR6X)
- `clock_mhz`: Clock em MHz
- `tdp_watts`: TDP em Watts
- `interface`: Interface (PCIe 4.0 x16, PCIe 5.0 x16)

### RamDTO (Memória RAM)
**Campos:**
- `modulos`: Lista de módulos de RAM (ModuloRamDTO[])
- `capacidade_total_gb`: Capacidade total em GB

**ModuloRamDTO:**
- `modelo`: Modelo do módulo
- `fabricante`: Fabricante
- `capacidade_gb`: Capacidade em GB
- `tipo`: Tipo (DDR4, DDR5)
- `frequencia_mhz`: Frequência em MHz
- `latencia`: Latência (CL16, CL18, etc.)

### StorageDTO (Armazenamento)
**Campos:**
- `dispositivos`: Lista de dispositivos (DispositivoArmazenamentoDTO[])
- `capacidade_total_gb`: Capacidade total em GB

**DispositivoArmazenamentoDTO:**
- `modelo`: Modelo do dispositivo
- `fabricante`: Fabricante
- `tipo`: Tipo (SSD, HDD, NVMe)
- `capacidade_gb`: Capacidade em GB
- `interface`: Interface (SATA III, NVMe PCIe 4.0, etc.)
- `velocidade_leitura_mbps`: Velocidade de leitura em MB/s
- `velocidade_escrita_mbps`: Velocidade de escrita em MB/s

### CaseDTO (Gabinete)
**Campos:**
- `modelo`: Modelo do gabinete
- `fabricante`: Fabricante
- `tipo`: Tipo (Full Tower, Mid Tower, Mini Tower, SFF)
- `cor`: Cor do gabinete
- `material`: Material de construção
- `tamanho_placa_mae_suportado`: Tamanhos suportados
- `slots_expansao`: Número de slots de expansão
- `baias_35_polegadas`: Número de baias de 3.5"
- `baias_25_polegadas`: Número de baias de 2.5"
- `ventilacao`: Informações de ventilação (VentilacaoDTO)

**VentilacaoDTO:**
- `coolers_inclusos`: Número de coolers inclusos
- `suporte_radiador`: Suporte para radiadores
- `slots_ventilacao_frontal`: Slots frontais
- `slots_ventilacao_superior`: Slots superiores
- `slots_ventilacao_traseira`: Slots traseiros

## Uso no Quarkus Reactive

Estes DTOs são compatíveis com Quarkus Reactive e podem ser usados com:
- `io.quarkus:quarkus-rest-jackson` para serialização/deserialização JSON
- Armazenamento no campo JSONB do PostgreSQL
- APIs RESTful reativas

## Exemplo de JSON

Veja o arquivo `exemplo-computer-description.json` em `src/main/resources/` para um exemplo completo de estrutura JSON.

## Integração com ComputerEntity

O `ComputerDescriptionDTO` pode ser serializado como JSON e armazenado no campo `description` (JSONB) da entidade `ComputerEntity`:

```java
@Column(columnDefinition = "jsonb")
private String description;
```

Para converter entre DTO e JSON:

```java
// Serializar DTO para JSON
ObjectMapper mapper = new ObjectMapper();
String json = mapper.writeValueAsString(computerDescriptionDTO);

// Deserializar JSON para DTO
ComputerDescriptionDTO dto = mapper.readValue(json, ComputerDescriptionDTO.class);
```

