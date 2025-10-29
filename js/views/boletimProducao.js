// js/views/boletimProducao.js
import { showToast, handleOperation, showLoading, hideLoading } from '../helpers.js';
// ADICIONADO: getCurrentShift para calcular a meta do turno
import { formatDateTime, getCurrentShift } from '../timeUtils.js';
import { dataCache } from '../dataCache.js';

export class BoletimProducaoView {
    constructor() {
        this.container = null;
        this.cycleInfo = null;
        this.processedData = [];
        this.allFrentes = [];
        // NOVOS ATRIBUTOS PARA KPIs GLOBAIS
        this.globalMetrics = {
            totalMeta24h: 0,
            totalMetaMomento: 0,
            metaTurnoAtual: 0,
            mediaMetaHora: 0,
            progressoCicloPercent: 0,
            turnoAtualInfo: {}
        };
    }

    async show() {
        await this.loadData();
        // Só calcula e renderiza se tiver dados carregados
        if (this.allFrentes.length > 0) {
            this.calculateCycleData(); // Calcula dados globais e por frente
            await this.loadHTML(); // Carrega o HTML (que agora inclui o placeholder do top dashboard)
            this.renderTopDashboard(); // Renderiza o dashboard superior com os KPIs globais
            this.renderFrentesDashboard(); // Renderiza os cards das frentes (corrigido)
            this.addEventListeners();
        } else {
             // Mostra uma mensagem se não houver frentes com metas e tipo definidos
             await this.loadHTML(true); // Passa true para mostrar erro
        }
    }

    async hide() {}

    async loadData(forceRefresh = false) {
        showLoading(); //
        try {
            const masterData = await dataCache.fetchMasterDataOnly(forceRefresh); //

            // Armazena as frentes que têm meta E tipo de produção definido
            this.allFrentes = (masterData.frentes_servico || []).filter(f => { //
                const metaInfo = Array.isArray(f.frentes_metas) ? f.frentes_metas[0] : f.frentes_metas; //
                // Garante que tenha meta > 0 E que o tipo_producao NÃO seja nulo ou vazio e seja MANUAL ou MECANIZADA
                return metaInfo && metaInfo.meta_toneladas > 0 && f.tipo_producao && ['MANUAL', 'MECANIZADA'].includes(f.tipo_producao); //
            });

        } catch (error) {
            console.error('Erro ao carregar dados do boletim:', error);
            handleOperation(error, "Erro ao carregar frentes e metas."); //
            this.allFrentes = []; // Limpa em caso de erro
        } finally {
            hideLoading(); //
        }
    }

    async loadHTML(showError = false) {
        const container = document.getElementById('views-container');
        container.innerHTML = this.getHTML(showError); // Passa o flag de erro
        this.container = container.querySelector('#boletim-producao-view');
    }

