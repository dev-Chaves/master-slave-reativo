/**
 * Teste Exploratório — master-slave-reativo (3 minutos)
 * ======================================================
 * OBJETIVO: Encontrar NOVOS problemas que os testes anteriores não cobriram.
 *
 *  ÂNGULOS DE ATAQUE:
 *
 *   1. REPLICATION LAG (Read-Your-Writes)
 *      Insere no Master → lê imediatamente na Réplica.
 *      Mede quantas vezes o dado NÃO aparece (lag de replicação WAL).
 *      → Problema #3 do ESTUDO.md seção 13: "Read-Your-Writes"
 *
 *   2. SOAK — Detecção de Vazamento de Conexões
 *      Carga CONSTANTE e moderada durante 2.5 minutos.
 *      Se a latência cresce linearmente → vazamento de conexão ou memória.
 *      Métricas: latência a cada 30s para detectar degradação progressiva.
 *
 *   3. BURST-RECOVERY (Resiliência)
 *      Carga estável → SPIKE abrupto → volta ao normal.
 *      Mede se o sistema RECUPERA a latência pré-spike ou fica degradado.
 *
 *   4. CONTENÇÃO DE ESCRITA DUPLICADA
 *      Múltiplos VUs tentam criar computadores com nomes iguais.
 *      Testa tratamento de erro de constraint unique no Master.
 *
 *   5. PAGINAÇÃO PROFUNDA COM PÁGINAS GRANDES
 *      Páginas de 100 registros para forçar payloads pesados na réplica.
 *      Testa serialização JSON de grandes volumes.
 *
 * Executar:
 *   k6 run k6/exploratory-load-test.js
 *   k6 run --out json=k6-exploratory-results.json k6/exploratory-load-test.js
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Rate, Trend, Gauge } from "k6/metrics";
import { randomString, randomIntBetween } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";
const ENDPOINT = `${BASE_URL}/computer`;

// ─── Métricas customizadas ───────────────────────────────────────────────────

// -- Padrão
const writeLatency = new Trend("write_latency_ms", true);
const readLatency = new Trend("read_latency_ms", true);
const searchLatency = new Trend("search_latency_ms", true);
const writeErrors = new Counter("write_errors");
const readErrors = new Counter("read_errors");
const successRate = new Rate("success_rate");
const insertedCount = new Counter("inserted_total");
const paginaVazia = new Counter("pagina_vazia_total");

// -- NOVAS: Replication Lag
const replicationLagDetected = new Counter("replication_lag_detected");
const replicationLagRate = new Rate("replication_lag_rate");
const replicationCheckTotal = new Counter("replication_check_total");

// -- NOVAS: Consistência
const duplicateAttempts = new Counter("duplicate_insert_attempts");
const duplicateRejected = new Counter("duplicate_correctly_rejected");
const duplicateNotRejected = new Counter("duplicate_not_rejected");

// -- NOVAS: Burst Recovery
const burstLatency = new Trend("burst_phase_latency_ms", true);
const recoveryLatency = new Trend("recovery_phase_latency_ms", true);

// -- NOVAS: Soak / Degradação
const soakLatencyEarly = new Trend("soak_latency_early_ms", true);   // primeiros 30s
const soakLatencyMid = new Trend("soak_latency_mid_ms", true);     // meio do teste
const soakLatencyLate = new Trend("soak_latency_late_ms", true);    // final do teste

// ─── Cenários (3 minutos totais) ─────────────────────────────────────────────

export const options = {
    scenarios: {

        // ─────────────────────────────────────────────────────────────
        // CENÁRIO 1 — Warm-up (0s → 20s)
        // Popular o banco rapidamente para os demais cenários
        // ─────────────────────────────────────────────────────────────
        warmup: {
            executor: "ramping-vus",
            startVUs: 0,
            stages: [
                { duration: "5s", target: 80 },
                { duration: "15s", target: 80 },
            ],
            exec: "escrever",
            gracefulRampDown: "3s",
            tags: { fase: "warmup" },
        },

        // ─────────────────────────────────────────────────────────────
        // CENÁRIO 2 — Read-Your-Writes (20s → 1m20s)
        // Insere no Master → imediatamente busca na Réplica
        // Detecta replication lag do WAL streaming
        // ─────────────────────────────────────────────────────────────
        replication_lag_test: {
            executor: "constant-vus",
            vus: 30,
            duration: "60s",
            startTime: "20s",
            exec: "testarReplicationLag",
            gracefulStop: "5s",
            tags: { fase: "replication" },
        },

        // ─────────────────────────────────────────────────────────────
        // CENÁRIO 3 — Inserção Duplicada (20s → 1m)
        // Múltiplos VUs tentam inserir o MESMO nome
        // Testa constraint unique + tratamento de erro 409/500
        // ─────────────────────────────────────────────────────────────
        contencao_duplicada: {
            executor: "per-vu-iterations",
            vus: 20,
            iterations: 5,
            startTime: "20s",
            maxDuration: "40s",
            exec: "testarDuplicata",
            gracefulStop: "5s",
            tags: { fase: "contencao" },
        },

        // ─────────────────────────────────────────────────────────────
        // CENÁRIO 4 — Soak Constante (20s → 2m30s)
        // Carga CONSTANTE e moderada para detectar degradação
        // progressiva (vazamento de conexão, memória, GC pressure)
        // ─────────────────────────────────────────────────────────────
        soak_leitura: {
            executor: "constant-vus",
            vus: 60,
            duration: "130s",
            startTime: "20s",
            exec: "lerComTimestamp",
            gracefulStop: "5s",
            tags: { fase: "soak" },
        },

        soak_escrita: {
            executor: "constant-vus",
            vus: 15,
            duration: "130s",
            startTime: "20s",
            exec: "escrever",
            gracefulStop: "3s",
            tags: { fase: "soak" },
        },

        // ─────────────────────────────────────────────────────────────
        // CENÁRIO 5 — Burst + Recovery (1m30s → 2m30s)
        // Spike abrupto de 0→400 VUs em 5s, sustenta 15s,
        // depois ramp-down rápido para observar se o sistema
        // RECUPERA a latência normal ou fica degradado
        // ─────────────────────────────────────────────────────────────
        burst_recovery: {
            executor: "ramping-vus",
            startTime: "90s",
            startVUs: 0,
            stages: [
                { duration: "5s", target: 400 },  // SPIKE abrupto
                { duration: "15s", target: 400 },  // sustenta o pico
                { duration: "5s", target: 30 },   // ramp-down abrupto
                { duration: "35s", target: 30 },   // observa recuperação
            ],
            exec: "lerComBurstTag",
            gracefulRampDown: "5s",
            tags: { fase: "burst" },
        },

        // ─────────────────────────────────────────────────────────────
        // CENÁRIO 6 — Paginação com Payload Grande (30s → 2m)
        // Páginas de 100 registros para forçar serialização pesada
        // ─────────────────────────────────────────────────────────────
        paginacao_grande: {
            executor: "constant-vus",
            vus: 40,
            duration: "90s",
            startTime: "30s",
            exec: "lerPaginaGrande",
            gracefulStop: "5s",
            tags: { fase: "payload_grande" },
        },
    },

    thresholds: {
        // ─── Leitura ─────────────────────────────────────────────
        "read_latency_ms": ["p(95)<300"],
        "read_latency_ms{fase:soak}": ["p(95)<250"],

        // ─── Escrita ─────────────────────────────────────────────
        "write_latency_ms": ["p(95)<800"],

        // ─── Replication Lag ─────────────────────────────────────
        "replication_lag_rate": ["rate<0.10"],  // menos de 10% de lag

        // ─── Soak: Degradação progressiva ────────────────────────
        // Se late > 2x early → degradação detectada
        "soak_latency_late_ms": ["p(95)<500"],

        // ─── Burst Recovery ──────────────────────────────────────
        "recovery_phase_latency_ms": ["p(95)<400"],

        // ─── Qualidade global ────────────────────────────────────
        "success_rate": ["rate>0.95"],
        "write_errors": ["count<50"],
        "http_req_failed": ["rate<0.05"],
        "http_req_duration": ["p(99)<2000"],
    },
};

// ─── Cursor por VU ────────────────────────────────────────────────────────────

let cursor = null;

function buildPaginationUrl(cursorState, limit = 20) {
    if (cursorState === null) {
        return `${ENDPOINT}/pagination?limit=${limit}`;
    }
    const encoded = encodeURIComponent(cursorState.createdAt);
    return `${ENDPOINT}/pagination?createdAt=${encoded}&id=${cursorState.id}&limit=${limit}`;
}

function extractCursor(items) {
    if (!items || items.length === 0) return null;
    const last = items[items.length - 1];
    return { createdAt: last.createdAt, id: last.id };
}

// ─── Geração de payload ───────────────────────────────────────────────────────

const GPU_MODELS = [
    "GeForce RTX 4090", "GeForce RTX 4080 SUPER", "GeForce RTX 4070 Ti GAMING X TRIO",
    "GeForce RTX 3090 Ti", "Radeon RX 7900 XTX", "Radeon RX 7800 XT",
    "GeForce RTX 3060 Ti", "Intel Arc A770",
];

const RAM_CONFIGS = [16, 32, 64, 128];
const STORAGE = [512, 1000, 2000, 4000];
const SOCKETS = ["AM5", "AM4", "LGA1700", "LGA1851"];
const CHIPSETS = ["X670E", "B650", "Z790", "Z890", "B760"];

function gerarComputador(nomeOverride) {
    const id = randomString(10);
    const nome = nomeOverride || `PC-EXP-${id}`;
    const ramGb = RAM_CONFIGS[randomIntBetween(0, RAM_CONFIGS.length - 1)];
    const gpu = GPU_MODELS[randomIntBetween(0, GPU_MODELS.length - 1)];
    const stor = STORAGE[randomIntBetween(0, STORAGE.length - 1)];
    const socket = SOCKETS[randomIntBetween(0, SOCKETS.length - 1)];
    const chipset = CHIPSETS[randomIntBetween(0, CHIPSETS.length - 1)];

    return {
        name: nome,
        price: randomIntBetween(2500, 35000),
        fonte: {
            modelo: `RM${randomIntBetween(6, 12) * 100}x`,
            potencia_watts: randomIntBetween(550, 1200),
            certificacao: ["80 Plus Bronze", "80 Plus Gold", "80 Plus Platinum"][randomIntBetween(0, 2)],
            modular: true,
            fabricante: ["Corsair", "Seasonic", "be quiet!"][randomIntBetween(0, 2)],
        },
        placa_mae: {
            modelo: `ROG STRIX ${chipset}-F GAMING WIFI`,
            fabricante: ["ASUS", "MSI", "Gigabyte", "ASRock"][randomIntBetween(0, 3)],
            socket, chipset,
            formato: ["ATX", "Micro-ATX", "E-ATX"][randomIntBetween(0, 2)],
            slots_ram: 4, ram_max_gb: 256, slots_pcie: randomIntBetween(2, 4),
        },
        placa_video: {
            modelo: gpu,
            fabricante: ["MSI", "ASUS", "Gigabyte", "Sapphire"][randomIntBetween(0, 3)],
            chipset: gpu,
            memoria_gb: randomIntBetween(8, 24),
            tipo_memoria: ["GDDR6", "GDDR6X"][randomIntBetween(0, 1)],
            clock_mhz: randomIntBetween(2200, 2800),
            tdp_watts: randomIntBetween(150, 450),
            interface: "PCIe 4.0 x16",
        },
        memoria_ram: {
            modulos: [
                {
                    modelo: "Dominator Platinum RGB", fabricante: "Corsair", capacidade_gb: ramGb / 2,
                    tipo: ramGb >= 64 ? "DDR5" : "DDR4",
                    frequencia_mhz: ramGb >= 64 ? randomIntBetween(5600, 7200) : randomIntBetween(3200, 4800),
                    latencia: `CL${randomIntBetween(16, 40)}`
                },
                {
                    modelo: "Dominator Platinum RGB", fabricante: "Corsair", capacidade_gb: ramGb / 2,
                    tipo: ramGb >= 64 ? "DDR5" : "DDR4",
                    frequencia_mhz: ramGb >= 64 ? randomIntBetween(5600, 7200) : randomIntBetween(3200, 4800),
                    latencia: `CL${randomIntBetween(16, 40)}`
                },
            ],
            capacidade_total_gb: ramGb,
        },
        armazenamento: {
            dispositivos: [
                {
                    modelo: "990 PRO", fabricante: "Samsung", tipo: "NVMe", capacidade_gb: stor,
                    interface: "NVMe PCIe 5.0", velocidade_leitura_mbps: randomIntBetween(6000, 14000),
                    velocidade_escrita_mbps: randomIntBetween(4000, 12000)
                },
                {
                    modelo: "870 EVO", fabricante: "Samsung", tipo: "SSD", capacidade_gb: stor * 2,
                    interface: "SATA III", velocidade_leitura_mbps: 560, velocidade_escrita_mbps: 530
                },
            ],
            capacidade_total_gb: stor * 3,
        },
        gabinete: {
            modelo: "O11 Dynamic EVO",
            fabricante: ["Corsair", "NZXT", "Lian Li"][randomIntBetween(0, 2)],
            tipo: "Mid Tower",
            cor: ["Preto", "Branco"][randomIntBetween(0, 1)],
            material: "Alumínio com painel de vidro temperado",
            tamanho_placa_mae_suportado: "E-ATX, ATX, Micro-ATX, Mini-ITX",
            slots_expansao: 8, baias_35_polegadas: 2, baias_25_polegadas: 4,
            ventilacao: {
                coolers_inclusos: 3, suporte_radiador: "360mm frontal, 360mm lateral, 240mm traseiro",
                slots_ventilacao_frontal: 3, slots_ventilacao_superior: 3, slots_ventilacao_traseira: 1
            },
        },
        observacoes: `Build exploratório para teste de ${["replication lag", "soak testing", "burst recovery", "contention"][randomIntBetween(0, 3)]
            }. ID: ${id}`,
    };
}

// ─── Cenário: Escrita ─────────────────────────────────────────────────────────

export function escrever() {
    const payload = JSON.stringify(gerarComputador());
    const headers = { "Content-Type": "application/json" };

    const start = Date.now();
    const res = http.post(ENDPOINT, payload, {
        headers, tags: { operacao: "insert" }, timeout: "10s",
    });
    writeLatency.add(Date.now() - start);

    const ok = check(res, {
        "insert: status 201": (r) => r.status === 201,
        "insert: tem id": (r) => {
            try { return JSON.parse(r.body).id !== undefined; }
            catch (_) { return false; }
        },
    });

    successRate.add(ok);
    if (ok) { insertedCount.add(1); }
    else { writeErrors.add(1); }
}

// ═════════════════════════════════════════════════════════════════════════════
// CENÁRIO NOVO 1: Read-Your-Writes — Detecta Replication Lag
// ═════════════════════════════════════════════════════════════════════════════

export function testarReplicationLag() {
    const uniqueGpu = `LAGTEST-${randomString(8)}`;
    const comp = gerarComputador();
    // Usa um modelo de GPU único para buscar depois
    comp.placa_video.modelo = uniqueGpu;

    // 1) ESCREVE no Master
    const writeRes = http.post(ENDPOINT, JSON.stringify(comp), {
        headers: { "Content-Type": "application/json" },
        tags: { operacao: "repl_write" },
        timeout: "10s",
    });

    const writeOk = check(writeRes, {
        "repl_write: 201": (r) => r.status === 201,
    });

    if (!writeOk) {
        successRate.add(false);
        writeErrors.add(1);
        return;
    }
    insertedCount.add(1);

    // 2) Espera ZERO — lê imediatamente na Réplica (via search/gpu)
    //    Se o WAL ainda não propagou, o dado não aparece
    replicationCheckTotal.add(1);

    const readRes = http.get(`${ENDPOINT}/search/gpu/${encodeURIComponent(uniqueGpu)}`, {
        tags: { operacao: "repl_read_immediate" },
        timeout: "10s",
    });

    let found = false;
    check(readRes, {
        "repl_read: 200": (r) => r.status === 200,
        "repl_read: encontrou dado": (r) => {
            try {
                const arr = JSON.parse(r.body);
                found = Array.isArray(arr) && arr.length > 0;
                return found;
            } catch (_) { return false; }
        },
    });

    if (!found) {
        replicationLagDetected.add(1);
        replicationLagRate.add(1); // lag detectado

        // 3) Espera 50ms e tenta de novo (mede o lag real)
        sleep(0.05);
        const retryRes = http.get(`${ENDPOINT}/search/gpu/${encodeURIComponent(uniqueGpu)}`, {
            tags: { operacao: "repl_read_retry" },
            timeout: "10s",
        });

        let foundRetry = false;
        check(retryRes, {
            "repl_retry: encontrou após 50ms": (r) => {
                try {
                    const arr = JSON.parse(r.body);
                    foundRetry = Array.isArray(arr) && arr.length > 0;
                    return foundRetry;
                } catch (_) { return false; }
            },
        });

        if (!foundRetry) {
            // Lag > 50ms — preocupante
            sleep(0.2);
            http.get(`${ENDPOINT}/search/gpu/${encodeURIComponent(uniqueGpu)}`, {
                tags: { operacao: "repl_read_retry_200ms" },
                timeout: "10s",
            });
        }
    } else {
        replicationLagRate.add(0); // sem lag
    }

    successRate.add(true);
}

// ═════════════════════════════════════════════════════════════════════════════
// CENÁRIO NOVO 2: Inserção Duplicada — Teste de Constraint
// ═════════════════════════════════════════════════════════════════════════════

const NOMES_DUPLICADOS = Array.from({ length: 10 }, (_, i) => `PC-DUP-TESTE-${i}`);

export function testarDuplicata() {
    const nome = NOMES_DUPLICADOS[randomIntBetween(0, NOMES_DUPLICADOS.length - 1)];
    const comp = gerarComputador(nome);
    const payload = JSON.stringify(comp);

    duplicateAttempts.add(1);

    const res = http.post(ENDPOINT, payload, {
        headers: { "Content-Type": "application/json" },
        tags: { operacao: "duplicate_insert" },
        timeout: "10s",
    });

    // Primeira inserção: 201. Duplicatas: deveria ser 409 ou 500
    if (res.status === 201) {
        // Pode ser a primeira vez — ok
        successRate.add(true);
        insertedCount.add(1);
    } else if (res.status === 409 || res.status === 500 || res.status === 422) {
        // Rejeitado corretamente pela constraint unique
        duplicateRejected.add(1);
        successRate.add(true);
    } else {
        // Resposta inesperada
        duplicateNotRejected.add(1);
        successRate.add(false);
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// CENÁRIO NOVO 3: Soak com Timestamp — Detecta Degradação Progressiva
// ═════════════════════════════════════════════════════════════════════════════

export function lerComTimestamp() {
    const url = buildPaginationUrl(cursor, 20);

    const start = Date.now();
    const res = http.get(url, {
        tags: { operacao: "soak_pagination" },
        timeout: "10s",
    });
    const elapsed = Date.now() - start;
    readLatency.add(elapsed);

    // Classifica a latência por fase temporal do soak
    // cenário soak_leitura começa em 20s, dura 130s → 20s-150s
    const testElapsed = Date.now() / 1000; // não importa o valor absoluto, usamos VU iteration
    const vuIter = __ITER; // iteração do VU (0-indexed)

    // Usa a iteração como proxy de tempo:
    // primeiras iterações = early, meio = mid, final = late
    if (vuIter < 100) {
        soakLatencyEarly.add(elapsed);
    } else if (vuIter < 300) {
        soakLatencyMid.add(elapsed);
    } else {
        soakLatencyLate.add(elapsed);
    }

    let items = null;
    const ok = check(res, {
        "soak: status 200": (r) => r.status === 200,
        "soak: é array": (r) => {
            try { items = JSON.parse(r.body); return Array.isArray(items); }
            catch (_) { return false; }
        },
    });

    successRate.add(ok);
    if (ok && items !== null) {
        if (items.length === 0) {
            paginaVazia.add(1);
            cursor = null;
        } else {
            cursor = extractCursor(items);
        }
    } else {
        readErrors.add(1);
        cursor = null;
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// CENÁRIO NOVO 4: Burst + Recovery — Testa Resiliência Pós-Spike
// ═════════════════════════════════════════════════════════════════════════════

export function lerComBurstTag() {
    const url = buildPaginationUrl(cursor, 30);

    const start = Date.now();
    const res = http.get(url, {
        tags: { operacao: "burst_pagination" },
        timeout: "15s",
    });
    const elapsed = Date.now() - start;
    readLatency.add(elapsed);

    // Classifica: burst (primeiras iterações com 400 VUs) vs recovery (depois do ramp-down)
    // cenário começa em 90s: spike 0→400 em 5s, sustenta 15s, ramp-down 5s, recovery 35s
    // Total: 60s do cenário. Spike: iter 0-20s, Recovery: iter 25-60s
    if (__ITER < 30) {
        burstLatency.add(elapsed);
    } else {
        recoveryLatency.add(elapsed);
    }

    let items = null;
    const ok = check(res, {
        "burst: status 200": (r) => r.status === 200,
        "burst: é array": (r) => {
            try { items = JSON.parse(r.body); return Array.isArray(items); }
            catch (_) { return false; }
        },
    });

    successRate.add(ok);
    if (ok && items !== null) {
        cursor = items.length === 0 ? null : extractCursor(items);
        if (items.length === 0) paginaVazia.add(1);
    } else {
        readErrors.add(1);
        cursor = null;
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// CENÁRIO NOVO 5: Paginação com Payload Grande (100 registros por página)
// ═════════════════════════════════════════════════════════════════════════════

let cursorGrande = null;

export function lerPaginaGrande() {
    const url = buildPaginationUrl(cursorGrande, 100); // 5x o PAGE_SIZE normal

    const start = Date.now();
    const res = http.get(url, {
        tags: { operacao: "pagination_grande" },
        timeout: "15s",
    });
    const elapsed = Date.now() - start;
    readLatency.add(elapsed);

    let items = null;
    const ok = check(res, {
        "pag_grande: status 200": (r) => r.status === 200,
        "pag_grande: é array": (r) => {
            try { items = JSON.parse(r.body); return Array.isArray(items); }
            catch (_) { return false; }
        },
        "pag_grande: payload > 10KB": (r) => {
            return r.body && r.body.length > 10000;
        },
    });

    successRate.add(ok);
    if (ok && items !== null) {
        if (items.length === 0) {
            paginaVazia.add(1);
            cursorGrande = null;
        } else {
            cursorGrande = extractCursor(items);
        }
    } else {
        readErrors.add(1);
        cursorGrande = null;
    }
}
