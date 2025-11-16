// js/views/controle.js

import { fetchAllData, updateCaminhaoStatus, updateFrenteComFazenda, assignCaminhaoToFrente, updateFrenteStatus, removeCaminhaoFromFila } from '../api.js';
import { showToast, handleOperation, showLoading, hideLoading } from '../helpers.js';
// *** CORREÇÃO: Importa a nova função getBrtHour ***
import { formatDateTime, calculateDowntimeDuration, getBrtNowString, getBrtIsoString, groupDowntimeSessions, formatMillisecondsToHoursMinutes, calculateTimeDifference, getBrtHour } from '../timeUtils.js'; 
import { openModal, closeModal } from '../components/modal.js';
import { dataCache } from '../dataCache.js';
import { CAMINHAO_STATUS_LABELS, CAMINHAO_STATUS_CYCLE, FRENTE_STATUS_LABELS, CAMINHAO_ROUTE_STATUS } from '../constants.js';

// --- REMOVIDA A FUNÇÃO getBrtHour LOCAL ---

const ESTACIONAMENTO_STATUS = ['disponivel', 'patio_vazio']; // Status que indicam que o caminhão está na fila/pátio
// CORREÇÃO: A linha abaixo não é mais usada para o filtro de partida, mas é mantida caso outras lógicas dependam dela.
const DEPARTURE_STATUS = CAMINHAO_ROUTE_STATUS; // Status de partida do pátio para uma frente

export class ControleView {
    constructor() {
        this.container = null;
        this.data = {};
        this.statusCiclo = CAMINHAO_STATUS_CYCLE;
        this.statusLabels = CAMINHAO_STATUS_LABELS;
        
        this.frenteStatusLabels = FRENTE_STATUS_LABELS;
        
        this._boundStatusUpdateHandler = this.handleStatusUpdate.bind(this);

        if (window.viewManager) {
             window.viewManager.views.set('controle', this);
        }
        
        this.latestStatusTimeMap = new Map();
        
        // NOVO: Armazena o ID do caminhão que partiu em cada slot
        this.movimentacaoData = {}; 
        // NOVO: Armazena os headers de 1h
        this.cycleHeaders = [];
        this.frentesMap = new Map(); // Mapa de frentes para renderização
        this.currentHourSlot = null; // NOVO: Armazena o slot de hora atual
        
        // --- INÍCIO DA CORREÇÃO (TABELA DESCARGA) ---
        this.statusToMonitor = 'descarregando';
        // --- FIM DA CORREÇÃO (TABELA DESCARGA) ---
    }

    async show() {
        await this.loadData();
        window.addEventListener('statusUpdated', this._boundStatusUpdateHandler);
        this.addEventListeners();
    }

    async hide() {
        window.removeEventListener('statusUpdated', this._boundStatusUpdateHandler);
    }

    handleStatusUpdate(e) {
        const relevantTables = ['caminhoes', 'frentes_servico'];
        
        if (relevantTables.includes(e.detail.table)) {
            console.log('Real-Time: ControleView detectou mudança, recarregando...');
            this.loadData(true); 
        }
    }

    async loadData(forceRefresh = false) {
        showLoading();
        
        let savedScrollTop = 0;
        if (this.container && this.container.scrollTop > 0) {
            savedScrollTop = this.container.scrollTop;
            console.log(`Scroll: Salvando posição ${savedScrollTop}`);
        }

        try {
            this.data = await dataCache.fetchAllData(forceRefresh); 
            
            // *** CORREÇÃO: A função agora é chamada DEPOIS que this.data.caminhoes está definido ***
            this.latestStatusTimeMap = this.calculateLatestStatusTimes(this.data.caminhao_historico);
            
            this.render();
            this.addEventListeners();
            
            if (savedScrollTop > 0) {
                setTimeout(() => {
                     if (this.container) {
                          this.container.scrollTop = savedScrollTop;
                          console.log(`Scroll: Resturando para ${savedScrollTop}`);
                     }
                }, 50); 
            }
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading();
        }
    }
    
    /**
     * @MODIFICADO: Esta função agora encontra o timestamp de INÍCIO do status ATUAL.
     */
    calculateLatestStatusTimes(history = []) {
        const latestStatusTimeMap = new Map();
        
        // 1. Mapeia o status atual de todos os caminhões
        const currentStatusMap = new Map(this.data.caminhoes.map(c => [c.id, c.status]));

        // 2. Ordena o histórico do MAIS NOVO para o MAIS ANTIGO
        const sortedHistory = history.sort((a, b) => 
            new Date(b.timestamp_mudanca) - new Date(a.timestamp_mudanca)
        );
        
        // 3. Itera o histórico
        sortedHistory.forEach(log => {
            const caminhaoId = log.caminhao_id;
            
            // Se já encontramos o log para este caminhão, pulamos
            if (latestStatusTimeMap.has(caminhaoId)) {
                return;
            }

            // Pega o status atual do caminhão
            const currentStatus = currentStatusMap.get(caminhaoId);

            // Se o log (status_novo) bate com o status ATUAL do caminhão,
            // este é o log de início do status atual.
            if (log.status_novo === currentStatus) { // <--- BUG IS HERE
                latestStatusTimeMap.set(caminhaoId, log.timestamp_mudanca);
            }
        });
        
        // 4. (Fallback) Para caminhões que não têm histórico (ex: recém-criados),
        // mas têm um status, usamos o created_at.
        this.data.caminhoes.forEach(caminhao => {
            if (!latestStatusTimeMap.has(caminhao.id)) {
                latestStatusTimeMap.set(caminhao.id, caminhao.created_at);
            }
        });

        return latestStatusTimeMap;
    }

    /**
     * @NOVO
     * Calcula as 24 colunas do ciclo (07:00h do dia D até 06:00h do dia D+1).
     * @returns {Array<{start: string, end: string, display: string}>} Lista de cabeçalhos de 1 hora.
     */
    _getCycleHeaders() {
        const headers = [];
        const startHour = 7; // Início do ciclo é 07:00

        let currentHour = startHour;
        for (let i = 0; i < 24; i++) {
            const displayHour = String(currentHour % 24).padStart(2, '0');
            
            headers.push({
                start: `${displayHour}:00`,
                display: `${displayHour}:00`
            });
            currentHour++;
        }
        return headers;
    }

