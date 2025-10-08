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
                    <div class="empty-state-descarga" style="grid-column: 1 / -1;">
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

        // 1. Define Fixed Groups with initial empty data
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
        const caminhoesEmDescarga = caminhoes.filter(c => c.status === this.statusToMonitor && c.frente_id);
        const sortedHistory = caminhao_historico.sort((a, b) => new Date(b.timestamp_mudanca) - new Date(a.timestamp_mudanca));
        const entradaDescargaMap = new Map();

        caminhoesEmDescarga.forEach(caminhao => {
            const latestLog = sortedHistory.find(log => log.caminhao_id === caminhao.id && log.status_novo === this.statusToMonitor);
            
            entradaDescargaMap.set(caminhao.id, {
                timestamp: new Date(latestLog ? latestLog.timestamp_mudanca : caminhao.created_at),
                logId: latestLog ? latestLog.id : null
            });
        });
        
        // 3. Group trucks into fixed columns
        const frentesMap = new Map(frentes_servico.map(f => [f.id, f]));

        caminhoesEmDescarga.forEach(caminhao => {
            const frente = frentesMap.get(caminhao.frente_id);
            const frenteNome = frente ? frente.nome : null;
            const entradaInfo = entradaDescargaMap.get(caminhao.id);

            if (frenteNome && entradaInfo) {
                const truckData = {
                    cod_equipamento: caminhao.cod_equipamento,
                    entrada: entradaInfo.timestamp,
                    id: caminhao.id
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
        const grid = document.getElementById('descarga-grid');
        if (!grid) return;
        
        // Always set 3 columns
        grid.style.gridTemplateColumns = `repeat(3, 1fr)`;

        // Check for empty state across all groups
        const allEmpty = fixedGroups.every(group => group.data.length === 0);
        
        if (allEmpty) {
             grid.innerHTML = `
                <div class="empty-state-descarga" style="grid-column: 1 / -1; height: 300px;">
                    <i class="ph-fill ph-check-square-offset" style="color: var(--accent-primary);"></i>
                    <p>Nenhum caminhão atualmente no status 'Descarregando' nas frentes monitoradas.</p>
                </div>
            `;
            return;
        }

        // Generate HTML for each column
        let gridHTML = '';
        fixedGroups.forEach(group => {
            const listaCaminhoesHTML = group.data.map(caminhao => `
                <div class="descarga-card">
                    <div class="descarga-cod">#${caminhao.cod_equipamento}</div>
                    <div class="descarga-time">${formatDateTime(caminhao.entrada)}</div>
                </div>
            `).join('');

            gridHTML += `
                <div class="descarga-coluna">
                    <h2 class="descarga-frente-title">${group.columnName}</h2>
                    <div class="descarga-list">
                        ${group.data.length > 0 ? listaCaminhoesHTML : '<div class="empty-state-list"><i class="ph-fill ph-info"></i><p>Nenhum caminhão nesta categoria.</p></div>'}
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