/**
 * Teste de Carga - master-slave-reativo
 * ======================================
 * Cobre todos os endpoints da API reativa:
 *   POST   /computer              → escrita no master (porta 5432)
 *   GET    /computer              → leitura na réplica (porta 5433)
 *   GET    /computer/search/gpu/{search}
 *   GET    /computer/search/ram/{capacity}
 *   DELETE /computer/{name}
 *
 * Executar:
 *   k6 run k6/load-test.js
 *
 * Sobrescrever a URL base:
 *   k6 run -e BASE_URL=http://meu-servidor:8080 k6/load-test.js
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { randomString, randomIntBetween } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

// ─── Configuração ────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";
const ENDPOINT = `${BASE_URL}/computer`;

// ─── Métricas customizadas ───────────────────────────────────────────────────

const writeErrors = new Counter("write_errors");
const readErrors = new Counter("read_errors");
const deleteErrors = new Counter("delete_errors");
const writeLatency = new Trend("write_latency_ms", true);
const readLatency = new Trend("read_latency_ms", true);
const searchLatency = new Trend("search_latency_ms", true);
const successRate = new Rate("success_rate");

// ─── Cenários / Estágios ─────────────────────────────────────────────────────

export const options = {
    scenarios: {
        /**
         * Leitura intensiva — simula carga típica de produção onde leituras
         * dominam (80 % do tráfego vai para a réplica slave).
         */
        leitura_intensa: {
            executor: "ramping-vus",
            startVUs: 0,
            stages: [
                { duration: "30s", target: 20 },   // aquecimento
                { duration: "1m", target: 50 },   // carga sustentada
                { duration: "30s", target: 100 },  // pico
                { duration: "30s", target: 50 },   // redução
                { duration: "30s", target: 0 },    // resfriamento
            ],
            exec: "cenarioLeitura",
            gracefulRampDown: "10s",
        },

        /**
         * Escrita moderada — simula inserções concorrentes no master.
         * Inicia 15 s depois para não sobrecarregar o banco no arranque.
         */
        escrita_moderada: {
            executor: "ramping-vus",
            startTime: "15s",
            startVUs: 0,
            stages: [
                { duration: "30s", target: 5 },
                { duration: "1m", target: 15 },
                { duration: "30s", target: 5 },
                { duration: "30s", target: 0 },
            ],
            exec: "cenarioEscrita",
            gracefulRampDown: "10s",
        },

        /**
         * Busca por GPU/RAM — consultas JSONB na réplica.
         */
        busca_avancada: {
            executor: "constant-vus",
            startTime: "30s",
            vus: 10,
            duration: "2m",
            exec: "cenarioBusca",
        },
    },

    thresholds: {
        // Latência de leitura: 95 % das requisições < 500 ms
        "read_latency_ms{scenario:leitura_intensa}": ["p(95)<500"],
        // Latência de escrita: 95 % das requisições < 1000 ms
        "write_latency_ms{scenario:escrita_moderada}": ["p(95)<1000"],
        // Latência de busca: 95 % das requisições < 800 ms
        "search_latency_ms{scenario:busca_avancada}": ["p(95)<800"],
        // Taxa de sucesso geral > 99 %
        success_rate: ["rate>0.99"],
        // Erros de escrita < 1 %
        write_errors: ["count<10"],
    },
};

// ─── Dados de exemplo (baseados em exemplo-computer-description.json) ────────

/**
 * Gera um payload de computador com nome único para evitar conflito de unique
 * constraint na coluna `name`.
 */
function gerarComputador() {
    const sufixo = randomString(8);
    const ramGb = [16, 32, 64][randomIntBetween(0, 2)];
    const gpus = [
        "GeForce RTX 4070 Ti GAMING X TRIO",
        "GeForce RTX 4080 SUPER",
        "Radeon RX 7900 XTX",
        "GeForce RTX 3060 Ti",
    ];
    const gpu = gpus[randomIntBetween(0, gpus.length - 1)];

    return {
        name: `PC-${sufixo}`,
        price: randomIntBetween(3000, 25000),

        // ── fonte ──────────────────────────────────────────────────────────────
        fonte: {
            modelo: "CX750M",
            potencia_watts: 750,
            certificacao: "80 Plus Bronze",
            modular: true,
            fabricante: "Corsair",
        },

        // ── placa_mae ──────────────────────────────────────────────────────────
        placa_mae: {
            modelo: "ROG STRIX B550-F GAMING",
            fabricante: "ASUS",
            socket: "AM4",
            chipset: "B550",
            formato: "ATX",
            slots_ram: 4,
            ram_max_gb: 128,
            slots_pcie: 3,
        },

        // ── placa_video ────────────────────────────────────────────────────────
        placa_video: {
            modelo: gpu,
            fabricante: "MSI",
            chipset: gpu.split(" ").slice(1, 4).join(" "),
            memoria_gb: 12,
            tipo_memoria: "GDDR6X",
            clock_mhz: 2610,
            tdp_watts: 285,
            interface: "PCIe 4.0 x16",
        },

        // ── memoria_ram ────────────────────────────────────────────────────────
        memoria_ram: {
            modulos: [
                {
                    modelo: "Vengeance RGB Pro",
                    fabricante: "Corsair",
                    capacidade_gb: ramGb / 2,
                    tipo: "DDR4",
                    frequencia_mhz: 3600,
                    latencia: "CL18",
                },
                {
                    modelo: "Vengeance RGB Pro",
                    fabricante: "Corsair",
                    capacidade_gb: ramGb / 2,
                    tipo: "DDR4",
                    frequencia_mhz: 3600,
                    latencia: "CL18",
                },
            ],
            capacidade_total_gb: ramGb,
        },

        // ── armazenamento ──────────────────────────────────────────────────────
        armazenamento: {
            dispositivos: [
                {
                    modelo: "980 PRO",
                    fabricante: "Samsung",
                    tipo: "NVMe",
                    capacidade_gb: 1000,
                    interface: "NVMe PCIe 4.0",
                    velocidade_leitura_mbps: 7000,
                    velocidade_escrita_mbps: 5000,
                },
                {
                    modelo: "870 EVO",
                    fabricante: "Samsung",
                    tipo: "SSD",
                    capacidade_gb: 2000,
                    interface: "SATA III",
                    velocidade_leitura_mbps: 560,
                    velocidade_escrita_mbps: 530,
                },
            ],
            capacidade_total_gb: 3000,
        },

        // ── gabinete ───────────────────────────────────────────────────────────
        gabinete: {
            modelo: "4000D Airflow",
            fabricante: "Corsair",
            tipo: "Mid Tower",
            cor: "Preto",
            material: "Aço com painel de vidro temperado",
            tamanho_placa_mae_suportado: "ATX, Micro-ATX, Mini-ITX",
            slots_expansao: 7,
            baias_35_polegadas: 2,
            baias_25_polegadas: 2,
            ventilacao: {
                coolers_inclusos: 2,
                suporte_radiador: "360mm frontal, 280mm superior",
                slots_ventilacao_frontal: 3,
                slots_ventilacao_superior: 3,
                slots_ventilacao_traseira: 1,
            },
        },

        observacoes: `Configuração para jogos em alta resolução e criação de conteúdo. Build ${sufixo}.`,
    };
}

