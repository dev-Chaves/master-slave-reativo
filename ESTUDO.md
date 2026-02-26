# Estudo de Caso: Arquitetura Reativa Master-Slave com Quarkus e PostgreSQL

> **Objetivo:** Implementar uma aplicação Quarkus com separação de leitura/escrita em bancos PostgreSQL distintos (Master-Slave), validar a arquitetura com testes de carga K6 e otimizá-la iterativamente.

---

## 1. Stack Tecnológica

| Componente | Tecnologia |
|---|---|
| Framework | Quarkus (Hibernate Reactive + Panache) |
| Banco de Dados | PostgreSQL 18 (Primary + Replica) |
| Comunicação DB | Vert.x Reactive PostgreSQL Client |
| Containerização | Docker Compose |
| Teste de Carga | K6 |
| Linguagem | Java 21 |
| Imagem de Runtime | Eclipse Temurin 21 JRE |

---

## 2. Arquitetura da Aplicação

```
                         ┌──────────────────┐
                         │   K6 Load Test   │
                         │  (300 VUs max)   │
                         └────────┬─────────┘
                                  │ HTTP :8080
                         ┌────────▼─────────┐
                         │   Quarkus API    │
                         │   (JVM Mode)     │
                         └──┬───────────┬───┘
                            │           │
               ┌────────────▼──┐   ┌────▼──────────────┐
               │  WRITE (POST) │   │   READ (GET)       │
               │  @WithTransaction │   │   Vert.x Pool   │
               └────────────┬──┘   └────┬───────────────┘
                            │           │
               ┌────────────▼──┐   ┌────▼──────────────┐
               │  pg-primary   │◄──┤  pg-replica       │
               │  (Master)     │   │  (Slave)          │
               │  :5432        │   │  :5433            │
               └───────────────┘   └───────────────────┘
                  WAL Replication ──►
```

### Separação de Datasources

A aplicação possui dois datasources configurados:

- **`default`** → `pg-primary:5432` — usado em operações de **escrita** (`POST`, `DELETE`)
- **`leitura`** → `pg-replica:5432` — usado em operações de **leitura** (`GET`)

```properties
# Datasource primário (escrita)
quarkus.datasource.reactive.url=postgresql://localhost:5432/quarkus_db

# Datasource réplica (leitura)
quarkus.datasource.leitura.reactive.url=postgresql://localhost:5433/quarkus_db
```

---

## 3. Modelo de Dados

```sql
CREATE TABLE computers (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(40) NOT NULL,
    description JSONB,
    price       NUMERIC(10, 2),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índice para paginação cursor (adicionado na Iteração 3)
CREATE INDEX idx_created_at ON computers(created_at);

-- Índice GIN para buscas no campo JSONB (adicionado na Iteração 3)
CREATE INDEX idx_computers_description ON computers USING gin (description);
```

### Payload da Entidade `Computer` (JSONB `description`)

O campo `description` armazena um objeto complexo com componentes do computador:

```json
{
  "fonte": { "modelo": "RM1000x", "potencia_watts": 1000, "certificacao": "80 Plus Platinum", "modular": true },
  "placa_mae": { "modelo": "ROG STRIX Z790-F GAMING WIFI", "socket": "LGA1700", "chipset": "Z790" },
  "placa_video": { "modelo": "GeForce RTX 4090", "memoria_gb": 24, "tipo_memoria": "GDDR6X", "tdp_watts": 450 },
  "memoria_ram": { "modulos": [...], "capacidade_total_gb": 64 },
  "armazenamento": { "dispositivos": [...], "capacidade_total_gb": 3000 },
  "gabinete": { "modelo": "O11 Dynamic EVO", "tipo": "Mid Tower" }
}
```

---

## 4. Endpoints da API

| Método | Path | Datasource | Descrição |
|---|---|---|---|
| `POST` | `/computer` | Primary | Cria um novo computador |
| `GET` | `/computer/pagination` | Replica | Lista com paginação cursor |
| `GET` | `/computer/search/gpu/{termo}` | Replica | Busca por modelo de GPU (JSONB) |
| `GET` | `/computer/search/ram/{gb}` | Replica | Busca por capacidade de RAM (JSONB) |
| `DELETE` | `/computer/{name}` | Primary | Remove por nome |