    /**
     * Calcula dados do ciclo, KPIs globais e processa frentes.
     */
    calculateCycleData() {
        // 1. Cálculo do Ciclo (Horas Passadas)
        const now = new Date();
        const cycleStart = new Date();
        if (now.getHours() < 7) {
            cycleStart.setDate(now.getDate() - 1);
        }
        cycleStart.setHours(7, 0, 0, 0);

        const cycleEnd = new Date(cycleStart);
        cycleEnd.setDate(cycleStart.getDate() + 1);
        cycleEnd.setHours(6, 59, 59, 999);

        const msPassed = now.getTime() - cycleStart.getTime();
        let hoursPassed = msPassed / (1000 * 60 * 60);

        if (hoursPassed > 24) hoursPassed = 24;
        if (hoursPassed < 0) hoursPassed = 0;

        // Mantém o cálculo interno, mas não será exibido
        this.cycleInfo = {
            start: cycleStart,
            end: cycleEnd,
            hoursPassed: hoursPassed
        };

        // --- INÍCIO CÁLCULO KPIs GLOBAIS E PROCESSAMENTO FRENTES ---
        let totalMeta24hGlobal = 0;
        let totalMetaMomentoGlobal = 0;

        // Resetar dados processados e grupos
        this.processedData = [];
        const gruposProcessados = {
            "MANUAL": { titulo: "CANA MANUAL", frentes: [], totalMetaMomento: 0, totalMeta24h: 0 },
            "MECANIZADA": { titulo: "CANA MECANIZADA", frentes: [], totalMetaMomento: 0, totalMeta24h: 0 }
        };

        // Lógica de Agregação (Agro Unione Manual)
        const frentesAgregadas = [];
        let agroUnioneManualAgregada = {
            nome: "AGRO UNIONE - MANUAL",
            meta_toneladas_total: 0,
            tipo_producao: 'MANUAL',
            frentes_metas: [] // Garante que frentes_metas exista
        };
        let encontrouAgroUnioneManual = false;

        this.allFrentes.forEach(frente => {
            const metaInfo = Array.isArray(frente.frentes_metas) ? frente.frentes_metas[0] : frente.frentes_metas; //
            const meta_toneladas = metaInfo ? metaInfo.meta_toneladas : 0; //

            // Verifica se o nome da frente no DB começa com "AGRO UNIONE - MANUAL"
            if (frente.nome.toUpperCase().startsWith('AGRO UNIONE - MANUAL')) { //
                agroUnioneManualAgregada.meta_toneladas_total += meta_toneladas;
                encontrouAgroUnioneManual = true; // Marca que encontrou pelo menos uma
            } else {
                // Se não for, apenas passa a frente original adiante
                frentesAgregadas.push(frente);
            }
        });

        // Adiciona a frente agregada (se ela tiver meta e foi encontrada)
        if (encontrouAgroUnioneManual && agroUnioneManualAgregada.meta_toneladas_total > 0) {
            // Recria a estrutura do objeto
            frentesAgregadas.push({
                nome: agroUnioneManualAgregada.nome,
                tipo_producao: agroUnioneManualAgregada.tipo_producao, //
                frentes_metas: [{ meta_toneladas: agroUnioneManualAgregada.meta_toneladas_total }] // Adiciona a meta agregada na estrutura esperada
            });
        }
        // --- FIM DA AGREGAÇÃO ---


        // 3. Processamento dos dados (agora usa frentesAgregadas)
        frentesAgregadas.forEach(frente => {
            const metaInfo = Array.isArray(frente.frentes_metas) ? frente.frentes_metas[0] : frente.frentes_metas; //
            const meta24h = metaInfo ? metaInfo.meta_toneladas : 0; // Garante que meta24h seja numérico

            totalMeta24hGlobal += meta24h; // Acumula meta global

            const metaHora = meta24h / 24;
            const metaMomento = metaHora * hoursPassed;
            totalMetaMomentoGlobal += metaMomento; // Acumula meta momento global

            const cumprimento = meta24h > 0 ? (metaMomento / meta24h) * 100 : 0;

            const frenteProcessada = {
                nome: frente.nome, //
                meta24h: meta24h,
                metaHora: metaHora,
                metaMomento: metaMomento, // <-- Valor que vamos somar
                cumprimento: cumprimento
            };

            // Agrupamento dinâmico
            if (frente.tipo_producao === 'MANUAL' && gruposProcessados["MANUAL"]) { //
                gruposProcessados["MANUAL"].frentes.push(frenteProcessada);
                gruposProcessados["MANUAL"].totalMetaMomento += metaMomento; // <-- SOMA MOMENTO
                gruposProcessados["MANUAL"].totalMeta24h += meta24h; // <-- SOMA 24H
            } else if (frente.tipo_producao === 'MECANIZADA' && gruposProcessados["MECANIZADA"]) { //
                gruposProcessados["MECANIZADA"].frentes.push(frenteProcessada);
                gruposProcessados["MECANIZADA"].totalMetaMomento += metaMomento; // <-- SOMA MOMENTO
                gruposProcessados["MECANIZADA"].totalMeta24h += meta24h; // <-- SOMA 24H
            }
        });

        // Ordena as frentes dentro de cada grupo
        gruposProcessados["MANUAL"].frentes.sort((a, b) => a.nome.localeCompare(b.nome));
        gruposProcessados["MECANIZADA"].frentes.sort((a, b) => a.nome.localeCompare(b.nome));

        // Converte o objeto em array (apenas os grupos que têm frentes)
        this.processedData = Object.values(gruposProcessados).filter(g => g.frentes.length > 0);

        // --- CÁLCULO DA META DO TURNO ATUAL ---
        const turnoAtualInfo = getCurrentShift(); // Pega info do turno atual (A, B, C)
        let metaTurnoAtual = 0;
        const mediaMetaHoraGlobal = totalMeta24hGlobal > 0 ? totalMeta24hGlobal / 24 : 0; // Evita divisão por zero

        // Duração de cada turno em horas (aproximado)
        const duracaoTurnoA = 8 + (5 / 60);  // 7:00 as 15:05 -> ~8.08h
        const duracaoTurnoB = 8 + (35 / 60); // 15:05 as 23:40 -> ~8.58h
        const duracaoTurnoC = 7 + (20 / 60); // 23:40 as 7:00  -> ~7.33h (Total ~24h)

        if (turnoAtualInfo.turno === 'A') {
            metaTurnoAtual = mediaMetaHoraGlobal * duracaoTurnoA;
        } else if (turnoAtualInfo.turno === 'B') {
            metaTurnoAtual = mediaMetaHoraGlobal * duracaoTurnoB;
        } else { // Turno C
            metaTurnoAtual = mediaMetaHoraGlobal * duracaoTurnoC;
        }

        // Armazena os KPIs globais
        this.globalMetrics = {
            totalMeta24h: totalMeta24hGlobal,
            totalMetaMomento: totalMetaMomentoGlobal,
            metaTurnoAtual: metaTurnoAtual,
            mediaMetaHora: mediaMetaHoraGlobal,
            progressoCicloPercent: totalMeta24hGlobal > 0 ? (totalMetaMomentoGlobal / totalMeta24hGlobal) * 100 : 0, // Usa meta momento / meta total 24h
            turnoAtualInfo: turnoAtualInfo // Guarda A, B ou C e horários
        };
        // --- FIM CÁLCULO KPIs GLOBAIS ---
    }

