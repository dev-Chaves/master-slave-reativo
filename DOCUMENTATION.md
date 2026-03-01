# Documentação do Projeto: Aplicação Reativa Quarkus com Master/Slave

## Visão Geral
Este projeto é uma aplicação backend reativa desenvolvida com o framework **Quarkus**. O principal objetivo arquitetural é demonstrar o uso de **CQRS** (Command Query Responsibility Segregation) em nível de banco de dados, utilizando replicação Master/Slave no PostgreSQL para separar as operações de escrita (Primary) e leitura (Replica). O projeto também inclui testes de carga com K6 e monitoramento de métricas com Prometheus.

## Stack Tecnológica
- **Linguagem**: Java 21
- **Framework Principal**: Quarkus 3.31.3
- **ORM**: Hibernate Reactive com Panache
- **Banco de Dados**: PostgreSQL (Cliente Reativo)
- **Web/REST**: RESTEasy Reactive com Jackson
- **Monitoramento**: Micrometer Registry Prometheus
- **Agendamento de Tarefas**: Quarkus Scheduler
- **Testes de Carga**: K6 (JavaScript)
- **Containerização**: Docker e Docker Compose

## Arquitetura de Banco de Dados
A infraestrutura do banco de dados (orquestrada via `docker-compose.yaml`) é composta por:
1. **Primary (Master)**: Responsável exclusivamente por operações de escrita (`INSERT`, `UPDATE`, `DELETE`).
2. **Replica (Slave)**: Responsável pelas operações de leitura (`SELECT`).
A aplicação Quarkus está configurada com dois datasources distintos para rotear as consultas de forma apropriada de acordo com o tipo de operação.

## Estrutura do Domínio e Endpoints REST

A principal entidade de domínio do projeto é `ComputerEntity`, a qual mapeia computadores contendo informações como nome, descrição estruturada em JSONB, preço e data de criação.

A API REST (`ComputersResource`) expõe os seguintes serviços (caminho base `/computer`):

### Operações de Escrita (Roteadas para o Banco Master)
- **POST `/`**: Cria um novo computador.
- **DELETE `/{name}`**: Remove um computador pelo nome.

### Operações de Leitura (Roteadas para a Réplica)
- **GET `/pagination`**: Lista computadores de forma paginada e ordenados pela data de criação decrescente. (Parâmetros: `createdAt`, `id`, `limit`).
- **GET `/search/gpu/{search}`**: Busca computadores com base no modelo da placa de vídeo (GPU).
- **GET `/search/ram/{capacity}`**: Busca computadores com base na capacidade de memória RAM.

## Fluxo de Serviços e Segregação
O projeto divide logicamente as operações em dois serviços:
- `ComputerWriteService`: Encarregado da persistência de dados. Utiliza o datasource primário e transações ativas.
- `ComputerReadService`: Encarregado das consultas. Utiliza o datasource de leitura (réplica), permitindo balanceamento de carga e melhoria na performance sob grande volume de requisições GET.

## Observabilidade e Testes
- **Monitoramento e Métricas**: O pacote `org.acme.monitoring` possui rotinas (`MetricsCollectorJob`, `MetricsStore`) e endpoints (`MetricsDashboardResource`) para extrair snapshots do estado da aplicação e expor métricas no padrão Prometheus.
- **Testes de Carga**: Scripts disponíveis no diretório `/k6` (`load-test.js`) permitem simular tráfego pesado e validar o comportamento e a estabilidade da aplicação com a arquitetura de replicação em funcionamento.

## Como Executar
1. Suba a infraestrutura de banco de dados utilizando Docker Compose:
   ```shell script
   docker-compose up -d postgres-primary postgres-replica
   ```
2. Para executar a API em modo de desenvolvimento:
   ```shell script
   ./mvnw quarkus:dev
   ```
3. O empacotamento da aplicação para produção ou compilação nativa está detalhado em `README.md`.