    /**
     * CORRIGIDO: Processa o histórico APENAS pela HORA de saída (00:00-23:00), ignorando o dia.
     */
    _processMovimentacaoData() {
        this.movimentacaoData = {};
        this.cycleHeaders = this._getCycleHeaders();
        const { caminhao_historico = [], frentes_servico = [], caminhoes = [] } = this.data;

        // 1. Definir a matriz com base nas HORAS (07:00 a 06:00), ignorando o dia.
        const now = new Date(); // Hora local (BRT)
        
        // Calcula o slot de hora atual (ex: 16:43 -> "16:00")
        const currentHourString = String(now.getHours()).padStart(2, '0') + ":00";
        this.currentHourSlot = currentHourString;
        
        const caminhoesMap = new Map(caminhoes.map(c => [c.id, c]));
        
        // Criar um Set de caminhões que estão descarregando (eles não devem aparecer na matriz de saídas)
        const descarregandoSet = new Set();
        caminhoes.forEach(c => {
            if (c.status === this.statusToMonitor) { // statusToMonitor = 'descarregando'
                descarregandoSet.add(c.id);
            }
        });
        
        // ** NOVO: Mapa para garantir que um caminhão apareça APENAS uma vez (o primeiro log) **
        const trucksAddedToMatrix = new Map(); 

        // 2. Filtra logs que são partidas REAIS (indo_carregar)
        let filteredDepartures = caminhao_historico.filter(log => {
            const statusAnterior = log.status_anterior;
            // Filtro 1: Saiu do pátio (Estacionamento)
            const isPreDeparture = ESTACIONAMENTO_STATUS.includes(statusAnterior) || statusAnterior === null || statusAnterior === '';
            // Filtro 2: Está especificamente INDO CARREGAR
            const isNewDeparture = log.status_novo === 'indo_carregar';

            return isPreDeparture && isNewDeparture;
        });

        // 3. *** CORREÇÃO APLICADA: Ordena da MAIS NOVA para a MAIS ANTIGA ***
        // (Isso garante que vamos pegar a *última* partida do caminhão)
        filteredDepartures.sort((a, b) => new Date(b.timestamp_mudanca) - new Date(a.timestamp_mudanca));

        // 4. Processa a lista, SLOTANDO APENAS PELA HORA
        filteredDepartures.forEach(log => {
            
            const caminhaoId = log.caminhao_id;

            // Se o caminhão está na lista de descarga, PULA.
            if (descarregandoSet.has(caminhaoId)) {
                return; 
            }
            
            // ** APLICA REGRA DE UNICIDADE: Se já adicionado, pule. (Agora pega o MAIS NOVO) **
            if (trucksAddedToMatrix.has(caminhaoId)) {
                return; 
            }
            
            const caminhao = caminhoesMap.get(caminhaoId);
            const frenteId = log.frente_id || caminhao?.frente_id; 

            if (frenteId && caminhao && log.timestamp_mudanca) {
                
                trucksAddedToMatrix.set(caminhaoId, true); // Marca como adicionado

                // *** CORREÇÃO DE FUSO: Obtém a hora BRT (0-23) para slotagem ***
                // Esta função agora vem de timeUtils.js
                const logHour = getBrtHour(log.timestamp_mudanca); // Pega a hora BRT (0 a 23)
                // *** FIM DA CORREÇÃO DE FUSO ***
                
                // Ajusta a hora para o índice de 0 a 23 (onde 7h é o índice 0)
                let slotIndex = (logHour - 7 + 24) % 24; 
                
                const slotKey = this.cycleHeaders[slotIndex].display; // Ex: '07:00'
                
                if (!this.movimentacaoData[frenteId]) {
                    this.movimentacaoData[frenteId] = {};
                }
                if (!this.movimentacaoData[frenteId][slotKey]) {
                    this.movimentacaoData[frenteId][slotKey] = [];
                }
                
                // Adiciona o caminhão no slot da hora correspondente (primeira ocorrência)
                this.movimentacaoData[frenteId][slotKey].push({
                    id: caminhao.id, 
                    cod: caminhao.cod_equipamento,
                    status: caminhao.status || 'disponivel' // Armazena o status atual
                });
            }
        });
        
        // 5. Define as frentes para o render (apenas as que são de produção)
        this.frentesMap = new Map(this.data.frentes_servico.filter(f => 
            f.tipo_producao === 'MANUAL' || f.tipo_producao === 'MECANIZADA' || f.tipo_producao === 'NA' || !f.tipo_producao)
            .map(f => [f.id, f]));
        
        // Ordena o mapa para que a renderização seja em ordem alfabética do nome da frente
        this.frentesMap = new Map(
            Array.from(this.frentesMap.entries())
                 .sort(([, a], [, b]) => a.nome.localeCompare(b.nome))
        );
    }

    // --- INÍCIO DA MODIFICAÇÃO: Inclusão do Dashboard ---

    /**
     * @NOVO: Calcula as contagens para o dashboard minimalista.
     */
    _calculateDashboardCounts() {
        const counts = {
            indo_carregar: 0,
            carregando: 0,
            retornando: 0,
            descarregando: 0,
            inativos: 0 // (Quebrado + Parado)
        };
        
        if (!this.data.caminhoes) return counts;

        for (const caminhao of this.data.caminhoes) {
            switch (caminhao.status) {
                case 'indo_carregar':
                    counts.indo_carregar++;
                    break;
                case 'carregando':
                    counts.carregando++;
                    break;
                case 'retornando':
                    counts.retornando++;
                    break;
                case 'descarregando':
                    counts.descarregando++;
                    break;
                case 'quebrado':
                case 'parado':
                    counts.inativos++;
                    break;
            }
        }
        return counts;
    }

