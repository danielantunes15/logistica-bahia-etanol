// js/views/relatorios.js

import { fetchAllData } from '../api.js';
import { showToast, showLoading, hideLoading, formatDateTime, calculateDowntimeDuration } from '../helpers.js';
import { dataCache } from '../dataCache.js';
import { CAMINHAO_STATUS_LABELS, EQUIPAMENTO_STATUS_LABELS } from '../constants.js';

// Variáveis globais para as bibliotecas de exportação
let html2canvas;
let jspdf;

export class RelatoriosView {
    constructor() {
        this.container = null;
        this.data = {};
        this.workHoursChart = null;
        this.downtimeHoursChart = null; 
        this.utilizationChart = null; 
        this.exportData = {}; 
        this.currentReport = 'charts'; 
        this.caminhaoStatusLabels = CAMINHAO_STATUS_LABELS; 
        this.equipamentoStatusLabels = EQUIPAMENTO_STATUS_LABELS; 
    }

    async show() {
        await this.loadHTML();
        await this.loadInitialData();
        await this.showReport('charts'); 
        this.addEventListeners();
    }

    async hide() {
        if (this.workHoursChart) this.workHoursChart.destroy();
        if (this.downtimeHoursChart) this.downtimeHoursChart.destroy();
        if (this.utilizationChart) this.utilizationChart.destroy();
    }

    async loadHTML() {
        const container = document.getElementById('views-container');
        container.innerHTML = this.getHTML(); 
        this.container = container.querySelector('#relatorios-view');
    }
    
    getHTML() {
        return `
            <div id="relatorios-view" class="view active-view">
                <div class="report-header">
                    <h1>Relatórios Gerenciais</h1>
                    ${this.renderInternalMenu()} </div>

                <div class="report-filters" style="padding: 0 24px 24px; display: flex; flex-wrap: wrap; gap: 16px;">
                    <div class="filter-group" id="filter-date-group" style="display: flex; gap: 12px; align-items: center; background-color: var(--bg-light); border: 1px solid var(--border-color); padding: 12px; border-radius: 8px;">
                        <label style="font-weight: 600; color: var(--accent-primary);">Período:</label>
                        <label for="filter-data-inicio" style="color: var(--text-secondary); font-size: 0.9rem;">De:</label>
                        <input type="date" id="filter-data-inicio" class="form-input" style="width: 150px;">
                        <label for="filter-data-fim" style="color: var(--text-secondary); font-size: 0.9rem;">Até:</label>
                        <input type="date" id="filter-data-fim" class="form-input" style="width: 150px;">
                    </div>
                    
                    <div class="filter-group" id="filter-resource-group" style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; background-color: var(--bg-light); border: 1px solid var(--border-color); padding: 12px; border-radius: 8px; flex-grow: 1;">
                        <label style="font-weight: 600; color: var(--accent-primary);">Recursos:</label>
                        <select id="filter-equipamento" class="form-select" style="min-width: 200px;">
                            <option value="">Equipamento (Todos)</option>
                        </select>
                        <select id="filter-frente" class="form-select">
                            <option value="">Frente (Todas)</option>
                        </select>
                        <select id="filter-proprietario" class="form-select">
                            <option value="">Proprietário (Todos)</option>
                        </select>
                        <button class="btn-primary" id="apply-report-filters" style="margin-left: 20px;">
                            <i class="ph-fill ph-funnel"></i>
                            Filtrar
                        </button>
                    </div>
                </div>
                
                <div id="report-content-container" style="min-height: 500px;">
                </div>

                <div class="report-export" style="padding-top: 20px;">
                    <button class="btn-secondary" id="export-pdf">
                        <i class="ph-fill ph-file-pdf"></i>
                        Exportar PDF
                    </button>
                    <button class="btn-secondary" id="export-excel">
                        <i class="ph-fill ph-file-xls"></i>
                        Exportar Excel/CSV
                    </button>
                </div>
            </div>
        `;
    }
    
    renderInternalMenu() {
        const buttons = [
            { name: 'Gráficos de Utilização', id: 'charts' },
            { name: 'Relatório de Paradas (Caminhões)', id: 'downtime-caminhao' },
            { name: 'Relatório de Paradas (Equipamentos)', id: 'downtime-equipamento' }
        ];
        
        return `
            <div class="report-internal-menu">
                ${buttons.map(btn => `
                    <button class="btn-secondary internal-menu-btn ${this.currentReport === btn.id ? 'active' : ''}" data-report-type="${btn.id}">
                        ${btn.name}
                    </button>
                `).join('')}
            </div>
        `;
    }

    async loadInitialData() {
        showLoading();
        try {
            this.data = await dataCache.fetchAllData(); 
            this.populateFilters();
        } catch (error) {
            showToast('Erro ao carregar dados iniciais dos relatórios.', 'error');
            console.error("Erro em loadInitialData:", error);
        } finally {
            hideLoading();
        }
    }

