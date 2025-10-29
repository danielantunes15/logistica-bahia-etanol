// js/views/boletimProducao.js
import { showToast, handleOperation, showLoading, hideLoading } from '../helpers.js';
import { formatDateTime } from '../timeUtils.js';
import { dataCache } from '../dataCache.js';

export class BoletimProducaoView {
    constructor() {
        this.container = null;
        this.cycleInfo = null;
        this.processedData = [];
        this.allFrentes = []; // Para armazenar os dados do cache
    }

    async show() {
        await this.loadData();
        // Só calcula e renderiza se tiver dados carregados
        if (this.allFrentes.length > 0) {
            this.calculateCycleData();
            await this.loadHTML();
            this.renderDashboard();
            this.addEventListeners();
        } else {
             // Mostra uma mensagem se não houver frentes com metas e tipo definidos
             await this.loadHTML(true); // Passa true para mostrar erro
        }
    }

    async hide() {}

    async loadData(forceRefresh = false) {
        showLoading();
        try {
            const masterData = await dataCache.fetchMasterDataOnly(forceRefresh);

            // Armazena as frentes que têm meta E tipo de produção definido
            this.allFrentes = (masterData.frentes_servico || []).filter(f => {
                const metaInfo = Array.isArray(f.frentes_metas) ? f.frentes_metas[0] : f.frentes_metas;
                // Garante que tenha meta > 0 E que o tipo_producao NÃO seja nulo ou vazio
                return metaInfo && metaInfo.meta_toneladas > 0 && f.tipo_producao;
            });

        } catch (error) {
            console.error('Erro ao carregar dados do boletim:', error);
            handleOperation(error, "Erro ao carregar frentes e metas.");
            this.allFrentes = []; // Limpa em caso de erro
        } finally {
            hideLoading();
        }
    }

    async loadHTML(showError = false) {
        const container = document.getElementById('views-container');
        container.innerHTML = this.getHTML(showError); // Passa o flag de erro
        this.container = container.querySelector('#boletim-producao-view');
    }

