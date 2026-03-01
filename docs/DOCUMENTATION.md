# Documentação do Projeto: Master-Slave Reativo com Quarkus

## Visão Geral

Este projeto é uma aplicação REST reativa construída com **Quarkus** (versão 3.31.3), projetada para demonstrar o padrão de arquitetura de banco de dados **Master/Slave (Primary/Replica)** utilizando PostgreSQL. O objetivo principal do projeto é separar a carga de trabalho de leitura da de escrita para maximizar a performance e escalar sob condições de estresse.

A aplicação inclui também scripts de teste de carga (via **k6**) e um sistema de monitoramento interno **SSR (Scheduled Service Report)**.

---

## 🏗 Arquitetura

O sistema é construído sobre uma arquitetura reativa (Non-blocking I/O) composta pelos seguintes elementos principais:

1. **API Quarkus (Native/JVM)**: Serviço exposto na porta `8080`, construído sobre o ecossistema reativo do Quarkus (RESTEasy Reactive, Hibernate Reactive Panache, e Reactive PostgreSQL Client).
2. **Master DB (pg-primary)**: Banco de dados de escrita. Recebe todas as operações de mutação de dados (INSERT, UPDATE, DELETE).
3. **Slave DB (pg-replica)**: Banco de dados de leitura (Read Replica). É sincronizado com o Master através de replicação nativa do PostgreSQL e atende a todas as requisições de consulta (SELECT).

### Separação de Responsabilidades (CQS - Command Query Separation)

O design de serviços no nível da aplicação reflete diretamente a segregação do banco:

- **Escrita (`ComputerWriteService.java`)**:
  - Utiliza o `PanacheEntity` padrão e a anotação `@WithTransaction`.
  - Pela configuração padrão (`quarkus.datasource`), estas operações roteiam via _datasource_ primário.
  - Endpoints associados: `POST /computer`, `DELETE /computer/{name}`.

- **Leitura (`ComputerReadService.java`)**:
  - Utiliza injeção direta via `@ReactiveDataSource("leitura") Pool readClient`.
  - Executa _prepared queries_ cruas através do Vert.x SQL Client, evitando a sobrecarga de context do ORM na leitura para máxima performance.
  - O mapeamento dos dados relacionais e em formato JSONB para objetos é feito manualmente (`ComputerRowMapper.java`).
  - Endpoints associados: `GET /computer/pagination`, `GET /computer/search/gpu/{search}`, e `GET /computer/search/ram/{capacity}`.

---

## 🛠 Tecnologias e Configuração

### Stack Principal
- **Java 21**, compilado usando **Maven**.
- **Quarkus 3.31.3**: Framework Supersonic Subatomic Java.
- **REST**: `quarkus-rest-jackson` e `quarkus-rest`.
- **Persistência**: `quarkus-hibernate-reactive-panache` e `quarkus-reactive-pg-client`.
- **Monitoramento**: `quarkus-micrometer-registry-prometheus` e `quarkus-scheduler`.
- **Banco de Dados**: PostgreSQL 18.
- **Testes de Carga**: k6 (JavaScript).

### Configurações de Datasource (application.properties)

A aplicação gerencia múltiplos pools de conexões de forma assíncrona:

```properties
# Master (Escrita) - Datasource padrão
quarkus.datasource.reactive.url=postgresql://localhost:5432/quarkus_db
quarkus.datasource.reactive.max-size=10

# Slave (Leitura) - Datasource secundária nomeada "leitura"
quarkus.datasource.leitura.reactive.url=postgresql://localhost:5433/quarkus_db
quarkus.datasource.leitura.reactive.max-size=30
```
Nota-se que o banco de leitura foi configurado com um _max-size_ muito maior (30 conexões vs 10 no master), indicando o foco no escalonamento para leituras intensas.

---

## 🗄 Modelo de Dados (`ComputerEntity`)

O cadastro gira em torno da entidade `ComputerEntity`, a qual aproveita o suporte avançado de JSONB do PostgreSQL para lidar com atributos com esquema dinâmico ou profundamente aninhados (como especificações de placas-mãe, memória e GPU):

- `id`: Chave primária gerada (fornecida pelo PanacheEntity).
- `name`: String, campo obrigatório.
- `price`: BigDecimal.
- `description`: Armazenado no banco como tipo **jsonb**.
- `createdAt`: Timestamp de criação (mapeado para `created_at`).

---

## 📊 Monitoramento Interno: SSR (Scheduled Service Report)

O projeto conta com um módulo robusto de observabilidade nativa, o **SSR**, detalhado na documentação `docs/SSR.md`.

- **Mecânica:** A cada 30 segundos, a classe `MetricsCollectorJob` extrai métricas do Micrometer (taxa de leituras/escritas HTTP, conexões ativas nos pools principal e réplica, etc.) e as salva numa estrutura em memória circular (`MetricsStore`).
- **Dashboard:** Uma UI interativa está disponível no endpoint `/ssr`, renderizando gráficos (Chart.js) das últimas medições.
- **Objetivo:** Fornecer feedback visual em tempo real sobre como a carga de CPU e I/O de uma Request está se dividindo entre as threads reativas e os respectivos bancos (Master vs Slave).

---

## 🚀 Testes de Carga (k6)

O arquivo `k6/load-test.js` dita um cenário evolutivo para estressar a infraestrutura:
- **Fase 1 (Warm-up)**: Geração de dezenas de VUs puramente de escrita para alimentar o master de dados (~1min).
- **Fase 2 (Paralelo)**: Mix de escritas e leituras pesadas usando a estratégia de limite por cursor (Cursor-based pagination) atuando sobre o Slave.
- **Fase 3 (Stress)**: Chegando a picos de até 300 VUs fazendo buscas completas via dados textuais no conteúdo do `jsonb` do slave e paginação simultaneamente.

---

## ⚠️ Estado Atual e Próximos Passos (Conforme ROADMAP.md)

Pela análise do `ROADMAP.md` e do código atual, constata-se a arquitetura delineada e parcialmente implementada. A lógica da aplicação para gerenciar a segregação (`ComputerWriteService` e `ComputerReadService`) **já se encontra resolvida e devidamente implementada** no projeto. 

Pontos pendentes para a infraestrutura operar 100% conforme a especificação de replicação no Docker Compose:

1. **Docker Init Scripts**: Criar o script `init-primary.sql` e adequar a inicialização do container réplica para formalizar o elo de replicação do nível do Postgres.
2. **Atualização de Credenciais**: Equalizar variáveis de ambiente no container do Docker-Compose correspondendo à `application.properties` para garantir que os testes com Docker rodem perfeitamente.