    populateFilters() {
        const selectEquipamento = document.getElementById('filter-equipamento');
        const selectFrente = document.getElementById('filter-frente');
        const selectProprietario = document.getElementById('filter-proprietario');
        if (!selectEquipamento || !selectFrente || !selectProprietario) return;
        
        const allItems = [
            ...(this.data.caminhoes || []).map(c => ({ id: `c-${c.id}`, cod: c.cod_equipamento, tipo: 'Caminhão' })),
            ...(this.data.equipamentos || []).map(e => ({ id: `e-${e.id}`, cod: e.cod_equipamento, tipo: e.finalidade }))
        ];

        selectEquipamento.innerHTML = '<option value="">Todos os Recursos</option>' +
            allItems.map(item => `<option value="${item.id}">${item.cod} (${item.tipo})</option>`).join('');

        const frentes = this.data.frentes_servico || [];
        selectFrente.innerHTML = '<option value="">Todas as Frentes</option>' + 
            frentes.map(f => `<option value="${f.id}">${f.nome}</option>`).join('');
            
        const proprietarios = this.data.proprietarios || [];
        selectProprietario.innerHTML = '<option value="">Todos os Proprietários</option>' + 
            proprietarios.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');

        const dateEnd = new Date();
        const dateStart = new Date();
        dateStart.setDate(dateEnd.getDate() - 7); 

        const formatDate = (date) => date.toISOString().split('T')[0];

        document.getElementById('filter-data-fim').value = formatDate(dateEnd);
        document.getElementById('filter-data-inicio').value = formatDate(dateStart);
    }

