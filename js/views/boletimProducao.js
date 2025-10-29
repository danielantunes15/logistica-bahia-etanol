// js/views/boletimProducao.js
import { showToast, handleOperation, showLoading, hideLoading } from '../helpers.js';
// Importa getCurrentShift e adiciona getBrtIsoString (necessário para cálculo de tempo no turno)
import { formatDateTime, getCurrentShift, getBrtIsoString, calculateTimeDifference, formatMillisecondsToHoursMinutes } from '../timeUtils.js'; // Adiciona calculateTimeDifference e formatMillisecondsToHoursMinutes
import { dataCache } from '../dataCache.js';

// Importar Chart.js explicitamente se o plugin datalabels for usado separadamente
// import ChartDataLabels from 'chartjs-plugin-datalabels'; // Exemplo, pode não ser necessário se global

export class BoletimProducaoView {
    constructor() {
        this.container = null;
        this.cycleInfo = null;
        this.processedData = [];
        this.allFrentes = [];
        // Guarda a instância do gráfico para destruí-la depois
        this.overallProgressChartInstance = null;
        this.globalMetrics = {
            totalMeta24h: 0,
            totalMetaMomento: 0,
            // NOVO: KPI Refinado - Projeção TOTAL para o turno atual
            kpiMetaTotalTurno: 0,
            mediaMetaHora: 0,
            progressoCicloPercent: 0,
            turnoAtualInfo: {}
        };
    }

    async show() {
        // Destruir gráfico antigo ANTES de carregar novos dados/HTML
        if (this.overallProgressChartInstance) {
            this.overallProgressChartInstance.destroy();
            this.overallProgressChartInstance = null;
        }
        await this.loadData();
        if (this.allFrentes.length > 0) {
            this.calculateCycleData();
            await this.loadHTML();
            this.renderTopDashboard();
            this.renderOverallProgressChart(); // Renderiza gráfico APÓS top dashboard estar no DOM
            this.renderFrentesDashboard();
            this.addEventListeners();
        } else {
            await this.loadHTML(true);
        }
    }

    async hide() {
        // Destruir o gráfico ao sair da view para liberar memória
        if (this.overallProgressChartInstance) {
            this.overallProgressChartInstance.destroy();
            this.overallProgressChartInstance = null;
        }
    }

    async loadData(forceRefresh = false) {
        showLoading();
        try {
            const masterData = await dataCache.fetchMasterDataOnly(forceRefresh);
            // Garante que frentes_metas exista e seja um array ou objeto antes de acessar meta_toneladas
            this.allFrentes = (masterData.frentes_servico || []).filter(f => {
                 const metaInfo = f.frentes_metas ? (Array.isArray(f.frentes_metas) ? f.frentes_metas[0] : f.frentes_metas) : null; // Verifica se frentes_metas existe
                 return metaInfo && metaInfo.meta_toneladas > 0 && f.tipo_producao && ['MANUAL', 'MECANIZADA'].includes(f.tipo_producao);
            });

        } catch (error) {
            console.error('Erro ao carregar dados do boletim:', error);
            handleOperation(error, "Erro ao carregar frentes e metas.");
            this.allFrentes = [];
        } finally {
            hideLoading();
        }
    }

    async loadHTML(showError = false) {
        const container = document.getElementById('views-container');
        container.innerHTML = this.getHTML(showError);
        this.container = container.querySelector('#boletim-producao-view');
    }

