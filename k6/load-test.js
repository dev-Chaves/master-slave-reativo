/**
 * Teste de Carga Pesado — master-slave-reativo
 * =============================================
 * Estratégia em 3 fases:
 *
 *  FASE 1 — Warm-up de Escrita (0s → 60s)
 *    Apenas INSERTs para popular o banco com volume real de dados.
 *    Sem leitura ainda — garante que a réplica tenha dados para servir.
 *
 *  FASE 2 — Paralelo Escrita + Leitura (60s → 3m30s)
 *    Escritas moderadas no master + leituras intensas na réplica em paralelo.
 *    Simula produção real: 20% escrita / 80% leitura.
 *
 *  FASE 3 — Stress de Leitura (3m30s → 5m)
 *    Apenas leituras com volume máximo de VUs para estressar a réplica.
 *    Inclui buscas JSONB complexas.
 *
 * Executar:
 *   k6 run k6/load-test.js
 *
 * Com saída para Grafana (k6 Cloud ou k6 OSS com output):
 *   k6 run --out json=k6-results.json k6/load-test.js
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Rate, Trend, Gauge } from "k6/metrics";
import { randomString, randomIntBetween } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";
const ENDPOINT = `${BASE_URL}/computer`;

// ─── Métricas customizadas ───────────────────────────────────────────────────

const writeLatency = new Trend("write_latency_ms", true);
const readLatency = new Trend("read_latency_ms", true);
const searchLatency = new Trend("search_latency_ms", true);
const writeErrors = new Counter("write_errors");
const readErrors = new Counter("read_errors");
const successRate = new Rate("success_rate");
const insertedCount = new Counter("inserted_total");

// ─── Cenários ────────────────────────────────────────────────────────────────

export const options = {
    scenarios: {

        /**
         * FASE 1 — Warm-up de escrita pura.
         * Popula o banco com dados reais antes de qualquer leitura.
         * 50 VUs por 60s = ~3.000–5.000 registros inseridos.
         */
        fase1_warmup_escrita: {
            executor: "ramping-vus",
            startVUs: 0,
            stages: [
                { duration: "10s", target: 50 },   // ramp up rápido
                { duration: "50s", target: 50 },   // escrita sustentada
            ],
            exec: "escrever",
            gracefulRampDown: "5s",
            tags: { fase: "warmup" },
        },

        /**
         * FASE 2a — Escrita moderada paralela (começa em 60s).
         * Mantém fluxo de inserção enquanto leituras sobem.
         */
        fase2a_escrita_paralela: {
            executor: "ramping-vus",
            startTime: "60s",
            startVUs: 0,
            stages: [
                { duration: "20s", target: 20 },
                { duration: "1m", target: 30 },
                { duration: "30s", target: 20 },
                { duration: "20s", target: 0 },
            ],
            exec: "escrever",
            gracefulRampDown: "5s",
            tags: { fase: "paralelo" },
        },

        /**
         * FASE 2b — Leitura intensa paralela (começa em 60s).
         * Lê tudo da réplica enquanto o master ainda recebe escritas.
         */
        fase2b_leitura_paralela: {
            executor: "ramping-vus",
            startTime: "60s",
            startVUs: 0,
            stages: [
                { duration: "20s", target: 50 },
                { duration: "1m", target: 100 },
                { duration: "30s", target: 150 },
                { duration: "20s", target: 0 },
            ],
            exec: "ler",
            gracefulRampDown: "5s",
            tags: { fase: "paralelo" },
        },

        /**
         * FASE 3 — Stress de leitura pura (começa em 3m30s).
         * Máximo de VUs lendo da réplica — inclui buscas JSONB pesadas.
         */
        fase3_stress_leitura: {
            executor: "ramping-vus",
            startTime: "210s",
            startVUs: 0,
            stages: [
                { duration: "20s", target: 200 },
                { duration: "1m", target: 300 },
                { duration: "30s", target: 0 },
            ],
            exec: "lerComBusca",
            gracefulRampDown: "10s",
            tags: { fase: "stress" },
        },
    },

    thresholds: {
        // Leitura: 95% < 300ms mesmo sob stress máximo
        "read_latency_ms": ["p(95)<300"],
        "read_latency_ms{fase:stress}": ["p(95)<500"],
        // Escrita: 95% < 800ms
        "write_latency_ms": ["p(95)<800"],
        // Busca JSONB: 95% < 600ms
        "search_latency_ms": ["p(95)<600"],
        // Taxa de sucesso geral > 98%
        "success_rate": ["rate>0.98"],
        // Erros de escrita: tolerância mínima
        "write_errors": ["count<20"],
        // HTTP: 99% das requisições com resposta
        "http_req_failed": ["rate<0.02"],
        // Latência geral HTTP p(99) < 1s
        "http_req_duration": ["p(99)<1000"],
    },
};

// ─── Geração de payload ───────────────────────────────────────────────────────

