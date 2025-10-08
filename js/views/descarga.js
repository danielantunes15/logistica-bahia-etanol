// js/views/descarga.js
import { fetchAllData } from '../api.js';
import { showToast, formatDateTime } from '../helpers.js';

export class DescargaView {
    constructor() {
        this.container = null;
        this.data = {};
        this.statusToMonitor = 'descarregando';
        this.autoRefreshInterval = null;
    }

    async show() {
        await this.loadHTML();
        await this.loadData();
        this.startAutoRefresh();
        this.addEventListeners();
    }

    async hide() {
        this.stopAutoRefresh();
    }

    async loadHTML() {
        const container = document.getElementById('views-container');
        container.innerHTML = this.getHTML();
        this.container = container.querySelector('#descarga-view');
    }

    getHTML() {
        return `
            <div id="descarga-view" class="view active-view controle-view">
                <div class="controle-header">
                    <h1>Caminhões em Descarga na Usina</h1>
                    <button class="btn-primary" id="refresh-descarga">
                        <i class="ph-fill ph-arrows-clockwise"></i>
                        Atualizar
                    </button>
                </div>
                <div id="descarga-grid" class="descarga-grid">
                    <div class="empty-state-descarga">
                        <i class="ph-fill ph-info"></i>
                        <p>Carregando dados...</p>
                    </div>
                </div>
            </div>
        `;
    }

    startAutoRefresh() {
        // Atualizar a cada 15 segundos
        this.autoRefreshInterval = setInterval(() => {
            this.loadData();
        }, 15000);
    }

    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }

    async loadData() {
        // showLoading() e hideLoading() estão desativados (conforme sua solicitação anterior)
        try {
            this.data = await fetchAllData();
            this.processAndRender();
        } catch (error) {
            showToast('Erro ao carregar dados de descarga', 'error');
            console.error('Erro ao carregar dados de descarga:', error);
        }
    }

    processAndRender() {
        const { caminhoes = [], frentes_servico = [], caminhao_historico = [] } = this.data;

        // 1. Filtrar caminhões que estão descarregando e associados a uma frente
        const caminhoesEmDescarga = caminhoes.filter(c => c.status === this.statusToMonitor && c.frente_id);

        if (caminhoesEmDescarga.length === 0) {
            this.renderEmptyState();
            return;
        }

        // 2. Encontrar o timestamp de entrada para o status 'descarregando' para cada caminhão
        const entradaDescargaMap = new Map();
        
        // Ordena o histórico do mais novo para o mais antigo para encontrar o último log de 'descarregando'
        const sortedHistory = caminhao_historico.sort((a, b) => new Date(b.timestamp_mudanca) - new Date(a.timestamp_mudanca));

        caminhoesEmDescarga.forEach(caminhao => {
            // Encontra o log mais recente onde o status_novo foi 'descarregando'
            const latestLog = sortedHistory.find(log => log.caminhao_id === caminhao.id && log.status_novo === this.statusToMonitor);
            
            if (latestLog) {
                entradaDescargaMap.set(caminhao.id, {
                    timestamp: new Date(latestLog.timestamp_mudanca),
                    logId: latestLog.id
                });
            } else {
                 // Fallback (embora improvável para status ativo)
                 entradaDescargaMap.set(caminhao.id, {
                    timestamp: new Date(caminhao.created_at),
                    logId: null
                });
            }
        });
        
        // 3. Agrupar por Frente e adicionar a hora de entrada
        const descargaPorFrente = new Map();
        const frentesMap = new Map(frentes_servico.map(f => [f.id, f]));

        caminhoesEmDescarga.forEach(caminhao => {
            const frente = frentesMap.get(caminhao.frente_id);
            const entradaInfo = entradaDescargaMap.get(caminhao.id);
            
            if (frente && entradaInfo) {
                if (!descargaPorFrente.has(frente.id)) {
                    descargaPorFrente.set(frente.id, {
                        frenteNome: frente.nome,
                        caminhoes: []
                    });
                }
                
                descargaPorFrente.get(frente.id).caminhoes.push({
                    cod_equipamento: caminhao.cod_equipamento,
                    entrada: entradaInfo.timestamp,
                    id: caminhao.id
                });
            }
        });

        // 4. Ordenar caminhões dentro de cada frente por hora de entrada (mais antigos primeiro = ordem de chegada)
        descargaPorFrente.forEach(grupo => {
            grupo.caminhoes.sort((a, b) => a.entrada - b.entrada);
        });

        // 5. Renderizar o grid de colunas
        this.renderGrid(descargaPorFrente);
    }
    
    renderEmptyState() {
        const grid = document.getElementById('descarga-grid');
        if (grid) {
             grid.innerHTML = `
                <div class="empty-state-descarga" style="grid-column: 1 / -1;">
                    <i class="ph-fill ph-check-square-offset" style="color: var(--accent-primary);"></i>
                    <p>Nenhum caminhão atualmente no status 'Descarregando'.</p>
                </div>
            `;
             grid.style.gridTemplateColumns = '1fr';
        }
    }

    renderGrid(descargaPorFrente) {
        const grid = document.getElementById('descarga-grid');
        if (!grid) return;
        
        // 1. Configurar o número de colunas dinamicamente
        const numColunas = Math.max(1, descargaPorFrente.size); // Mínimo de 1
        grid.style.gridTemplateColumns = `repeat(${numColunas}, 1fr)`;

        // 2. Gerar o HTML para cada coluna
        let gridHTML = '';
        descargaPorFrente.forEach(grupo => {
            const listaCaminhoesHTML = grupo.caminhoes.map(caminhao => `
                <div class="descarga-card">
                    <div class="descarga-cod">#${caminhao.cod_equipamento}</div>
                    <div class="descarga-time">${formatDateTime(caminhao.entrada)}</div>
                </div>
            `).join('');

            gridHTML += `
                <div class="descarga-coluna">
                    <h2 class="descarga-frente-title">${grupo.frenteNome}</h2>
                    <div class="descarga-list">
                        ${listaCaminhoesHTML}
                    </div>
                </div>
            `;
        });

        grid.innerHTML = gridHTML;
    }
    
    addEventListeners() {
        const refreshBtn = document.getElementById('refresh-descarga');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadData();
                showToast('Fila de descarga atualizada', 'success');
            });
        }
    }
}