    calculateCycleData() {
        const now = new Date();
        const cycleStart = new Date();
        if (now.getHours() < 7) { cycleStart.setDate(now.getDate() - 1); }
        cycleStart.setHours(7, 0, 0, 0);

        const cycleEnd = new Date(cycleStart);
        cycleEnd.setDate(cycleStart.getDate() + 1);
        cycleEnd.setHours(6, 59, 59, 999);

        const msPassedCycle = now.getTime() - cycleStart.getTime();
        let hoursPassedCycle = msPassedCycle / (1000 * 60 * 60);
        if (hoursPassedCycle > 24) hoursPassedCycle = 24;
        if (hoursPassedCycle < 0) hoursPassedCycle = 0;

        this.cycleInfo = { start: cycleStart, end: cycleEnd, hoursPassed: hoursPassedCycle };

        let totalMeta24hGlobal = 0;
        let totalMetaMomentoGlobal = 0;
        this.processedData = [];
        const gruposProcessados = {
            "MANUAL": { titulo: "CANA MANUAL", frentes: [], totalMetaMomento: 0, totalMeta24h: 0 },
            "MECANIZADA": { titulo: "CANA MECANIZADA", frentes: [], totalMetaMomento: 0, totalMeta24h: 0 }
        };

        const frentesAgregadas = [];
        let agroUnioneManualAgregada = { nome: "AGRO UNIONE - MANUAL", meta_toneladas_total: 0, tipo_producao: 'MANUAL', frentes_metas: [] };
        let encontrouAgroUnioneManual = false;
        this.allFrentes.forEach(frente => {
            const metaInfo = frente.frentes_metas ? (Array.isArray(frente.frentes_metas) ? frente.frentes_metas[0] : frente.frentes_metas) : null;
            const meta_toneladas = metaInfo ? metaInfo.meta_toneladas : 0;
            if (frente.nome.toUpperCase().startsWith('AGRO UNIONE - MANUAL')) {
                agroUnioneManualAgregada.meta_toneladas_total += meta_toneladas;
                encontrouAgroUnioneManual = true;
            } else {
                frentesAgregadas.push(frente);
            }
        });
        if (encontrouAgroUnioneManual && agroUnioneManualAgregada.meta_toneladas_total > 0) {
            frentesAgregadas.push({ nome: agroUnioneManualAgregada.nome, tipo_producao: agroUnioneManualAgregada.tipo_producao, frentes_metas: [{ meta_toneladas: agroUnioneManualAgregada.meta_toneladas_total }] });
        }

        frentesAgregadas.forEach(frente => {
            const metaInfo = frente.frentes_metas ? (Array.isArray(frente.frentes_metas) ? frente.frentes_metas[0] : frente.frentes_metas) : null;
            const meta24h = metaInfo ? metaInfo.meta_toneladas : 0;
            totalMeta24hGlobal += meta24h;
            const metaHora = meta24h / 24;
            const metaMomento = metaHora * hoursPassedCycle;
            totalMetaMomentoGlobal += metaMomento;
            const cumprimento = meta24h > 0 ? (metaMomento / meta24h) * 100 : 0;
            const frenteProcessada = { nome: frente.nome, meta24h: meta24h, metaHora: metaHora, metaMomento: metaMomento, cumprimento: cumprimento };

            if (frente.tipo_producao === 'MANUAL' && gruposProcessados["MANUAL"]) {
                gruposProcessados["MANUAL"].frentes.push(frenteProcessada);
                gruposProcessados["MANUAL"].totalMetaMomento += metaMomento;
                gruposProcessados["MANUAL"].totalMeta24h += meta24h;
            } else if (frente.tipo_producao === 'MECANIZADA' && gruposProcessados["MECANIZADA"]) {
                gruposProcessados["MECANIZADA"].frentes.push(frenteProcessada);
                gruposProcessados["MECANIZADA"].totalMetaMomento += metaMomento;
                gruposProcessados["MECANIZADA"].totalMeta24h += meta24h;
            }
        });

        gruposProcessados["MANUAL"].frentes.sort((a, b) => a.nome.localeCompare(b.nome));
        gruposProcessados["MECANIZADA"].frentes.sort((a, b) => a.nome.localeCompare(b.nome));
        this.processedData = Object.values(gruposProcessados).filter(g => g.frentes.length > 0);

        // --- Calcula a meta total projetada para o turno completo ---
        const turnoAtualInfo = getCurrentShift();
        const mediaMetaHoraGlobal = totalMeta24hGlobal > 0 ? totalMeta24hGlobal / 24 : 0;

        const [startHour, startMinute] = turnoAtualInfo.inicio.split(':').map(Number);
        const [endHour, endMinute] = turnoAtualInfo.fim.split(':').map(Number);
        const shiftStartDate = new Date();
        shiftStartDate.setHours(startHour, startMinute, 0, 0);
        const shiftEndDate = new Date();
        shiftEndDate.setHours(endHour, endMinute, 0, 0);

        if (endHour < startHour) {
             shiftEndDate.setDate(shiftEndDate.getDate() + 1);
        }

        const shiftDurationMillis = shiftEndDate.getTime() - shiftStartDate.getTime();
        const shiftDurationHours = shiftDurationMillis / (1000 * 60 * 60);
        const kpiMetaTotalTurno = mediaMetaHoraGlobal * shiftDurationHours;
        // --- Fim do cálculo ---

        // Atualiza as métricas globais
        this.globalMetrics = {
            totalMeta24h: totalMeta24hGlobal,
            totalMetaMomento: totalMetaMomentoGlobal,
            kpiMetaTotalTurno: kpiMetaTotalTurno,
            mediaMetaHora: mediaMetaHoraGlobal,
            progressoCicloPercent: totalMeta24hGlobal > 0 ? (totalMetaMomentoGlobal / totalMeta24hGlobal) * 100 : 0,
            turnoAtualInfo: turnoAtualInfo
        };
    }

