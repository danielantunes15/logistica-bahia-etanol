// js/views/relatorios.js
import { fetchAllData } from '../api.js';
import { showToast, showLoading, hideLoading, formatDateTime, calculateDowntimeDuration } from '../helpers.js';
import { dataCache } from '../dataCache.js';
import { CAMINHAO_STATUS_LABELS, EQUIPAMENTO_STATUS_LABELS } from '../constants.js'; // Importa LABELS

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
        this.currentReport = 'charts'; // NOVO: Estado para gerenciar a view interna
        this.caminhaoStatusLabels = CAMINHAO_STATUS_LABELS; // NOVO
        this.equipamentoStatusLabels = EQUIPAMENTO_STATUS_LABELS; // NOVO
    }

    async show() {
        await this.loadHTML();
        await this.loadInitialData();
        // Ação inicial: mostrar gráficos
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
        // Usaremos o getHTML abaixo
        container.innerHTML = this.getHTML(); 
        this.container = container.querySelector('#relatorios-view');
    }
    
    // ESTRUTURA HTML COM DESIGN MODERNO E MENU INTERNO
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
    
    // NOVO: Renderiza o menu interno
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
            // Usa fetchAllData pois os relatórios de tabela precisam do histórico
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
        
        // Combina caminhões e equipamentos para o filtro de recursos
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

        // Define o período padrão de 7 dias
        const dateEnd = new Date();
        const dateStart = new Date();
        dateStart.setDate(dateEnd.getDate() - 7); 

        const formatDate = (date) => date.toISOString().split('T')[0];

        document.getElementById('filter-data-fim').value = formatDate(dateEnd);
        document.getElementById('filter-data-inicio').value = formatDate(dateStart);
    }

    // NOVO: Método principal para renderizar o relatório selecionado
    async showReport(reportName) {
        this.currentReport = reportName;
        // Atualiza a classe ativa do menu
        this.container.querySelectorAll('.internal-menu-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.reportType === reportName) {
                btn.classList.add('active');
            }
        });
        
        // Oculta/Exibe filtros conforme necessário
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
    
    // NOVO: Renderiza Tabela de Paradas de Caminhão
    async renderDowntimeCaminhaoTable() {
        showLoading();
        const container = document.getElementById('report-content-container');
        
        try {
            const filters = this.getFilterValues();
            const caminhãoMap = new Map((this.data.caminhoes || []).map(c => [c.id, c]));
            
            // 1. Filtragem da História de Caminhões
            const filteredHistory = this.filterHistory(
                this.data.caminhao_historico, caminhãoMap, filters.dataInicio, filters.dataFim, 
                filters.equipamento, filters.frente, filters.proprietario, 'caminhao_id'
            );
            
            // 2. Geração das Sessões de Inatividade
            const sessions = this.groupDowntimeSessions(filteredHistory, caminhãoMap, 'caminhao_id', ['parado', 'quebrado'], this.data.frentes_servico);
            
            // 3. Renderização
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

    // NOVO: Renderiza Tabela de Paradas de Equipamentos
    async renderDowntimeEquipamentoTable() {
        showLoading();
        const container = document.getElementById('report-content-container');
        
        try {
            const filters = this.getFilterValues();
            const equipamentoMap = new Map((this.data.equipamentos || []).map(e => [e.id, e]));
            
            // 1. Filtragem da História de Equipamentos
            const filteredHistory = this.filterHistory(
                this.data.equipamento_historico, equipamentoMap, filters.dataInicio, filters.dataFim, 
                filters.equipamento, filters.frente, filters.proprietario, 'equipamento_id'
            );
            
            // 2. Geração das Sessões de Inatividade
            const sessions = this.groupDowntimeSessions(filteredHistory, equipamentoMap, 'equipamento_id', ['parado', 'quebrado'], this.data.frentes_servico);
            
            // 3. Renderização
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
    
    // NOVO: Função genérica para agrupar logs em sessões de inatividade
    groupDowntimeSessions(history, itemMap, idColumn, downtimeStatuses, frentesServico) {
        const sortedLogs = history.sort((a, b) => new Date(a.timestamp_mudanca) - new Date(b.timestamp_mudanca));
        const downtimeSessions = [];
        const activeSessions = new Map(); 
        const frentesMap = new Map(frentesServico.map(f => [f.id, f.nome]));

        for (const log of sortedLogs) {
            const itemId = log[idColumn];
            // Uma sessão de inatividade começa se o status for de inatividade E o anterior não for
            const isDowntimeStart = downtimeStatuses.includes(log.status_novo) && !downtimeStatuses.includes(log.status_anterior);
            // Uma sessão é uma mudança entre status de inatividade (ex: parado -> quebrado)
            const isStatusChangeDowntime = downtimeStatuses.includes(log.status_novo) && downtimeStatuses.includes(log.status_anterior);
            // Uma sessão termina se o status novo NÃO for de inatividade E o anterior FOI
            const isDowntimeEnd = !downtimeStatuses.includes(log.status_novo) && downtimeStatuses.includes(log.status_anterior);

            const itemDetails = itemMap.get(itemId);
            if (!itemDetails) continue; // Ignora logs de itens que não existem mais

            if (isDowntimeStart) {
                // Início de uma nova parada
                activeSessions.set(itemId, {
                    startLog: log,
                    startTime: new Date(log.timestamp_mudanca),
                    startStatus: log.status_novo,
                    frenteId: itemDetails.frente_id // Frente associada no momento do início
                });
            } else if (isDowntimeEnd) {
                const session = activeSessions.get(itemId);
                if (session) {
                    // Fim da parada
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
                // Atualização de status/motivo durante a parada
                const session = activeSessions.get(itemId);
                if (session) {
                    // Atualiza o status e o motivo mais recente
                    session.startStatus = log.status_novo; 
                    session.startLog.motivo_parada = log.motivo_parada || session.startLog.motivo_parada;
                }
            }
        }
        
        // Adiciona sessões que ainda estão abertas
        for (const [id, session] of activeSessions.entries()) {
            const itemDetails = itemMap.get(id);
            downtimeSessions.push({
                cod_equipamento: itemDetails.cod_equipamento,
                tipo: itemDetails.finalidade || 'Caminhão',
                frente: frentesMap.get(session.frenteId) || 'N/A',
                start_time: session.startTime,
                end_time: null, // Em aberto
                start_status: session.startStatus,
                end_status: session.startStatus, 
                motivo: session.startLog.motivo_parada || 'Não informado',
            });
        }
        
        downtimeSessions.sort((a, b) => b.start_time - a.start_time);
        return downtimeSessions;
    }
    
    // NOVO: Gerador de HTML de Tabela de Parada
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
                // Se a sessão terminou, o status final é o status de retorno (ex: 'disponivel', 'ativo')
                endStatusLabel = `<span class="caminhao-status-badge status-${session.end_status}" style="background-color: var(--accent-primary);">${statusLabels[session.end_status] || session.end_status}</span>`;
            } else {
                // Se estiver em aberto, mantém o status atual (parado/quebrado) com destaque
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

    // Método para obter valores dos filtros
    getFilterValues() {
        return {
            equipamento: document.getElementById('filter-equipamento')?.value,
            frente: document.getElementById('filter-frente')?.value,
            proprietario: document.getElementById('filter-proprietario')?.value,
            dataInicio: document.getElementById('filter-data-inicio')?.value,
            dataFim: document.getElementById('filter-data-fim')?.value
        };
    }
    
    // Método principal para renderizar todos os gráficos
    async renderReports() {
        showLoading(); 
        const container = document.getElementById('report-content-container');
        container.innerHTML = `
            <div class="charts-grid">
                <div class="chart-container">
                    <h3>Horas Trabalhadas vs. Paradas (Por Equipamento)</h3>
                    <div class="chart-wrapper">
                        <canvas id="workHoursChart"></canvas>
                    </div>
                </div>

                <div class="chart-container">
                    <h3>Horas de Inatividade por Tipo de Equipamento</h3>
                    <div class="chart-wrapper">
                        <canvas id="downtimeHoursChart"></canvas>
                    </div>
                </div>
                
                <div class="chart-container">
                    <h3>Taxa de Utilização por Equipamento (%)</h3>
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
            let filteredDowntimeHistory = this.filterHistory(
                this.data.equipamento_historico, equipamentosMap, filters.dataInicio, filters.dataFim, 
                filters.equipamento, filters.frente, filters.proprietario, 'equipamento_id'
            );

            // 2. CÁLCULO DE HORAS (GRÁFICO 1: INDIVIDUAL)
            const workHoursCaminhoes = this.calculateWorkHours(filteredWorkHistory, this.data.caminhoes, 'caminhao_id');
            const workHoursEquipamentos = this.calculateWorkHours(filteredDowntimeHistory, this.data.equipamentos, 'equipamento_id');
            const allWorkHours = [...workHoursCaminhoes, ...workHoursEquipamentos];

            const downtimeHoursIndividual = this.calculateDowntimeHours(filteredDowntimeHistory, this.data.equipamentos);
            
            // 3. PREPARAÇÃO DO GRÁFICO COMPARATIVO
            const comparisonData = this.prepareComparisonData(allWorkHours, downtimeHoursIndividual);
            
            const workChartLabels = comparisonData.labels;
            const workChartDatasets = [
                {
                    label: 'Horas Trabalhadas (H)',
                    data: comparisonData.workData,
                    backgroundColor: 'rgba(56, 161, 105, 0.8)', // Verde
                    borderColor: 'rgba(56, 161, 105, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Horas Paradas (H)',
                    data: comparisonData.downtimeData,
                    backgroundColor: 'rgba(197, 48, 48, 0.8)', // Vermelho (Danger)
                    borderColor: 'rgba(197, 48, 48, 1)',
                    borderWidth: 1
                }
            ];

            this.drawComparisonChart('workHoursChart', workChartLabels, workChartDatasets, 'bar');


            // 4. CÁLCULO DE HORAS (GRÁFICO 2: POR TIPO)
            const downtimeHoursByType = this.calculateDowntimeHoursByType(filteredDowntimeHistory, this.data.equipamentos);
            const downtimeLabels = downtimeHoursByType.map(item => item.cod_equipamento);
            const downtimeData = downtimeHoursByType.map(item => item.totalHours);
            this.drawChart('downtimeHoursChart', downtimeLabels, downtimeData, 'bar', 'Total de Horas de Inatividade (H)', 'rgba(197, 48, 48, 0.6)');

            // 5. CÁLCULO DE HORAS (GRÁFICO 3: TAXA DE UTILIZAÇÃO)
            const utilizationData = this.calculateUtilizationRate(comparisonData);
            this.drawUtilizationChart('utilizationChart', utilizationData.labels, utilizationData.data);
            
            // 6. ARMAZENAR DADOS PARA EXPORTAÇÃO
            this.exportData = {
                comparisonData: comparisonData,
                downtimeByType: downtimeHoursByType,
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

    // Lógica de filtragem unificada (MANTIDA)
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

    // Calcula Horas Trabalhadas por CÓDIGO de Equipamento (MANTIDA)
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

    // Calcula Horas de Inatividade por CÓDIGO de Equipamento (MANTIDA)
    calculateDowntimeHours(history, equipamentos) {
        const itemMap = new Map(equipamentos.map(i => [i.id, i]));
        const nonProductiveStatus = ['parado', 'quebrado'];
        
        const itemDowntimeLogs = {};
        
        history.forEach(log => {
            const id = log.equipamento_id;
            const item = itemMap.get(id);
            if (!id || !item) return;
            
            if (!itemDowntimeLogs[id]) {
                itemDowntimeLogs[id] = { 
                    cod_equipamento: item.cod_equipamento,
                    sessions: [] 
                };
            }
            
            itemDowntimeLogs[id].sessions.push({ 
                status: log.status_novo, 
                time: new Date(log.timestamp_mudanca) 
            });
        });

        const results = [];

        for (const id in itemDowntimeLogs) {
            let totalMillis = 0;
            const { sessions, cod_equipamento } = itemDowntimeLogs[id];
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
        
        return results;
    }

    // Função para mesclar os dados de Horas Trabalhadas e Paradas (MANTIDA)
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
    
    // Calcula Taxa de Utilização com base nos dados de comparação (MANTIDA)
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

    // Função para renderizar o Gráfico de Utilização (MANTIDA)
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

    // Função para o Gráfico de Comparação (Multi-Dataset) (MANTIDA)
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

    // LÓGICA ANTIGA (MANTIDA PARA O GRÁFICO 2: AGRUPAMENTO POR TIPO)
    calculateDowntimeHoursByType(history, equipamentos) {
        const itemMap = new Map(equipamentos.map(i => [i.id, i]));
        const nonProductiveStatus = ['parado', 'quebrado'];
        
        const itemDowntimeLogs = {};
        
        history.forEach(log => {
            const id = log.equipamento_id;
            const item = itemMap.get(id);
            if (!id || !item) return;
            
            if (!itemDowntimeLogs[id]) {
                itemDowntimeLogs[id] = { 
                    groupKey: item.finalidade,
                    sessions: [] 
                };
            }
            
            itemDowntimeLogs[id].sessions.push({ 
                status: log.status_novo, 
                time: new Date(log.timestamp_mudanca) 
            });
        });

        const groupedResults = {};

        for (const id in itemDowntimeLogs) {
            let totalMillis = 0;
            const { sessions, groupKey } = itemDowntimeLogs[id];
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
            
            if (!groupedResults[groupKey]) {
                groupedResults[groupKey] = 0;
            }
            groupedResults[groupKey] += totalMillis;
        }

        const finalResults = Object.keys(groupedResults).map(groupKey => ({
            cod_equipamento: groupKey, 
            totalHours: (groupedResults[groupKey] / (1000 * 60 * 60)).toFixed(2)
        }));
        
        return finalResults;
    }
    
    // Função para renderizar gráficos simples (usada no Gráfico 2)
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
        
        if (canvasId === 'downtimeHoursChart') this.downtimeHoursChart = newChart;
    }

    // FUNÇÃO DE EXPORTAÇÃO DE RELATÓRIO PDF (MANTIDA)
    async exportToPDF() {
        if (!this.container) return;
        
        // Lazy Load das bibliotecas de exportação
        if (!html2canvas || !jspdf) {
            showToast('Carregando bibliotecas de exportação...', 'info');
            try {
                // Carrega html2canvas globalmente
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://html2canvas.hertzen.com/dist/html2canvas.min.js';
                    script.onload = () => { html2canvas = window.html2canvas; resolve(); };
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
                
                // Carrega jspdf globalmente
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
            
            // Título e Contexto
            doc.setFontSize(22);
            doc.setTextColor(56, 161, 105); // Cor primária (RGB de #38A169)
            doc.text("Relatório Gerencial de Operações", margin, y);
            y += 10;
            
            doc.setFontSize(10);
            doc.setTextColor(160, 174, 192); // Cor secundária (RGB de #A0AEC0)
            doc.text(`Período: ${this.exportData.filterContext.periodo}`, margin, y);
            y += 5;
            doc.text(`Filtros: Equipamento=${this.exportData.filterContext.equipamento} | Frente=${this.exportData.filterContext.frente} | Proprietário=${this.exportData.filterContext.proprietario}`, margin, y);
            y += 10;
            
            const chartContainers = this.container.querySelectorAll('.chart-container');
            
            for (const container of chartContainers) {
                const canvas = container.querySelector('canvas');
                if (!canvas) continue;

                const chartTitle = container.querySelector('h3')?.textContent || 'Gráfico';
                
                // 1. Capturar imagem do gráfico
                const canvasImage = await html2canvas(canvas, {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#1A202C' // Usando bg-dark para PDF
                });
                
                const imgData = canvasImage.toDataURL('image/png');
                const imgWidth = 180; // Largura em mm
                const imgHeight = canvasImage.height * imgWidth / canvasImage.width / canvasImage.scale;
                
                // 2. Verificar quebra de página
                if (y + imgHeight + 10 > doc.internal.pageSize.height) {
                    doc.addPage();
                    y = margin;
                }
                
                // 3. Adicionar título do gráfico e imagem
                doc.setFontSize(14);
                doc.setTextColor(247, 250, 252); // Cor primária (RGB de #F7FAFC)
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

    // FUNÇÃO DE EXPORTAÇÃO DE RELATÓRIO EXCEL/CSV (MANTIDA)
    exportToExcel() {
        if (!this.exportData || !this.exportData.comparisonData) {
            showToast('Erro: Dados para exportação não disponíveis. Filtre o relatório primeiro.', 'error');
            return;
        }

        try {
            const data = this.exportData;
            const labels = data.comparisonData.labels;
            
            let csvContent = "";
            
            // Informações de Contexto
            csvContent += `Relatorio Gerencial de Operacoes\r\n`;
            csvContent += `Periodo: ${data.filterContext.periodo}\r\n`;
            csvContent += `Filtros: Equipamento=${data.filterContext.equipamento}, Frente=${data.filterContext.frente}, Proprietario=${data.filterContext.proprietario}\r\n\r\n`;

            // Tabela 1: Comparativo Individual (Horas Trabalhadas vs Paradas)
            csvContent += `--- Comparativo Individual (Horas) ---\r\n`;
            let header1 = "Equipamento/Caminhao;Horas Trabalhadas;Horas Paradas;Total Horas;Taxa de Utilizacao (%)\r\n";
            csvContent += header1;

            labels.forEach((label, index) => {
                const work = data.comparisonData.workData[index];
                const downtime = data.comparisonData.downtimeData[index];
                const utilization = data.utilizationData.data[index];
                const total = work + downtime;
                
                // Usando ponto para decimal e ponto-e-vírgula para separador CSV
                csvContent += `${label};${work.toFixed(2).replace('.', ',')};${downtime.toFixed(2).replace('.', ',')};${total.toFixed(2).replace('.', ',')};${utilization.toFixed(1).replace('.', ',')}\r\n`;
            });

            // Tabela 2: Inatividade por Tipo de Equipamento
            csvContent += `\r\n--- Inatividade por Tipo de Equipamento (Horas) ---\r\n`;
            let header2 = "Tipo de Equipamento;Horas Inativas\r\n";
            csvContent += header2;

            data.downtimeByType.forEach(item => {
                csvContent += `${item.cod_equipamento};${item.totalHours.replace('.', ',')}\r\n`;
            });

            // Cria e baixa o arquivo CSV
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
        // Listener do botão de Filtro (aplica filtro ao relatório atual)
        const filterBtn = document.getElementById('apply-report-filters');
        if (filterBtn) {
            filterBtn.removeEventListener('click', this.applyFilterAndRender.bind(this));
            filterBtn.addEventListener('click', this.applyFilterAndRender.bind(this));
        }
        
        // Listener do menu interno
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
    
    // NOVO: Handler para o menu interno
    handleInternalMenuClick(e) {
        const reportType = e.target.dataset.reportType;
        if (reportType) {
            this.showReport(reportType);
        }
    }
    
    // NOVO: Aplica o filtro no relatório atual
    applyFilterAndRender() {
        this.showReport(this.currentReport);
    }
}