    getHTML(showError = false) {
        // Mensagem de erro ou container normal
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

     /**
     * NOVO: Renderiza o dashboard superior com KPIs globais.
     */
    renderTopDashboard() {
        const topContainer = document.getElementById('producao-top-dashboard');
        if (!topContainer) return;

        const metrics = this.globalMetrics;
        const turnoBadgeClass = `turno-${metrics.turnoAtualInfo.turno.toLowerCase()}`;

        // Formatação dos números
        const totalMeta24hF = metrics.totalMeta24h.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
        const totalMetaMomentoF = metrics.totalMetaMomento.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
        const metaTurnoAtualF = metrics.metaTurnoAtual.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
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

                <div class="stats-grid-producao">
                    <div class="stat-card-producao">
                        <div class="stat-icon-producao"><i class="ph-fill ph-target"></i></div>
                        <div class="stat-content-producao">
                            <span class="stat-value-producao">${totalMeta24hF} t</span>
                            <span class="stat-label-producao">Meta Total (24h)</span>
                        </div>
                    </div>

                    <div class="stat-card-producao">
                        <div class="stat-icon-producao" style="background-color: var(--accent-primary);"><i class="ph-fill ph-chart-line-up"></i></div>
                        <div class="stat-content-producao">
                            <span class="stat-value-producao">${totalMetaMomentoF} t</span>
                            <span class="stat-label-producao">Projeção p/ Momento</span>
                        </div>
                        <div class="stat-progress-producao">
                             <div class="progress-bar-bg-producao">
                                 <div class="progress-bar-fill-producao" style="width: ${progressoCicloF}%;"></div>
                             </div>
                             <span>${progressoCicloF}% da Meta</span> </div>
                    </div>

                    <div class="stat-card-producao">
                         <div class="stat-icon-producao ${turnoBadgeClass}"><i class="ph-fill ph-clock"></i></div>
                        <div class="stat-content-producao">
                            <span class="stat-value-producao">${metaTurnoAtualF} t</span>
                            <span class="stat-label-producao">Projeção p/ ${metrics.turnoAtualInfo.nome}</span>
                        </div>
                    </div>

                    <div class="stat-card-producao">
                        <div class="stat-icon-producao" style="background-color: var(--accent-edit);"><i class="ph-fill ph-gauge"></i></div>
                        <div class="stat-content-producao">
                            <span class="stat-value-producao">${mediaMetaHoraF} t/h</span>
                            <span class="stat-label-producao">Média Projetada / Hora</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * CORRIGIDO: Renderiza os cards das frentes (lógica anterior, renomeada).
     */
    renderFrentesDashboard() {
        const container = document.getElementById('producao-frentes-container'); // Container específico para as frentes
        if (!container) return;
        container.innerHTML = ''; // Limpa antes de renderizar

        this.processedData.forEach(grupo => {
            if (grupo.frentes.length === 0) return;

            // *** INÍCIO DA CORREÇÃO ***
            // Verifica se os dados da frente estão corretos antes de gerar o HTML
            const cardsHTML = grupo.frentes.map(frente => {
                // Validação básica dos dados esperados
                if (!frente || typeof frente.nome === 'undefined' || typeof frente.cumprimento === 'undefined' || typeof frente.meta24h === 'undefined' || typeof frente.metaHora === 'undefined' || typeof frente.metaMomento === 'undefined') {
                    console.error("Dados inválidos para a frente:", frente);
                    return '<div class="producao-card error">Erro ao renderizar card da frente.</div>'; // Card de erro
                }

                let cumprimentoClass = 'low';
                // Garante que cumprimento seja um número antes de comparar
                const cumprimentoNum = Number(frente.cumprimento);
                if (!isNaN(cumprimentoNum)) {
                    if (cumprimentoNum >= 90) cumprimentoClass = 'high';
                    else if (cumprimentoNum >= 60) cumprimentoClass = 'medium';
                } else {
                     console.warn(`Valor de cumprimento inválido para ${frente.nome}: ${frente.cumprimento}`);
                }

                // Garante que valores numéricos sejam formatados corretamente
                const meta24hF = Number(frente.meta24h).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
                const metaHoraF = Number(frente.metaHora).toFixed(2);
                const metaMomentoF = Number(frente.metaMomento).toFixed(2);
                const cumprimentoF = !isNaN(cumprimentoNum) ? cumprimentoNum.toFixed(1) : 'N/A';
                const cumprimentoWidth = !isNaN(cumprimentoNum) ? cumprimentoNum.toFixed(2) : '0'; // Usa 2 decimais para a barra

                // Estrutura HTML completa do card
                return `
                    <div class="producao-card">
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
            // *** FIM DA CORREÇÃO ***

            // Adiciona o cabeçalho do grupo e os cards
            container.innerHTML += `
                <div class="producao-group-header">
                    <h2 class="producao-group-title">${grupo.titulo}</h2>
                    <div class="producao-group-totals">
                        <span class="producao-group-total">
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
        // Listener para o botão de recalcular
        this.container.addEventListener('click', (e) => {
            if (e.target.closest('#refresh-boletim')) {
                this.show();
                showToast('Metas recalculadas para a hora atual!', 'success'); //
            }
        });
    }
}