    /**
     * @NOVO: Renderiza o HTML do dashboard minimalista.
     * Reutiliza as classes CSS .controle-dashboard-summary e .summary-card
     */
    renderMinimalistDashboard() {
        const counts = this._calculateDashboardCounts();
        
        // Função auxiliar para criar os cards
        const createCard = (statusKey, count, label) => {
            // Usa 'summary-quebrado' (vermelho) para inativos, senão a classe do status
            const cardClass = (statusKey === 'inativos') ? 'summary-quebrado' : `summary-${statusKey}`;
            
            return `
                <div class="summary-card ${cardClass} clickable-dashboard-card" data-status-key="${statusKey}">
                    <div class="summary-card-label">${label}</div>
                    <div class="summary-card-value">${count}</div>
                </div>
            `;
        };

        // Adiciona padding ao wrapper para alinhar com o restante do conteúdo
        return `
            <div class="controle-dashboard-summary" style="padding: 24px 24px 0 24px;">
                ${createCard('indo_carregar', counts.indo_carregar, this.statusLabels['indo_carregar'])}
                ${createCard('carregando', counts.carregando, this.statusLabels['carregando'])}
                ${createCard('retornando', counts.retornando, this.statusLabels['retornando'])}
                ${createCard('descarregando', counts.descarregando, this.statusLabels['descarregando'])}
                ${createCard('inativos', counts.inativos, 'Quebrados / Parados')}
            </div>
        `;
    }

    render() {
        this._processMovimentacaoData(); 
        const container = document.getElementById('views-container');
        
        container.innerHTML = `
            <div id="controle-view" class="view controle-view active-view">
                <div class="controle-header">
                    <h1>Matriz de Movimentação de Frota (Ciclo 24h)</h1>
                    <button class="btn-primary" id="btn-fazer-acao">
                        <i class="ph-fill ph-plus-circle"></i>
                        Fazer Ação
                    </button>
                </div>
                
                ${this.renderMinimalistDashboard()} 
                
                ${this.renderLegend()}
                ${this.renderMovimentacaoTable()}
                
                ${this.renderDescargaTable()}
                <div class="info-footer">
                    <p style="font-size: 0.9rem; color: var(--text-secondary);">
                        <i class="ph-fill ph-info"></i> Esta tabela mostra as partidas de caminhões do pátio agrupadas por slot de horário, sem filtro de data.
                    </p>
                </div>

            </div>
        `;
        this.container = container.querySelector('#controle-view');
    }

    // --- FIM DA MODIFICAÇÃO ---


    /**
     * @NOVO (LEGENDA)
     * Renderiza o HTML da legenda de status dos caminhões.
     */
    renderLegend() {
        // Define quais status são relevantes para a legenda da matriz
        const relevantStatuses = [
            'indo_carregar', 
            'carregando', 
            'retornando', 
            'patio_carregado',
            'descarregando',
            'patio_vazio',
            'parado',
            'quebrado'
            // 'disponivel' é omitido por ser o estado "padrão" ou pós-ciclo
        ];
        
        const legendItems = relevantStatuses.map(status => {
            const label = this.statusLabels[status] || 'Indefinido';
            return `
                <div class="legend-item">
                    <span class="legend-color-box status-${status}"></span>
                    <span class="legend-label">${label}</span>
                </div>
            `;
        }).join('');

        return `
            <div class="movimentacao-legend">
                <span class="legend-title">Status Atual do Caminhão:</span>
                ${legendItems}
            </div>
        `;
    }