    getHTML(showError = false) {
        const dashboardContent = showError || this.allFrentes.length === 0 ? `
            <div class="empty-state" style="padding: 40px; text-align: center;">
                <i class="ph-fill ph-warning" style="font-size: 3rem; color: var(--accent-danger);"></i>
                <p style="color: var(--text-primary); font-size: 1.1rem;">Não foi possível carregar o boletim.</p>
                <p style="color: var(--text-secondary);">Verifique se as frentes possuem metas definidas e estão atribuídas a um Grupo de Produção (Manual/Mecanizada) no cadastro.</p>
            </div>
        ` : `
            <div id="producao-top-dashboard" class="producao-top-dashboard">
            </div>
            <div id="producao-frentes-container">
            </div>
        `;

        return `
            <div id="boletim-producao-view" class="view active-view producao-view">
                <div class="controle-header">
                    <h1>Boletim de Metas (Projeção Horária)</h1>
                    <button class="btn-primary" id="refresh-boletim">
                        <i class="ph-fill ph-arrows-clockwise"></i>
                        Recalcular
                    </button>
                </div>
                ${dashboardContent}
            </div>
        `;
    }

    renderTopDashboard() {
        const topContainer = document.getElementById('producao-top-dashboard');
        if (!topContainer) return;

        const metrics = this.globalMetrics;
        const turnoBadgeClass = `turno-${metrics.turnoAtualInfo.turno.toLowerCase()}`;
        const totalMeta24hF = metrics.totalMeta24h.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
        const totalMetaMomentoF = metrics.totalMetaMomento.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
        const kpiMetaTotalTurnoF = metrics.kpiMetaTotalTurno.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
        const mediaMetaHoraF = metrics.mediaMetaHora.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
        const progressoCicloF = metrics.progressoCicloPercent.toFixed(1);

        topContainer.innerHTML = `
            <div class="stats-panel-producao">
                 <div class="panel-header-producao">
                    <h3>Projeção Geral do Ciclo (24h)</h3>
                    <div class="turno-info-producao">
                        Turno Atual: <span class="turno-badge ${turnoBadgeClass}">${metrics.turnoAtualInfo.nome}</span>
                         (${metrics.turnoAtualInfo.inicio} - ${metrics.turnoAtualInfo.fim})
                    </div>
                </div>

                <div class="stats-grid-producao-com-grafico">
                    <div class="kpi-column-producao">
                        <div class="stats-grid-producao">
                            <div class="stat-card-producao">
                                <div class="stat-main-content-producao">
                                    <div class="stat-icon-producao"><i class="ph-fill ph-target"></i></div>
                                    <div class="stat-content-producao">
                                        <span class="stat-value-producao">${totalMeta24hF} t</span>
                                        <span class="stat-label-producao">Meta Total (24h)</span>
                                    </div>
                                </div>
                            </div>

                            <div class="stat-card-producao">
                                 <div class="stat-main-content-producao">
                                    <div class="stat-icon-producao" style="background-color: var(--accent-primary);"><i class="ph-fill ph-chart-line-up"></i></div>
                                    <div class="stat-content-producao">
                                        <span class="stat-value-producao">${totalMetaMomentoF} t</span>
                                        <span class="stat-label-producao">Projeção p/ Momento (Ciclo)</span>
                                    </div>
                                </div>
                                <div class="stat-progress-producao">
                                    <div class="progress-bar-bg-producao">
                                        <div class="progress-bar-fill-producao" style="width: ${progressoCicloF}%;"></div>
                                    </div>
                                    <span>${progressoCicloF}% da Meta 24h</span>
                                </div>
                            </div>

                            <div class="stat-card-producao">
                                <div class="stat-main-content-producao">
                                    <div class="stat-icon-producao ${turnoBadgeClass}"><i class="ph-fill ph-clock-afternoon"></i></div>
                                    <div class="stat-content-producao">
                                        <span class="stat-value-producao">${kpiMetaTotalTurnoF} t</span>
                                        <span class="stat-label-producao">Meta Projetada para ${metrics.turnoAtualInfo.nome}</span>
                                    </div>
                                </div>
                            </div>

                            <div class="stat-card-producao">
                                <div class="stat-main-content-producao">
                                    <div class="stat-icon-producao" style="background-color: var(--accent-edit);"><i class="ph-fill ph-gauge"></i></div>
                                    <div class="stat-content-producao">
                                        <span class="stat-value-producao">${mediaMetaHoraF} t/h</span>
                                        <span class="stat-label-producao">Média Projetada / Hora</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="chart-column-producao" id="producao-progresso-geral-chart-container">
                        <canvas id="producao-progresso-geral-chart"></canvas>
                        </div>
                </div>
            </div>
        `;
    }