    async showReport(reportName) {
        this.currentReport = reportName;
        this.container.querySelectorAll('.internal-menu-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.reportType === reportName) {
                btn.classList.add('active');
            }
        });
        
        const filters = document.getElementById('filter-resource-group');
        if (filters) {
            filters.style.display = 'flex';
        }

        switch (reportName) {
            case 'charts':
                await this.renderReports();
                break;
            case 'downtime-caminhao':
                await this.renderDowntimeCaminhaoTable();
                break;
            case 'downtime-equipamento':
                await this.renderDowntimeEquipamentoTable();
                break;
            default:
                document.getElementById('report-content-container').innerHTML = `<div class="empty-state">Selecione um relatório.</div>`;
        }
    }
    
    async renderDowntimeCaminhaoTable() {
        showLoading();
        const container = document.getElementById('report-content-container');
        
        try {
            const filters = this.getFilterValues();
            const caminhãoMap = new Map((this.data.caminhoes || []).map(c => [c.id, c]));
            
            const filteredHistory = this.filterHistory(
                this.data.caminhao_historico, caminhãoMap, filters.dataInicio, filters.dataFim, 
                filters.equipamento, filters.frente, filters.proprietario, 'caminhao_id'
            );
            
            const sessions = this.groupDowntimeSessions(filteredHistory, caminhãoMap, 'caminhao_id', ['parado', 'quebrado'], this.data.frentes_servico);
            
            let tableHTML = this.generateDowntimeTableHTML(
                sessions, 
                'Relatório Detalhado de Paradas de Caminhões', 
                'Caminhão', 
                this.caminhaoStatusLabels
            );
            
            container.innerHTML = tableHTML;
        } catch (error) {
            container.innerHTML = `<div class="empty-state">Erro ao gerar relatório de caminhões: ${error.message}</div>`;
        } finally {
            hideLoading();
        }
    }

    async renderDowntimeEquipamentoTable() {
        showLoading();
        const container = document.getElementById('report-content-container');
        
        try {
            const filters = this.getFilterValues();
            const equipamentoMap = new Map((this.data.equipamentos || []).map(e => [e.id, e]));
            
            const filteredHistory = this.filterHistory(
                this.data.equipamento_historico, equipamentoMap, filters.dataInicio, filters.dataFim, 
                filters.equipamento, filters.frente, filters.proprietario, 'equipamento_id'
            );
            
            const sessions = this.groupDowntimeSessions(filteredHistory, equipamentoMap, 'equipamento_id', ['parado', 'quebrado'], this.data.frentes_servico);
            
            let tableHTML = this.generateDowntimeTableHTML(
                sessions, 
                'Relatório Detalhado de Paradas de Equipamentos', 
                'Equipamento', 
                this.equipamentoStatusLabels
            );
            
            container.innerHTML = tableHTML;
        } catch (error) {
            container.innerHTML = `<div class="empty-state">Erro ao gerar relatório de equipamentos: ${error.message}</div>`;
        } finally {
            hideLoading();
        }
    }
    
    groupDowntimeSessions(history, itemMap, idColumn, downtimeStatuses, frentesServico) {
        const sortedLogs = history.sort((a, b) => new Date(a.timestamp_mudanca) - new Date(b.timestamp_mudanca));
        const downtimeSessions = [];
        const activeSessions = new Map(); 
        const frentesMap = new Map(frentesServico.map(f => [f.id, f.nome]));

        for (const log of sortedLogs) {
            const itemId = log[idColumn];
            const isDowntimeStart = downtimeStatuses.includes(log.status_novo) && !downtimeStatuses.includes(log.status_anterior);
            const isStatusChangeDowntime = downtimeStatuses.includes(log.status_novo) && downtimeStatuses.includes(log.status_anterior);
            const isDowntimeEnd = !downtimeStatuses.includes(log.status_novo) && downtimeStatuses.includes(log.status_anterior);

            const itemDetails = itemMap.get(itemId);
            if (!itemDetails) continue;

            if (isDowntimeStart) {
                activeSessions.set(itemId, {
                    startLog: log,
                    startTime: new Date(log.timestamp_mudanca),
                    startStatus: log.status_novo,
                    frenteId: itemDetails.frente_id 
                });
            } else if (isDowntimeEnd) {
                const session = activeSessions.get(itemId);
                if (session) {
                    downtimeSessions.push({
                        cod_equipamento: itemDetails.cod_equipamento,
                        tipo: itemDetails.finalidade || 'Caminhão',
                        frente: frentesMap.get(session.frenteId) || 'N/A',
                        start_time: session.startTime,
                        end_time: new Date(log.timestamp_mudanca),
                        start_status: session.startStatus,
                        end_status: log.status_novo, 
                        motivo: session.startLog.motivo_parada || 'Não informado',
                    });
                    activeSessions.delete(itemId);
                }
            } else if (isStatusChangeDowntime) {
                const session = activeSessions.get(itemId);
                if (session) {
                    session.startStatus = log.status_novo; 
                    session.startLog.motivo_parada = log.motivo_parada || session.startLog.motivo_parada;
                }
            }
        }
        
        for (const [id, session] of activeSessions.entries()) {
            const itemDetails = itemMap.get(id);
            downtimeSessions.push({
                cod_equipamento: itemDetails.cod_equipamento,
                tipo: itemDetails.finalidade || 'Caminhão',
                frente: frentesMap.get(session.frenteId) || 'N/A',
                start_time: session.startTime,
                end_time: null, 
                start_status: session.startStatus,
                end_status: session.startStatus, 
                motivo: session.startLog.motivo_parada || 'Não informado',
            });
        }
        
        downtimeSessions.sort((a, b) => b.start_time - a.start_time);
        return downtimeSessions;
    }
    
    generateDowntimeTableHTML(sessions, title, resourceLabel, statusLabels) {
        if (sessions.length === 0) {
            return `<div class="empty-state" style="padding: 50px;">
                        <i class="ph-fill ph-warning" style="font-size: 3rem;"></i>
                        <p>Nenhum registro de inatividade encontrado para os filtros e recursos selecionados.</p>
                    </div>`;
        }

        const rows = sessions.map(session => {
            const duration = calculateDowntimeDuration(session.start_time, session.end_time);
            const startStatusBadge = `<span class="caminhao-status-badge status-${session.start_status}">${statusLabels[session.start_status] || session.start_status}</span>`;
            
            let endStatusLabel;
            if (session.end_time) {
                endStatusLabel = `<span class="caminhao-status-badge status-${session.end_status}" style="background-color: var(--accent-primary);">${statusLabels[session.end_status] || session.end_status}</span>`;
            } else {
                endStatusLabel = `<span class="caminhao-status-badge status-${session.end_status}" style="background-color: var(--accent-danger);">EM ABERTO (${statusLabels[session.end_status]})</span>`;
            }
            
            const endTimeDisplay = session.end_time ? formatDateTime(session.end_time) : '---';

            return `
                <tr>
                    <td>${session.cod_equipamento}</td>
                    <td>${session.tipo}</td>
                    <td>${session.frente}</td>
                    <td>${startStatusBadge}</td>
                    <td>${session.motivo}</td>
                    <td>${formatDateTime(session.start_time)}</td>
                    <td>${endTimeDisplay}</td>
                    <td><strong style="color: ${session.end_time ? 'var(--text-primary)' : 'var(--accent-danger)'};">${duration}</strong></td>
                </tr>
            `;
        }).join('');

        return `
            <div class="report-table-container">
                <h3 style="padding: 0 24px; margin-bottom: 16px;">${title} (${sessions.length} Registros)</h3>
                <div style="padding: 0 24px; overflow-x: auto;">
                    <table class="data-table-modern">
                        <thead>
                            <tr>
                                <th>Cód. ${resourceLabel}</th>
                                <th>Tipo</th>
                                <th>Frente de Origem</th>
                                <th>Status Inicial</th>
                                <th>Motivo</th>
                                <th>Início da Parada</th>
                                <th>Fim da Parada</th>
                                <th>Duração</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    getFilterValues() {
        return {
            equipamento: document.getElementById('filter-equipamento')?.value,
            frente: document.getElementById('filter-frente')?.value,
            proprietario: document.getElementById('filter-proprietario')?.value,
            dataInicio: document.getElementById('filter-data-inicio')?.value,
            dataFim: document.getElementById('filter-data-fim')?.value
        };
    }
    
    async renderReports() {
        showLoading(); 
        const container = document.getElementById('report-content-container');
        // NOVO HTML PARA GRÁFICOS
        container.innerHTML = `
            <div class="charts-grid">
                <div class="chart-container">
                    <h3>1. Horas de Inatividade por Tipo de Equipamento (Geral)</h3>
                    <div class="chart-wrapper">
                        <canvas id="downtimeByTypeChart"></canvas>
                    </div>
                </div>

                <div class="chart-container">
                    <h3>2. Horas Trabalhadas vs. Paradas (Por Tipo de Equipamento)</h3>
                    <div class="chart-wrapper">
                        <canvas id="workDowntimeByTypeChart"></canvas>
                    </div>
                </div>
                
                <div class="chart-container">
                    <h3>3. Taxa de Utilização por Equipamento (%)</h3>
                    <div class="chart-wrapper">
                        <canvas id="utilizationChart"></canvas>
                    </div>
                </div>
            </div>
        `;
        
        try {
            const filters = this.getFilterValues();
            const caminhoesMap = new Map((this.data.caminhoes || []).map(c => [c.id, c]));
            const equipamentosMap = new Map((this.data.equipamentos || []).map(e => [e.id, e]));

            // 1. FILTRAGEM
            let filteredWorkHistory = this.filterHistory(
                this.data.caminhao_historico, caminhoesMap, filters.dataInicio, filters.dataFim, 
                filters.equipamento, filters.frente, filters.proprietario, 'caminhao_id'
            );
            let filteredDowntimeCaminhaoHistory = this.filterHistory(
                this.data.caminhao_historico, caminhoesMap, filters.dataInicio, filters.dataFim, 
                filters.equipamento, filters.frente, filters.proprietario, 'caminhao_id'
            );
            let filteredDowntimeEquipamentoHistory = this.filterHistory(
                this.data.equipamento_historico, equipamentosMap, filters.dataInicio, filters.dataFim, 
                filters.equipamento, filters.frente, filters.proprietario, 'equipamento_id'
            );

            // 2. CÁLCULO DE HORAS
            
            // CÁLCULO DE DOWNTIME POR TIPO (GRÁFICO 1)
            const downtimeHoursByType = this.calculateDowntimeHoursByType(
                filteredDowntimeEquipamentoHistory, 
                this.data.equipamentos,
                filteredDowntimeCaminhaoHistory,
                this.data.caminhoes
            );
            const downtimeTypeLabels = downtimeHoursByType.map(item => item.cod_equipamento);
            const downtimeTypeData = downtimeHoursByType.map(item => item.totalHours);
            this.drawChart('downtimeByTypeChart', downtimeTypeLabels, downtimeTypeData, 'bar', 'Total de Horas de Inatividade (H)', 'rgba(197, 48, 48, 0.6)');

            // CÁLCULO COMPARATIVO POR TIPO (GRÁFICO 2)
            const workDowntimeByType = this.calculateWorkDowntimeByType(
                filteredWorkHistory, 
                filteredDowntimeCaminhaoHistory,
                filteredDowntimeEquipamentoHistory,
                this.data.caminhoes,
                this.data.equipamentos
            );
            
            const comparisonTypeDatasets = [
                {
                    label: 'Horas Trabalhadas (H)',
                    data: workDowntimeByType.workData,
                    backgroundColor: 'rgba(56, 161, 105, 0.8)', // Verde
                    borderColor: 'rgba(56, 161, 105, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Horas Paradas (H)',
                    data: workDowntimeByType.downtimeData,
                    backgroundColor: 'rgba(197, 48, 48, 0.8)', // Vermelho (Danger)
                    borderColor: 'rgba(197, 48, 48, 1)',
                    borderWidth: 1
                }
            ];

            this.drawComparisonChart('workDowntimeByTypeChart', workDowntimeByType.labels, comparisonTypeDatasets, 'bar');


            // CÁLCULO INDIVIDUAL E UTILIZAÇÃO (GRÁFICO 3)
            const workHoursCaminhoes = this.calculateWorkHours(filteredWorkHistory, this.data.caminhoes, 'caminhao_id');
            const workHoursEquipamentos = this.calculateWorkHours(filteredDowntimeEquipamentoHistory, this.data.equipamentos, 'equipamento_id');
            const allWorkHours = [...workHoursCaminhoes, ...workHoursEquipamentos];
            
            const individualDowntimeHours = this.calculateIndividualDowntimeHours(
                filteredDowntimeCaminhaoHistory, 
                filteredDowntimeEquipamentoHistory, 
                this.data.caminhoes, 
                this.data.equipamentos
            );
            
            const comparisonDataIndividual = this.prepareComparisonData(allWorkHours, individualDowntimeHours);
            
            const utilizationData = this.calculateUtilizationRate(comparisonDataIndividual);
            this.drawUtilizationChart('utilizationChart', utilizationData.labels, utilizationData.data);
            
            // 6. ARMAZENAR DADOS PARA EXPORTAÇÃO
            this.exportData = {
                comparisonData: comparisonDataIndividual, 
                downtimeByType: this.calculateDowntimeHoursByType(filteredDowntimeEquipamentoHistory, this.data.equipamentos, filteredDowntimeCaminhaoHistory, this.data.caminhoes),
                utilizationData: utilizationData,
                filterContext: {
                    periodo: `${filters.dataInicio || 'Início'} a ${filters.dataFim || 'Fim'}`,
                    equipamento: document.getElementById('filter-equipamento')?.options[document.getElementById('filter-equipamento')?.selectedIndex]?.text || 'Todos',
                    frente: document.getElementById('filter-frente')?.options[document.getElementById('filter-frente')?.selectedIndex]?.text || 'Todas',
                    proprietario: document.getElementById('filter-proprietario')?.options[document.getElementById('filter-proprietario')?.selectedIndex]?.text || 'Todos'
                }
            };
            
        } catch (error) {
            showToast('Erro ao gerar os relatórios. Verifique os filtros.', 'error');
            console.error("Erro em renderReports:", error);
        } finally {
            hideLoading();
        }
    }

    filterHistory(history, itemMap, start, end, itemFilter, frenteFilter, proprietarioFilter, idColumn) {
        let filtered = history;
        const numericFrenteId = frenteFilter ? parseInt(frenteFilter) : null;
        const numericProprietarioId = proprietarioFilter ? parseInt(proprietarioFilter) : null;

        if (start) {
            const startDate = new Date(start).getTime();
            filtered = filtered.filter(log => new Date(log.timestamp_mudanca).getTime() >= startDate);
        }
        if (end) {
            const endDate = new Date(end);
            endDate.setDate(endDate.getDate() + 1);
            const endDateTimestamp = endDate.getTime();
            filtered = filtered.filter(log => new Date(log.timestamp_mudanca).getTime() < endDateTimestamp);
        }
        
        if (itemFilter) {
            const [type, id] = itemFilter.split('-');
            const numericId = parseInt(id);
            
            if (type === 'c' && idColumn === 'caminhao_id') {
                filtered = filtered.filter(log => log[idColumn] === numericId);
            } else if (type === 'e' && idColumn === 'equipamento_id') {
                filtered = filtered.filter(log => log[idColumn] === numericId);
            } else {
                if ((type === 'c' && idColumn === 'equipamento_id') || (type === 'e' && idColumn === 'caminhao_id')) {
                    return [];
                }
            }
        }
        
        if (numericFrenteId || numericProprietarioId) {
            filtered = filtered.filter(log => {
                const itemId = log[idColumn];
                const item = itemMap.get(itemId);
                
                if (!item) return false;
                
                let matchesFrente = true;
                let matchesProprietario = true;
                
                if (numericFrenteId) {
                    matchesFrente = item.frente_id === numericFrenteId;
                }
                
                if (numericProprietarioId) {
                    matchesProprietario = item.proprietario_id === numericProprietarioId;
                }
                
                return matchesFrente && matchesProprietario;
            });
        }

        return filtered;
    }

    calculateWorkHours(history, items, idColumn) {
        const itemMap = new Map(items.map(i => [i.id, i]));
        const productiveStatus = ['ativo', 'indo_carregar', 'carregando', 'retornando', 'patio_carregado', 'descarregando', 'patio_vazio'];
        
        const itemWorkLogs = {};
        
        history.forEach(log => {
            const id = log[idColumn];
            const item = itemMap.get(id);
            if (!id || !item) return;
            
            if (!itemWorkLogs[id]) {
                itemWorkLogs[id] = { 
                    cod_equipamento: item.cod_equipamento, 
                    sessions: [] 
                };
            }
            
            itemWorkLogs[id].sessions.push({ 
                status: log.status_novo, 
                time: new Date(log.timestamp_mudanca) 
            });
        });

        const results = [];

        for (const id in itemWorkLogs) {
            let totalMillis = 0;
            const { sessions, cod_equipamento } = itemWorkLogs[id];
            const sortedSessions = sessions.sort((a, b) => a.time - b.time);
            
            for(let i = 0; i < sortedSessions.length - 1; i++) {
                if (productiveStatus.includes(sortedSessions[i].status)) {
                    totalMillis += sortedSessions[i+1].time - sortedSessions[i].time;
                }
            }
            
            const lastSession = sortedSessions[sortedSessions.length - 1];
            if (lastSession && productiveStatus.includes(lastSession.status)) {
                totalMillis += new Date() - lastSession.time; 
            }
            
            results.push({
                cod_equipamento: cod_equipamento, 
                totalHours: parseFloat((totalMillis / (1000 * 60 * 60)).toFixed(2))
            });
        }
        
        return results;
    }

    calculateIndividualDowntimeHours(caminhaoHistory, equipamentoHistory, caminhoes, equipamentos) {
        const itemDowntimeLogs = {};
        const itemMap = new Map();
        const nonProductiveStatus = ['parado', 'quebrado'];

        // 1. Processa Caminhões
        caminhoes.forEach(c => itemMap.set(`c-${c.id}`, { cod_equipamento: c.cod_equipamento, id: c.id }));
        caminhaoHistory.forEach(log => {
            const idKey = `c-${log.caminhao_id}`;
            if (itemMap.has(idKey)) {
                if (!itemDowntimeLogs[idKey]) {
                    itemDowntimeLogs[idKey] = { 
                        cod_equipamento: itemMap.get(idKey).cod_equipamento, 
                        sessions: [] 
                    };
                }
                itemDowntimeLogs[idKey].sessions.push({ 
                    status: log.status_novo, 
                    time: new Date(log.timestamp_mudanca) 
                });
            }
        });

        // 2. Processa Equipamentos
        equipamentos.forEach(e => itemMap.set(`e-${e.id}`, { cod_equipamento: e.cod_equipamento, id: e.id, finalidade: e.finalidade }));
        equipamentoHistory.forEach(log => {
            const idKey = `e-${log.equipamento_id}`;
            if (itemMap.has(idKey)) {
                if (!itemDowntimeLogs[idKey]) {
                    itemDowntimeLogs[idKey] = { 
                        cod_equipamento: itemMap.get(idKey).cod_equipamento, 
                        sessions: [] 
                    };
                }
                itemDowntimeLogs[idKey].sessions.push({ 
                    status: log.status_novo, 
                    time: new Date(log.timestamp_mudanca) 
                });
            }
        });
        
        // 3. Cálculo de Duração 
        const results = [];
        for (const idKey in itemDowntimeLogs) {
            let totalMillis = 0;
            const { sessions, cod_equipamento } = itemDowntimeLogs[idKey];
            const sortedSessions = sessions.sort((a, b) => a.time - b.time);
            
            for(let i = 0; i < sortedSessions.length - 1; i++) {
                if (nonProductiveStatus.includes(sortedSessions[i].status)) {
                    totalMillis += sortedSessions[i+1].time - sortedSessions[i].time;
                }
            }
            
            const lastSession = sortedSessions[sessions.length - 1];
            if (lastSession && nonProductiveStatus.includes(lastSession.status)) {
                totalMillis += new Date() - lastSession.time; 
            }

            results.push({
                cod_equipamento: cod_equipamento, 
                totalHours: parseFloat((totalMillis / (1000 * 60 * 60)).toFixed(2))
            });
        }
        
        return results.filter(r => r.totalHours > 0).sort((a, b) => b.totalHours - a.totalHours);
    }

    calculateDowntimeHoursByType(equipamentoHistory, equipamentos, caminhaoHistory, caminhoes) {
        const nonProductiveStatus = ['parado', 'quebrado'];
        const groupedResults = {};

        const calculateDowntimeDurationFromLogs = (logs, itemType) => {
            const itemDowntimeLogs = {};
            
            logs.forEach(log => {
                const idColumn = itemType === 'Caminhão' ? 'caminhao_id' : 'equipamento_id';
                const id = log[idColumn];
                if (!itemDowntimeLogs[id]) {
                    itemDowntimeLogs[id] = { sessions: [] };
                }
                itemDowntimeLogs[id].sessions.push({ 
                    status: log.status_novo, 
                    time: new Date(log.timestamp_mudanca) 
                });
            });

            let totalMillis = 0;
            for (const id in itemDowntimeLogs) {
                const { sessions } = itemDowntimeLogs[id];
                const sortedSessions = sessions.sort((a, b) => a.time - b.time);
                
                for(let i = 0; i < sortedSessions.length - 1; i++) {
                    if (nonProductiveStatus.includes(sortedSessions[i].status)) {
                        totalMillis += sortedSessions[i+1].time - sortedSessions[i].time;
                    }
                }
                
                const lastSession = sortedSessions[sortedSessions.length - 1];
                if (lastSession && nonProductiveStatus.includes(lastSession.status)) {
                    totalMillis += new Date() - lastSession.time; 
                }
            }
            return totalMillis;
        };

        // 1. Mapeia logs de Equipamentos por ID para agregar o tempo
        const equipamentoMap = new Map(equipamentos.map(i => [i.id, i]));
        equipamentoHistory.forEach(log => {
            const item = equipamentoMap.get(log.equipamento_id);
            if (item) {
                const key = `e-${log.equipamento_id}`;
                if (!groupedResults[key]) {
                    groupedResults[key] = { groupKey: item.finalidade, logs: [] };
                }
                groupedResults[key].logs.push(log);
            }
        });

        // 2. Mapeia logs de Caminhões por ID para agregar o tempo
        const caminhaoMap = new Map(caminhoes.map(i => [i.id, i]));
        caminhaoHistory.forEach(log => {
            const item = caminhaoMap.get(log.caminhao_id);
            if (item) {
                const key = `c-${log.caminhao_id}`;
                if (!groupedResults[key]) {
                    groupedResults[key] = { groupKey: 'Caminhão', logs: [] };
                }
                groupedResults[key].logs.push(log);
            }
        });
        
        const finalByType = {};

        // 3. Calcula o tempo total de inatividade e agrega por tipo
        for (const key in groupedResults) {
            const { groupKey, logs } = groupedResults[key];
            const type = groupKey;
            
            const totalMillis = calculateDowntimeDurationFromLogs(logs, type);
            
            if (!finalByType[type]) {
                finalByType[type] = 0;
            }
            finalByType[type] += totalMillis;
        }

        const finalResults = Object.keys(finalByType).map(groupKey => ({
            cod_equipamento: groupKey, 
            totalHours: parseFloat((finalByType[groupKey] / (1000 * 60 * 60)).toFixed(2))
        }));
        
        return finalResults.filter(r => r.totalHours > 0).sort((a, b) => b.totalHours - a.totalHours);
    }

    calculateWorkDowntimeByType(caminhaoWorkHistory, caminhaoDowntimeHistory, equipamentoDowntimeHistory, caminhoes, equipamentos) {
        
        // 1. Obter horas de trabalho por tipo (Agrega as horas de trabalho individuais)
        const workHoursByType = this.calculateWorkHours(caminhaoWorkHistory, caminhoes, 'caminhao_id')
            .concat(
                this.calculateWorkHours(equipamentoDowntimeHistory, equipamentos, 'equipamento_id')
            ).reduce((acc, curr) => {
                const item = equipamentos.find(e => e.cod_equipamento === curr.cod_equipamento) || caminhoes.find(c => c.cod_equipamento === curr.cod_equipamento);
                const type = item?.finalidade || (caminhoes.find(c => c.cod_equipamento === curr.cod_equipamento) ? 'Caminhão' : 'Outros');
                
                acc[type] = (acc[type] || 0) + curr.totalHours;
                return acc;
            }, {});
        
        // 2. Obter horas de inatividade por tipo (Reutiliza a função do Gráfico 1)
        const downtimeHoursByType = this.calculateDowntimeHoursByType(
            equipamentoDowntimeHistory, 
            equipamentos,
            caminhaoDowntimeHistory,
            caminhoes
        ).reduce((acc, curr) => {
            acc[curr.cod_equipamento] = curr.totalHours;
            return acc;
        }, {});

        // 3. Combina e formata
        const allTypes = Array.from(new Set([...Object.keys(workHoursByType), ...Object.keys(downtimeHoursByType)]));
        allTypes.sort(); 

        const workData = allTypes.map(type => workHoursByType[type] || 0);
        const downtimeData = allTypes.map(type => downtimeHoursByType[type] || 0);

        return { labels: allTypes, workData, downtimeData };
    }

    prepareComparisonData(workHours, downtimeHours) {
        const dataMap = new Map();

        workHours.forEach(item => {
            dataMap.set(item.cod_equipamento, { work: item.totalHours, downtime: 0 });
        });

        downtimeHours.forEach(item => {
            if (dataMap.has(item.cod_equipamento)) {
                dataMap.get(item.cod_equipamento).downtime = item.totalHours;
            } else {
                 dataMap.set(item.cod_equipamento, { work: 0, downtime: item.totalHours });
            }
        });

        const labels = Array.from(dataMap.keys()).sort();
        const workData = labels.map(label => dataMap.get(label).work);
        const downtimeData = labels.map(label => dataMap.get(label).downtime);
        
        return { labels, workData, downtimeData };
    }
    
    calculateUtilizationRate(comparisonData) {
        const labels = comparisonData.labels;
        const utilizationData = [];

        labels.forEach((label, index) => {
            const work = comparisonData.workData[index];
            const downtime = comparisonData.downtimeData[index];
            const total = work + downtime;
            
            const utilization = total > 0 ? (work / total) * 100 : 0;
            utilizationData.push(parseFloat(utilization.toFixed(1)));
        });

        return { labels, data: utilizationData };
    }

    drawUtilizationChart(canvasId, labels, data) {
        const ctx = document.getElementById(canvasId);
        if (this.utilizationChart) this.utilizationChart.destroy();
        
        this.utilizationChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Taxa de Utilização (%)',
                    data: data,
                    backgroundColor: data.map(v => v >= 80 ? 'rgba(56, 161, 105, 0.8)' : v >= 50 ? 'rgba(214, 158, 46, 0.8)' : 'rgba(197, 48, 48, 0.8)'),
                    borderColor: data.map(v => v >= 80 ? 'rgba(56, 161, 105, 1)' : v >= 50 ? 'rgba(214, 158, 46, 1)' : 'rgba(197, 48, 48, 1)'),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                    y: { 
                        beginAtZero: true, 
                        max: 100,
                        ticks: { color: '#A0AEC0', callback: (value) => value + "%" }, 
                        grid: { color: '#4A5568' } 
                    }, 
                    x: { 
                        ticks: { color: '#A0AEC0' }, 
                        grid: { color: '#4A5568' } 
                    } 
                },
                plugins: { 
                    legend: { 
                        labels: { color: '#F7FAFC' } 
                    } 
                }
            }
        });
    }

    drawComparisonChart(canvasId, labels, datasets, type) {
        const ctx = document.getElementById(canvasId);
        if (this.workHoursChart) this.workHoursChart.destroy(); 

        this.workHoursChart = new Chart(ctx, {
            type: type,
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                    y: { 
                        beginAtZero: true, 
                        ticks: { color: '#A0AEC0' }, 
                        grid: { color: '#4A5568' } 
                    }, 
                    x: { 
                        ticks: { color: '#A0AEC0' }, 
                        grid: { color: '#4A5568' } 
                    } 
                },
                plugins: { 
                    legend: { 
                        labels: { color: '#F7FAFC' } 
                    } 
                }
            }
        });
    }

    drawChart(canvasId, labels, data, type, label, color = 'rgba(56, 161, 105, 0.6)') {
        const ctx = document.getElementById(canvasId);
        if (this.downtimeHoursChart) this.downtimeHoursChart.destroy();

        const newChart = new Chart(ctx, {
            type: type,
            data: {
                labels: labels,
                datasets: [{
                    label: label,
                    data: data,
                    backgroundColor: color,
                    borderColor: color.replace('0.6', '1'),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                    y: { 
                        beginAtZero: true, 
                        ticks: { color: '#A0AEC0' }, 
                        grid: { color: '#4A5568' } 
                    }, 
                    x: { 
                        ticks: { color: '#A0AEC0' }, 
                        grid: { color: '#4A5568' } 
                    } 
                },
                plugins: { 
                    legend: { 
                        labels: { color: '#F7FAFC' } 
                    } 
                }
            }
        });
        
        if (canvasId === 'downtimeByTypeChart') this.downtimeHoursChart = newChart;
    }

    async exportToPDF() {
        if (!this.container) return;
        
        if (!html2canvas || !jspdf) {
            showToast('Carregando bibliotecas de exportação...', 'info');
            try {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://html2canvas.hertzen.com/dist/html2canvas.min.js';
                    script.onload = () => { html2canvas = window.html2canvas; resolve(); };
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
                
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                    script.onload = () => { jspdf = window.jspdf; resolve(); };
                    script.onerror = reject;
                    document.head.appendChild(script);
                });

            } catch (error) {
                 showToast('Erro ao carregar bibliotecas de exportação.', 'error');
                 return;
            }
        }
        
        showLoading();
        try {
            const { jsPDF } = jspdf;
            const doc = new jsPDF('p', 'mm', 'a4');
            const margin = 10;
            let y = margin;
            
            doc.setFontSize(22);
            doc.setTextColor(56, 161, 105); 
            doc.text("Relatório Gerencial de Operações", margin, y);
            y += 10;
            
            doc.setFontSize(10);
            doc.setTextColor(160, 174, 192); 
            doc.text(`Período: ${this.exportData.filterContext.periodo}`, margin, y);
            y += 5;
            doc.text(`Filtros: Equipamento=${this.exportData.filterContext.equipamento} | Frente=${this.exportData.filterContext.frente} | Proprietário=${this.exportData.filterContext.proprietario}`, margin, y);
            y += 10;
            
            const chartContainers = this.container.querySelectorAll('.chart-container');
            
            for (const container of chartContainers) {
                const canvas = container.querySelector('canvas');
                if (!canvas) continue;

                const chartTitle = container.querySelector('h3')?.textContent || 'Gráfico';
                
                const canvasImage = await html2canvas(canvas, {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#1A202C' 
                });
                
                const imgData = canvasImage.toDataURL('image/png');
                const imgWidth = 180; 
                const imgHeight = canvasImage.height * imgWidth / canvasImage.width / canvasImage.scale;
                
                if (y + imgHeight + 10 > doc.internal.pageSize.height) {
                    doc.addPage();
                    y = margin;
                }
                
                doc.setFontSize(14);
                doc.setTextColor(247, 250, 252); 
                doc.text(chartTitle, margin, y);
                y += 5;

                doc.addImage(imgData, 'PNG', margin, y, imgWidth, imgHeight);
                y += imgHeight + 10;
            }
            
            doc.save(`Relatorio_Logistica_BEL_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`);
            showToast('Relatório exportado para PDF com sucesso!', 'success');
            
        } catch (error) {
            showToast('Erro ao exportar PDF. Verifique se as bibliotecas foram carregadas.', 'error');
            console.error("Erro na exportação PDF:", error);
        } finally {
            hideLoading();
        }
    }

    exportToExcel() {
        if (!this.exportData || !this.exportData.comparisonData) {
            showToast('Erro: Dados para exportação não disponíveis. Filtre o relatório primeiro.', 'error');
            return;
        }

        try {
            const data = this.exportData;
            const labels = data.comparisonData.labels; 

            const aggregatedData = this.calculateWorkDowntimeByType(
                this.filterHistory(this.data.caminhao_historico, new Map(this.data.caminhoes.map(c=>[c.id, c])), data.filterContext.periodo.split(' a ')[0], data.filterContext.periodo.split(' a ')[1], null, null, null, 'caminhao_id'),
                this.filterHistory(this.data.caminhao_historico, new Map(this.data.caminhoes.map(c=>[c.id, c])), data.filterContext.periodo.split(' a ')[0], data.filterContext.periodo.split(' a ')[1], null, null, null, 'caminhao_id'),
                this.filterHistory(this.data.equipamento_historico, new Map(this.data.equipamentos.map(e=>[e.id, e])), data.filterContext.periodo.split(' a ')[0], data.filterContext.periodo.split(' a ')[1], null, null, null, 'equipamento_id'),
                this.data.caminhoes,
                this.data.equipamentos
            );
            
            let csvContent = "";
            
            csvContent += `Relatorio Gerencial de Operacoes\r\n`;
            csvContent += `Periodo: ${data.filterContext.periodo}\r\n`;
            csvContent += `Filtros: Equipamento=${data.filterContext.equipamento}, Frente=${data.filterContext.frente}, Proprietario=${data.filterContext.proprietario}\r\n\r\n`;

            // Tabela 1: Comparativo Individual (Horas Trabalhadas vs Paradas)
            csvContent += `--- Tabela 1: Comparativo Individual (Horas) ---\r\n`;
            let header1 = "Equipamento/Caminhao;Horas Trabalhadas;Horas Paradas;Total Horas;Taxa de Utilizacao (%)\r\n";
            csvContent += header1;

            labels.forEach((label, index) => {
                const work = data.comparisonData.workData[index];
                const downtime = data.comparisonData.downtimeData[index];
                const utilization = data.utilizationData.data[index];
                const total = work + downtime;
                
                csvContent += `${label};${work.toFixed(2).replace('.', ',')};${downtime.toFixed(2).replace('.', ',')};${total.toFixed(2).replace('.', ',')};${utilization.toFixed(1).replace('.', ',')}\r\n`;
            });

            // Tabela 2: Comparativo por Tipo (Agregado)
            csvContent += `\r\n--- Tabela 2: Comparativo por Tipo de Equipamento (Horas) ---\r\n`;
            let header2 = "Tipo de Equipamento;Horas Trabalhadas;Horas Inativas\r\n";
            csvContent += header2;

            aggregatedData.labels.forEach((type, index) => {
                const work = aggregatedData.workData[index];
                const downtime = aggregatedData.downtimeData[index];
                csvContent += `${type};${work.toFixed(2).replace('.', ',')};${downtime.toFixed(2).replace('.', ',')}\r\n`;
            });


            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `Relatorio_Logistica_BEL_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showToast('Relatório exportado para Excel/CSV com sucesso!', 'success');
            
        } catch (error) {
            showToast('Erro ao exportar Excel. Tente gerar o relatório novamente.', 'error');
            console.error("Erro na exportação Excel:", error);
        }
    }


    addEventListeners() {
        const filterBtn = document.getElementById('apply-report-filters');
        if (filterBtn) {
            filterBtn.removeEventListener('click', this.applyFilterAndRender.bind(this));
            filterBtn.addEventListener('click', this.applyFilterAndRender.bind(this));
        }
        
        if (this.container) {
            this.container.querySelectorAll('.internal-menu-btn').forEach(btn => {
                btn.removeEventListener('click', this.handleInternalMenuClick.bind(this));
                btn.addEventListener('click', this.handleInternalMenuClick.bind(this));
            });
        }
        
        const exportPdfBtn = document.getElementById('export-pdf');
        if (exportPdfBtn) {
            exportPdfBtn.removeEventListener('click', this.exportToPDF.bind(this));
            exportPdfBtn.addEventListener('click', this.exportToPDF.bind(this));
        }
        
        const exportExcelBtn = document.getElementById('export-excel');
        if (exportExcelBtn) {
            exportExcelBtn.removeEventListener('click', this.exportToExcel.bind(this));
            exportExcelBtn.addEventListener('click', this.exportToExcel.bind(this));
        }
    }
    
    handleInternalMenuClick(e) {
        const reportType = e.target.dataset.reportType;
        if (reportType) {
            this.showReport(reportType);
        }
    }
    
    applyFilterAndRender() {
        this.showReport(this.currentReport);
    }
}