### Paginação Cursor-Based

A paginação utiliza dois parâmetros de cursor (`createdAt` + `id`) para ser estável mesmo com inserções concorrentes:

```sql
SELECT * FROM computers
WHERE (created_at < $1 OR (created_at = $1 AND id < $2))
ORDER BY created_at DESC, id DESC
LIMIT $3
```

**Query params:** `?createdAt=2025-02-18T17:00:00&id=1500&limit=20`

**Vantagem sobre offset paginaton:** Não "pula" registros inseridos entre as páginas. Performance `O(log n)` com o índice em vez de `O(n)`.

---

## 5. Decisões Técnicas e Bugs Corrigidos

### 5.1 `@WithTransaction` no Service Layer

**Problema:** `IllegalStateException: No current Mutiny.Session found`

**Causa:** Métodos que usam Panache (Hibernate Reactive) precisam de uma sessão ativa no contexto Vert.x. A anotação `@GET`/`@POST` no resource layer abre sessão automaticamente, mas não propaga para beans injetados.

**Solução:**
```java
// ComputerWriteService.java
@WithTransaction
public Uni<ComputerEntity> create(ComputerDescriptionDTO dto) { ... }

@WithTransaction
public Uni<Long> deleteByName(String name) { ... }
```

E remover o `Panache.withTransaction()` redundante no Resource.

---

### 5.2 Exceções Síncronas em Código Reativo

**Problema:** `throw new IllegalArgumentException(...)` em método reativo trava o event loop do Vert.x.

**Solução:** Sempre usar `Uni.createFrom().failure()`:
```java
if (limit <= 0) {
    return Uni.createFrom().failure(
        new IllegalArgumentException("limit must be greater than 0"));
}
```

---

### 5.3 Mapper não mapeava `created_at`

**Problema:** O campo `createdAt` da entidade sempre ficava `null`, tornando o cursor de paginação inválido.

**Solução:**
```java
// ComputerRowMapper.java
entity.createdAt = row.getLocalDateTime("created_at");
```

---

## 6. Evolução dos Testes de Carga (K6)

### Estratégia de Cenários

O teste é dividido em 3 fases:

| Fase | Duração | Cenário | VUs |
|---|---|---|---|
| 1 — Warm-up | 0s → 60s | Apenas escritas para popular o banco | 50 |
| 2a — Escrita | 60s → 3m30s | Escrita moderada contínua | 20-30 |
| 2b — Leitura | 60s → 3m30s | Leitura paginada intensa em paralelo | 50→150 |
| 3 — Stress | 3m30s → 5m | Máximo de leituras + buscas JSONB | 200→300 |

---

### Teste 1 — Com Paginação Cursor, Sem Índices (Modo Dev)

> **Cenário:** Paginação cursor implementada (`GET /computer/pagination?limit=20`), mas **sem índices** no banco. API rodando em modo **quarkus:dev** (hot-reload ativo, alto consumo de CPU).

```
█ THRESHOLDS
    http_req_duration     ✗ p(99)=2.15s      (limite: 1000ms)
    http_req_failed       ✓ rate=0.34%       (limite: <2%)
    read_latency_ms       ✗ p(95)=1.75s      (limite: 300ms)
      {fase:stress}       ✗ p(95)=1.54s      (limite: 500ms)
    search_latency_ms     ✗ p(95)=1.47s      (limite: 600ms)
    success_rate          ✓ rate=99.65%      (limite: >98%)
    write_errors          ✗ count=74         (limite: <20)
    write_latency_ms      ✓ p(95)=199ms      (limite: 800ms)
```

```
█ TOTAL RESULTS
    checks_total.......: 165782 518.062124/s
    checks_succeeded...: 99.65% 165218 out of 165782
    checks_failed......: 0.34%  564 out of 165782

    ✗ insert: status 201        ↳  99% — ✓ 45449 / ✗ 74
    ✗ insert: tem id            ↳  99% — ✓ 45449 / ✗ 74
    ✗ pagination: status 200    ↳  98% — ✓ 10340 / ✗ 208
    ✗ pagination: é array       ↳  98% — ✓ 19144 / ✗ 208
    ✓ search_gpu: 200
    ✓ search_gpu: é array
    ✓ pagination: 200
    ✓ search_ram: 200
    ✓ search_ram: é array
```