const GPU_MODELS = [
    "GeForce RTX 4090",
    "GeForce RTX 4080 SUPER",
    "GeForce RTX 4070 Ti GAMING X TRIO",
    "GeForce RTX 3090 Ti",
    "Radeon RX 7900 XTX",
    "Radeon RX 7800 XT",
    "GeForce RTX 3060 Ti",
    "Intel Arc A770",
];

const RAM_CONFIGS = [16, 32, 64, 128];
const STORAGE_SIZES = [512, 1000, 2000, 4000];
const FABRICANTES_CASE = ["Corsair", "NZXT", "Lian Li", "Fractal Design", "be quiet!"];
const SOCKETS = ["AM5", "AM4", "LGA1700", "LGA1851"];
const CHIPSETS = ["X670E", "B650", "Z790", "Z890", "B760"];

function gerarComputador() {
    const id = randomString(10);
    const ramGb = RAM_CONFIGS[randomIntBetween(0, RAM_CONFIGS.length - 1)];
    const gpu = GPU_MODELS[randomIntBetween(0, GPU_MODELS.length - 1)];
    const storage = STORAGE_SIZES[randomIntBetween(0, STORAGE_SIZES.length - 1)];
    const socket = SOCKETS[randomIntBetween(0, SOCKETS.length - 1)];
    const chipset = CHIPSETS[randomIntBetween(0, CHIPSETS.length - 1)];
    const caseB = FABRICANTES_CASE[randomIntBetween(0, FABRICANTES_CASE.length - 1)];

    return {
        name: `PC-${id}`,
        price: randomIntBetween(2500, 35000),

        fonte: {
            modelo: `RM${randomIntBetween(6, 12) * 100}x`,
            potencia_watts: randomIntBetween(550, 1200),
            certificacao: ["80 Plus Bronze", "80 Plus Gold", "80 Plus Platinum", "80 Plus Titanium"][randomIntBetween(0, 3)],
            modular: true,
            fabricante: ["Corsair", "Seasonic", "be quiet!", "EVGA"][randomIntBetween(0, 3)],
        },

        placa_mae: {
            modelo: `ROG STRIX ${chipset}-F GAMING WIFI`,
            fabricante: ["ASUS", "MSI", "Gigabyte", "ASRock"][randomIntBetween(0, 3)],
            socket: socket,
            chipset: chipset,
            formato: ["ATX", "Micro-ATX", "E-ATX"][randomIntBetween(0, 2)],
            slots_ram: 4,
            ram_max_gb: 256,
            slots_pcie: randomIntBetween(2, 4),
        },

        placa_video: {
            modelo: gpu,
            fabricante: ["MSI", "ASUS", "Gigabyte", "Sapphire", "PowerColor"][randomIntBetween(0, 4)],
            chipset: gpu,
            memoria_gb: randomIntBetween(8, 24),
            tipo_memoria: ["GDDR6", "GDDR6X", "GDDR7"][randomIntBetween(0, 2)],
            clock_mhz: randomIntBetween(2200, 2800),
            tdp_watts: randomIntBetween(150, 450),
            interface: "PCIe 4.0 x16",
        },

        memoria_ram: {
            modulos: [
                {
                    modelo: "Dominator Platinum RGB",
                    fabricante: "Corsair",
                    capacidade_gb: ramGb / 2,
                    tipo: ramGb >= 64 ? "DDR5" : "DDR4",
                    frequencia_mhz: ramGb >= 64 ? randomIntBetween(5600, 7200) : randomIntBetween(3200, 4800),
                    latencia: `CL${randomIntBetween(16, 40)}`,
                },
                {
                    modelo: "Dominator Platinum RGB",
                    fabricante: "Corsair",
                    capacidade_gb: ramGb / 2,
                    tipo: ramGb >= 64 ? "DDR5" : "DDR4",
                    frequencia_mhz: ramGb >= 64 ? randomIntBetween(5600, 7200) : randomIntBetween(3200, 4800),
                    latencia: `CL${randomIntBetween(16, 40)}`,
                },
            ],
            capacidade_total_gb: ramGb,
        },

        armazenamento: {
            dispositivos: [
                {
                    modelo: "990 PRO",
                    fabricante: "Samsung",
                    tipo: "NVMe",
                    capacidade_gb: storage,
                    interface: "NVMe PCIe 5.0",
                    velocidade_leitura_mbps: randomIntBetween(6000, 14000),
                    velocidade_escrita_mbps: randomIntBetween(4000, 12000),
                },
                {
                    modelo: "870 EVO",
                    fabricante: "Samsung",
                    tipo: "SSD",
                    capacidade_gb: storage * 2,
                    interface: "SATA III",
                    velocidade_leitura_mbps: 560,
                    velocidade_escrita_mbps: 530,
                },
            ],
            capacidade_total_gb: storage * 3,
        },

        gabinete: {
            modelo: "O11 Dynamic EVO",
            fabricante: caseB,
            tipo: "Mid Tower",
            cor: ["Preto", "Branco", "Cinza"][randomIntBetween(0, 2)],
            material: "Alumínio com painel de vidro temperado",
            tamanho_placa_mae_suportado: "E-ATX, ATX, Micro-ATX, Mini-ITX",
            slots_expansao: 8,
            baias_35_polegadas: 2,
            baias_25_polegadas: 4,
            ventilacao: {
                coolers_inclusos: 3,
                suporte_radiador: "360mm frontal, 360mm lateral, 240mm traseiro",
                slots_ventilacao_frontal: 3,
                slots_ventilacao_superior: 3,
                slots_ventilacao_traseira: 1,
            },
        },

        observacoes: `Build de alta performance para workloads de ${["gaming 4K", "criação de conteúdo", "machine learning", "streaming", "desenvolvimento"][randomIntBetween(0, 4)]}. ID: ${id}`,
    };
}

