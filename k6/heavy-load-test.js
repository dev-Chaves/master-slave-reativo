/**
 * Teste de Carga PESADO — master-slave-reativo (3 minutos)
 * =========================================================
 * Baseado nos gargalos identificados no ESTUDO.md:
 *
 *  PROBLEMAS ALVO:
 *   1. Pool de conexões do Master: 50 erros de escrita → saturação com picos de VUs
 *   2. Busca JSONB com ILIKE: p(95)=3.5s sob stress → 300 VUs saturam o pool
 *   3. Pool de conexões da Réplica: satura com 300 VUs simultâneos de leitura
 *   4. http_req_duration p(99) = 2.8s → tail latency alta sob concorrência extrema
 *
 *  ESTRATÉGIA (3 minutos):
 *
 *   FASE 1 — Warm-up Agressivo (0s → 30s)
 *     100 VUs escrevendo para popular rapidamente o banco.
 *     Testa contenção no pool do Master com carga dobrada vs teste original.
 *
 *   FASE 2 — Carga Mista Intensa (30s → 2m)
 *     Escrita sustentada (50 VUs) + Leitura pesada (200 VUs) + Buscas JSONB (100 VUs).
 *     Todos os 3 endpoints sob pressão simultânea.
 *
 *   FASE 3 — Spike de Stress Máximo (2m → 3m)
 *     500 VUs de leitura + busca JSONB para estourar os pools.
 *     Testa o limite real da arquitetura.
 *
 * Executar:
 *   k6 run k6/heavy-load-test.js
 *   k6 run --out json=k6-heavy-results.json k6/heavy-load-test.js
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { randomString, randomIntBetween } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";
const ENDPOINT = `${BASE_URL}/computer`;
const PAGE_SIZE = 50; // páginas maiores = mais dados por request = mais pressão no DB

// ─── Métricas customizadas ───────────────────────────────────────────────────

const writeLatency = new Trend("write_latency_ms", true);
const readLatency = new Trend("read_latency_ms", true);
const searchLatency = new Trend("search_latency_ms", true);
const deleteLatency = new Trend("delete_latency_ms", true);
const writeErrors = new Counter("write_errors");
const readErrors = new Counter("read_errors");
const searchErrors = new Counter("search_errors");
const deleteErrors = new Counter("delete_errors");
const successRate = new Rate("success_rate");
const insertedCount = new Counter("inserted_total");
const deletedCount = new Counter("deleted_total");
const paginaVazia = new Counter("pagina_vazia_total");
const searchGpuCount = new Counter("search_gpu_total");
const searchRamCount = new Counter("search_ram_total");

// ─── Cenários (3 minutos totais) ─────────────────────────────────────────────

export const options = {
    scenarios: {

        // ─────────────────────────────────────────────────────────────
        // FASE 1 — Warm-up Agressivo (0s → 30s)
        // 100 VUs de escrita para popular rapidamente E testar
        // contenção no pool do Master (gargalo #1 do ESTUDO.md)
        // ─────────────────────────────────────────────────────────────
        fase1_warmup_agressivo: {
            executor: "ramping-vus",
            startVUs: 0,
            stages: [
                { duration: "5s", target: 100 },  // ramp-up explosivo
                { duration: "25s", target: 100 },  // sustenta 100 VUs
            ],
            exec: "escrever",
            gracefulRampDown: "3s",
            tags: { fase: "warmup" },
        },

        // ─────────────────────────────────────────────────────────────
        // FASE 2a — Escrita Sustentada (30s → 2m)
        // Mantém escrita constante no Master durante toda a fase 2
        // para gerar contenção W/R simultâneo
        // ─────────────────────────────────────────────────────────────
        fase2a_escrita_sustentada: {
            executor: "ramping-vus",
            startTime: "30s",
            startVUs: 0,
            stages: [
                { duration: "10s", target: 50 },
                { duration: "50s", target: 50 },
                { duration: "20s", target: 30 },
                { duration: "10s", target: 0 },
            ],
            exec: "escrever",
            gracefulRampDown: "3s",
            tags: { fase: "paralelo" },
        },

        // ─────────────────────────────────────────────────────────────
        // FASE 2b — Leitura Paginada Pesada (30s → 2m)
        // 200 VUs navegando via cursor pagination na réplica
        // Testa gargalo #3: saturação do pool da réplica
        // ─────────────────────────────────────────────────────────────
        fase2b_leitura_pesada: {
            executor: "ramping-vus",
            startTime: "30s",
            startVUs: 0,
            stages: [
                { duration: "10s", target: 100 },
                { duration: "30s", target: 200 },
                { duration: "30s", target: 200 },
                { duration: "20s", target: 0 },
            ],
            exec: "ler",
            gracefulRampDown: "5s",
            tags: { fase: "paralelo" },
        },

        // ─────────────────────────────────────────────────────────────
        // FASE 2c — Buscas JSONB Paralelas (30s → 2m)
        // 100 VUs fazendo buscas GPU + RAM no JSONB
        // Testa gargalo #2: ILIKE com wildcard no índice GIN
        // ─────────────────────────────────────────────────────────────
        fase2c_busca_jsonb: {
            executor: "ramping-vus",
            startTime: "30s",
            startVUs: 0,
            stages: [
                { duration: "10s", target: 50 },
                { duration: "40s", target: 100 },
                { duration: "20s", target: 100 },
                { duration: "20s", target: 0 },
            ],
            exec: "buscarJsonb",
            gracefulRampDown: "5s",
            tags: { fase: "paralelo" },
        },

        // ─────────────────────────────────────────────────────────────
        // FASE 2d — Deletes Concorrentes (40s → 1m40s)
        // 20 VUs deletando registros para testar contenção de escrita
        // simultânea com os INSERTs no Master
        // ─────────────────────────────────────────────────────────────
        fase2d_deletes: {
            executor: "ramping-vus",
            startTime: "40s",
            startVUs: 0,
            stages: [
                { duration: "10s", target: 10 },
                { duration: "30s", target: 20 },
                { duration: "20s", target: 0 },
            ],
            exec: "deletar",
            gracefulRampDown: "3s",
            tags: { fase: "paralelo" },
        },

        // ─────────────────────────────────────────────────────────────
        // FASE 3 — Spike de Stress Máximo (2m → 3m)
        // 500 VUs misturando paginação + busca JSONB
        // Testa o limite absoluto da arquitetura
        // ─────────────────────────────────────────────────────────────
        fase3_stress_maximo: {
            executor: "ramping-vus",
            startTime: "120s",
            startVUs: 0,
            stages: [
                { duration: "10s", target: 300 },
                { duration: "20s", target: 500 },
                { duration: "20s", target: 500 },
                { duration: "10s", target: 0 },
            ],
            exec: "lerComBusca",
            gracefulRampDown: "10s",
            tags: { fase: "stress" },
        },
    },

    thresholds: {
        // ─── Leitura paginada ────────────────────────────────────
        "read_latency_ms": ["p(95)<300"],
        "read_latency_ms{fase:stress}": ["p(95)<500"],
        "read_latency_ms{fase:paralelo}": ["p(95)<200"],

        // ─── Escrita ─────────────────────────────────────────────
        "write_latency_ms": ["p(95)<800"],
        "write_latency_ms{fase:warmup}": ["p(95)<500"],

        // ─── Busca JSONB ─────────────────────────────────────────
        "search_latency_ms": ["p(95)<600"],
        "search_latency_ms{fase:stress}": ["p(95)<1000"],

        // ─── Delete ──────────────────────────────────────────────
        "delete_latency_ms": ["p(95)<800"],

        // ─── Qualidade global ────────────────────────────────────
        "success_rate": ["rate>0.97"],
        "write_errors": ["count<30"],
        "http_req_failed": ["rate<0.03"],
        "http_req_duration": ["p(99)<1500"],
    },
};

// ─── Estado de cursor por VU ──────────────────────────────────────────────────

let cursor = null;

function buildPaginationUrl(cursorState) {
    if (cursorState === null) {
        return `${ENDPOINT}/pagination?limit=${PAGE_SIZE}`;
    }
    const encoded = encodeURIComponent(cursorState.createdAt);
    return `${ENDPOINT}/pagination?createdAt=${encoded}&id=${cursorState.id}&limit=${PAGE_SIZE}`;
}

function extractCursor(items) {
    if (!items || items.length === 0) return null;
    const last = items[items.length - 1];
    return { createdAt: last.createdAt, id: last.id };
}

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
    "GeForce RTX 5090",
    "Radeon RX 9070 XT",
];

const RAM_CONFIGS = [16, 32, 64, 128, 256];
const STORAGE_SIZES = [512, 1000, 2000, 4000, 8000];
const FABRICANTES_CASE = ["Corsair", "NZXT", "Lian Li", "Fractal Design", "be quiet!", "Cooler Master", "Phanteks"];
const SOCKETS = ["AM5", "AM4", "LGA1700", "LGA1851"];
const CHIPSETS = ["X670E", "B650", "Z790", "Z890", "B760", "X870E"];
const FONTES = ["Corsair", "Seasonic", "be quiet!", "EVGA", "Thermaltake", "Cooler Master"];
const MOB_FABRICANTES = ["ASUS", "MSI", "Gigabyte", "ASRock"];
const GPU_FABRICANTES = ["MSI", "ASUS", "Gigabyte", "Sapphire", "PowerColor", "Zotac", "EVGA"];

// Nomes gerados para deletar depois
const nomesGerados = [];

function gerarComputador() {
    const id = randomString(12);
    const nome = `PC-HEAVY-${id}`;
    const ramGb = RAM_CONFIGS[randomIntBetween(0, RAM_CONFIGS.length - 1)];
    const gpu = GPU_MODELS[randomIntBetween(0, GPU_MODELS.length - 1)];
    const storage = STORAGE_SIZES[randomIntBetween(0, STORAGE_SIZES.length - 1)];
    const socket = SOCKETS[randomIntBetween(0, SOCKETS.length - 1)];
    const chipset = CHIPSETS[randomIntBetween(0, CHIPSETS.length - 1)];
    const caseB = FABRICANTES_CASE[randomIntBetween(0, FABRICANTES_CASE.length - 1)];

    // Guardar nome para cenário de delete
    nomesGerados.push(nome);
    if (nomesGerados.length > 200) nomesGerados.shift(); // limita memória

    return {
        name: nome,
        price: randomIntBetween(2500, 55000),

        fonte: {
            modelo: `RM${randomIntBetween(6, 16) * 100}x`,
            potencia_watts: randomIntBetween(550, 1600),
            certificacao: ["80 Plus Bronze", "80 Plus Gold", "80 Plus Platinum", "80 Plus Titanium"][randomIntBetween(0, 3)],
            modular: true,
            fabricante: FONTES[randomIntBetween(0, FONTES.length - 1)],
        },

        placa_mae: {
            modelo: `ROG STRIX ${chipset}-F GAMING WIFI`,
            fabricante: MOB_FABRICANTES[randomIntBetween(0, MOB_FABRICANTES.length - 1)],
            socket,
            chipset,
            formato: ["ATX", "Micro-ATX", "E-ATX", "Mini-ITX"][randomIntBetween(0, 3)],
            slots_ram: randomIntBetween(2, 8),
            ram_max_gb: 256,
            slots_pcie: randomIntBetween(2, 5),
            wifi: randomIntBetween(0, 1) === 1,
            bluetooth: randomIntBetween(0, 1) === 1,
        },

        placa_video: {
            modelo: gpu,
            fabricante: GPU_FABRICANTES[randomIntBetween(0, GPU_FABRICANTES.length - 1)],
            chipset: gpu,
            memoria_gb: randomIntBetween(8, 24),
            tipo_memoria: ["GDDR6", "GDDR6X", "GDDR7"][randomIntBetween(0, 2)],
            clock_mhz: randomIntBetween(2200, 3000),
            boost_clock_mhz: randomIntBetween(2400, 3200),
            tdp_watts: randomIntBetween(150, 600),
            interface: "PCIe 5.0 x16",
            ray_tracing: true,
            dlss: gpu.includes("GeForce"),
            fsr: gpu.includes("Radeon"),
        },

        memoria_ram: {
            modulos: Array.from({ length: ramGb >= 128 ? 4 : 2 }, (_, i) => ({
                modelo: ["Dominator Platinum RGB", "Trident Z5 Royal", "Fury Beast", "Vengeance"][randomIntBetween(0, 3)],
                fabricante: ["Corsair", "G.Skill", "Kingston", "Crucial"][randomIntBetween(0, 3)],
                capacidade_gb: ramGb / (ramGb >= 128 ? 4 : 2),
                tipo: ramGb >= 64 ? "DDR5" : "DDR4",
                frequencia_mhz: ramGb >= 64 ? randomIntBetween(5600, 8400) : randomIntBetween(3200, 4800),
                latencia: `CL${randomIntBetween(16, 40)}`,
                ecc: false,
            })),
            capacidade_total_gb: ramGb,
            canal: ramGb >= 128 ? "Quad Channel" : "Dual Channel",
        },

        armazenamento: {
            dispositivos: [
                {
                    modelo: ["990 PRO", "980 PRO", "SN850X", "FireCuda 530", "T700"][randomIntBetween(0, 4)],
                    fabricante: ["Samsung", "WD", "Seagate", "Crucial"][randomIntBetween(0, 3)],
                    tipo: "NVMe",
                    capacidade_gb: storage,
                    interface: "NVMe PCIe 5.0",
                    velocidade_leitura_mbps: randomIntBetween(6000, 14000),
                    velocidade_escrita_mbps: randomIntBetween(4000, 12000),
                },
                {
                    modelo: ["870 EVO", "860 QVO", "BX500", "MX500"][randomIntBetween(0, 3)],
                    fabricante: ["Samsung", "Crucial", "WD"][randomIntBetween(0, 2)],
                    tipo: "SSD",
                    capacidade_gb: storage * 2,
                    interface: "SATA III",
                    velocidade_leitura_mbps: 560,
                    velocidade_escrita_mbps: 530,
                },
                {
                    modelo: "IronWolf Pro",
                    fabricante: "Seagate",
                    tipo: "HDD",
                    capacidade_gb: storage * 4,
                    interface: "SATA III",
                    rpm: 7200,
                    velocidade_leitura_mbps: 260,
                    velocidade_escrita_mbps: 250,
                },
            ],
            capacidade_total_gb: storage * 7,
        },

        gabinete: {
            modelo: ["O11 Dynamic EVO", "H7 Flow", "4000D Airflow", "Meshify 2", "Torrent"][randomIntBetween(0, 4)],
            fabricante: caseB,
            tipo: ["Mid Tower", "Full Tower", "Mini Tower"][randomIntBetween(0, 2)],
            cor: ["Preto", "Branco", "Cinza", "Preto com RGB"][randomIntBetween(0, 3)],
            material: "Alumínio com painel de vidro temperado",
            tamanho_placa_mae_suportado: "E-ATX, ATX, Micro-ATX, Mini-ITX",
            slots_expansao: randomIntBetween(7, 10),
            baias_35_polegadas: randomIntBetween(2, 4),
            baias_25_polegadas: randomIntBetween(2, 6),
            ventilacao: {
                coolers_inclusos: randomIntBetween(3, 6),
                suporte_radiador: "360mm frontal, 360mm lateral, 360mm superior",
                slots_ventilacao_frontal: 3,
                slots_ventilacao_superior: 3,
                slots_ventilacao_traseira: 1,
                slots_ventilacao_lateral: 3,
            },
        },

        refrigeracao: {
            tipo: ["Air Cooler", "AIO 240mm", "AIO 360mm", "Custom Loop"][randomIntBetween(0, 3)],
            modelo: ["NH-D15", "Kraken X73", "iCUE H150i", "Dark Rock Pro 4"][randomIntBetween(0, 3)],
            fabricante: ["Noctua", "NZXT", "Corsair", "be quiet!"][randomIntBetween(0, 3)],
            tdp_suportado_watts: randomIntBetween(200, 400),
        },

        observacoes: `Build de alta performance para ${["gaming 4K 144Hz", "criação de conteúdo 8K", "machine learning com CUDA",
                "streaming profissional", "desenvolvimento full-stack", "renderização 3D",
                "simulações científicas", "edição de vídeo profissional"][randomIntBetween(0, 7)]
            }. Configuração ${["premium", "enthusiast", "workstation", "top-tier"][randomIntBetween(0, 3)]}. ID: ${id}`,
    };
}

// ─── Cenário: Escrita Agressiva (master) ──────────────────────────────────────

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
}

// ─── Cenário: Delete Concorrente (master) ─────────────────────────────────────

export function deletar() {
    // Tenta deletar um nome aleatório gerado anteriormente
    const idx = randomIntBetween(0, Math.max(nomesGerados.length - 1, 0));
    const nome = nomesGerados.length > 0 ? nomesGerados[idx] : `PC-HEAVY-inexistente`;

    const start = Date.now();
    const res = http.del(`${ENDPOINT}/${encodeURIComponent(nome)}`, null, {
        tags: { operacao: "delete" },
        timeout: "10s",
    });
    deleteLatency.add(Date.now() - start);

    const ok = check(res, {
        "delete: status 200 ou 404": (r) => r.status === 200 || r.status === 404,
    });

    successRate.add(ok);
    if (ok && res.status === 200) {
        deletedCount.add(1);
    } else if (!ok) {
        deleteErrors.add(1);
    }
}

// ─── Cenário: Leitura paginada (réplica) ──────────────────────────────────────

export function ler() {
    const url = buildPaginationUrl(cursor);

    const start = Date.now();
    const res = http.get(url, {
        tags: { operacao: "pagination" },
        timeout: "10s",
    });
    readLatency.add(Date.now() - start);

    let items = null;
    const ok = check(res, {
        "pagination: status 200": (r) => r.status === 200,
        "pagination: é array": (r) => {
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

// ─── Cenário: Busca JSONB pura (réplica) ──────────────────────────────────────

const GPU_TERMOS_PESADO = [
    "RTX", "RX", "GTX", "4090", "4080", "4070", "3090", "7900", "Arc",
    "5090", "9070", "SUPER", "GAMING", "Ti",
];
const RAM_VALORES_PESADO = [16, 32, 64, 128, 256];

export function buscarJsonb() {
    const tipo = randomIntBetween(0, 1);

    if (tipo === 0) {
        // Busca JSONB por GPU — o gargalo principal (ILIKE com wildcard)
        const termo = GPU_TERMOS_PESADO[randomIntBetween(0, GPU_TERMOS_PESADO.length - 1)];
        const start = Date.now();
        const res = http.get(`${ENDPOINT}/search/gpu/${encodeURIComponent(termo)}`, {
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
        if (ok) { searchGpuCount.add(1); }
        else { searchErrors.add(1); }

    } else {
        // Busca JSONB por RAM
        const cap = RAM_VALORES_PESADO[randomIntBetween(0, RAM_VALORES_PESADO.length - 1)];
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
        if (ok) { searchRamCount.add(1); }
        else { searchErrors.add(1); }
    }
}

// ─── Cenário: Stress Misto (leitura + busca JSONB) ────────────────────────────

export function lerComBusca() {
    // Distribuição: 40% paginação, 35% busca GPU, 25% busca RAM
    const roll = randomIntBetween(1, 100);

    if (roll <= 40) {
        // Paginação cursor
        group("stress_pagination", () => {
            const url = buildPaginationUrl(cursor);

            const start = Date.now();
            const res = http.get(url, {
                tags: { operacao: "pagination" },
                timeout: "15s",
            });
            readLatency.add(Date.now() - start);

            let items = null;
            const ok = check(res, {
                "stress_pagination: 200": (r) => r.status === 200,
                "stress_pagination: array": (r) => {
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
        });

    } else if (roll <= 75) {
        // Busca JSONB por GPU (gargalo #2 — ILIKE)
        group("stress_search_gpu", () => {
            const termo = GPU_TERMOS_PESADO[randomIntBetween(0, GPU_TERMOS_PESADO.length - 1)];
            const start = Date.now();
            const res = http.get(`${ENDPOINT}/search/gpu/${encodeURIComponent(termo)}`, {
                tags: { operacao: "search_gpu" },
                timeout: "15s",
            });
            searchLatency.add(Date.now() - start);

            const ok = check(res, {
                "stress_gpu: 200": (r) => r.status === 200,
                "stress_gpu: array": (r) => {
                    try { return Array.isArray(JSON.parse(r.body)); }
                    catch (_) { return false; }
                },
            });
            successRate.add(ok);
            if (ok) { searchGpuCount.add(1); }
            else { searchErrors.add(1); }
        });

    } else {
        // Busca JSONB por RAM
        group("stress_search_ram", () => {
            const cap = RAM_VALORES_PESADO[randomIntBetween(0, RAM_VALORES_PESADO.length - 1)];
            const start = Date.now();
            const res = http.get(`${ENDPOINT}/search/ram/${cap}`, {
                tags: { operacao: "search_ram" },
                timeout: "15s",
            });
            searchLatency.add(Date.now() - start);

            const ok = check(res, {
                "stress_ram: 200": (r) => r.status === 200,
                "stress_ram: array": (r) => {
                    try { return Array.isArray(JSON.parse(r.body)); }
                    catch (_) { return false; }
                },
            });
            successRate.add(ok);
            if (ok) { searchRamCount.add(1); }
            else { searchErrors.add(1); }
        });
    }
}