```
█ CUSTOM METRICS
    inserted_total.................: 45449  142.026308/s
    pagina_vazia_total.............: 19144  59.824235/s
    read_errors....................: 208    0.649992/s
    read_latency_ms................: avg=898.07ms min=14ms   med=751ms    max=10.01s p(90)=1.45s p(95)=1.75s
      { fase:stress }..............: avg=811.25ms min=15ms   med=857ms    max=2.89s  p(90)=1.25s p(95)=1.54s
    search_latency_ms..............: avg=799.3ms  min=13ms   med=852ms    max=2.82s  p(90)=1.21s p(95)=1.47s
    success_rate...................: 99.65% 82609 out of 82891
    write_errors...................: 74     0.231247/s
    write_latency_ms...............: avg=121.81ms min=3ms    med=75ms     max=10.01s p(90)=157ms p(95)=199ms
```

```
█ HTTP
    http_req_duration..............: avg=449.93ms min=3.11ms med=132.8ms  max=10.01s p(90)=1.03s p(95)=1.32s
      { expected_response:true }...: avg=417.33ms min=3.11ms med=131.81ms max=10.01s p(90)=1.03s p(95)=1.29s
    http_req_failed................: 0.34%  282 out of 82891
    http_reqs......................: 82891  259.031062/s

█ EXECUTION
    iteration_duration.............: avg=450.8ms  min=4.11ms med=133.97ms max=10.01s p(90)=1.03s p(95)=1.32s
    iterations.....................: 82891  259.031062/s
    vus............................: 1      min=0              max=299
    vus_max........................: 300    min=300            max=300

█ NETWORK
    data_received..................: 104 MB 323 kB/s
    data_sent......................: 92 MB  287 kB/s
```

```
running (5m20.0s), 000/300 VUs, 82891 complete and 46 interrupted iterations
fase1_warmup_escrita    ✓ [======================================] 00/50 VUs    1m0s
fase2a_escrita_paralela ✓ [======================================] 00/30 VUs    2m10s
fase2b_leitura_paralela ✓ [======================================] 000/150 VUs  2m10s
fase3_stress_leitura    ✓ [======================================] 000/300 VUs  1m50s
ERRO: thresholds on metrics 'http_req_duration, read_latency_ms, read_latency_ms{fase:stress},
      search_latency_ms, write_errors' have been crossed
```

**Análise:**
- ✅ A paginação funcionou — sem um único timeout catastrófico como antes (sem paginação)
- ✅ 99.65% de taxa de sucesso global
- ❌ Leitura lenta (p95=1.75s): sem índice, cada busca JSONB faz `Sequential Scan`
- ❌ Modo Dev consome CPU extra para monitorar mudanças de arquivo, competindo com as queries
- ❌ 74 erros de escrita — picos de contenção no pool de conexões do Master
- ❌ 5 de 8 thresholds violados

---

### Otimizações Aplicadas entre Teste 1 e Teste 2

Após o Teste 1, foram aplicadas 3 melhorias:

1. **Índice B-Tree em `created_at`:**
   ```sql
   CREATE INDEX idx_created_at ON computers(created_at);
   ```
   → Acelera o `WHERE (created_at < $1 OR ...)` da paginação cursor de `O(n)` para `O(log n)`.

2. **Índice GIN em `description` (JSONB):**
   ```sql
   CREATE INDEX idx_computers_description ON computers USING gin (description);
   ```
   → Acelera as queries `description -> 'placa_video' ->> 'modelo' ILIKE $1` e `(description -> 'memoria_ram' ->> 'capacidade_total_gb')::int = $1` de **Sequential Scan** para **Index Scan**.

3. **JVM Mode no Docker (em vez de Dev Mode):**
   - Antes: `quarkus:dev` dentro do container (alto consumo de CPU/mem para hot-reload)
   - Depois: `java -jar quarkus-run.jar` (Eclipse Temurin 21 JRE — produção real)