// ─── Cenário: Leitura (slave) ─────────────────────────────────────────────────

export function cenarioLeitura() {
    group("GET /computer — listar todos", () => {
        const start = Date.now();
        const res = http.get(ENDPOINT, { tags: { name: "list_all" } });
        readLatency.add(Date.now() - start);

        const ok = check(res, {
            "status 200": (r) => r.status === 200,
            "body é array": (r) => {
                try {
                    const body = JSON.parse(r.body);
                    return Array.isArray(body);
                } catch (_) {
                    return false;
                }
            },
        });

        successRate.add(ok);
        if (!ok) readErrors.add(1);
    });

    sleep(randomIntBetween(1, 3));
}

// ─── Cenário: Escrita (master) ────────────────────────────────────────────────

export function cenarioEscrita() {
    const computador = gerarComputador();
    const payload = JSON.stringify(computador);
    const headers = { "Content-Type": "application/json" };

    let nomeParaDeletar = null;

    group("POST /computer — criar computador", () => {
        const start = Date.now();
        const res = http.post(ENDPOINT, payload, {
            headers,
            tags: { name: "create_computer" },
        });
        writeLatency.add(Date.now() - start);

        const ok = check(res, {
            "status 201": (r) => r.status === 201,
            "body contém id": (r) => {
                try {
                    const body = JSON.parse(r.body);
                    return body.id !== undefined;
                } catch (_) {
                    return false;
                }
            },
        });

        successRate.add(ok);
        if (ok) {
            nomeParaDeletar = computador.name;
        } else {
            writeErrors.add(1);
        }
    });

    // Aguarda replicação antes de deletar
    sleep(randomIntBetween(1, 2));

    // Limpeza: remove o registro criado para não inflar o banco durante o teste
    if (nomeParaDeletar) {
        group(`DELETE /computer/${nomeParaDeletar} — remover computador criado`, () => {
            const res = http.del(`${ENDPOINT}/${nomeParaDeletar}`, null, {
                tags: { name: "delete_computer" },
            });

            const ok = check(res, {
                "status 204": (r) => r.status === 204,
            });

            successRate.add(ok);
            if (!ok) deleteErrors.add(1);
        });
    }

    sleep(randomIntBetween(1, 3));
}

// ─── Cenário: Busca avançada (JSONB na réplica) ───────────────────────────────

export function cenarioBusca() {
    const gpuTermos = ["RTX", "RX", "GTX", "4070", "3060", "7900"];
    const ramCapacidades = [16, 32, 64];

    group("GET /computer/search/gpu — busca por GPU", () => {
        const termo = gpuTermos[randomIntBetween(0, gpuTermos.length - 1)];
        const start = Date.now();
        const res = http.get(`${ENDPOINT}/search/gpu/${termo}`, {
            tags: { name: "search_gpu" },
        });
        searchLatency.add(Date.now() - start);

        const ok = check(res, {
            "status 200": (r) => r.status === 200,
            "body é array": (r) => {
                try {
                    return Array.isArray(JSON.parse(r.body));
                } catch (_) {
                    return false;
                }
            },
        });

        successRate.add(ok);
        if (!ok) readErrors.add(1);
    });

    sleep(randomIntBetween(1, 2));

    group("GET /computer/search/ram — busca por capacidade de RAM", () => {
        const capacidade = ramCapacidades[randomIntBetween(0, ramCapacidades.length - 1)];
        const start = Date.now();
        const res = http.get(`${ENDPOINT}/search/ram/${capacidade}`, {
            tags: { name: "search_ram" },
        });
        searchLatency.add(Date.now() - start);

        const ok = check(res, {
            "status 200": (r) => r.status === 200,
            "body é array": (r) => {
                try {
                    return Array.isArray(JSON.parse(r.body));
                } catch (_) {
                    return false;
                }
            },
        });

        successRate.add(ok);
        if (!ok) readErrors.add(1);
    });

    sleep(randomIntBetween(1, 3));
}
