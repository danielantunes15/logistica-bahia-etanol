// js/views/controle.js
import { fetchAllData, updateCaminhaoStatus, updateFrenteComFazenda, assignCaminhaoToFrente, updateFrenteStatus, removeCaminhaoFromFila } from '../api.js';
import { showToast, handleOperation, showLoading, hideLoading } from '../helpers.js';
// *** CORREÇÃO: Importa a nova função getBrtHour ***
import { formatDateTime, calculateDowntimeDuration, getBrtNowString, getBrtIsoString, groupDowntimeSessions, formatMillisecondsToHoursMinutes, calculateTimeDifference, getBrtHour, ensureBrtTimestamp } from '../timeUtils.js'; 
import { openModal, closeModal } from '../components/modal.js';
import { dataCache } from '../dataCache.js';
import { CAMINHAO_STATUS_LABELS, CAMINHAO_STATUS_CYCLE, FRENTE_STATUS_LABELS, CAMINHAO_ROUTE_STATUS } from '../constants.js';

// --- REMOVIDA A FUNÇÃO getBrtHour LOCAL ---

const ESTACIONAMENTO_STATUS = ['disponivel', 'patio_vazio']; 
const DEPARTURE_STATUS = CAMINHAO_ROUTE_STATUS; 

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
        this.movimentacaoData = {}; 
        this.cycleHeaders = [];
        this.frentesMap = new Map(); 
        this.currentHourSlot = null; 
        this.statusToMonitor = 'descarregando';
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
        }

        try {
            this.data = await dataCache.fetchAllData(forceRefresh); 
            this.latestStatusTimeMap = this.calculateLatestStatusTimes(this.data.caminhao_historico);
            
            this.render();
            this.addEventListeners();
            
            if (savedScrollTop > 0) {
                setTimeout(() => {
                     if (this.container) {
                          this.container.scrollTop = savedScrollTop;
                     }
                }, 50); 
            }
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading();
        }
    }
    
    calculateLatestStatusTimes(history = []) {
        const latestStatusTimeMap = new Map();
        const currentStatusMap = new Map(this.data.caminhoes.map(c => [c.id, c.status]));
        const sortedHistory = history.sort((a, b) => 
            new Date(b.timestamp_mudanca) - new Date(a.timestamp_mudanca)
        );
        
        sortedHistory.forEach(log => {
            const caminhaoId = log.caminhao_id;
            if (latestStatusTimeMap.has(caminhaoId)) return;

            const currentStatus = currentStatusMap.get(caminhaoId);
            if (log.status_novo === currentStatus) { 
                latestStatusTimeMap.set(caminhaoId, log.timestamp_mudanca);
            }
        });
        
        this.data.caminhoes.forEach(caminhao => {
            if (!latestStatusTimeMap.has(caminhao.id)) {
                latestStatusTimeMap.set(caminhao.id, caminhao.created_at);
            }
        });

        return latestStatusTimeMap;
    }

    _getCycleHeaders() {
        const headers = [];
        const startHour = 7; 

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

    _processMovimentacaoData() {
        this.movimentacaoData = {};
        this.cycleHeaders = this._getCycleHeaders();
        const { caminhao_historico = [], frentes_servico = [], caminhoes = [] } = this.data;

        const now = new Date(); 
        const currentHourString = String(now.getHours()).padStart(2, '0') + ":00";
        this.currentHourSlot = currentHourString;
        
        const caminhoesMap = new Map(caminhoes.map(c => [c.id, c]));
        const trucksAddedToMatrix = new Map(); 

        let filteredDepartures = caminhao_historico.filter(log => {
            const statusAnterior = log.status_anterior;
            const isPreDeparture = ESTACIONAMENTO_STATUS.includes(statusAnterior) || statusAnterior === null || statusAnterior === '';
            const isNewDeparture = log.status_novo === 'indo_carregar';
            return isPreDeparture && isNewDeparture; 
        });

        filteredDepartures.sort((a, b) => new Date(b.timestamp_mudanca) - new Date(a.timestamp_mudanca));

        filteredDepartures.forEach(log => {
            const caminhaoId = log.caminhao_id;
            if (trucksAddedToMatrix.has(caminhaoId)) return; 
            
            const caminhao = caminhoesMap.get(caminhaoId);
            const frenteId = log.frente_id || caminhao?.frente_id; 

            if (caminhao) {
                const currentStatus = caminhao.status;
                if (currentStatus === 'patio_vazio' || currentStatus === 'disponivel') {
                    trucksAddedToMatrix.set(caminhaoId, true); 
                    return; 
                }
            }

            if (frenteId && caminhao && log.timestamp_mudanca) {
                const logHour = getBrtHour(log.timestamp_mudanca); 
                let slotIndex = (logHour - 7 + 24) % 24; 
                const slotKey = this.cycleHeaders[slotIndex].display;
                
                if (!this.movimentacaoData[frenteId]) {
                    this.movimentacaoData[frenteId] = {};
                }
                if (!this.movimentacaoData[frenteId][slotKey]) {
                    this.movimentacaoData[frenteId][slotKey] = [];
                }
                
                this.movimentacaoData[frenteId][slotKey].push({
                    id: caminhao.id, 
                    cod: caminhao.cod_equipamento,
                    status: caminhao.status || 'disponivel' 
                });
                trucksAddedToMatrix.set(caminhaoId, true); 
            }
        });
        
        this.frentesMap = new Map(this.data.frentes_servico.filter(f => 
            f.tipo_producao === 'MANUAL' || f.tipo_producao === 'MECANIZADA' || f.tipo_producao === 'NA' || !f.tipo_producao)
            .map(f => [f.id, f]));
        
        this.frentesMap = new Map(
            Array.from(this.frentesMap.entries())
                 .sort(([, a], [, b]) => a.nome.localeCompare(b.nome))
        );
    }

    _calculateDashboardCounts() {
        const counts = {
            indo_carregar: 0,
            carregando: 0,
            retornando: 0,
            descarregando: 0,
            inativos: 0 
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

    renderMinimalistDashboard() {
        const counts = this._calculateDashboardCounts();
        
        const createCard = (statusKey, count, label) => {
            const cardClass = (statusKey === 'inativos') ? 'summary-quebrado' : `summary-${statusKey}`;
            
            return `
                <div class="summary-card ${cardClass} clickable-dashboard-card" data-status-key="${statusKey}">
                    <div class="summary-card-label">${label}</div>
                    <div class="summary-card-value">${count}</div>
                </div>
            `;
        };

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
                        <i class="ph-fill ph-info"></i> Esta tabela mostra a última partida do caminhão no ciclo atual (iniciado às 07:00).
                    </p>
                </div>

            </div>
        `;
        this.container = container.querySelector('#controle-view');
    }

    renderLegend() {
        const relevantStatuses = [
            'indo_carregar', 
            'carregando', 
            'retornando', 
            'patio_carregado', 
            'descarregando',
            'patio_vazio',
            'parado',
            'quebrado'
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

    renderDescargaTable() {
        const { caminhoes = [], frentes_servico = [], caminhao_historico = [] } = this.data;

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

        const caminhoesEmDescarga = caminhoes.filter(c => c.status === this.statusToMonitor && c.frente_id);
        if (caminhoesEmDescarga.length === 0) {
            return ''; 
        }

        const sortedHistory = caminhao_historico.sort((a, b) => new Date(b.timestamp_mudanca) - new Date(a.timestamp_mudanca));
        const entradaDescargaMap = new Map();

        caminhoesEmDescarga.forEach(caminhao => {
            const latestLog = sortedHistory.find(log => log.caminhao_id === caminhao.id && log.status_novo === this.statusToMonitor);
            entradaDescargaMap.set(caminhao.id, {
                timestamp: new Date(latestLog ? latestLog.timestamp_mudanca : caminhao.created_at),
            });
        });
        
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

                for (const group of fixedGroups) {
                    if (group.frentes.includes(frenteNome)) {
                        group.data.push(truckData);
                        break; 
                    }
                }
            }
        });

        fixedGroups.forEach(group => {
            group.data.sort((a, b) => a.entrada - b.entrada);
        });

        let gridHTML = '';
        fixedGroups.forEach(group => {
            const listaCaminhoesHTML = group.data.map(caminhao => `
                <div class="descarga-card clickable-truck-descarga" data-truck-id="${caminhao.id}" title="Clique para ver Ações">
                    <div class="descarga-info-main">
                        <div class="descarga-cod">#${caminhao.cod_equipamento}</div>
                        <div class="descarga-frente-origem">${caminhao.frente_nome_origem}</div> 
                    </div>
                    
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

    renderMovimentacaoTable() {
        if (this.frentesMap.size === 0) {
            return `<div class="empty-state-frente-grid" style="margin-top: 24px;">Nenhuma frente de produção com meta de produção cadastrada.</div>`;
        }
        
        const headerHTML = this.cycleHeaders.map(header => {
            const isCurrentHour = header.display === this.currentHourSlot;
            const headerClass = isCurrentHour ? 'current-hour-slot' : '';
            return `<th class="mov-header-slot ${headerClass}">${header.display}</th>`;
        }).join('');
        
        const bodyHTML = Array.from(this.frentesMap.values()).map(frente => {
            const fazendaNome = frente.fazendas?.nome || 'N/A';
            const fazendaCod = frente.fazendas?.cod_equipamento || 'N/A';
            const fazendaDisplay = (frente.fazendas && fazendaNome !== 'N/A') ? `${fazendaCod}-${fazendaNome}` : 'Nenhuma Fazenda Associada';
            
            const isFrenteInativa = (frente.status === 'inativa' || !frente.status);
            const rowClass = isFrenteInativa ? 'frente-inativa' : '';

            const cellsHTML = this.cycleHeaders.map(header => {
                const trucks = this.movimentacaoData[frente.id]?.[header.display] || [];
                
                const isCurrentHour = header.display === this.currentHourSlot;
                const cellClass = isCurrentHour ? 'current-hour-slot' : '';

                const chunkSize = 3;
                let trucksHTML = '<div class="mov-stacks-wrapper">'; 

                for (let i = 0; i < trucks.length; i += chunkSize) {
                    const group = trucks.slice(i, i + chunkSize);
                    trucksHTML += '<div class="mov-stack-group">';
                    
                    group.forEach(truck => {
                        const codString = String(truck.cod || ''); 
                        const last3 = codString.slice(-3); 
                        const statusLabel = this.statusLabels[truck.status] || 'N/A';
                        trucksHTML += `<span class="truck-code-badge clickable-truck-code status-${truck.status}" 
                                            data-truck-id="${truck.id}" 
                                            title="Caminhão #${truck.cod} (Status: ${statusLabel})">${last3}</span>`;
                    });
                    
                    trucksHTML += '</div>'; 
                }
                trucksHTML += '</div>'; 
                
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
            const truckBadge = e.target.closest('.clickable-truck-code'); 
            const clickableFront = e.target.closest('.clickable-front'); 
            const dashboardCard = e.target.closest('.clickable-dashboard-card'); 
            
            const truckDescarga = e.target.closest('.clickable-truck-descarga'); 
            
            if (truckBadge) {
                const caminhaoId = truckBadge.dataset.truckId;
                this.showStatusUpdateModal(caminhaoId); 
                return;
            }
            
            if (truckDescarga) {
                const caminhaoId = truckDescarga.dataset.truckId;
                this.showStatusUpdateModal(caminhaoId); 
                return;
            }

            if (dashboardCard) {
                const statusKey = dashboardCard.dataset.statusKey;
                if (statusKey) {
                    this.showStatusDetailModal(statusKey);
                }
                return;
            }

            if (clickableFront) {
                const frenteId = clickableFront.dataset.frenteId;
                const currentStatus = clickableFront.dataset.frenteStatus;
                this.showFrontEditModal(frenteId, currentStatus); 
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

    showStatusDetailModal(statusKey) {
        const frentesMap = new Map(this.data.frentes_servico.map(f => [f.id, f.nome]));
        
        let statusList = [statusKey];
        let modalTitle = this.statusLabels[statusKey];

        if (statusKey === 'inativos') {
            statusList = ['parado', 'quebrado'];
            modalTitle = 'Quebrados / Parados';
        }

        const filteredTrucks = this.data.caminhoes.filter(c => statusList.includes(c.status));

        const truckDetails = filteredTrucks.map(truck => {
            const frenteNome = frentesMap.get(truck.frente_id) || 'N/A';
            const startTime = this.latestStatusTimeMap.get(truck.id) || truck.created_at;
            const duration = calculateDowntimeDuration(startTime, null); 

            return {
                cod: truck.cod_equipamento,
                frente: frenteNome,
                startTimeISO: startTime,
                startTimeFormatted: formatDateTime(startTime), 
                duration: duration,
                status: truck.status 
            };
        })
        .sort((a, b) => new Date(a.startTimeISO) - new Date(b.startTimeISO));

        let rowsHTML = '';
        if (truckDetails.length === 0) {
            rowsHTML = '<tr><td colspan="5" style="text-align: center;">Nenhum caminhão neste status no momento.</td></tr>';
        } else {
            rowsHTML = truckDetails.map(truck => {
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
     * @MODIFICADO
     * Modal unificado para edição da frente: permite alterar Fazenda OU Status.
     * Adicionado filtro de pesquisa e exibição do código da fazenda.
     */
    showFrontEditModal(frenteId, currentStatus) {
        const frente = this.data.frentes_servico.find(f => f.id == frenteId);
        const fazendas = this.data.fazendas || [];
        
        const currentFazendaNome = frente.fazendas?.nome || 'Nenhuma';

        const optionsStatusHTML = Object.entries(this.frenteStatusLabels).map(([statusKey, statusLabel]) => 
            `<option value="${statusKey}" ${statusKey === currentStatus ? 'selected' : ''}>${statusLabel}</option>`
        ).join('');
        
        // MODIFICADO: Inclui o código no texto e gera as opções
        const optionsFazendaHTML = fazendas.map(f => {
            const cod = f.cod_equipamento || 'S/C';
            const selected = f.id === frente.fazenda_id ? 'selected' : '';
            // O texto visível no option será pesquisado pelo filtro
            return `<option value="${f.id}" ${selected}>${cod} - ${f.nome}</option>`;
        }).join('');


        const modalContent = `
            <h3>Gerenciar Frente: ${frente.nome}</h3>
            <p>Fazenda Atual: <strong>${currentFazendaNome}</strong></p>
            <p>Status Atual: <span class="caminhao-status-badge status-${currentStatus}">${this.frenteStatusLabels[currentStatus]}</span></p>

            <hr style="margin: 20px 0; border-color: var(--border-color);">

            <h4>1. Alterar Fazenda de Colheita</h4>
            <form id="fazenda-select-form" class="action-modal-form">
                <div class="form-group">
                    <label>Selecione a Nova Fazenda</label>
                    <input type="text" id="fazenda-search-input" class="form-input" placeholder="🔍 Buscar por Código ou Nome..." style="margin-bottom: 8px;">
                    
                    <select name="fazenda" id="fazenda-selector" class="form-select" size="6" style="height: 150px;">
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

        // Lógica de Pesquisa (Filtro)
        const searchInput = document.getElementById('fazenda-search-input');
        const selectElement = document.getElementById('fazenda-selector');
        
        if (searchInput && selectElement) {
            // Armazena as opções originais para poder restaurá-las
            const originalOptions = Array.from(selectElement.options);

            searchInput.addEventListener('keyup', (e) => {
                const term = e.target.value.toLowerCase();
                
                // Limpa o select atual
                selectElement.innerHTML = '';

                // Filtra e readiciona as opções que correspondem
                originalOptions.forEach(opt => {
                    const text = opt.text.toLowerCase();
                    // Sempre mantém a opção "Nenhuma / Limpar" ou se o texto der match
                    if (opt.value === "" || text.includes(term)) {
                        selectElement.appendChild(opt);
                    }
                });
            });
        }

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
            closeModal();
            await this.loadData(true); 
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading();
        }
    }

    async handleFrenteStatusUpdate(frenteId, newStatus) {
        showLoading(); 
        try {
            await updateFrenteStatus(frenteId, newStatus);
            
            dataCache.invalidateAllData();
            
            closeModal();
            
            await this.loadData(true); 
            
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading(); 
        }
    }

    showAssignmentModal() {
        const { caminhoes = [], frentes_servico = [] } = this.data;
        let caminhoesDisponiveis = caminhoes.filter(c => c.status === 'disponivel' || c.status === 'patio_vazio' || !c.status);
        
        caminhoesDisponiveis.sort((a, b) => {
            const codA = parseInt(a.cod_equipamento, 10);
            const codB = parseInt(b.cod_equipamento, 10);
            return codA - codB;
        });
        
        const nowString = getBrtNowString();

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

            this.handleAssignTruck(caminhaoId, frenteId, status, hora);
        });
    }

    async handleAssignTruck(caminhaoId, frenteId, status, hora) {
        showLoading();
        try {
            await assignCaminhaoToFrente(caminhaoId, frenteId, status, getBrtIsoString(hora));
            
            await removeCaminhaoFromFila(caminhaoId); 
            
            dataCache.invalidateAllData();

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

        const frentesAtivas = frentes_servico
            .filter(f => f.fazenda_id && (f.status === 'ativa' || f.status === 'fazendo_cata'))
            .sort((a, b) => a.nome.localeCompare(b.nome));

        const nowString = getBrtNowString();
        
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

        document.getElementById('reallocate-cycle-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = e.target;
            const frenteId = formData.frente.value;
            const status = formData.status.value; 
            const hora = formData.hora.value;
            
            if (!frenteId) {
                showToast('Selecione uma Frente de Destino.', 'error');
                return;
            }
            
            this.handleAssignTruck(caminhaoId, frenteId, status, hora); 
        });

        document.getElementById('btn-set-patio-vazio').addEventListener('click', () => {
            this.handleStatusUpdate(caminhaoId, 'patio_vazio', null, 'Caminhão movido para Pátio Vazio!');
        });
    }

    showFinalizeDowntimeModal(caminhaoId, startTime) {
        const caminhao = this.data.caminhoes.find(c => c.id == caminhaoId);
        if (!caminhao) return;

        const nowString = getBrtNowString();
        
        const initialDiffMillis = calculateTimeDifference(startTime, nowString);
        const initialDuration = formatMillisecondsToHoursMinutes(initialDiffMillis);
        
        const durationColor = initialDiffMillis < 0 ? 'var(--accent-danger)' : 'var(--accent-primary)';


        const modalContent = `
            <p>Finalizando inatividade para: <strong>${caminhao.cod_equipamento}</strong></p>
            <p style="font-size: 0.9rem; color: var(--text-secondary);">Início da Inatividade: ${formatDateTime(startTime)}</p>
            
            <form id="finalize-downtime-form-frota" class="action-modal-form">
                <div class="form-group">
                    <label>Hora de Retorno (Fim da Inatividade)</label>
                    <input type="datetime-local" name="hora_fim" id="hora_fim_input_frota" class="form-input" value="${nowString}" required>
                    <p class="form-help">Edite se a hora de retorno for diferente da hora atual.</p>
                </div>
                
                <p style="text-align: center; font-size: 1.1rem; margin-top: 15px;">
                    Duração Total: <strong id="downtime-duration-display-frota" style="color: ${durationColor};">${initialDuration}</strong>
                </p>
                
                <button type="submit" class="btn-primary">Finalizar (Tornar Disponível)</button>
            </form>
            
            <script>
                window.timeUtils = {
                    calculateTimeDifference: (start, end) => {
                         const startMs = new Date(start).getTime();
                         const endMs = new Date(end).getTime();
                         return endMs - startMs;
                    },
                    formatMillisecondsToHoursMinutes: (ms) => {
                         if (ms < 0) ms = 0;
                         const diffHours = Math.floor(ms / (1000 * 60 * 60));
                         const diffMinutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
                         if (diffHours > 0) {
                             return diffHours + 'h ' + diffMinutes + 'm'; 
                         } else {
                             return diffMinutes + 'm'; 
                         }
                    }
                };

                const startTimeIso = '${startTime}';
                const horaFimInput = document.getElementById('hora_fim_input_frota');
                const durationDisplay = document.getElementById('downtime-duration-display-frota');

                function updateDuration() {
                    const endTime = horaFimInput.value;
                    if (!endTime) return;

                    const diffMillis = window.timeUtils.calculateTimeDifference(startTimeIso, endTime);
                    const durationText = window.timeUtils.formatMillisecondsToHoursMinutes(Math.abs(diffMillis));
                    
                    durationDisplay.textContent = durationText;

                    if (diffMillis < 0) {
                        durationDisplay.style.color = 'var(--accent-danger)';
                        durationDisplay.textContent += ' (Inválida)';
                        horaFimInput.classList.add('is-invalid');
                    } else {
                        durationDisplay.style.color = 'var(--accent-primary)';
                        horaFimInput.classList.remove('is-invalid');
                    }
                }
                
                horaFimInput.addEventListener('input', updateDuration);
                updateDuration(); 
            </script>
        `;
        openModal('Finalizar Inatividade - ' + this.statusLabels[caminhao.status], modalContent);

        document.getElementById('finalize-downtime-form-frota').addEventListener('submit', async (e) => {
            e.preventDefault();
            const horaFim = e.target.hora_fim.value;
            
            if (calculateTimeDifference(startTime, horaFim) < 0) {
                 showToast('A Hora de Retorno não pode ser anterior à Hora de Início.', 'error');
                 document.getElementById('hora_fim_input_frota').classList.add('is-invalid');
                 return;
            }
            
            this.handleStatusUpdate(caminhao.id, 'disponivel', null, 'Inatividade finalizada! Caminhão disponível.', null, getBrtIsoString(horaFim));
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
             
             document.getElementById('btn-finalizar-downtime').addEventListener('click', () => {
                 closeModal(); 
                 this.showFinalizeDowntimeModal(caminhao.id, startTime); 
             });
             
             return;
        }


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
            <\/script>
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

        document.getElementById('btn-finalizar-ciclo').addEventListener('click', () => {
             closeModal();
             this.showFinalizeCycleModal(caminhao.id);
        });
    }
    
    async handleStatusUpdate(caminhaoId, novoStatus, frenteId, successMessage, motivoParada = null, timestamp = null) {
        showLoading(); 
        try {
            const logTimestamp = timestamp || getBrtIsoString();
            
            await updateCaminhaoStatus(caminhaoId, novoStatus, frenteId, motivoParada, logTimestamp);
            
            if (!ESTACIONAMENTO_STATUS.includes(novoStatus)) {
                 await removeCaminhaoFromFila(caminhaoId);
            }
            
            dataCache.invalidateAllData();
            
            closeModal();
            
            await this.loadData(true); 
            
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading();
        }
    }

    // Método restaurado para garantir compatibilidade
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