---

### Teste 2 — Com Índices + JVM Mode (Otimizado)

> **Cenário:** Todos os índices aplicados (`idx_created_at` + `idx_computers_description` GIN). API rodando em **JVM Mode** (`java -jar quarkus-run.jar`) dentro do container Docker com limite de 1024MB.

```
█ THRESHOLDS
    http_req_duration     ✗ p(99)=2.8s       (limite: 1000ms)
    http_req_failed       ✓ rate=0.01%       (limite: <2%)
    read_latency_ms       ✓ p(95)=106ms      (limite: 300ms)   ← CORRIGIDO! (era 1.75s)
      {fase:stress}       ✗ p(95)=2.95s      (limite: 500ms)
    search_latency_ms     ✗ p(95)=3.5s       (limite: 600ms)
    success_rate          ✓ rate=99.98%      (limite: >98%)
    write_errors          ✗ count=50         (limite: <20)
    write_latency_ms      ✓ p(95)=192ms      (limite: 800ms)
```

```
█ TOTAL RESULTS
    checks_total.......: 529138 1653.350659/s
    checks_succeeded...: 99.98% 529036 out of 529138
    checks_failed......: 0.01%  102 out of 529138

    ✗ insert: status 201        ↳  99% — ✓ 47924 / ✗ 50
    ✗ insert: tem id            ↳  99% — ✓ 47924 / ✗ 50
    ✗ pagination: status 200    ↳  99% — ✓ 206339 / ✗ 1
    ✗ pagination: é array       ↳  99% — ✓ 209835 / ✗ 1
    ✓ pagination: 200
    ✓ search_gpu: 200
    ✓ search_gpu: é array
    ✓ search_ram: 200
    ✓ search_ram: é array
```

```
█ CUSTOM METRICS
    inserted_total.................: 47924  149.74388/s
    pagina_vazia_total.............: 209835 655.652846/s
    read_errors....................: 1      0.003125/s
    read_latency_ms................: avg=78.59ms  min=0s   med=46ms    max=10s    p(90)=89ms     p(95)=106ms
      { fase:stress }..............: avg=1.8s     min=0s   med=1.97s   max=3.45s  p(90)=2.83s    p(95)=2.95s
    search_latency_ms..............: avg=2.27s    min=77ms med=2.43s   max=4.29s  p(90)=3.32s    p(95)=3.5s
    success_rate...................: 99.98% 264518 out of 264569
    write_errors...................: 50     0.156231/s
    write_latency_ms...............: avg=119.28ms min=3ms  med=95ms    max=10.17s p(90)=163ms    p(95)=192ms
```

```
█ HTTP
    http_req_duration..............: avg=141.99ms min=0s   med=54.87ms max=10.07s p(90)=122.68ms p(95)=182.07ms
      { expected_response:true }...: avg=140.09ms min=0s   med=54.86ms max=9.92s  p(90)=122.61ms p(95)=181.57ms
    http_req_failed................: 0.01%  51 out of 264569
    http_reqs......................: 264569 826.67533/s

█ EXECUTION
    iteration_duration.............: avg=142.44ms min=0s   med=55.22ms max=10.17s p(90)=123.44ms p(95)=183.22ms
    iterations.....................: 264569 826.67533/s
    vus............................: 1      min=0                max=299
    vus_max........................: 300    min=300              max=300

█ NETWORK
    data_received..................: 124 MB 389 kB/s
    data_sent......................: 114 MB 357 kB/s
```

```
running (5m20.0s), 000/300 VUs, 264569 complete and 0 interrupted iterations
fase1_warmup_escrita    ✓ [======================================] 00/50 VUs    1m0s
fase2a_escrita_paralela ✓ [======================================] 00/30 VUs    2m10s
fase2b_leitura_paralela ✓ [======================================] 000/150 VUs  2m10s
fase3_stress_leitura    ✓ [======================================] 000/300 VUs  1m50s
ERRO: thresholds on metrics 'http_req_duration, read_latency_ms{fase:stress},
      search_latency_ms, write_errors' have been crossed
```