    /**
     * Calcula o ciclo de 24h (07:00 às 06:59) e
     * processa os dados VINDOS DO CACHE com base no tempo passado.
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

        this.cycleInfo = {
            start: cycleStart,
            end: cycleEnd,
            hoursPassed: hoursPassed
        };

        // --- INÍCIO DA LÓGICA DE AGRUPAMENTO DINÂMICO ---

        // Inicializa os grupos
        const gruposProcessados = {
            "MANUAL": { titulo: "CANA MANUAL", frentes: [], totalMetaMomento: 0 }, // <-- Adiciona total
            "MECANIZADA": { titulo: "CANA MECANIZADA", frentes: [], totalMetaMomento: 0 } // <-- Adiciona total
        };

        // --- LÓGICA DE AGREGAÇÃO PARA "AGRO UNIONE - MANUAL" ---
        const frentesAgregadas = [];
        let agroUnioneManualAgregada = {
            nome: "AGRO UNIONE - MANUAL",
            meta_toneladas_total: 0,
            tipo_producao: 'MANUAL',
            frentes_metas: []
        };
        let encontrouAgroUnioneManual = false;

        this.allFrentes.forEach(frente => {
            const metaInfo = Array.isArray(frente.frentes_metas) ? frente.frentes_metas[0] : frente.frentes_metas;
            const meta_toneladas = metaInfo ? metaInfo.meta_toneladas : 0;

            if (frente.nome.toUpperCase().startsWith('AGRO UNIONE - MANUAL')) {
                agroUnioneManualAgregada.meta_toneladas_total += meta_toneladas;
                encontrouAgroUnioneManual = true;
            } else {
                frentesAgregadas.push(frente);
            }
        });

        if (encontrouAgroUnioneManual && agroUnioneManualAgregada.meta_toneladas_total > 0) {
            frentesAgregadas.push({
                nome: agroUnioneManualAgregada.nome,
                tipo_producao: agroUnioneManualAgregada.tipo_producao,
                frentes_metas: [{ meta_toneladas: agroUnioneManualAgregada.meta_toneladas_total }]
            });
        }
        // --- FIM DA AGREGAÇÃO ---

        // 3. Processamento dos dados (agora usa frentesAgregadas)
        frentesAgregadas.forEach(frente => {
            const metaInfo = Array.isArray(frente.frentes_metas) ? frente.frentes_metas[0] : frente.frentes_metas;
            const meta24h = metaInfo.meta_toneladas;

            const metaHora = meta24h / 24;
            const metaMomento = metaHora * hoursPassed;
            const cumprimento = meta24h > 0 ? (metaMomento / meta24h) * 100 : 0;

            const frenteProcessada = {
                nome: frente.nome,
                meta24h: meta24h,
                metaHora: metaHora,
                metaMomento: metaMomento, // <-- Valor que vamos somar
                cumprimento: cumprimento
            };

            // Agrupamento dinâmico
            if (frente.tipo_producao === 'MANUAL' && gruposProcessados["MANUAL"]) {
                gruposProcessados["MANUAL"].frentes.push(frenteProcessada);
                gruposProcessados["MANUAL"].totalMetaMomento += metaMomento; // <-- SOMA AQUI
            } else if (frente.tipo_producao === 'MECANIZADA' && gruposProcessados["MECANIZADA"]) {
                gruposProcessados["MECANIZADA"].frentes.push(frenteProcessada);
                gruposProcessados["MECANIZADA"].totalMetaMomento += metaMomento; // <-- SOMA AQUI
            }
        });

        // Ordena as frentes dentro de cada grupo
        gruposProcessados["MANUAL"].frentes.sort((a, b) => a.nome.localeCompare(b.nome));
        gruposProcessados["MECANIZADA"].frentes.sort((a, b) => a.nome.localeCompare(b.nome));

        // Converte o objeto em array (apenas os grupos que têm frentes)
        this.processedData = Object.values(gruposProcessados).filter(g => g.frentes.length > 0);
        // --- FIM DA LÓGICA DE AGRUPAMENTO DINÂMICO ---
    }

    getHTML(showError = false) { // Recebe flag de erro
        const cycleStartStr = this.cycleInfo ? this.cycleInfo.start.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'N/A';
        const cycleEndStr = this.cycleInfo ? this.cycleInfo.end.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'N/A';
        const hoursPassedStr = this.cycleInfo ? this.cycleInfo.hoursPassed.toFixed(2).replace('.', ',') : 'N/A';

        const dashboardContent = showError || this.allFrentes.length === 0 ? `
            <div class="empty-state" style="padding: 40px; text-align: center;">
                <i class="ph-fill ph-warning" style="font-size: 3rem; color: var(--accent-danger);"></i>
                <p style="color: var(--text-primary); font-size: 1.1rem;">Não foi possível carregar o boletim.</p>
                <p style="color: var(--text-secondary);">Verifique se as frentes possuem metas definidas e estão atribuídas a um Grupo de Produção (Manual/Mecanizada) no cadastro.</p>
            </div>
        ` : `
            <div id="producao-dashboard-container">
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
                
                <div class="producao-cycle-info">
                    <i class="ph-fill ph-calendar-check"></i>
                    Ciclo: <strong>${cycleStartStr}</strong> até <strong>${cycleEndStr}</strong>
                </div>
                
                <div class="producao-cycle-info" style="border-left-color: var(--border-color);">
                    <i class="ph-fill ph-clock" style="color: var(--text-primary);"></i>
                    Horas decorridas no ciclo: <strong>${hoursPassedStr} horas</strong>
                </div>

                ${dashboardContent} 
            </div>
        `;
    }

    renderDashboard() {
        const container = document.getElementById('producao-dashboard-container');
        if (!container) return;

        container.innerHTML = ''; // Limpa antes de renderizar

        this.processedData.forEach(grupo => {
            
            if (grupo.frentes.length === 0) return;

            const cardsHTML = grupo.frentes.map(frente => {
                let cumprimentoClass = 'low';
                if (frente.cumprimento >= 90) cumprimentoClass = 'high';
                else if (frente.cumprimento >= 60) cumprimentoClass = 'medium';

                return `
                    <div class="producao-card">
                        <h3 class="producao-frente-nome">${frente.nome}</h3>
                        
                        <div class="producao-progress-bar-container">
                            <div class="producao-progress-bar-fill ${cumprimentoClass}" style="width: ${frente.cumprimento.toFixed(2)}%;"></div>
                            <span class="producao-progress-label">Projeção: ${frente.cumprimento.toFixed(1)}%</span>
                        </div>
                        
                        <div class="producao-stats-grid">
                            <div class="stat-item">
                                <span class="stat-label">Cota 24h (Meta)</span>
                                <span class="stat-value cota">${frente.meta24h.toLocaleString('pt-BR')} t</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Meta / Hora</span>
                                <span class="stat-value hora">${frente.metaHora.toFixed(2)} t</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Meta p/ Momento</span>
                                <span class="stat-value momento">${frente.metaMomento.toFixed(2)} t</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            // --- MODIFICAÇÃO AQUI: Adiciona o total ao lado do título ---
            container.innerHTML += `
                <div class="producao-group-header">
                    <h2 class="producao-group-title">${grupo.titulo}</h2>
                    <span class="producao-group-total">
                        Meta p/ Momento (Total): 
                        <strong>${grupo.totalMetaMomento.toFixed(2)} t</strong>
                    </span>
                </div>
                <div class="producao-grid">
                    ${cardsHTML}
                </div>
            `;
            // --- FIM DA MODIFICAÇÃO ---
        });
    }

    addEventListeners() {
        // Listener para o botão de recalcular
        this.container.addEventListener('click', (e) => {
            if (e.target.closest('#refresh-boletim')) {
                this.show(); 
                showToast('Metas recalculadas para a hora atual!', 'success');
            }
        });
    }
}