// ─── Cenário: Escrita (master) ────────────────────────────────────────────────

export function escrever() {
    const payload = JSON.stringify(gerarComputador());
    const headers = { "Content-Type": "application/json" };

    const start = Date.now();
    const res = http.post(ENDPOINT, payload, {
        headers,
        tags: { operacao: "insert" },
        timeout: "10s",
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
    if (ok) {
        insertedCount.add(1);
    } else {
        writeErrors.add(1);
    }

    // Sem sleep — máximo throughput de escrita
}

// ─── Cenário: Leitura simples (réplica) ──────────────────────────────────────

export function ler() {
    const start = Date.now();
    const res = http.get(ENDPOINT, {
        tags: { operacao: "select_all" },
        timeout: "10s",
    });
    readLatency.add(Date.now() - start);

    const ok = check(res, {
        "select: status 200": (r) => r.status === 200,
        "select: é array": (r) => {
            try { return Array.isArray(JSON.parse(r.body)); }
            catch (_) { return false; }
        },
        "select: tem dados": (r) => {
            try { return JSON.parse(r.body).length > 0; }
            catch (_) { return false; }
        },
    });

    successRate.add(ok);
    if (!ok) readErrors.add(1);

    // Sem sleep — máximo throughput de leitura
}

// ─── Cenário: Leitura com busca JSONB (réplica) ───────────────────────────────

const GPU_TERMOS = ["RTX", "RX", "GTX", "4090", "4080", "4070", "3090", "7900", "Arc"];
const RAM_VALORES = [16, 32, 64, 128];

export function lerComBusca() {
    // Alterna entre listagem completa e buscas JSONB
    const tipo = randomIntBetween(0, 2);

    if (tipo === 0) {
        // GET /computer — lista completa (maior volume de dados)
        group("select_all", () => {
            const start = Date.now();
            const res = http.get(ENDPOINT, {
                tags: { operacao: "select_all" },
                timeout: "15s",
            });
            readLatency.add(Date.now() - start);

            const ok = check(res, {
                "select_all: 200": (r) => r.status === 200,
                "select_all: é array": (r) => {
                    try { return Array.isArray(JSON.parse(r.body)); }
                    catch (_) { return false; }
                },
            });
            successRate.add(ok);
            if (!ok) readErrors.add(1);
        });

    } else if (tipo === 1) {
        // GET /computer/search/gpu/{termo} — busca JSONB por GPU
        group("search_gpu", () => {
            const termo = GPU_TERMOS[randomIntBetween(0, GPU_TERMOS.length - 1)];
            const start = Date.now();
            const res = http.get(`${ENDPOINT}/search/gpu/${termo}`, {
                tags: { operacao: "search_gpu" },
                timeout: "15s",
            });
            searchLatency.add(Date.now() - start);

            const ok = check(res, {
                "search_gpu: 200": (r) => r.status === 200,
                "search_gpu: é array": (r) => {
                    try { return Array.isArray(JSON.parse(r.body)); }
                    catch (_) { return false; }
                },
            });
            successRate.add(ok);
            if (!ok) readErrors.add(1);
        });

    } else {
        // GET /computer/search/ram/{capacidade} — busca JSONB por RAM
        group("search_ram", () => {
            const cap = RAM_VALORES[randomIntBetween(0, RAM_VALORES.length - 1)];
            const start = Date.now();
            const res = http.get(`${ENDPOINT}/search/ram/${cap}`, {
                tags: { operacao: "search_ram" },
                timeout: "15s",
            });
            searchLatency.add(Date.now() - start);

            const ok = check(res, {
                "search_ram: 200": (r) => r.status === 200,
                "search_ram: é array": (r) => {
                    try { return Array.isArray(JSON.parse(r.body)); }
                    catch (_) { return false; }
                },
            });
            successRate.add(ok);
            if (!ok) readErrors.add(1);
        });
    }

    // Sem sleep — máximo throughput
}