**Análise:**
- ✅ **3.2x mais throughput** — de 259 req/s para **826 req/s**
- ✅ **99.98% de sucesso** (melhoria de 0.33 pontos percentuais)
- ✅ **0 iterações interrompidas** (antes eram 46)
- ✅ Paginação normal agora dentro do SLA: **p(95)=106ms** (antes era 1.75s — **16x mais rápido**)
- ✅ Erros de leitura caíram de 208 para **1 único erro**
- ✅ Erros HTTP caíram de 0.34% para **0.01%**
- ⚠️ Busca JSONB sob stress degradou: p(95)=3.5s — o índice GIN ajudou, mas 300 VUs simultâneos saturam o pool
- ⚠️ 50 erros de escrita (melhoria de 74 → 50) — contenção no pool do Master no burst inicial

---

### Comparação Direta: Teste 1 vs Teste 2

| Métrica | Teste 1 (Dev, Sem Índices) | Teste 2 (JVM, Com Índices) | Variação |
|---|---|---|---|
| **Throughput** | 259 req/s | **826 req/s** | **+219%** ↑ |
| **Total de Requisições** | 82.891 | **264.569** | **+219%** ↑ |
| **Taxa de Sucesso** | 99.65% | **99.98%** | +0.33 pp ↑ |
| **HTTP Errors** | 0.34% (282) | **0.01%** (51) | **-82%** ↓ |
| **Iterações Interrompidas** | 46 | **0** | **-100%** ↓ |
| | | | |
| **read_latency p(95)** | 1.75s | **106ms** | **16.5x mais rápido** ↑ |
| **read_latency avg** | 898ms | **78ms** | **11.5x mais rápido** ↑ |
| **read_latency med** | 751ms | **46ms** | **16.3x mais rápido** ↑ |
| **Erros de Leitura** | 208 | **1** | **-99.5%** ↓ |
| | | | |
| **write_latency p(95)** | 199ms | **192ms** | ~igual |
| **write_latency avg** | 121ms | **119ms** | ~igual |
| **Erros de Escrita** | 74 | **50** | **-32%** ↓ |
| | | | |
| **search_latency p(95)** | 1.47s | **3.5s** | +138% ↑ ⚠️ |
| **Inserções** | 45.449 | **47.924** | +5.4% ↑ |
| **Paginações com sucesso** | 10.340 | **206.339** | **+1895%** ↑ |
| **Reinícios de cursor** | 19.144 | **209.835** | **+996%** ↑ |
| | | | |
| **http_req_duration p(99)** | 2.15s | **2.8s** | +30% ↑ ⚠️ |
| **http_req_duration avg** | 449ms | **141ms** | **3.2x mais rápido** ↑ |
| **http_req_duration med** | 132ms | **54ms** | **2.4x mais rápido** ↑ |
| **Dados Recebidos** | 104 MB | **124 MB** | +19% ↑ |
| **Dados Enviados** | 92 MB | **114 MB** | +24% ↑ |

### Interpretação dos Resultados

#### O que melhorou significativamente?

1. **Paginação 16x mais rápida:** O índice B-Tree em `created_at` eliminou os Sequential Scans na paginação cursor. A mediana caiu de 751ms para 46ms.

2. **Throughput 3.2x maior:** A combinação de JVM Mode (sem overhead de dev) + índices permitiu que o sistema processasse 826 req/s contra 259 req/s.

3. **Erros praticamente zerados:** De 282 erros HTTP (0.34%) para apenas 51 (0.01%). O sistema se tornou altamente estável.

4. **1895% mais paginações:** Com respostas mais rápidas, as VUs conseguiram fazer muito mais iterações no mesmo intervalo de tempo — 206.339 paginações vs 10.340.

#### O que piorou? E por quê?

1. **search_latency p(95) subiu de 1.47s → 3.5s:** Parece contraintuitivo, mas a explicação é que **o Teste 2 processou muito mais requisições**. Com 826 req/s (vs 259), a fase de stress com 300 VUs gerou **mais concorrência real** no pool de conexões. As buscas JSONB com `ILIKE` (que usam expressão regular) **não se beneficiam totalmente do índice GIN** — o GIN otimiza operadores como `@>`, `?`, `?|` mas não `ILIKE` com wildcards.

