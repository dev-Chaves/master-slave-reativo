# Roadmap: Aplicação Reativa Quarkus com Master/Slave e Teste de Carga

Este documento descreve o que falta no repositório atual para que o objetivo do projeto seja alcançado.

## 1. Infraestrutura (Banco de Dados e Replicação)

Atualmente o `docker-compose.yaml` define o Primary (Master) e Replica (Slave), mas há alguns problemas críticos:

- [ ] **Criar `init-primary.sql`**: O arquivo de inicialização do banco primário não existe. Ele é necessário para criar o usuário de replicação e o `replication_slot`.
- [ ] **Corrigir Credenciais**: O arquivo `src/main/resources/application.properties` está usando `password`, enquanto o `docker-compose.yaml` define `quarkus_password`.
- [ ] **Configurar Replicação**: O comando de inicialização da réplica no `docker-compose.yaml` tenta fazer o `pg_basebackup`, mas precisa que o usuário de replicação esteja devidamente configurado e o arquivo de autenticação (`pg_hba.conf`) do primário permita a conexão.

## 2. Configuração do Quarkus (Hibernate Reactive Master/Slave)

O Quarkus Hibernate Reactive, por padrão, utiliza apenas uma `datasource`. Para suportar Master/Slave, você tem dois caminhos principais:

- [ ] **Múltiplos Persistence Units**: No Quarkus 3.x, você precisaria definir duas Persistence Units. Uma mapeada para a `datasource` padrão (Master - Escrita) e outra para a `datasource` de leitura (Slave). O Panache teria que ser configurado para usar uma ou outra dependendo da operação.
- [ ] **Encaminhamento no Service**: Como as entidades Panache geralmente usam a Persistence Unit padrão, você precisará de uma lógica para injetar diferentes instâncias de `Mutiny.SessionFactory` ou gerenciar a conexão manualmente para as queries de leitura (`SELECT`).

## 3. Lógica da Aplicação (ComputerService / ComputerResource)

O código atual sempre utiliza o Panache padrão, que aponta para a `datasource` Master:

- [ ] **Implementar Queries de Leitura na Réplica**: Alterar o `ComputerService.get()` para utilizar a `datasource` de leitura (`leitura`).
- [ ] **Manter Escritas no Master**: Garantir que as operações de `persist`, `update` e `delete` continuem indo para o Master (como o `@POST` já faz ao usar `Panache.withTransaction`).

## 4. Teste de Carga

Falta uma ferramenta para realizar o teste de carga e scripts que simulem o uso real:

- [ ] **Escolha de Ferramenta**: Recomendo usar **K6** (em JavaScript) ou **Gatling** (Java/Kotlin/Scala) por serem fáceis de integrar e performarem bem em testes reativos.
- [ ] **Criação do Script de Teste**: Um script que realize simultaneamente `POST` (escrita no Master) e `GET` (leitura no Slave) para verificar a consistência e o balanceamento da carga.

## 5. Observabilidade (Monitoramento)

Para validar o benefício de ter um banco de leitura, você precisa ver os dados:

- [ ] **Adicionar Monitoramento**: Incluir Prometheus e Grafana no `docker-compose.yaml` para monitorar métricas de CPU, memória e, principalmente, o uso das conexões nos dois bancos de dados durante o teste de carga.
- [ ] **Habilitar Métricas do Quarkus**: Adicionar a extensão `quarkus-micrometer-registry-prometheus` ao `pom.xml`.

---

### Próximos Passos Sugeridos:

1. Criar o `init-primary.sql` para habilitar a replicação.
2. Corrigir as credenciais em `application.properties`.
3. Ajustar o `ComputerService` para rotear as consultas de leitura para a réplica.
4. Definir e implementar o script de teste de carga (K6).