    renderOverallProgressChart() {
        const canvas = document.getElementById('producao-progresso-geral-chart');
        const container = document.getElementById('producao-progresso-geral-chart-container');
        if (!canvas || typeof Chart === 'undefined') {
            console.error("Canvas para gráfico não encontrado ou Chart.js não carregado.");
            if (container) { container.innerHTML = `<p style="color: var(--text-secondary); text-align: center; font-size: 0.9rem; padding: 20px;">Gráfico indisponível.</p>`; }
            return;
        }
        if (!container) return;

        if (this.overallProgressChartInstance) {
            this.overallProgressChartInstance.destroy();
        }

        const percentComplete = this.globalMetrics.progressoCicloPercent;
        const percentRemaining = 100 - percentComplete;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error("Não foi possível obter o contexto 2D do canvas.");
            container.innerHTML = `<p style="color: var(--accent-danger); text-align: center; font-size: 0.8rem;">Erro ao obter contexto do gráfico.</p>`;
            return;
        }

        container.innerHTML = '';
        container.appendChild(canvas);

        try {
            this.overallProgressChartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    datasets: [{
                        data: [percentComplete, percentRemaining > 0 ? percentRemaining : 0],
                        backgroundColor: ['#38A169', '#4A5568'], // Verde, Cinza
                        borderWidth: 0,
                        circumference: 180,
                        rotation: -90
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: {
                         legend: { display: false },
                         tooltip: { enabled: false }
                    },
                    events: []
                }
            });