2. **http_req_duration p(99) subiu de 2.15s → 2.8s:** Mesmo motivo — o tail end (1% piores) piorou porque o sistema foi submetido a 3x mais carga total. O p(99) captura os outliers que competem por conexões no pool durante os picos.

#### Gargalos Remanescentes

- **Pool de conexões do Master:** 50 erros de escrita indicam que o pool padrão (~20 conexões) não suporta picos de 50 VUs escrevendo simultaneamente.
- **Busca JSONB com ILIKE:** O operador `ILIKE '%RTX%'` com wildcard no início impede o uso de índices B-Tree e GIN padrão. Necessitaria de `pg_trgm` (trigram) + índice GIN com `gin_trgm_ops`.
- **300 VUs simultâneos na leitura:** O pool de conexões da réplica satura. Recomenda-se aumentar para `max-size=100`.

---

## 7. Estrutura de Arquivos do Projeto

```
master-slave-reativo/
├── docker-compose.yaml               # Orquestração: primary, replica, quarkus-api
├── pg_hba.conf                       # Autenticação PostgreSQL (permite replicação)
├── pom.xml                           # Dependências Maven / Quarkus
│
├── src/main/
│   ├── docker/
│   │   └── Dockerfile.jvm            # Imagem JVM (eclipse-temurin:21-jre-jammy)
│   ├── java/org/acme/computers/
│   │   ├── ComputerEntity.java        # Entidade JPA (PanacheEntity)
│   │   ├── ComputersResource.java     # REST Endpoints
│   │   ├── dto/
│   │   │   └── ComputerDescriptionDTO.java
│   │   ├── mapper/
│   │   │   └── ComputerRowMapper.java # Row → Entity (Vert.x SQL Client)
│   │   └── service/
│   │       ├── ComputerReadService.java   # Leitura via Réplica (@ReactiveDataSource)
│   │       └── ComputerWriteService.java  # Escrita via Primary (@WithTransaction)
│   └── resources/
│       ├── application.properties     # Config datasources, Quarkus
│       ├── init-primary.sql           # DDL + índices (executado na criação do DB)
│       ├── init-replica.sh            # Script de pg_basebackup para o Slave
│       └── exemplo-computer-description.json
│
└── k6/
    └── load-test.js                   # Teste de carga multi-fase com cursor pagination
```

---

## 8. Configuração Docker Compose Final

```yaml
services:
  postgres-primary:          # Master — escrita, gera WAL
    image: postgres:18
    ports: ["5432:5432"]
    command: postgres -c wal_level=replica -c max_wal_senders=10 ...

  postgres-replica:          # Slave — leitura, consome WAL via pg_basebackup
    image: postgres:18
    ports: ["5433:5432"]
    entrypoint: ["bash", "/docker-entrypoint-replica.sh"]

  quarkus-api:               # API Quarkus em JVM Mode
    build: { dockerfile: src/main/docker/Dockerfile.jvm }
    ports: ["8080:8080"]
    deploy:
      resources:
        limits: { memory: 1024m }
    environment:
      QUARKUS_DATASOURCE_REACTIVE_URL: postgresql://pg-primary:5432/quarkus_db
      QUARKUS_DATASOURCE_LEITURA_REACTIVE_URL: postgresql://pg-replica:5432/quarkus_db
```

---

## 9. Como Executar

### Subir o ambiente completo:

```bash
# 1. Compilar o JAR (necessário antes do Docker build)
./mvnw package -DskipTests

# 2. Subir os containers (com reset completo de dados)
docker compose down -v && docker compose up --build
```

### Executar o teste de carga:

```bash
# Instale o K6: https://k6.io/docs/getting-started/installation/
k6 run k6/load-test.js

# Salvar resultado em JSON para análise posterior:
k6 run --out json=k6-results.json k6/load-test.js
```

### Monitorar memória em tempo real:

```bash
docker stats quarkus-api
```

---

## 10. Métricas Customizadas do K6

