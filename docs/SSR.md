# SSR — Scheduled Service Report

> **Monitoramento de métricas Master/Slave em tempo real com background job Quarkus**

---

## Visão Geral

O SSR _(Scheduled Service Report)_ é um serviço de monitoramento embutido na aplicação que coleta automaticamente, a cada **30 segundos**, métricas de:

- **Requisições HTTP** — separando leituras (GET) de escritas (POST / PUT / DELETE)
- **Pool de conexões reativas** — utilização e fila de espera do datasource **Master (primary)** e do **Slave (leitura)**

Os dados são expostos via um **dashboard HTML interativo** com gráficos Chart.js que atualizam automaticamente, sem necessidade de qualquer ferramenta externa.

---

## Arquitetura

```
┌──────────────────────────────────────────────────────────┐
│                   Quarkus Application                    │
│                                                          │
│  ┌─────────────────────┐   30s   ┌──────────────────┐   │
│  │  MetricsCollectorJob│ ──────► │   MetricsStore   │   │
│  │  @Scheduled(30s)    │         │  (deque, max 20) │   │
│  └────────┬────────────┘         └────────┬─────────┘   │
│           │                               │             │
│    MeterRegistry                   ┌──────▼──────────┐  │
│   ┌───────┴────────┐               │MetricsDashboard │  │
│   │ http.server    │               │Resource         │  │
│   │ .requests      │               │ GET /ssr        │  │
│   │ vertx.pool.*   │               │ GET /ssr/data   │  │
│   └────────────────┘               └─────────────────┘  │
│                                                          │
│  ┌─────────────┐        ┌──────────────────────────┐    │
│  │ pg-primary  │        │       pg-replica          │    │
│  │ :5432       │        │       :5433               │    │
│  │ (MASTER)    │        │       (SLAVE)             │    │
│  └─────────────┘        └──────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

---

## Estrutura de Arquivos

```
src/main/java/org/acme/monitoring/
├── MetricsSnapshot.java        # Model: record imutável de um snapshot
├── MetricsStore.java           # Storage: deque circular em memória
├── MetricsCollectorJob.java    # Scheduler: coleta a cada 30 segundos
└── MetricsDashboardResource.java # REST: dashboard HTML + endpoint JSON
```

---

## Classes

### `MetricsSnapshot`

```java
@RegisterForReflection
public record MetricsSnapshot(
    String timestamp,          // ISO-8601 (ex: 2026-02-27T22:00:00Z)
    double httpReads,          // Total de requests GET acumulado
    double httpWrites,         // Total de requests POST+PUT+DELETE acumulado
    double primaryPoolInUse,   // Conexões em uso no Master
    double primaryPoolPending, // Requisições em fila no Master
    double replicaPoolInUse,   // Conexões em uso no Slave
    double replicaPoolPending  // Requisições em fila no Slave
) { ... }
```

- `@RegisterForReflection` garante compatibilidade com **GraalVM native image**
- Instanciado via factory method `MetricsSnapshot.of(...)` que injeta o timestamp automaticamente

---

### `MetricsStore`

```java
@ApplicationScoped
public class MetricsStore {
    // Retém os últimos 20 snapshots (~ 10 minutos de histórico)
    private final ConcurrentLinkedDeque<MetricsSnapshot> snapshots;

    void addSnapshot(MetricsSnapshot snapshot) { ... }
    List<MetricsSnapshot> getAll() { ... }
}
```

- Thread-safe via `ConcurrentLinkedDeque`
- Janela deslizante: ao ultrapassar 20 entradas, o snapshot mais antigo é descartado

---

### `MetricsCollectorJob`

```java
@ApplicationScoped
public class MetricsCollectorJob {

