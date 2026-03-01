package org.acme.monitoring;

import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

import java.util.List;

/**
 * Dashboard SSR — Scheduled Service Report.
 *
 * GET /ssr       → Página HTML com gráficos Chart.js (atualiza a cada 30s)
 * GET /ssr/data  → JSON com os últimos snapshots coletados
 */
@Path("/ssr")
public class MetricsDashboardResource {

    @Inject
    MetricsStore store;

    @GET
    @Produces(MediaType.TEXT_HTML)
    public String dashboard() {
        return """
                <!DOCTYPE html>
                <html lang="pt-BR">
                <head>
                  <meta charset="UTF-8"/>
                  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
                  <title>SSR — Master/Slave Metrics</title>
                  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
                  <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px; }
                    h1  { font-size: 1.4rem; margin-bottom: 4px; color: #38bdf8; }
                    .sub { font-size: 0.85rem; color: #64748b; margin-bottom: 24px; }
                    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                    .card { background: #1e293b; border-radius: 12px; padding: 20px; }
                    .card h2 { font-size: 0.95rem; color: #94a3b8; margin-bottom: 14px; }
                    canvas { max-height: 260px; }
                    .badge { display: inline-block; margin-left: 8px; font-size: 0.7rem;
                             background: #334155; padding: 2px 8px; border-radius: 99px; color: #94a3b8; }
                    @media (max-width: 700px) { .grid { grid-template-columns: 1fr; } }
                  </style>
                </head>
                <body>
                  <h1>SSR — Scheduled Service Report <span class="badge">30s refresh</span></h1>
                  <p class="sub">Métricas do Master (primary) e Slave (leitura) • últimos 20 snapshots</p>
                  <div class="grid">
                    <div class="card">
                      <h2>🌐 Requisições HTTP — Reads vs Writes</h2>
                      <canvas id="httpChart"></canvas>
                    </div>
                    <div class="card">
                      <h2>🏊 Pool de Conexões — In Use</h2>
                      <canvas id="poolInUseChart"></canvas>
                    </div>
                    <div class="card">
                      <h2>⏳ Pool de Conexões — Pending (Queue)</h2>
                      <canvas id="poolPendingChart"></canvas>
                    </div>
                    <div class="card" style="display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;">
                      <p style="color:#64748b;font-size:0.85rem;">Último snapshot</p>
                      <pre id="lastSnapshot" style="font-size:0.8rem;color:#38bdf8;white-space:pre-wrap;"></pre>
                    </div>
                  </div>

                  <script>
                    const cfg = (label, datasets) => ({
                      type: 'line',
                      data: { labels: [], datasets },
                      options: {
                        animation: false,
                        responsive: true,
                        plugins: { legend: { labels: { color: '#94a3b8' } } },
                        scales: {
                          x: { ticks: { color: '#475569', maxRotation: 30, autoSkip: true, maxTicksLimit: 8 },
                               grid: { color: '#1e293b' } },
                          y: { ticks: { color: '#475569' }, grid: { color: '#334155' }, beginAtZero: true }
                        }
                      }
                    });

                    const httpChart = new Chart(document.getElementById('httpChart'), cfg('HTTP', [
                      { label: 'Reads (GET)',        data: [], borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,.15)', tension: 0.3, fill: true },
                      { label: 'Writes (POST/PUT/DELETE)', data: [], borderColor: '#f472b6', backgroundColor: 'rgba(244,114,182,.15)', tension: 0.3, fill: true }
                    ]));

                    const poolInChart = new Chart(document.getElementById('poolInUseChart'), cfg('Pool In Use', [
                      { label: 'Master in-use',  data: [], borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,.15)', tension: 0.3, fill: true },
                      { label: 'Slave in-use',   data: [], borderColor: '#fbbf24', backgroundColor: 'rgba(251,191,36,.15)',  tension: 0.3, fill: true }
                    ]));

                    const poolPendChart = new Chart(document.getElementById('poolPendingChart'), cfg('Pool Pending', [
                      { label: 'Master pending', data: [], borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,.15)', tension: 0.3, fill: true },
                      { label: 'Slave pending',  data: [], borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,.15)', tension: 0.3, fill: true }
                    ]));

                    function shortTs(ts) {
                      return ts ? ts.substring(11, 19) : '';
                    }

                    async function refresh() {
                      try {
                        const res = await fetch('/ssr/data');
                        const data = await res.json();
                        const labels = data.map(s => shortTs(s.timestamp));

                        function sync(chart, ...series) {
                          chart.data.labels = labels;
                          series.forEach((vals, i) => chart.data.datasets[i].data = vals);
                          chart.update('none');
                        }

                        sync(httpChart,
                          data.map(s => s.httpReads),
                          data.map(s => s.httpWrites));

                        sync(poolInChart,
                          data.map(s => s.primaryPoolInUse),
                          data.map(s => s.replicaPoolInUse));

                        sync(poolPendChart,
                          data.map(s => s.primaryPoolPending),
                          data.map(s => s.replicaPoolPending));

                        const last = data[data.length - 1];
                        if (last) {
                          document.getElementById('lastSnapshot').textContent =
                            JSON.stringify(last, null, 2);
                        }
                      } catch(e) {
                        console.error('SSR refresh error', e);
                      }
                    }

                    refresh();
                    setInterval(refresh, 30000);
                  </script>
                </body>
                </html>
                """;
    }

    @GET
    @Path("/data")
    @Produces(MediaType.APPLICATION_JSON)
    public List<MetricsSnapshot> data() {
        return store.getAll();
    }
}