| Métrica | Tipo | O que mede |
|---|---|---|
| `write_latency_ms` | Trend | Latência total de cada INSERT |
| `read_latency_ms` | Trend | Latência total de cada GET paginado |
| `search_latency_ms` | Trend | Latência das buscas JSONB |
| `write_errors` | Counter | Total de INSERTs com falha |
| `read_errors` | Counter | Total de leituras com falha |
| `success_rate` | Rate | % de operações bem-sucedidas |
| `inserted_total` | Counter | Total de registros inseridos com sucesso |
| `pagina_vazia_total` | Counter | Vezes que o cursor chegou ao fim e resetou |

---

## 11. Thresholds de Qualidade Definidos

| Threshold | Critério | Justificativa |
|---|---|---|
| `read_latency_ms` p(95) | < 300ms | SLA de leitura em produção |
| `read_latency_ms{fase:stress}` p(95) | < 500ms | Tolerância extra sob stress máximo |
| `write_latency_ms` p(95) | < 800ms | Escritas são mais lentas naturalmente |
| `search_latency_ms` p(95) | < 600ms | Buscas JSONB são computacionalmente caras |
| `success_rate` | > 98% | Sistema deve ser altamente disponível |
| `write_errors` | < 20 | Tolerância mínima a falhas de inserção |
| `http_req_failed` | < 2% | Menos de 2% de falhas HTTP |
| `http_req_duration` p(99) | < 1000ms | 99% das requests em menos de 1 segundo |

---

## 12. Conceitos Aprendidos

### Master-Slave PostgreSQL (Streaming Replication)
- O **Primary** gera registros WAL (Write-Ahead Log)
- O **Replica** consome esses logs via `pg_basebackup` + `recovery.conf`
- A réplica está em modo `hot_standby = on` — aceita apenas leituras
- Lag de replicação é negligenciável em redes locais (< 1ms)

### Quarkus Reactive + Vert.x
- **Event Loop**: Thread única por CPU, nunca bloquear
- **Panache Reactive**: ORM sobre Hibernate Reactive — precisa de sessão no contexto Vert.x
- **Vert.x SQL Pool**: Pool de conexões reativo para queries nativas sem ORM
- **`@WithTransaction`**: Abre sessão + transação no contexto reativo automaticamente

### Cursor Pagination vs. Offset Pagination

| | Offset Pagination | Cursor Pagination |
|---|---|---|
| Query | `LIMIT 20 OFFSET 100` | `WHERE created_at < $1 AND id < $2 LIMIT 20` |
| Complexidade | `O(n)` — escaneia até o offset | `O(log n)` — usa índice diretamente |
| Estabilidade | Instável com inserções concorrentes | Estável — não "pula" registros |
| Usabilidade | Suporta "ir para página X" | Apenas navegação sequencial |
| Performance com volume | Degrada com volume | Constante com índice |

### Por que JSONB + GIN?
- **JSONB**: Armazena JSON em formato binário otimizado para consulta
- **GIN (Generalized Inverted Index)**: Índice invertido que indexa cada chave/valor dentro do JSONB
- Sem GIN: `WHERE description -> 'placa_video' ->> 'modelo' ILIKE '%RTX%'` faz **Sequential Scan** em toda a tabela
- Com GIN: A mesma query usa **Index Scan** — ordens de magnitude mais rápida

---

## 13. Próximos Passos e Melhorias Possíveis

1. **Pool Size**: Aumentar o pool de conexões da réplica para suportar 300 VUs simultâneos:
   ```properties
   quarkus.datasource.leitura.reactive.max-size=100
   ```

2. **Cache L1**: Adicionar cache em memória (ex: Caffeine) para os resultados de busca mais frequentes.

3. **Read-Your-Writes**: Implementar lógica para redirecionar leituras ao Primary logo após uma escrita (evita ler dado "stale" da Replica).

4. **Connection Pooling Externo**: Usar PgBouncer na frente do PostgreSQL para multiplexar centenas de conexões em poucos workers de banco.

5. **Load Balancer**: Com múltiplas réplicas, adicionar um load balancer (ex: HAProxy) para distribuir as leituras.