    @Scheduled(every = "30s", identity = "ssr-metrics-collector")
    void collect() { ... }
}
```

**Fontes de métricas (Micrometer):**

| Métrica Micrometer | Tag | Dado coletado |
|---|---|---|
| `http.server.requests` | `method=GET` | Total de requisições de leitura |
| `http.server.requests` | `method=POST\|PUT\|DELETE` | Total de requisições de escrita |
| `vertx.pool.in.use` | _(default datasource)_ | Conexões ativas no Master |
| `vertx.pool.queue.size` | _(default datasource)_ | Fila de espera no Master |
| `vertx.pool.in.use` | `datasource=leitura` | Conexões ativas no Slave |
| `vertx.pool.queue.size` | `datasource=leitura` | Fila de espera no Slave |

> **Pré-requisitos no `application.properties`** (já configurados):
> ```properties
> quarkus.datasource.reactive.metrics.enabled=true
> quarkus.datasource.leitura.reactive.metrics.enabled=true
> quarkus.micrometer.binder.vertx.enabled=true
> ```

---

### `MetricsDashboardResource`

Dois endpoints expostos em `/ssr`:

| Método | Path | Content-Type | Descrição |
|---|---|---|---|
| `GET` | `/ssr` | `text/html` | Dashboard interativo com Chart.js |
| `GET` | `/ssr/data` | `application/json` | Lista de snapshots em JSON |

---

## Dashboard

Acesse **`http://localhost:8080/ssr`** com a aplicação rodando.

```
┌─────────────────────────────────────────────────────────────┐
│  SSR — Scheduled Service Report           [30s refresh]     │
│  Métricas do Master (primary) e Slave (leitura)             │
├────────────────────────┬────────────────────────────────────┤
│  🌐 HTTP Reads vs      │  🏊 Pool In Use                   │
│     Writes             │     Master vs Slave                │
│  [line chart]          │  [line chart]                      │
├────────────────────────┼────────────────────────────────────┤
│  ⏳ Pool Pending       │  Último snapshot (JSON)            │
│     Master vs Slave    │                                    │
│  [line chart]          │  { timestamp, httpReads, ... }    │
└────────────────────────┴────────────────────────────────────┘
```

- **Auto-refresh** via `setInterval` a cada 30 segundos (sincronizado com o job)
- Chart.js carregado via CDN (jsDelivr) — sem assets locais

---

## Endpoint `/ssr/data` — Exemplo de Resposta

```json
[
  {
    "timestamp": "2026-02-27T22:00:30Z",
    "httpReads": 142.0,
    "httpWrites": 38.0,
    "primaryPoolInUse": 2.0,
    "primaryPoolPending": 0.0,
    "replicaPoolInUse": 5.0,
    "replicaPoolPending": 0.0
  },
  {
    "timestamp": "2026-02-27T22:01:00Z",
    "httpReads": 156.0,
    "httpWrites": 41.0,
    "primaryPoolInUse": 1.0,
    "primaryPoolPending": 0.0,
    "replicaPoolInUse": 8.0,
    "replicaPoolPending": 1.0
  }
]
```

> Os valores de `httpReads` e `httpWrites` são **contadores acumulados** desde o início da aplicação (comportamento padrão do Micrometer). Para calcular a taxa no intervalo, subtraia snapshots consecutivos.

---

## Build

### JVM (desenvolvimento)

```bash
./mvnw quarkus:dev
# Dashboard disponível em: http://localhost:8080/ssr
```

### JVM (produção)

```bash
./mvnw package
java -jar target/quarkus-app/quarkus-run.jar
```

### Native Image (GraalVM)

```bash
./mvnw package -Pnative
./target/code-with-quarkus-1.0.0-SNAPSHOT-runner
```

> O perfil `native` já está configurado no `pom.xml`. A anotação `@RegisterForReflection` em `MetricsSnapshot` garante que o record seja acessível pelo serializador Jackson no binário nativo.

---

## Dependências Adicionadas

| Artefato | Motivo |
|---|---|
| `quarkus-scheduler` | Suporte à anotação `@Scheduled` e ao timer do background job |

> As demais dependências utilizadas (`quarkus-micrometer-registry-prometheus`, `quarkus-rest-jackson`, `quarkus-arc`) já estavam presentes no projeto.

---

## Logs

A cada execução do job, uma linha de log é emitida no nível `INFO`:

```
[SSR] snapshot coletado — HTTP reads=156 writes=41 | primary in-use=1 pending=0 | replica in-use=8 pending=1
```

Útil para auditoria e troubleshooting sem precisar abrir o dashboard.