    /**
     * @NOVO (REQUISITOS 2, 3, 4)
     * Renderiza a tabela de caminhões em descarga
     */
    renderDescargaTable() {
        const { caminhoes = [], frentes_servico = [], caminhao_historico = [] } = this.data;

        // --- INÍCIO DA LÓGICA DE GRUPO (COPIADA DE DESCARGA.JS) ---
        
        // 1. Define Fixed Groups (mesma ordem de Fila Descarga)
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
        if (caminhoesEmDescarga.length === 0) {
            return ''; // Retorna vazio se não houver caminhões descarregando
        }

        const sortedHistory = caminhao_historico.sort((a, b) => new Date(b.timestamp_mudanca) - new Date(a.timestamp_mudanca));
        const entradaDescargaMap = new Map();

        caminhoesEmDescarga.forEach(caminhao => {
            const latestLog = sortedHistory.find(log => log.caminhao_id === caminhao.id && log.status_novo === this.statusToMonitor);
            entradaDescargaMap.set(caminhao.id, {
                timestamp: new Date(latestLog ? latestLog.timestamp_mudanca : caminhao.created_at),
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

        // 5. Render the grid HTML
        // (Note: This HTML uses the classes from descarga.css, which are already in controle.css)
        
        let gridHTML = '';
        fixedGroups.forEach(group => {
            // *** INÍCIO DA CORREÇÃO (CLICKABLE CARD) ***
            const listaCaminhoesHTML = group.data.map(caminhao => `
                <div class="descarga-card clickable-truck-descarga" data-truck-id="${caminhao.id}" title="Clique para ver Ações">
                    <div class="descarga-info-main">
                        <div class="descarga-cod">#${caminhao.cod_equipamento}</div>
                        <div class="descarga-frente-origem">${caminhao.frente_nome_origem}</div> 
                    </div>
                    <div class="descarga-time">${formatDateTime(caminhao.entrada)}</div>
                </div>
            `).join('');
            // *** FIM DA CORREÇÃO (CLICKABLE CARD) ***

            gridHTML += `
                <div class="descarga-coluna">
                    <h2 class="descarga-frente-title">${group.columnName}</h2>
                    <div class="descarga-list">
                        ${group.data.length > 0 ? listaCaminhoesHTML : '<div class="empty-state-list"><i class="ph-fill ph-info"></i><p>Nenhum caminhão nesta categoria.</p></div>'}
                    </div>
                </div>
            `;
        });
        // --- FIM DA LÓGICA DE GRUPO ---


        // Envolve o grid no container e título
        return `
            <div class="descarga-container-matriz">
                <h2 class="descarga-header-matriz">
                    <i class="ph-fill ph-factory"></i>
                    Caminhões em Descarga na Usina (${caminhoesEmDescarga.length})
                </h2>
                <div class="descarga-grid" style="grid-template-columns: repeat(3, 1fr);">
                    ${gridHTML}
                </div>
            </div>
        `;
    }


    /**
     * @NOVO
     * Renderiza a nova tabela de movimentação de frota.
     */
    renderMovimentacaoTable() {
        if (this.frentesMap.size === 0) {
            return `<div class="empty-state-frente-grid" style="margin-top: 24px;">Nenhuma frente de produção com meta de produção cadastrada.</div>`;
        }
        
        const cycleStartDisplay = this.cycleHeaders[0]?.display;
        const cycleEndDisplay = this.cycleHeaders[this.cycleHeaders.length - 1]?.display;
        
        // 1. Cabeçalho da Tabela (Slots de Hora)
        const headerHTML = this.cycleHeaders.map(header => {
            // *** INÍCIO DA CORREÇÃO (DESTAQUE HORA ATUAL) ***
            const isCurrentHour = header.display === this.currentHourSlot;
            const headerClass = isCurrentHour ? 'current-hour-slot' : '';
            // *** FIM DA CORREÇÃO (DESTAQUE HORA ATUAL) ***
            
            return `<th class="mov-header-slot ${headerClass}">${header.display}</th>`;
        }).join('');
        
        // 2. Corpo da Tabela
        const bodyHTML = Array.from(this.frentesMap.values()).map(frente => {
            
            // BUSCA O NOME DA FAZENDA
            // frente.fazendas é um objeto retornado pelo Supabase (ou null)
            const fazendaNome = frente.fazendas?.nome || 'N/A';
            const fazendaCod = frente.fazendas?.cod_equipamento || 'N/A';
            const fazendaDisplay = (frente.fazendas && fazendaNome !== 'N/A') ? `${fazendaCod}-${fazendaNome}` : 'Nenhuma Fazenda Associada';
            
            // *** INÍCIO DA CORREÇÃO (DESTAQUE FRENTE INATIVA) ***
            const isFrenteInativa = (frente.status === 'inativa' || !frente.status);
            const rowClass = isFrenteInativa ? 'frente-inativa' : '';
            // *** FIM DA CORREÇÃO (DESTAQUE FRENTE INATIVA) ***


            const cellsHTML = this.cycleHeaders.map(header => {
                // *** INÍCIO DA CORREÇÃO (STATUS DINÂMICO) ***
                // trucks agora é um array de objetos: [{id, cod, status}]
                const trucks = this.movimentacaoData[frente.id]?.[header.display] || [];
                // *** FIM DA CORREÇÃO (STATUS DINÂMICO) ***
                
                // *** INÍCIO DA CORREÇÃO (DESTAQUE HORA ATUAL) ***
                const isCurrentHour = header.display === this.currentHourSlot;
                const cellClass = isCurrentHour ? 'current-hour-slot' : '';
                // *** FIM DA CORREÇÃO (DESTAQUE HORA ATUAL) ***

                // === LÓGICA DE AGRUPAMENTO E COMPACTAÇÃO NO JAVASCRIPT ===
                const chunkSize = 3;
                // AQUI ESTÁ A CORREÇÃO: trucksHTML é renderizado para ser o CONTEÚDO da célula de horário.
                let trucksHTML = '<div class="mov-stacks-wrapper">'; 

                for (let i = 0; i < trucks.length; i += chunkSize) {
                    const group = trucks.slice(i, i + chunkSize);

                    // Abre um novo grupo vertical (que flui horizontalmente)
                    trucksHTML += '<div class="mov-stack-group">';
                    
                    group.forEach(truck => {
                        const codString = String(truck.cod || ''); 
                        const last3 = codString.slice(-3); 
                        
                        // *** INÍCIO DA CORREÇÃO (STATUS DINÂMICO) ***
                        // Adiciona a classe de status ao badge e o status ao title
                        const statusLabel = this.statusLabels[truck.status] || 'N/A';
                        trucksHTML += `<span class="truck-code-badge clickable-truck-code status-${truck.status}" 
                                            data-truck-id="${truck.id}" 
                                            title="Caminhão #${truck.cod} (Status: ${statusLabel})">${last3}</span>`;
                        // *** FIM DA CORREÇÃO (STATUS DINÂMICO) ***
                    });
                    
                    trucksHTML += '</div>'; // Fecha o grupo vertical
                }
                trucksHTML += '</div>'; // Fecha o wrapper principal
                // ========================================================
                
                return `
                    <td class="mov-cell ${trucks.length > 0 ? 'has-data' : ''} ${cellClass}">
                        ${trucksHTML}
                    </td>
                `;
            }).join('');
            
            return `
                <tr class="${rowClass}">
                    <td class="mov-frente-name clickable-front" data-frente-id="${frente.id}" data-frente-status="${frente.status || 'inativa'}">
                        <i class="ph-fill ph-users-three"></i> 
                        <span class="frente-name-text">${frente.nome}</span>
                        <span class="frente-fazenda-text">${fazendaDisplay}</span>
                        <span class="frente-group-text">${this.formatOption(frente.tipo_producao)}</span>
                    </td>
                    ${cellsHTML}
                </tr>
            `;
        }).join('');
        
        // 3. Montagem da Tabela Final
        return `
            <div class="report-table-container">
                <div class="table-wrapper">
                    <table class="data-table-modern" style="min-width: 1500px;">
                        <thead>
                            <tr class="mov-header-group">
                                <th rowspan="2" style="width: 200px;">Frente de Serviço</th>
                                <th colspan="${this.cycleHeaders.length}" class="mov-header-group-title">
                                    Partidas do Pátio (07:00 - 06:00)
                                </th>
                            </tr>
                            <tr class="mov-header-slots">
                                ${headerHTML}
                            </tr>
                        </thead>
                        <tbody>
                            ${bodyHTML}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    formatOption(option) {
        if (option === 'NA' || option === null) return 'Não Atribuído';
        if (option === 'MANUAL') return 'Cana Manual';
        if (option === 'MECANIZADA') return 'Cana Mecanizada';
        if (!option || typeof option !== 'string') {
            return 'N/A';
        }
        return option.charAt(0).toUpperCase() + option.slice(1).replace('_', ' ');
    }

    addEventListeners() {
        this.container.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            const truckBadge = e.target.closest('.clickable-truck-code'); // Captura o clique no badge
            const clickableFront = e.target.closest('.clickable-front'); // Captura o clique na TD da frente
            const dashboardCard = e.target.closest('.clickable-dashboard-card'); // NOVO: Listener do Card
            
            // *** INÍCIO DA CORREÇÃO (CLICKABLE CARD) ***
            const truckDescarga = e.target.closest('.clickable-truck-descarga'); // Captura o clique no card de descarga
            
            if (truckBadge) {
                // Se o badge foi clicado, abre o modal de status/movimentação do caminhão
                const caminhaoId = truckBadge.dataset.truckId;
                this.showStatusUpdateModal(caminhaoId); 
                return;
            }
            
            if (truckDescarga) {
                // Se o card de descarga foi clicado, abre o mesmo modal
                const caminhaoId = truckDescarga.dataset.truckId;
                this.showStatusUpdateModal(caminhaoId); 
                return;
            }
            // *** FIM DA CORREÇÃO (CLICKABLE CARD) ***

            // --- NOVO: Handler for dashboard card clicks ---
            if (dashboardCard) {
                const statusKey = dashboardCard.dataset.statusKey;
                if (statusKey) {
                    this.showStatusDetailModal(statusKey);
                }
                return;
            }
            // --- FIM NOVO ---

            if (clickableFront) {
                // Se a célula da frente foi clicada, abre o modal de edição de Fazenda/Status
                const frenteId = clickableFront.dataset.frenteId;
                const currentStatus = clickableFront.dataset.frenteStatus;
                this.showFrontEditModal(frenteId, currentStatus); // NOVO: Chama a função que contém os dois botões
                return;
            }

            if (!btn) return;

            if (btn.id === 'btn-fazer-acao') this.showAssignmentModal();
            if (btn.classList.contains('btn-alterar-fazenda')) this.showFazendaSelector(btn.dataset.frenteId);
            if (btn.classList.contains('btn-frente-status')) this.showFrenteStatusModal(btn.dataset.frenteId, btn.dataset.currentStatus); 
            
            if (btn.dataset.caminhaoId && !btn.closest('#action-modal-form')) {
                this.showStatusUpdateModal(btn.dataset.caminhaoId);
            }
        });
    }

    /**
     * @NOVO: Mostra um modal com a lista de caminhões em um status específico.
     */
    showStatusDetailModal(statusKey) {
        const frentesMap = new Map(this.data.frentes_servico.map(f => [f.id, f.nome]));
        
        let statusList = [statusKey];
        let modalTitle = this.statusLabels[statusKey];

        if (statusKey === 'inativos') {
            statusList = ['parado', 'quebrado'];
            modalTitle = 'Quebrados / Parados';
        }

        // 1. Filtra os caminhões que estão no(s) status desejado(s)
        const filteredTrucks = this.data.caminhoes.filter(c => statusList.includes(c.status));

        // 2. Mapeia os detalhes, incluindo a hora de início do status
        const truckDetails = filteredTrucks.map(truck => {
            const frenteNome = frentesMap.get(truck.frente_id) || 'N/A';
            
            // *** CORREÇÃO AQUI: Usa o mapa CORRIGIDO para pegar o início do status ATUAL ***
            const startTime = this.latestStatusTimeMap.get(truck.id) || truck.created_at;
            
            // Reutiliza a função de cálculo de duração (tempo de início até agora)
            const duration = calculateDowntimeDuration(startTime, null); 

            return {
                cod: truck.cod_equipamento,
                frente: frenteNome,
                startTimeISO: startTime,
                startTimeFormatted: formatDateTime(startTime), // formatDateTime (de timeUtils) já converte para BRT
                duration: duration,
                status: truck.status // Para colorir o status 'parado' vs 'quebrado'
            };
        })
        // 3. Ordena pela hora de início (os que estão há mais tempo aparecem primeiro)
        .sort((a, b) => new Date(a.startTimeISO) - new Date(b.startTimeISO));

        // 4. Gera o HTML da tabela
        let rowsHTML = '';
        if (truckDetails.length === 0) {
            rowsHTML = '<tr><td colspan="5" style="text-align: center;">Nenhum caminhão neste status no momento.</td></tr>';
        } else {
            rowsHTML = truckDetails.map(truck => {
                // Define a cor da badge de status (útil para 'inativos')
                const statusClass = statusKey === 'inativos' ? truck.status : statusKey;
                
                return `
                    <tr>
                        <td><strong>#${truck.cod}</strong></td>
                        <td><span class="caminhao-status-badge status-${statusClass}">${this.statusLabels[truck.status]}</span></td>
                        <td>${truck.frente}</td>
                        <td>${truck.startTimeFormatted}</td>
                        <td><strong style="color: var(--accent-danger);">${truck.duration}</strong></td>
                    </tr>
                `;
            }).join('');
        }

        const modalHTML = `
            <div class="table-wrapper" style="max-height: 60vh; overflow-y: auto;">
                <table class="data-table-modern">
                    <thead>
                        <tr>
                            <th>Caminhão</th>
                            <th>Status</th>
                            <th>Frente</th>
                            <th>Início do Status</th>
                            <th>Duração</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHTML}
                    </tbody>
                </table>
            </div>
        `;
        
        openModal(`Caminhões em: ${modalTitle} (${filteredTrucks.length})`, modalHTML);
    }


    /**
     * @NOVO
     * Modal unificado para edição da frente: permite alterar Fazenda OU Status.
     */
    showFrontEditModal(frenteId, currentStatus) {
        const frente = this.data.frentes_servico.find(f => f.id == frenteId);
        const fazendas = this.data.fazendas || [];
        
        const currentFazendaNome = frente.fazendas?.nome || 'Nenhuma';

        const optionsStatusHTML = Object.entries(this.frenteStatusLabels).map(([statusKey, statusLabel]) => 
            `<option value="${statusKey}" ${statusKey === currentStatus ? 'selected' : ''}>${statusLabel}</option>`
        ).join('');
        
        const optionsFazendaHTML = fazendas.map(f => 
            `<option value="${f.id}" ${f.id === frente.fazenda_id ? 'selected' : ''}>${f.nome}</option>`
        ).join('');


        const modalContent = `
            <h3>Gerenciar Frente: ${frente.nome}</h3>
            <p>Fazenda Atual: <strong>${currentFazendaNome}</strong></p>
            <p>Status Atual: <span class="caminhao-status-badge status-${currentStatus}">${this.frenteStatusLabels[currentStatus]}</span></p>

            <hr style="margin: 20px 0; border-color: var(--border-color);">

            <h4>1. Alterar Fazenda de Colheita</h4>
            <form id="fazenda-select-form" class="action-modal-form">
                <div class="form-group">
                    <label>Selecione a Nova Fazenda</label>
                    <select name="fazenda" class="form-select">
                        <option value="">Nenhuma / Limpar</option>
                        ${optionsFazendaHTML}
                    </select>
                </div>
                <button type="submit" class="btn-primary" style="background-color: var(--accent-edit);">
                    Atualizar Fazenda
                </button>
            </form>

            <hr style="margin: 20px 0; border-color: var(--border-color);">

            <h4>2. Mudar Status da Frente</h4>
            <form id="frente-status-form" class="action-modal-form">
                <div class="form-group">
                    <label>Novo Status da Frente</label>
                    <select name="new_status" class="form-select" required>
                        ${optionsStatusHTML}
                    </select>
                </div>
                <button type="submit" class="btn-primary" style="background-color: var(--accent-primary);">
                    Atualizar Status
                </button>
            </form>
        `;
        openModal('Edição Rápida de Frente', modalContent);

        // Listener 1: Alterar Fazenda
        document.getElementById('fazenda-select-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const selectedFazendaId = e.target.fazenda.value;
            this.handleUpdateFazenda(frenteId, selectedFazendaId);
        });

        // Listener 2: Alterar Status
        document.getElementById('frente-status-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const newStatus = e.target.new_status.value;
            this.handleFrenteStatusUpdate(frenteId, newStatus);
        });
    }

    async handleUpdateFazenda(frenteId, selectedFazendaId) {
        showLoading();
        try {
            await updateFrenteComFazenda(frenteId, selectedFazendaId || null);
            dataCache.invalidateAllData();
            // showToast('Fazenda atualizada com sucesso!', 'success'); // Removido conforme solicitação
            closeModal();
            await this.loadData(true); 
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading();
        }
    }

    showFazendaSelector(frenteId) {
        // ... (Método antigo, mantido para compatibilidade, mas o showFrontEditModal é o novo principal)
    }

    async handleFrenteStatusUpdate(frenteId, newStatus) {
        showLoading(); // INICIA AQUI
        try {
            // 1. Atualiza o DB
            await updateFrenteStatus(frenteId, newStatus);
            
            // 2. Invalida o Cache (NOVO)
            dataCache.invalidateAllData();
            
            // 3. Feedback RÁPIDO para o usuário
            // showToast(`Status da frente atualizado para ${this.frenteStatusLabels[newStatus]}!`, 'success'); // Removido conforme solicitação
            closeModal();
            
            // 4. Recarrega os DADOS (a parte LENTA)
            await this.loadData(true); // Força refresh após escrita
            
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading(); // FINALIZA APÓS O loadData() (ou após o erro)
        }
    }

    showAssignmentModal() {
        const { caminhoes = [], frentes_servico = [] } = this.data;
        // --- CORREÇÃO AQUI: Mostra caminhões 'disponivel' OU sem status definido (null) ---
        let caminhoesDisponiveis = caminhoes.filter(c => c.status === 'disponivel' || c.status === 'patio_vazio' || !c.status);
        
        // NOVO: Ordenação numérica dos caminhões disponíveis
        caminhoesDisponiveis.sort((a, b) => {
            const codA = parseInt(a.cod_equipamento, 10);
            const codB = parseInt(b.cod_equipamento, 10);
            return codA - codB;
        });
        
        // CORREÇÃO: Usa a função getBrtNowString para o valor inicial do formulário
        const nowString = getBrtNowString();

        // Filtra para mostrar apenas frentes ATIVAS (ativa ou fazendo_cata) e com fazenda associada
        // E ORDENA POR NOME ALFABETICAMENTE
        const frentesAtivas = frentes_servico
            .filter(f => f.fazenda_id && (f.status === 'ativa' || f.status === 'fazendo_cata'))
            .sort((a, b) => a.nome.localeCompare(b.nome));

        const modalContent = `
            <form id="action-modal-form" class="action-modal-form">
                <div class="form-group">
                    <label>1. Escolha o Caminhão</label>
                    <select name="caminhao" class="form-select" required>
                        <option value="">Selecione...</option>
                        ${caminhoesDisponiveis.map(c => `<option value="${c.id}">${c.cod_equipamento}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>2. Escolha a Frente de Destino (Apenas frentes Ativas)</label>
                    <select name="frente" class="form-select" required>
                        <option value="">Selecione...</option>
                        ${frentesAtivas.map(f => `<option value="${f.id}">${f.nome} (${this.frenteStatusLabels[f.status]})</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>3. Selecione a Etapa Inicial</label>
                    <select name="status" class="form-select" required>
                        ${this.statusCiclo.map(s => `<option value="${s}">${this.statusLabels[s]}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>4. Hora de Saída para Roça</label>
                    <input type="datetime-local" name="hora" class="form-input" value="${nowString}" required>
                </div>
                <button type="submit" class="btn-primary">Confirmar Ação</button>
            </form>
        `;
        openModal('Designar Caminhão para Frente', modalContent);

        document.getElementById('action-modal-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = e.target;
            const caminhaoId = formData.caminhao.value;
            const frenteId = formData.frente.value;
            const status = formData.status.value;
            const hora = formData.hora.value;

            if (!caminhaoId || !frenteId || !status || !hora) {
                showToast('Por favor, preencha todos os campos.', 'error');
                return;
            }

            // REUTILIZA A NOVA FUNÇÃO
            this.handleAssignTruck(caminhaoId, frenteId, status, hora);
        });
    }

    async handleAssignTruck(caminhaoId, frenteId, status, hora) {
        showLoading();
        try {
            // 1. Designa o caminhão e atualiza status no DB
            await assignCaminhaoToFrente(caminhaoId, frenteId, status, getBrtIsoString(hora));
            
            // 2. Remove da fila de estacionamento persistida
            await removeCaminhaoFromFila(caminhaoId); 
            
            // 3. Invalida o Cache
            dataCache.invalidateAllData();

            // *** MELHORIA: Mensagem de toast mais genérica ***
            // showToast('Caminhão realocado e novo ciclo iniciado!', 'success'); // Removido conforme solicitação
            closeModal();
            await this.loadData(true); 
        } catch (error) {
            handleOperation(error); 
        } finally {
            hideLoading(); 
        }
    }
    
    showFinalizeCycleModal(caminhaoId) {
        const { caminhoes = [], frentes_servico = [] } = this.data;
        const caminhao = caminhoes.find(c => c.id == caminhaoId);
        if (!caminhao) return;

        // Filtra para mostrar apenas frentes ATIVAS (ativa ou fazendo_cata) e com fazenda associada
        const frentesAtivas = frentes_servico
            .filter(f => f.fazenda_id && (f.status === 'ativa' || f.status === 'fazendo_cata'))
            .sort((a, b) => a.nome.localeCompare(b.nome));

        // Usa a função getBrtNowString para o valor inicial do formulário
        const nowString = getBrtNowString();
        
        // *** MELHORIA: Gera as opções de status do ciclo ***
        const statusOptionsHTML = this.statusCiclo.map(s => 
            `<option value="${s}">${this.statusLabels[s]}</option>`
        ).join('');
        
        const modalContent = `
            <p>Caminhão: <strong>${caminhao.cod_equipamento}</strong> - Ciclo Finalizado.</p>
            <p class="form-help">Escolha a ação para o caminhão após o ciclo de retorno/descarga:</p>

            <hr style="margin: 20px 0; border-color: var(--border-color);">

            <h4>Opção 1: Realocar para Nova Frente de Serviço</h4>
            <form id="reallocate-cycle-form" class="action-modal-form" style="margin-bottom: 20px;">
                <input type="hidden" name="caminhaoId" value="${caminhaoId}">
                <div class="form-group">
                    <label>Frente de Destino</label>
                    <select name="frente" class="form-select" required>
                        <option value="">Selecione a Frente (Obrigatório)</option>
                        ${frentesAtivas.map(f => `<option value="${f.id}">${f.nome} (${this.frenteStatusLabels[f.status]})</option>`).join('')}
                    </select>
                </div>
                
                <div class="form-group">
                    <label>Etapa Inicial do Novo Ciclo</label>
                    <select name="status" class="form-select" required>
                        ${statusOptionsHTML}
                    </select>
                </div>
                
                <div class="form-group">
                    <label>Hora de Início da Etapa</label>
                    <input type="datetime-local" name="hora" class="form-input" value="${nowString}" required>
                </div>
                <button type="submit" class="btn-primary">
                    <i class="ph-fill ph-plus-circle"></i> Iniciar Novo Ciclo
                </button>
            </form>

            <hr style="margin: 20px 0; border-color: var(--border-color);">

            <h4>Opção 2: Deixar no Pátio Vazio</h4>
            <p class="form-help">O caminhão será marcado como "Pátio Vazio" e estará pronto para ser designado manualmente via "Fila Estacionamento" ou "Fazer Ação".</p>
            <button id="btn-set-patio-vazio" class="btn-secondary" style="background-color: #805AD5;">
                <i class="ph-fill ph-warehouse"></i> Marcar como Pátio Vazio
            </button>
        `;
        openModal('Ação Pós-Ciclo - ' + caminhao.cod_equipamento, modalContent);

        // Listener para Opção 1: Realocar
        document.getElementById('reallocate-cycle-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = e.target;
            const frenteId = formData.frente.value;
            const status = formData.status.value; // *** MELHORIA: Lê o status selecionado ***
            const hora = formData.hora.value;
            
            if (!frenteId) {
                showToast('Selecione uma Frente de Destino.', 'error');
                return;
            }
            
            // *** MELHORIA: Passa o status selecionado ***
            this.handleAssignTruck(caminhaoId, frenteId, status, hora); 
        });

        // Listener para Opção 2: Pátio Vazio
        document.getElementById('btn-set-patio-vazio').addEventListener('click', () => {
            // Usa 'patio_vazio' e o status atual para a frente (null, pois está finalizando o ciclo)
            this.handleStatusUpdate(caminhaoId, 'patio_vazio', null, 'Caminhão movido para Pátio Vazio!');
        });
    }

    showStatusUpdateModal(caminhaoId) {
        const caminhao = this.data.caminhoes.find(c => c.id == caminhaoId);
        if (!caminhao) return;

        const isDowntimeStatus = ['quebrado', 'parado'];
        const isCurrentDowntime = isDowntimeStatus.includes(caminhao.status);
        
        let initialMotivo = '';
        if (isCurrentDowntime) {
             const latestLog = this.data.caminhao_historico.find(log => log.caminhao_id === caminhaoId && isDowntimeStatus.includes(log.status_novo));
             initialMotivo = latestLog?.motivo_parada || '';
        }

        if (isCurrentDowntime) {
             const openSessions = groupDowntimeSessions(this.data.caminhao_historico, 'caminhao_id', isDowntimeStatus).filter(s => s.end_time === null && s.startLog.caminhao_id === caminhaoId);
             
             let startTime = caminhao.created_at; // Fallback
             if (openSessions.length > 0) {
                 startTime = openSessions[0].startTime;
             }

             
             // Se o status é de inatividade, oferece o modal de finalização/edição do status da inatividade
             const downtimeForm = `
                <p>Status atual: <strong>${this.statusLabels[caminhao.status]}</strong></p>
                <p style="font-size: 0.9rem; color: var(--text-secondary);">Início da Inatividade: ${formatDateTime(startTime)}</p>
                
                <form id="status-update-form" class="action-modal-form">
                    <div class="form-group">
                        <label>Alterar para Status de Inatividade (Mudar Motivo)</label>
                        <select name="status" id="novo-status-caminhao" class="form-select" required>
                        <option value="parado" ${caminhao.status === 'parado' ? 'selected' : ''}>${this.statusLabels['parado']}</option>
                        <option value="quebrado" ${caminhao.status === 'quebrado' ? 'selected' : ''}>${this.statusLabels['quebrado']}</option>
                        </select>
                    </div>
                    
                    <div class="form-group" id="motivo-parada-group">
                        <label>Novo Motivo (Obrigatório para atualização)</label>
                        <input type="text" name="motivo" class="form-input" value="${initialMotivo}" required placeholder="Ex: Manutenção preventiva, Esperando pneu">
                    </div>
                    
                    <button type="submit" class="btn-secondary">Atualizar Status/Motivo</button>
                    
                </form>
                
                <hr style="margin: 20px 0; border-color: var(--border-color);">
                
                <button type="button" id="btn-finalizar-downtime" class="btn-primary">
                    <i class="ph-fill ph-check-circle"></i> Finalizar Inatividade
                </button>

                `;
             openModal('Gerenciar Inatividade - ' + caminhao.cod_equipamento, downtimeForm);
             
             document.getElementById('status-update-form').addEventListener('submit', async (e) => {
                 e.preventDefault();
                 const novoStatus = e.target.status.value;
                 const motivo = e.target.motivo.value;
                 this.handleStatusUpdate(caminhao.id, novoStatus, caminhao.frente_id, 'Status e motivo atualizados!', motivo);
             });
             
             // Este botão não funcionará mais aqui, pois a função foi movida.
             // A lógica de finalização agora está em frota.js
             document.getElementById('btn-finalizar-downtime').addEventListener('click', () => {
                 showToast('Esta ação foi movida para a tela de Gerenciamento de Frota.', 'info');
                 closeModal();
             });
             
             return;
        }


        // Caso Normal: Caminhão em Ciclo ou Disponível
        const statusOptions = [...this.statusCiclo, 'quebrado', 'disponivel', 'parado']; 

        const modalContent = `
            <p>Alterando status de: <strong>${caminhao.cod_equipamento}</strong></p>
            <form id="status-update-form" class="action-modal-form">
                <div class="form-group">
                    <label>Selecione o Novo Status</label>
                    <select name="status" id="novo-status-caminhao" class="form-select" required>
                    ${statusOptions.map(s => `<option value="${s}" ${caminhao.status === s ? 'selected' : ''}>${this.statusLabels[s]}</option>`).join('')}
                    </select>
                </div>
                
                <div class="form-group" id="motivo-parada-group" style="display: none;">
                    <label>Motivo da Parada / Quebra (Obrigatório para Parado/Quebrado)</label>
                    <input type="text" name="motivo" class="form-input" placeholder="Ex: Manutenção preventiva, Esperando pneu">
                </div>
                
                <button type="submit" class="btn-primary">Atualizar Status</button>
                <button type="button" id="btn-finalizar-ciclo" class="btn-secondary">Finalizar Ciclo</button>
            </form>
            
            <script>
                document.getElementById('novo-status-caminhao').addEventListener('change', function() {
                    const statusGroup = document.getElementById('motivo-parada-group');
                    const selectedStatus = this.value;
                    if (selectedStatus === 'quebrado' || selectedStatus === 'parado') {
                        statusGroup.style.display = 'flex';
                        statusGroup.querySelector('input').setAttribute('required', 'required');
                    } else {
                        statusGroup.style.display = 'none';
                        statusGroup.querySelector('input').removeAttribute('required');
                    }
                });
            </script>
        `;
        openModal('Alterar Status do Caminhão', modalContent);

        const form = document.getElementById('status-update-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const novoStatus = e.target.status.value;
            const motivo = e.target.motivo.value;
            
            const motivoParaAPI = (novoStatus === 'quebrado' || novoStatus === 'parado') ? motivo : null;
            
            this.handleStatusUpdate(caminhao.id, novoStatus, caminhao.frente_id, 'Status atualizado!', motivoParaAPI);
        });

        // MODIFICAÇÃO CHAVE AQUI: Chama o novo modal de escolha
        document.getElementById('btn-finalizar-ciclo').addEventListener('click', () => {
             closeModal();
             this.showFinalizeCycleModal(caminhao.id);
        });
    }
    
    async handleStatusUpdate(caminhaoId, novoStatus, frenteId, successMessage, motivoParada = null, timestamp = null) {
        showLoading(); // INICIA AQUI
        try {
            // CORREÇÃO: Força o uso do instante BRT atual se nenhum timestamp foi fornecido (ação rápida)
            const logTimestamp = timestamp || getBrtIsoString();
            
            // 1. Atualiza o DB (o API.js já cuida de desassociar a frente se for 'disponivel', 'quebrado' ou 'parado')
            await updateCaminhaoStatus(caminhaoId, novoStatus, frenteId, motivoParada, logTimestamp);
            
            // 2. NOVO: Se o caminhão saiu do pátio/fila (status não é de estacionamento), remove da tabela fila_carregamento
            if (!ESTACIONAMENTO_STATUS.includes(novoStatus)) {
                 await removeCaminhaoFromFila(caminhaoId);
            }
            
            // 3. Invalida o Cache (NOVO)
            dataCache.invalidateAllData();
            
            // 4. Feedback RÁPIDO para o usuário
            // showToast(successMessage, 'success'); // Removido conforme solicitação
            closeModal();
            
            // 5. Recarrega os DADOS (a parte LENTA)
            await this.loadData(true); // Força refresh após escrita
            
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading();
        }
    }

    showFazendaSelector(frenteId) {
        const { fazendas = [] } = this.data;
        const optionsHTML = fazendas.map(f => `<option value="${f.id}">${f.cod_equipamento} - ${f.nome}</option>`).join('');
        const modalContent = `
            <form id="fazenda-select-form" class="fazenda-select-form">
                <p>Selecione a nova fazenda para esta frente de serviço.</p>
                <select name="fazenda" class="form-select"><option value="">Nenhuma / Limpar</option>${optionsHTML}</select>
                <button type="submit" class="btn-primary">Salvar Alteração</button>
            </form>
        `;
        openModal('Alterar Fazenda da Frente', modalContent);

        document.getElementById('fazenda-select-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const selectedFazendaId = e.target.fazenda.value;
            showLoading();
            try {
                await updateFrenteComFazenda(frenteId, selectedFazendaId || null);
                
                // Invalida o Cache (NOVO)
                dataCache.invalidateAllData();

                // showToast('Fazenda atualizada com sucesso!', 'success'); // Removido conforme solicitação
                closeModal();
                await this.loadData(true); // Força refresh após escrita
            } catch (error) {
                handleOperation(error);
            } finally {
                hideLoading();
            }
        });
    }
}