            // Adiciona o texto central via HTML sobreposto
            let centerText = container.querySelector('.chart-center-text-overlay');
            if (!centerText) {
                centerText = document.createElement('div');
                centerText.className = 'chart-center-text-overlay';
                container.appendChild(centerText);
            }
             centerText.innerHTML = `
                 <div class="chart-percentage">${percentComplete.toFixed(1)}%</div>
                 <div class="chart-label">Progresso</div>
             `;

        } catch (error) {
             console.error("Erro ao criar o gráfico Chart.js:", error);
             container.innerHTML = `<p style="color: var(--accent-danger); text-align: center; font-size: 0.8rem;">Erro ao renderizar gráfico.</p>`;
        }
    }

    renderFrentesDashboard() {
        const container = document.getElementById('producao-frentes-container');
        if (!container) return;
        container.innerHTML = '';

        const tempoPercorridoPercent = (this.cycleInfo.hoursPassed / 24) * 100;

        this.processedData.forEach(grupo => {
            if (grupo.frentes.length === 0) return;

            const cardsHTML = grupo.frentes.map(frente => {
                 if (!frente || typeof frente.nome === 'undefined' || typeof frente.cumprimento === 'undefined' || typeof frente.meta24h === 'undefined' || typeof frente.metaHora === 'undefined' || typeof frente.metaMomento === 'undefined') {
                    console.error("Dados inválidos para a frente:", frente);
                    return '<div class="producao-card error">Erro ao renderizar card da frente.</div>';
                }

                const cumprimentoNum = Number(frente.cumprimento);
                let cumprimentoClass = 'low';
                let performanceIcon = '';
                let performanceClass = '';
                let performanceTitle = '';

                if (!isNaN(cumprimentoNum)) {
                    if (cumprimentoNum >= 90) cumprimentoClass = 'high';
                    else if (cumprimentoNum >= 60) cumprimentoClass = 'medium';

                    const performanceDiff = cumprimentoNum - tempoPercorridoPercent;
                    if (performanceDiff < -10) {
                        performanceIcon = '<i class="ph-fill ph-trend-down"></i>';
                        performanceClass = 'icon-below';
                        performanceTitle = 'Projeção abaixo do esperado p/ hora';
                    } else if (performanceDiff > 10) {
                        performanceIcon = '<i class="ph-fill ph-trend-up"></i>';
                        performanceClass = 'icon-above';
                        performanceTitle = 'Projeção acima do esperado p/ hora';
                    } else {
                        performanceIcon = '<i class="ph-fill ph-pause-circle"></i>';
                        performanceClass = 'icon-on-track';
                        performanceTitle = 'Projeção dentro do esperado p/ hora';
                    }
                } else {
                     performanceTitle = 'Dados de projeção indisponíveis';
                     performanceIcon = '<i class="ph-fill ph-question"></i>';
                     performanceClass = 'icon-unknown';
                }

                const meta24hF = Number(frente.meta24h).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
                const metaHoraF = Number(frente.metaHora).toFixed(2);
                const metaMomentoF = Number(frente.metaMomento).toFixed(2);
                const cumprimentoF = !isNaN(cumprimentoNum) ? cumprimentoNum.toFixed(1) : 'N/A';
                const cumprimentoWidth = !isNaN(cumprimentoNum) ? Math.min(cumprimentoNum, 100).toFixed(2) : '0';

                return `
                    <div class="producao-card">
                        <span class="performance-indicator ${performanceClass}" title="${performanceTitle}">
                            ${performanceIcon}
                        </span>

                        <h3 class="producao-frente-nome">${frente.nome}</h3>
                        <div class="producao-progress-bar-container">
                            <div class="producao-progress-bar-fill ${cumprimentoClass}" style="width: ${cumprimentoWidth}%;"></div>
                            <span class="producao-progress-label">Projeção: ${cumprimentoF}%</span>
                        </div>
                        <div class="producao-stats-grid">
                            <div class="stat-item">
                                <span class="stat-label">Cota 24h (Meta)</span>
                                <span class="stat-value cota">${meta24hF} t</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Meta / Hora</span>
                                <span class="stat-value hora">${metaHoraF} t</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Meta p/ Momento</span>
                                <span class="stat-value momento">${metaMomentoF} t</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            container.innerHTML += `
                <div class="producao-group-header">
                    <h2 class="producao-group-title">${grupo.titulo}</h2>
                    <div class="producao-group-totals">
                        <span class="producao-group-total total-meta-24h">
                            Meta 24h:
                            <strong>${Number(grupo.totalMeta24h).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} t</strong>
                        </span>
                        <span class="producao-group-total">
                            Meta p/ Momento:
                            <strong>${Number(grupo.totalMetaMomento).toFixed(2)} t</strong>
                        </span>
                    </div>
                </div>
                <div class="producao-grid">
                    ${cardsHTML}
                </div>
            `;
        });
    }

    addEventListeners() {
        // Verifica se this.container existe antes de adicionar o listener
        if (this.container) {
            this.container.addEventListener('click', (e) => {
                if (e.target.closest('#refresh-boletim')) {
                    this.show();
                    showToast('Metas recalculadas para a hora atual!', 'success');
                }
            });
        }
    }
}