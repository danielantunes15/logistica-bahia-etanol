// js/views/patioCarregado.js

import { fetchAllData } from '../api.js';
import { showToast } from '../helpers.js';
import { formatDateTime } from '../timeUtils.js'; 
import { dataCache } from '../dataCache.js'; 

export class PatioCarregadoView {
    constructor() {
        this.container = null;
        this.data = {};
        // MODIFICADO: Status a ser monitorado agora é patio_carregado
        this.statusToMonitor = 'patio_carregado';
        this.autoRefreshInterval = null;
        this._boundStatusUpdateHandler = this.handleStatusUpdate.bind(this); 
    }

    async show() {
        await this.loadHTML();
        await this.loadData();
        this.addEventListeners();
        
        // NOVO: Adiciona o listener de Real-Time
        window.addEventListener('statusUpdated', this._boundStatusUpdateHandler); 
    }

    async hide() {
        // NOVO: Remove o listener ao sair da view
        window.removeEventListener('statusUpdated', this._boundStatusUpdateHandler);
    }
    
    // NOVO: Handler para o evento global
    handleStatusUpdate(e) {
        // Apenas recarrega se o evento for na tabela de caminhões
        if (e.detail.table === 'caminhoes') {
             // Força o refresh para buscar a nova versão que invalidou o cache
             this.loadData(true); 
        }
    }

    async loadHTML() {
        const container = document.getElementById('views-container');
        container.innerHTML = this.getHTML();
        this.container = container.querySelector('#patio-carregado-view');
    }

    getHTML() {
        return `
            <div id="patio-carregado-view" class="view active-view controle-view">
                <div class="controle-header">
                    <h1>Pátio Carregado (Aguardando Descarga)</h1>
                    <button class="btn-primary" id="refresh-patio">
                        <i class="ph-fill ph-arrows-clockwise"></i>
                        Atualizar
                    </button>
                </div>
                <div id="patio-carregado-grid" class="descarga-grid">
                    <div class="empty-state-descarga" style="grid-column: 1 / -1;">
                        <i class="ph-fill ph-info"></i>
                        <p>Carregando dados...</p>
                    </div>
                </div>
            </div>
        `;
    }

    async loadData(forceRefresh = false) {
        try {
            // Usa fetchAllData pois precisa do caminhao_historico para a hora de entrada no pátio carregado.
            this.data = await dataCache.fetchAllData(forceRefresh); 
            this.processAndRender();
        } catch (error) {
            showToast('Erro ao carregar dados do pátio carregado', 'error');
            console.error('Erro ao carregar dados do pátio carregado:', error);
        }
    }

    processAndRender() {
        const { caminhoes = [], frentes_servico = [], caminhao_historico = [] } = this.data;

        // 1. Define Fixed Groups with initial empty data (Reutiliza a mesma estrutura de agrupamento por Frente)
        const fixedGroups = [
            {
                columnName: 'AGRO UNIONE',
                frentes: ['AGRO UNIONE - MANUAL 01', 'AGRO UNIONE - MANUAL 02', 'AGRO UNIONE - MECANIZADA'],
                data: [], 
            },
            {
                columnName: 'CANA INTEIRA BEL',
                frentes: ['RG TRANSPORTE', 'CASTRO SERVIÇOS AGRI', 'GM AGRONEGÓCIO E SER'],
                data: [],
            },
            {
                columnName: 'CANA MECANIZADA BEL',
                frentes: ['PEDRO EPSON', 'AGROTERRA MECANIZADA', 'VALE DO ARAGUAIA', 'E. DOS SANTOS'],
                data: [],
            }
        ];

        // 2. Filter trucks and find entry time
        // MODIFICADO: Filtra pelo status 'patio_carregado'
        const caminhoesNoPatio = caminhoes.filter(c => c.status === this.statusToMonitor && c.frente_id);
        const sortedHistory = caminhao_historico.sort((a, b) => new Date(b.timestamp_mudanca) - new Date(a.timestamp_mudanca));
        const entradaPatioMap = new Map();

        caminhoesNoPatio.forEach(caminhao => {
            // Encontra o log mais recente onde o status mudou para 'patio_carregado'
            const latestLog = sortedHistory.find(log => log.caminhao_id === caminhao.id && log.status_novo === this.statusToMonitor);
            
            // Mantém como objeto Date, formatDateTime pode receber tanto string quanto Date object
            entradaPatioMap.set(caminhao.id, {
                timestamp: new Date(latestLog ? latestLog.timestamp_mudanca : caminhao.created_at),
                logId: latestLog ? latestLog.id : null
            });
        });
        
        // 3. Group trucks into fixed columns
        const frentesMap = new Map(frentes_servico.map(f => [f.id, f]));

        caminhoesNoPatio.forEach(caminhao => {
            const frente = frentesMap.get(caminhao.frente_id);
            const frenteNome = frente ? frente.nome : null;
            const entradaInfo = entradaPatioMap.get(caminhao.id);

            if (frenteNome && entradaInfo) {
                const truckData = {
                    cod_equipamento: caminhao.cod_equipamento,
                    entrada: entradaInfo.timestamp,
                    id: caminhao.id,
                    frente_nome_origem: frenteNome, 
                };

                // Find which fixed group this truck belongs to
                for (const group of fixedGroups) {
                    if (group.frentes.includes(frenteNome)) {
                        group.data.push(truckData);
                        break;
                    }
                }
            }
        });

        // 4. Order trucks within each fixed group by entry time (oldest first)
        fixedGroups.forEach(group => {
            group.data.sort((a, b) => a.entrada - b.entrada);
        });

        // 5. Render the grid
        this.renderGrid(fixedGroups);
    }
    
    renderGrid(fixedGroups) {
        const grid = document.getElementById('patio-carregado-grid');
        if (!grid) return;
        
        // Always set 3 columns
        grid.style.gridTemplateColumns = `repeat(3, 1fr)`;

        // Check for empty state across all groups
        const allEmpty = fixedGroups.every(group => group.data.length === 0);
        
        if (allEmpty) {
             grid.innerHTML = `
                <div class="empty-state-descarga" style="grid-column: 1 / -1; height: 300px;">
                    <i class="ph-fill ph-check-square-offset" style="color: var(--accent-primary);"></i>
                    <p>Nenhum caminhão atualmente no status 'Pátio Carregado'.</p>
                </div>
            `;
            return;
        }

        // Generate HTML for each column
        let gridHTML = '';
        fixedGroups.forEach(group => {
            const listaCaminhoesHTML = group.data.map(caminhao => `
                <div class="descarga-card" style="border-left: 5px solid #D53F8C;">
                    <div class="descarga-info-main">
                        <div class="descarga-cod">#${caminhao.cod_equipamento}</div>
                        <div class="descarga-frente-origem">${caminhao.frente_nome_origem}</div> </div>
                    <div class="descarga-time">${formatDateTime(caminhao.entrada)}</div>
                </div>
            `).join('');

            gridHTML += `
                <div class="descarga-coluna">
                    <h2 class="descarga-frente-title" style="border-bottom: 2px solid #D53F8C;">${group.columnName}</h2>
                    <div class="descarga-list">
                        ${group.data.length > 0 ? listaCaminhoesHTML : '<div class="empty-state-list"><i class="ph-fill ph-info"></i><p>Nenhum caminhão nesta categoria.</p></div>'}
                    </div>
                </div>
            `;
        });

        grid.innerHTML = gridHTML;
    }
    
    addEventListeners() {
        const refreshBtn = document.getElementById('refresh-patio');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadData(true); 
                showToast('Pátio carregado atualizado', 'success');
            });
        }
    }
}