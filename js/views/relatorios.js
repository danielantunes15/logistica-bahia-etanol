// js/views/relatorios.js

import { fetchAllData } from '../api.js';
// CORREÇÃO: Importa tudo relacionado a tempo/duração/cálculo de ciclo de timeUtils.js
import { showToast, showLoading, hideLoading } from '../helpers.js';
import { formatDateTime, calculateDowntimeDuration, formatMillisecondsToHoursMinutes, groupDowntimeSessions, calculateCycleDuration, getBrtIsoString } from '../timeUtils.js';
import { dataCache } from '../dataCache.js';
// NOVO: Importa CAMINHAO_STATUS_CYCLE
import { CAMINHAO_STATUS_LABELS, EQUIPAMENTO_STATUS_LABELS, CAMINHAO_STATUS_CYCLE } from '../constants.js';

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
        this.resolutionChart = null; // NOVO: Gráfico de resolução de ocorrências
        this.exportData = {}; 
        this.currentReport = 'charts'; 
        this.caminhaoStatusLabels = CAMINHAO_STATUS_LABELS; 
        this.equipamentoStatusLabels = EQUIPAMENTO_STATUS_LABELS; 
        // NOVO: Adiciona a constante de ciclo
        this.cycleStatus = CAMINHAO_STATUS_CYCLE;
    }
    
    // NOVO: Função auxiliar para formatar horas decimais para H:MM
    convertHoursToHM(decimalHours) {
        if (decimalHours === 0) return '0h';
        const totalMinutes = Math.round(decimalHours * 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        
        let result = '';
        if (hours > 0) {
            result += `${hours}h`;
        }
        if (minutes > 0) {
            // Garante dois dígitos para minutos
            result += `${minutes.toString().padStart(2, '0')}m`;
        }
        
        // Se a duração for muito pequena (ex: 1m), apenas retorna isso.
        if (result === '') return '<1m';
        
        return result.replace(/m$/, ''); // Remove o 'm' do final para ficar H:MM
    }
    
    // NOVO: Função para obter datas com base no range rápido
    getDateRange(rangeType) {
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        let startDate;

        switch (rangeType) {
            case '7d':
                startDate = new Date(today);
                startDate.setDate(today.getDate() - 7);
                break;
            case '30d':
                startDate = new Date(today);
                startDate.setDate(today.getDate() - 30);
                break;
            case 'currentMonth':
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                break;
            case 'lastMonth':
                startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                let endDate = new Date(today.getFullYear(), today.getMonth(), 0);
                endDate.setHours(23, 59, 59, 999);
                return { 
                    startDate: startDate.toISOString().split('T')[0], 
                    endDate: endDate.toISOString().split('T')[0] 
                };
            default:
                return { startDate: null, endDate: null };
        }
        
        startDate.setHours(0, 0, 0, 0); // Start of the day
        return { 
            startDate: startDate.toISOString().split('T')[0], 
            endDate: today.toISOString().split('T')[0] 
        };
    }

    async show() {
        // Pré-carregar libs de PDF para melhorar UX (Início)
        this.loadPdfLibs(); 
        await this.loadHTML();
        await this.loadInitialData();
        await this.showReport('charts'); 
        this.addEventListeners();
    }

    async hide() {
        if (this.workHoursChart) this.workHoursChart.destroy();
        if (this.downtimeHoursChart) this.downtimeHoursChart.destroy();
        if (this.utilizationChart) this.utilizationChart.destroy();
        if (this.resolutionChart) this.resolutionChart.destroy(); // NOVO: Destruir gráfico de resolução
    }
    
    // NOVO: Função para pré-carregar libs de PDF
    async loadPdfLibs() {
        if (!html2canvas) {
            await new Promise(resolve => {
                const script = document.createElement('script');
                script.src = 'https://html2canvas.hertzen.com/dist/html2canvas.min.js';
                script.onload = () => { html2canvas = window.html2canvas; resolve(); };
                document.head.appendChild(script);
            });
        }
        if (!jspdf) {
            await new Promise(resolve => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                script.onload = () => { jspdf = window.jspdf; resolve(); };
                document.head.appendChild(script);
            });
        }
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
                    <div class="filter-group date-range-selectors" style="display: flex; gap: 8px; align-items: center; background-color: var(--bg-light); border: 1px solid var(--border-color); padding: 12px; border-radius: 8px;">
                        <label style="font-weight: 600; color: var(--accent-primary);">Período Rápido:</label>
                        <button class="btn-secondary btn-quick-range" data-range="7d">7 Dias</button>
                        <button class="btn-secondary btn-quick-range" data-range="30d">30 Dias</button>
                        <button class="btn-secondary btn-quick-range" data-range="currentMonth">Mês Atual</button>
                        <button class="btn-secondary btn-quick-range" data-range="lastMonth">Mês Passado</button>
                    </div>

                    <div class="filter-group" id="filter-date-group" style="display: flex; gap: 12px; align-items: center; background-color: var(--bg-light); border: 1px solid var(--border-color); padding: 12px; border-radius: 8px;">
                        <label style="font-weight: 600; color: var(--accent-primary);">Período Manual:</label>
                        <label for="filter-data-inicio" style="color: var(--text-secondary); font-size: 0.9rem;">De:</label>
                        <input type="date" id="filter-data-inicio" class="form-input" style="width: 150px;">
                        <label for="filter-data-fim" style="color: var(--text-secondary); font-size: 0.9rem;">Até:</label>
                        <input type="date" id="filter-data-fim" class="form-input" style="width: 150px;">
                    </div>
                    
                    <div class="filter-group" id="filter-resource-group" style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; background-color: var(--bg-light); border: 1px solid var(--border-color); padding: 12px; border-radius: 8px; flex-grow: 1;">
                        <label style="font-weight: 600; color: var(--accent-primary);">Recursos:</label>
                        <select id="filter-equipamento" class="form-select" style="min-width: 200px;">
                            <option value="">Todos os Recursos</option>
                        </select>
                        <select id="filter-frente" class="form-select">
                            <option value="">Frente (Todas)</option>
                        </select>
                        <select id="filter-proprietario" class="form-select">
                            <option value="">Proprietário (Todos)</option>
                        </select>
                        
                        <input type="text" id="filter-motivo-parada" class="form-input" placeholder="Motivo (busca parcial)" style="min-width: 200px; display: none;">

                        <select id="filter-downtime-status" class="form-select" style="min-width: 150px; display: none;">
                            <option value="">Status Parada (Todos)</option>
                            <option value="parado">Parado (Obs.)</option>
                            <option value="quebrado">Quebrado</option>
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
            { name: 'Relatório de Paradas (Equipamentos)', id: 'downtime-equipamento' },
            { name: 'Tempo de Ciclo (Caminhões)', id: 'time-cycle' },
            { name: 'Movimentação de Frota', id: 'movimentacao-frota' },
            { name: 'Relatório de Ocorrências', id: 'ocorrencias' }
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

        // --- MELHORIA: Remove o filtro de data padrão de 7 dias para refletir o limite de 90 dias da API ---
        const dateEndInput = document.getElementById('filter-data-fim');
        const dateStartInput = document.getElementById('filter-data-inicio');
        if(dateEndInput) dateEndInput.value = '';
        if(dateStartInput) dateStartInput.value = '';
        // --- FIM MELHORIA ---
    }
    
    /**
     * @MODIFICADO
     * Busca dados da API, pulando o cache se houver filtros de data para garantir 
     * que a API ignore o limite de 90 dias e traga o período solicitado.
     */
    async fetchReportDataWithFilters(filters) {
        const isDateFilterActive = filters.dataInicio || filters.dataFim;
        
        if (isDateFilterActive) {
            let startDateISO = null;
            let endDateISO = null;
            
            // Tratamento de Data Início: 00:00:00 do dia
            if (filters.dataInicio) {
                 const date = new Date(filters.dataInicio);
                 date.setHours(0, 0, 0, 0); 
                 startDateISO = date.toISOString();
            }
            
            // Tratamento de Data Fim: 23:59:59 do dia
            if (filters.dataFim) {
                 const date = new Date(filters.dataFim);
                 date.setHours(23, 59, 59, 999);
                 endDateISO = date.toISOString();
            }

            // Chama a API com as datas explícitas e daysBack=null para não aplicar o filtro padrão.
            const reportData = await fetchAllData(null, startDateISO, endDateISO); 
            return reportData;
        } else {
             // Se nenhum filtro de data for ativo, usa o cache (que usa o padrão de 90 dias).
            return dataCache.fetchAllData();
        }
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
        const downtimeStatusFilter = document.getElementById('filter-downtime-status');
        const motivoParadaFilter = document.getElementById('filter-motivo-parada');
        
        if (filters) {
            // Esconde filtros apenas para o relatório de ocorrências
            filters.style.display = (reportName === 'ocorrencias') ? 'none' : 'flex';
        }
        
        const isDowntimeReport = reportName.startsWith('downtime');
        if (downtimeStatusFilter) {
            downtimeStatusFilter.style.display = isDowntimeReport ? 'flex' : 'none';
        }
        if (motivoParadaFilter) {
             motivoParadaFilter.style.display = isDowntimeReport ? 'flex' : 'none';
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
            case 'time-cycle':
                await this.renderTimeCycleReport();
                break;
            case 'movimentacao-frota':
                await this.renderMovimentacaoFrotaTable();
                break;
            case 'ocorrencias':
                await this.renderOcorrenciasReport();
                break;
            default:
                document.getElementById('report-content-container').innerHTML = `<div class="empty-state">Selecione um relatório.</div>`;
        }
    }

    async renderMovimentacaoFrotaTable() {
        showLoading();
        const container = document.getElementById('report-content-container');
        try {
            const filters = this.getFilterValues();
            
            // AQUI: Busca dados com os filtros, pulando o cache se houver filtro de data.
            const currentData = await this.fetchReportDataWithFilters(filters); 
            
            const caminhãoMap = new Map((currentData.caminhoes || []).map(c => [c.id, c]));
    
            // Primeiro, obtenha todo o histórico que corresponde aos filtros
            // Data é nula, pois já foi aplicada na API
            let filteredHistory = this.filterHistory(
                currentData.caminhao_historico, caminhãoMap, null, null,
                filters.equipamento, filters.frente, filters.proprietario, 'caminhao_id'
            );
            
            // Verifique se algum filtro relevante está ativo
            const isAnyFilterActive = filters.dataInicio || filters.dataFim || filters.equipamento || filters.frente || filters.proprietario;
    
            // Se nenhum filtro estiver ativo, pegue apenas os 10 mais recentes
            let displayHistory = filteredHistory;
            if (!isAnyFilterActive) {
                displayHistory = filteredHistory.slice(0, 10);
            }
    
            const rows = displayHistory.map(log => `
                <tr>
                    <td>${formatDateTime(log.timestamp_mudanca)}</td>
                    <td>${log.caminhoes?.cod_equipamento || 'N/A'}</td>
                    <td><span class="caminhao-status-badge status-${log.status_anterior}">${this.caminhaoStatusLabels[log.status_anterior] || log.status_anterior}</span></td>
                    <td><span class="caminhao-status-badge status-${log.status_novo}">${this.caminhaoStatusLabels[log.status_novo] || log.status_novo}</span></td>
                </tr>
            `).join('');
    
            // Mensagem de contagem dinâmica
            const recordCountMessage = isAnyFilterActive ? `${filteredHistory.length} Registros Encontrados` : `Últimos ${displayHistory.length} Registros`;
    
            const tableHTML = `
                <div class="report-table-container">
                     <h3 style="padding: 0 24px; margin-bottom: 16px;">Histórico de Movimentação da Frota (${recordCountMessage})</h3>
                    <div style="padding: 0 24px; overflow-x: auto;">
                        <table class="data-table-modern">
                            <thead>
                                <tr>
                                    <th>Horário</th>
                                    <th>Caminhão</th>
                                    <th>Status Anterior</th>
                                    <th>Status Novo</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows.length > 0 ? rows : '<tr><td colspan="4">Nenhum registro de movimentação encontrado para os filtros selecionados.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            container.innerHTML = tableHTML;
    
        } catch (error) {
            container.innerHTML = `<div class="empty-state">Erro ao gerar relatório de movimentação: ${error.message}</div>`;
            console.error("Erro em renderMovimentacaoFrotaTable:", error);
        } finally {
            hideLoading();
        }
    }
    
    // NOVO: Renderiza Relatório de Ocorrências
    async renderOcorrenciasReport() {
        showLoading();
        const container = document.getElementById('report-content-container');
        
        try {
            const filters = this.getFilterValues();
            
            // AQUI: Busca dados com os filtros, pulando o cache se houver filtro de data.
            const currentData = await this.fetchReportDataWithFilters(filters); 

            const { ocorrencias = [], frentes_servico = [] } = currentData;
            
            // 1. Filtrar ocorrências por período (apenas o que tem hora_inicio)
            let filteredOcorrencias = ocorrencias.filter(o => o.hora_inicio);
            if (filters.dataInicio) {
                const startDate = new Date(filters.dataInicio).getTime();
                filteredOcorrencias = filteredOcorrencias.filter(o => new Date(o.hora_inicio).getTime() >= startDate);
            }
            if (filters.dataFim) {
                const endDate = new Date(filters.dataFim);
                endDate.setDate(endDate.getDate() + 1); // Inclui o dia final
                const endDateTimestamp = endDate.getTime();
                filteredOcorrencias = filteredOcorrencias.filter(o => new Date(o.hora_inicio).getTime() < endDateTimestamp);
            }
            
            // 2. Calcula as médias de resolução por tipo
            const resolutionAverages = this.calculateResolutionAverages(filteredOcorrencias);
            
            // 3. Renderiza o HTML com gráfico e tabela
            let reportHTML = this.generateOcorrenciasHTML(filteredOcorrencias, resolutionAverages);
            container.innerHTML = reportHTML;
            
            // 4. Desenha o gráfico (se houver dados de resolução)
            if (Object.keys(resolutionAverages).length > 0) {
                 this.drawResolutionChart(resolutionAverages);
            }

            // 5. Armazenar dados para exportação (opcional, pode ser simplificado)
            this.exportData = {
                ocorrencias: filteredOcorrencias,
                resolutionAverages: resolutionAverages,
                filterContext: filters 
            };

        } catch (error) {
            container.innerHTML = `<div class="empty-state">Erro ao gerar relatório de ocorrências: ${error.message}</div>`;
            console.error("Erro em renderOcorrenciasReport:", error);
        } finally {
            hideLoading();
        }
    }
    
    // NOVO: Calcula Tempo Médio de Resolução
    calculateResolutionAverages(ocorrencias) {
        const stats = {};

        ocorrencias.filter(o => o.status === 'resolvido' && o.hora_fim).forEach(o => {
            const type = o.tipo;
            const duration = new Date(o.hora_fim).getTime() - new Date(o.hora_inicio).getTime();

            if (duration > 0) {
                if (!stats[type]) {
                    stats[type] = { totalDuration: 0, count: 0 };
                }
                stats[type].totalDuration += duration;
                stats[type].count++;
            }
        });

        const averages = {};
        for (const type in stats) {
            const { totalDuration, count } = stats[type];
            averages[this.formatOption(type)] = {
                count: count,
                averageDurationMillis: count > 0 ? totalDuration / count : 0
            };
        }
        return averages;
    }

    // NOVO: Gerador de HTML de Tabela e Gráfico de Ocorrências
    generateOcorrenciasHTML(ocorrencias, averages) {
        // Mapeamento de frentes para display
        const frenteMap = new Map(this.data.frentes_servico.map(f => [f.id, f.nome]));
        
        if (ocorrencias.length === 0) {
            return `<div class="empty-state" style="padding: 50px;">
                        <i class="ph-fill ph-warning" style="font-size: 3rem;"></i>
                        <p>Nenhuma ocorrência encontrada para o período selecionado.</p>
                    </div>`;
        }
        
        const rows = ocorrencias.map(item => {
            const isFinished = item.status === 'resolvido';
            const startTime = item.hora_inicio || item.created_at; 
            const duration = calculateDowntimeDuration(startTime, item.hora_fim);
            
            const statusClass = isFinished ? 'disponivel' : 'danger';
            const statusLabel = isFinished ? 'Resolvido' : 'Em Aberto';
            const horaFimDisplay = isFinished ? formatDateTime(item.hora_fim) : '---';
            const durationDisplay = isFinished ? duration : `<strong style="color: var(--accent-danger);">${duration}</strong>`;

            
            const frentesNomes = (item.frentes_impactadas || [])
                                    .map(fId => frenteMap.get(fId))
                                    .filter(name => name)
                                    .join(', ');
            const frentesDisplay = frentesNomes || 'Nenhuma';
            
            return `
                <tr>
                    <td>${this.formatOption(item.tipo)}</td>
                    <td>${item.descricao}</td>
                    <td>${frentesDisplay}</td>
                    <td>${formatDateTime(startTime)}</td>
                    <td>${horaFimDisplay}</td>
                    <td>${durationDisplay}</td>
                    <td><span class="caminhao-status-badge status-${statusClass}">${statusLabel}</span></td>
                </tr>
            `;
        }).join('');
        
        const averageRows = Object.entries(averages).map(([type, data]) => {
            const avgFormatted = formatMillisecondsToHoursMinutes(data.averageDurationMillis);
            return `
                <tr>
                    <td><strong>${type}</strong></td>
                    <td>${data.count}</td>
                    <td><strong style="font-size: 1.0rem; color: var(--accent-primary);">${avgFormatted}</strong></td>
                </tr>
            `;
        }).join('');


        return `
            <div class="charts-grid" style="grid-template-columns: 1fr;">
                 <div class="chart-container">
                    <h3>Tempo Médio de Resolução (Ocorrências Resolvidas)</h3>
                    <div class="chart-wrapper" style="height: 350px;">
                        <canvas id="resolutionChart"></canvas>
                    </div>
                </div>
            </div>
            
            <div class="report-table-container">
                <h3 style="padding: 0 24px; margin-bottom: 16px;">Métricas de Resolução por Tipo</h3>
                <div style="padding: 0 24px 24px; overflow-x: auto;">
                    <table class="data-table-modern" style="width: 600px;">
                        <thead>
                            <tr>
                                <th>Tipo de Ocorrência</th>
                                <th>Qtd. Resolvida</th>
                                <th>Tempo Médio de Resolução</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${averageRows.length > 0 ? averageRows : '<tr><td colspan="3">Nenhuma ocorrência resolvida no período.</td></tr>'}
                        </tbody>
                    </table>
                </div>

                <h3 style="padding: 0 24px; margin-bottom: 16px;">Detalhe das Ocorrências (${ocorrencias.length} Registros)</h3>
                <div style="padding: 0 24px; overflow-x: auto;">
                    <table class="data-table-modern">
                        <thead>
                            <tr>
                                <th>Tipo</th>
                                <th>Descrição</th>
                                <th>Frentes Impactadas</th>
                                <th>Início</th>
                                <th>Fim</th>
                                <th>Duração</th>
                                <th>Status</th>
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

    // NOVO: Função para desenhar o gráfico de Tempo de Resolução
    drawResolutionChart(resolutionAverages) {
        const ctx = document.getElementById('resolutionChart');
        if (this.resolutionChart) this.resolutionChart.destroy();
        
        const labels = Object.keys(resolutionAverages);
        const dataMillis = labels.map(label => resolutionAverages[label].averageDurationMillis);

        // Converte milissegundos para horas (para o display do Chart.js)
        const dataHours = dataMillis.map(ms => parseFloat((ms / (1000 * 60 * 60)).toFixed(2)));

        this.resolutionChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Tempo Médio de Resolução (Horas)',
                    data: dataHours,
                    backgroundColor: 'rgba(237, 137, 54, 0.8)', // Laranja
                    borderColor: 'rgba(237, 137, 54, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                    y: { 
                        beginAtZero: true, 
                        title: { display: true, text: 'Tempo (H:MM)', color: '#A0AEC0' }, // NOVO: Título com H:MM
                        ticks: { 
                            color: '#A0AEC0',
                            callback: (value) => this.convertHoursToHM(value) // NOVO: Callback para formatar
                        }, 
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

    // NOVO: Função auxiliar de formatação
    formatOption(option) {
        if (!option || typeof option !== 'string') return 'N/A';
        return option.charAt(0).toUpperCase() + option.slice(1).replace('_', ' ');
    }
    // FIM NOVO


    // NOVO: Renderiza Relatório de Tempo de Ciclo
    async renderTimeCycleReport() {
        showLoading();
        const container = document.getElementById('report-content-container');
        
        try {
            const filters = this.getFilterValues();
            
            // AQUI: Busca dados com os filtros, pulando o cache se houver filtro de data.
            const currentData = await this.fetchReportDataWithFilters(filters); 
            
            const caminhãoMap = new Map((currentData.caminhoes || []).map(c => [c.id, c]));
            
            // 1. Filtra o histórico apenas por tempo e recursos
            // Data é nula, pois já foi aplicada na API
            const filteredHistory = this.filterHistory(
                currentData.caminhao_historico, caminhãoMap, null, null, 
                filters.equipamento, filters.frente, filters.proprietario, 'caminhao_id'
            );
            
            // 2. Calcula todas as sessões de ciclo
            const cycles = calculateCycleDuration(filteredHistory, this.cycleStatus);
            
            // 3. Calcula as médias e formata os dados
            const cycleAverages = this.calculateCycleAverages(cycles);

            let tableHTML = this.generateCycleTableHTML(
                cycles, 
                cycleAverages,
                'Relatório Detalhado de Tempo de Ciclo (Caminhões)'
            );
            
            container.innerHTML = tableHTML;
        } catch (error) {
            container.innerHTML = `<div class="empty-state">Erro ao gerar relatório de tempo de ciclo: ${error.message}</div>`;
        } finally {
            hideLoading();
        }
    }

    async renderDowntimeCaminhaoTable() {
        showLoading();
        const container = document.getElementById('report-content-container');
        
        try {
            const filters = this.getFilterValues();
            
            // AQUI: Busca dados com os filtros, pulando o cache se houver filtro de data.
            const currentData = await this.fetchReportDataWithFilters(filters); 
            
            // NOVO: Define os status de inatividade a serem filtrados
            const downtimeStatusFilter = filters.downtimeStatus ? [filters.downtimeStatus] : ['parado', 'quebrado'];
            const caminhãoMap = new Map((currentData.caminhoes || []).map(c => [c.id, c]));
            
            // Data é nula, pois já foi aplicada na API
            const filteredHistory = this.filterHistory(
                currentData.caminhao_historico, caminhãoMap, null, null, 
                filters.equipamento, filters.frente, filters.proprietario, 'caminhao_id'
            );
            
            let sessions = groupDowntimeSessions(filteredHistory, 'caminhao_id', downtimeStatusFilter);
            
            // NOVO: Filtra as sessões pelo Motivo da Parada
            if (filters.motivoParada && filters.motivoParada.length > 0) {
                const motiveSearch = filters.motivoParada.toLowerCase();
                sessions = sessions.filter(session => {
                    const motive = session.startLog.motivo_parada ? session.startLog.motivo_parada.toLowerCase() : '';
                    return motive.includes(motiveSearch);
                });
            }
            
            // Adiciona informações de recurso e frente (que não estão no log do caminhão)
            sessions.forEach(session => {
                const caminhao = caminhãoMap.get(session.startLog.caminhao_id);
                session.cod_equipamento = caminhao?.cod_equipamento || 'N/A';
                session.tipo = 'Caminhão';
                const frente = currentData.frentes_servico.find(f => f.id === caminhao?.frente_id);
                session.frente = frente?.nome || 'N/A';
            });
            
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
            
            // AQUI: Busca dados com os filtros, pulando o cache se houver filtro de data.
            const currentData = await this.fetchReportDataWithFilters(filters); 
            
            // NOVO: Define os status de inatividade a serem filtrados
            const downtimeStatusFilter = filters.downtimeStatus ? [filters.downtimeStatus] : ['parado', 'quebrado'];
            const equipamentoMap = new Map((currentData.equipamentos || []).map(e => [e.id, e]));
            
            // Data é nula, pois já foi aplicada na API
            const filteredHistory = this.filterHistory(
                currentData.equipamento_historico, equipamentoMap, null, null, 
                filters.equipamento, filters.frente, filters.proprietario, 'equipamento_id'
            );
            
            let sessions = groupDowntimeSessions(filteredHistory, 'equipamento_id', downtimeStatusFilter);
            
            // NOVO: Filtra as sessões pelo Motivo da Parada
            if (filters.motivoParada && filters.motivoParada.length > 0) {
                const motiveSearch = filters.motivoParada.toLowerCase();
                sessions = sessions.filter(session => {
                    const motive = session.startLog.motivo_parada ? session.startLog.motivo_parada.toLowerCase() : '';
                    return motive.includes(motiveSearch);
                });
            }
            
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
    
    // Método para obter valores dos filtros (ADICIONA downtimeStatus e motivoParada)
    getFilterValues() {
        return {
            equipamento: document.getElementById('filter-equipamento')?.value,
            frente: document.getElementById('filter-frente')?.value,
            proprietario: document.getElementById('filter-proprietario')?.value,
            dataInicio: document.getElementById('filter-data-inicio')?.value,
            dataFim: document.getElementById('filter-data-fim')?.value,
            downtimeStatus: document.getElementById('filter-downtime-status')?.value,
            motivoParada: document.getElementById('filter-motivo-parada')?.value.trim() // NOVO
        };
    }
    // FIM DA CORREÇÃO

    // NOVO: Gerador de HTML de Tabela de Parada com Resumo por Motivo
    generateDowntimeTableHTML(sessions, title, resourceLabel, statusLabels) {
        if (sessions.length === 0) {
            return `<div class="empty-state" style="padding: 50px;">
                        <i class="ph-fill ph-warning" style="font-size: 3rem;"></i>
                        <p>Nenhum registro de inatividade encontrado para os filtros e recursos selecionados.</p>
                    </div>`;
        }

        // 1. Agrupamento por Motivo para Causa Raiz
        const downtimeByMotive = sessions.reduce((acc, curr) => {
            const motive = curr.startLog.motivo_parada || 'Não Informado (Sessão Antiga)';
            if (!acc[motive]) {
                acc[motive] = { count: 0, totalMillis: 0 };
            }
            acc[motive].count++;
            
            const start = curr.startTime.getTime();
            const end = curr.end_time ? curr.end_time.getTime() : new Date(getBrtIsoString()).getTime();
            const diffMillis = end - start;
            if (diffMillis > 0) {
                acc[motive].totalMillis += diffMillis;
            }
            return acc;
        }, {});
        
        const motiveRows = Object.entries(downtimeByMotive).map(([motive, data]) => {
            // Usa a função importada
            const durationFormatted = formatMillisecondsToHoursMinutes(data.totalMillis); 
            return `
                <tr>
                    <td><strong>${motive}</strong></td>
                    <td>${data.count}</td>
                    <td><strong style="font-size: 1.0rem; color: var(--accent-danger);">${durationFormatted}</strong></td>
                </tr>
            `;
        }).join('');

        // 2. Calcular o total de inatividade e as linhas detalhadas
        let totalDowntimeMillis = 0;

        const rows = sessions.map(session => {
            // Usa a função importada
            const duration = calculateDowntimeDuration(session.startTime, session.end_time);
            
            // Soma a duração em milissegundos para o total
            const start = new Date(session.startTime).getTime();
            const end = session.end_time ? new Date(session.end_time).getTime() : new Date(getBrtIsoString()).getTime();
            const diffMillis = end - start;
            if (diffMillis > 0) {
                totalDowntimeMillis += diffMillis;
            }

            const startStatusBadge = `<span class="caminhao-status-badge status-${session.startStatus}">${statusLabels[session.startStatus] || session.startStatus}</span>`;
            
            let endStatusLabel;
            if (session.end_time) {
                const finalStatus = session.endStatus === 'ativo' ? 'ativo' : 'disponivel';
                const finalLabel = statusLabels[finalStatus] || 'Ativo/Disponível';
                endStatusLabel = `<span class="caminhao-status-badge status-${finalStatus}" style="background-color: var(--accent-primary);">${finalLabel}</span>`;
            } else {
                endStatusLabel = `<span class="caminhao-status-badge status-${session.endStatus}" style="background-color: var(--accent-danger);">EM ABERTO (${statusLabels[session.endStatus]})</span>`;
            }
            
            const endTimeDisplay = session.end_time ? formatDateTime(session.end_time) : '---';

            return `
                <tr>
                    <td>${session.cod_equipamento}</td>
                    <td>${session.finalidade || session.tipo}</td>
                    <td>${session.frente}</td>
                    <td>${startStatusBadge}</td>
                    <td>${session.startLog.motivo_parada || 'Não informado'}</td>
                    <td>${formatDateTime(session.startTime)}</td>
                    <td>${endTimeDisplay}</td>
                    <td><strong style="color: ${session.end_time ? 'var(--text-primary)' : 'var(--accent-danger)'};">${duration}</strong></td>
                </tr>
            `;
        }).join('');
        
        // 3. Formatar o total
        const totalDurationFormatted = formatMillisecondsToHoursMinutes(totalDowntimeMillis);

        // 4. Gerar o HTML
        const tableFooter = `
            <tfoot>
                <tr>
                    <td colspan="7" style="text-align: right; font-weight: 700; font-size: 1.1rem; color: var(--text-primary);">Total de Horas de Inatividade:</td>
                    <td><strong style="font-size: 1.1rem; color: var(--accent-danger);">${totalDurationFormatted}</strong></td>
                </tr>
            </tfoot>
        `;


        return `
            <div class="report-table-container">
                <h3 style="padding: 0 24px; margin-bottom: 16px;">Análise de Causa Raiz por Motivo</h3>
                <div style="padding: 0 24px 24px; overflow-x: auto;">
                    <table class="data-table-modern" style="width: 600px;">
                        <thead>
                            <tr>
                                <th>Motivo da Parada</th>
                                <th>Qtd. Ocorrências</th>
                                <th>Duração Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${motiveRows.length > 0 ? motiveRows : '<tr><td colspan="3">Nenhum motivo encontrado para os filtros.</td></tr>'}
                        </tbody>
                    </table>
                </div>

                <h3 style="padding: 0 24px; margin-bottom: 16px;">Detalhe das Ocorrências (${sessions.length} Registros)</h3>
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
                        ${tableFooter}
                    </table>
                </div>
            </div>
        `;
    }

    // NOVO: Gerador de HTML de Tabela de Ciclo
    generateCycleTableHTML(cycles, averages, title) {
        if (cycles.length === 0) {
            return `<div class="empty-state" style="padding: 50px;">
                        <i class="ph-fill ph-warning" style="font-size: 3rem;"></i>
                        <p>Nenhum ciclo de caminhão encontrado para os filtros e recursos selecionados.</p>
                    </div>`;
        }

        const rows = cycles.map(session => {
            const durationFormatted = formatMillisecondsToHoursMinutes(session.duration);
            const frente = this.data.frentes_servico.find(f => f.id === session.frente_id);
            const frenteNome = frente?.nome || 'N/A';
            const isComplete = session.is_complete;

            return `
                <tr>
                    <td><strong>${session.start_cod}</strong></td>
                    <td>${frenteNome}</td>
                    <td>${formatDateTime(session.start_time)}</td>
                    <td>${isComplete ? formatDateTime(session.end_time) : '<span style="color: var(--accent-danger);">Em Andamento</span>'}</td>
                    <td><strong style="color: ${isComplete ? 'var(--accent-primary)' : 'var(--accent-danger)'};">${durationFormatted}</strong></td>
                    <td>${isComplete ? 'Completo' : session.status_final}</td>
                </tr>
            `;
        }).join('');
        
        // Tabela de Médias
        const averageRows = Object.entries(averages).map(([frenteNome, data]) => {
            const avgFormatted = formatMillisecondsToHoursMinutes(data.averageDuration);
            return `
                <tr>
                    <td><strong>${frenteNome}</strong></td>
                    <td>${data.count}</td>
                    <td><strong style="font-size: 1.0rem; color: var(--accent-primary);">${avgFormatted}</strong></td>
                </tr>
            `;
        }).join('');


        return `
            <div class="report-table-container">
                <h3 style="padding: 0 24px; margin-bottom: 16px;">${title} (${cycles.length} Registros)</h3>
                
                <div style="padding: 0 24px 24px; overflow-x: auto;">
                    <h4 style="margin-bottom: 10px; font-size: 1.1rem; color: var(--text-primary);">Médias por Frente de Serviço (Apenas Ciclos Completos)</h4>
                    <table class="data-table-modern" style="width: 500px;">
                        <thead>
                            <tr>
                                <th>Frente de Serviço</th>
                                <th>Qtd. Ciclos Completos</th>
                                <th>Tempo Médio de Ciclo</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${averageRows.length > 0 ? averageRows : '<tr><td colspan="3">Nenhuma média calculada.</td></tr>'}
                        </tbody>
                    </table>
                </div>

                <h3 style="padding: 0 24px; margin-bottom: 16px;">Detalhe dos Ciclos</h3>
                <div style="padding: 0 24px; overflow-x: auto;">
                    <table class="data-table-modern">
                        <thead>
                            <tr>
                                <th>Cód. Caminhão</th>
                                <th>Frente de Origem</th>
                                <th>Início do Ciclo (Saída)</th>
                                <th>Fim do Ciclo (Disponível)</th>
                                <th>Duração</th>
                                <th>Status</th>
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

    // NOVO: Função para calcular média de ciclo
    calculateCycleAverages(cycles) {
        const averages = {};
        const frentesMap = new Map(this.data.frentes_servico.map(f => [f.id, f.nome]));

        cycles.filter(c => c.is_complete).forEach(cycle => {
            const frenteNome = frentesMap.get(cycle.frente_id) || 'Frente Desconhecida';
            
            if (!averages[frenteNome]) {
                averages[frenteNome] = { totalDuration: 0, count: 0 };
            }
            
            averages[frenteNome].totalDuration += cycle.duration;
            averages[frenteNome].count++;
        });

        const finalAverages = {};
        for (const frenteNome in averages) {
            const { totalDuration, count } = averages[frenteNome];
            finalAverages[frenteNome] = {
                count: count,
                averageDuration: count > 0 ? totalDuration / count : 0
            };
        }
        
        return finalAverages;
    }


    /**
     * @MODIFICADO
     * Filtra o histórico de logs. A filtragem por data (start, end) é ignorada 
     * no cliente, pois agora é feita na API via fetchReportDataWithFilters().
     */
    filterHistory(history, itemMap, start, end, itemFilter, frenteFilter, proprietarioFilter, idColumn) {
        let filtered = history;
        const numericFrenteId = frenteFilter ? parseInt(frenteFilter) : null;
        const numericProprietarioId = proprietarioFilter ? parseInt(proprietarioFilter) : null;

        // REMOÇÃO DA LÓGICA DE FILTRAGEM DE DATA NO CLIENTE
        /*
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
        */
        
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

    async renderReports() {
        showLoading(); 
        const container = document.getElementById('report-content-container');
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
            
            // AQUI: Busca dados com os filtros, pulando o cache se houver filtro de data.
            const currentData = await this.fetchReportDataWithFilters(filters); 
            
            const caminhoesMap = new Map((currentData.caminhoes || []).map(c => [c.id, c]));
            const equipamentosMap = new Map((currentData.equipamentos || []).map(e => [e.id, e]));

            // 1. FILTRAGEM (Data é nula, pois já foi aplicada na API)
            let filteredWorkHistory = this.filterHistory(
                currentData.caminhao_historico, caminhoesMap, null, null, 
                filters.equipamento, filters.frente, filters.proprietario, 'caminhao_id'
            );
            let filteredDowntimeCaminhaoHistory = this.filterHistory(
                currentData.caminhao_historico, caminhoesMap, null, null, 
                filters.equipamento, filters.frente, filters.proprietario, 'caminhao_id'
            );
            let filteredDowntimeEquipamentoHistory = this.filterHistory(
                currentData.equipamento_historico, equipamentosMap, null, null, 
                filters.equipamento, filters.frente, filters.proprietario, 'equipamento_id'
            );

            // 2. CÁLCULO DE HORAS
            
            // CÁLCULO DE DOWNTIME POR TIPO (GRÁFICO 1)
            const downtimeHoursByType = this.calculateDowntimeHoursByType(
                filteredDowntimeEquipamentoHistory, 
                currentData.equipamentos,
                filteredDowntimeCaminhaoHistory,
                currentData.caminhoes
            );
            const downtimeTypeLabels = downtimeHoursByType.map(item => item.cod_equipamento);
            const downtimeTypeData = downtimeHoursByType.map(item => item.totalHours);
            this.drawChart('downtimeByTypeChart', downtimeTypeLabels, downtimeTypeData, 'bar', 'Total de Horas de Inatividade (H)', 'rgba(197, 48, 48, 0.6)');

            // CÁLCULO COMPARATIVO POR TIPO (GRÁFICO 2)
            const workDowntimeByType = this.calculateWorkDowntimeByType(
                filteredWorkHistory, 
                filteredDowntimeCaminhaoHistory,
                filteredDowntimeEquipamentoHistory,
                currentData.caminhoes,
                currentData.equipamentos
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
            const workHoursCaminhoes = this.calculateWorkHours(filteredWorkHistory, currentData.caminhoes, 'caminhao_id');
            const workHoursEquipamentos = this.calculateWorkHours(filteredDowntimeEquipamentoHistory, currentData.equipamentos, 'equipamento_id');
            const allWorkHours = [...workHoursCaminhoes, ...workHoursEquipamentos];
            
            const individualDowntimeHours = this.calculateIndividualDowntimeHours(
                filteredDowntimeCaminhaoHistory, 
                filteredDowntimeEquipamentoHistory, 
                currentData.caminhoes, 
                currentData.equipamentos
            );
            
            const comparisonDataIndividual = this.prepareComparisonData(allWorkHours, individualDowntimeHours);
            
            const utilizationData = this.calculateUtilizationRate(comparisonDataIndividual);
            this.drawUtilizationChart('utilizationChart', utilizationData.labels, utilizationData.data);
            
            // 6. ARMAZENAR DADOS PARA EXPORTAÇÃO
            this.exportData = {
                comparisonData: comparisonDataIndividual, 
                downtimeByType: this.calculateDowntimeHoursByType(filteredDowntimeEquipamentoHistory, currentData.equipamentos, filteredDowntimeCaminhaoHistory, currentData.caminhoes),
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
                totalMillis += new Date(getBrtIsoString()).getTime() - lastSession.time.getTime(); 
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
                totalMillis += new Date(getBrtIsoString()).getTime() - lastSession.time.getTime(); 
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

        // Funções para calcular downtime usando o novo helper
        const calculateDowntimeDurationByItem = (history, idColumn) => {
             const sessions = groupDowntimeSessions(history, idColumn, nonProductiveStatus);
             let totalMillis = 0;
             sessions.forEach(session => {
                 const start = session.startTime.getTime();
                 const end = session.end_time ? session.end_time.getTime() : new Date(getBrtIsoString()).getTime();
                 // Só soma se estiver no período de filtro (isso já foi feito no filterHistory),
                 // mas garante que a duração seja maior que zero
                 if (end - start > 0) {
                      totalMillis += (end - start);
                 }
             });
             return totalMillis;
        };
        
        const finalByType = {};

        // 1. Processa Equipamentos
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

        // 2. Processa Caminhões
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
        
        // 3. Calcula o tempo total de inatividade e agrega por tipo
        for (const key in groupedResults) {
            const { groupKey, logs } = groupedResults[key];
            const type = groupKey;
            
            const idColumn = type === 'Caminhão' ? 'caminhao_id' : 'equipamento_id';
            const totalMillis = calculateDowntimeDurationByItem(logs, idColumn);
            
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
                        title: { display: true, text: 'Tempo (H:MM)', color: '#A0AEC0' }, // NOVO: Título com H:MM
                        ticks: { 
                            color: '#A0AEC0', 
                            callback: (value) => this.convertHoursToHM(value) // NOVO: Callback para formatar
                        }, 
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
                        title: { display: true, text: 'Tempo (H:MM)', color: '#A0AEC0' }, // NOVO: Título com H:MM
                        ticks: { 
                            color: '#A0AEC0',
                            callback: (value) => this.convertHoursToHM(value) // NOVO: Callback para formatar
                        }, 
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
            await this.loadPdfLibs(); // Garante o carregamento das libs
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
            
            const contentContainer = document.getElementById('report-content-container');
            
            // 1. Exportar Gráficos (se for a view ativa)
            if (this.currentReport === 'charts') {
                 const chartContainers = contentContainer.querySelectorAll('.chart-container');
            
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
             } else {
                 // 2. Exportar Tabela (se for a view ativa)
                 const tableContainer = contentContainer.querySelector('.report-table-container');
                 if (tableContainer) {
                     const tableTitle = tableContainer.querySelector('h3')?.textContent || 'Tabela de Relatório';
                     
                     // Converte o container da tabela em imagem para o PDF
                     const tableImage = await html2canvas(tableContainer, {
                         scale: 2,
                         useCORS: true,
                         backgroundColor: '#1A202C' 
                     });
                     
                     const imgData = tableImage.toDataURL('image/png');
                     const imgWidth = 180; 
                     const imgHeight = tableImage.height * imgWidth / tableImage.width / tableImage.scale;
                     
                     if (y + imgHeight + 10 > doc.internal.pageSize.height) {
                         doc.addPage();
                         y = margin;
                     }
                     
                     doc.setFontSize(14);
                     doc.setTextColor(247, 250, 252); 
                     doc.text(tableTitle, margin, y);
                     y += 5;
                     
                     doc.addImage(imgData, 'PNG', margin, y, imgWidth, imgHeight);
                     y += imgHeight + 10;
                 } else {
                      throw new Error('Nenhum gráfico ou tabela encontrado para exportar.');
                 }
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
            
            // NOVO: Adicionar Relatório de Ciclo ao Export Excel
            if (this.currentReport === 'time-cycle') {
                 const filters = this.getFilterValues();
                 const caminhãoMap = new Map((this.data.caminhoes || []).map(c => [c.id, c]));
                 const filteredHistory = this.filterHistory(
                     this.data.caminhao_historico, caminhãoMap, filters.dataInicio, filters.dataFim, 
                     filters.equipamento, filters.frente, filters.proprietario, 'caminhao_id'
                 );
                 const cycles = calculateCycleDuration(filteredHistory, this.cycleStatus);
                 const cycleAverages = this.calculateCycleAverages(cycles);

                 csvContent += `\r\n--- Tabela 3: Tempo Médio de Ciclo (Ciclos Completos) ---\r\n`;
                 let header3 = "Frente de Serviço;Qtd. Ciclos;Tempo Medio (HH:MM)\r\n";
                 csvContent += header3;
                 
                 Object.entries(cycleAverages).forEach(([frenteNome, data]) => {
                     const avgFormatted = formatMillisecondsToHoursMinutes(data.averageDuration);
                     csvContent += `${frenteNome};${data.count};${avgFormatted}\r\n`;
                 });
                 
                 csvContent += `\r\n--- Tabela 4: Detalhe dos Ciclos ---\r\n`;
                 let header4 = "Caminhao;Frente;Inicio Ciclo;Fim Ciclo;Duracao (HH:MM);Status\r\n";
                 header4 += "ATENÇÃO: A filtragem de data para este relatório é aplicada no cliente, certifique-se de que o período é o mesmo do filtro de logs.\r\n";
                 csvContent += header4;

                 cycles.forEach(session => {
                     const durationFormatted = formatMillisecondsToHoursMinutes(session.duration);
                     const frente = this.data.frentes_servico.find(f => f.id === session.frente_id);
                     const frenteNome = frente?.nome || 'N/A';
                     const endTime = session.end_time ? formatDateTime(session.end_time) : 'EM ANDAMENTO';
                     const status = session.is_complete ? 'Completo' : session.status_final;

                     csvContent += `${session.start_cod};${frenteNome};${formatDateTime(session.start_time)};${endTime};${durationFormatted};${status}\r\n`;
                 });
            }


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
        
        // NOVO: Quick range listeners
        this.container.querySelectorAll('.btn-quick-range').forEach(btn => {
            btn.removeEventListener('click', this.handleQuickRangeClick.bind(this));
            btn.addEventListener('click', this.handleQuickRangeClick.bind(this));
        });
        
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
    
    // NOVO: Handler para o clique dos botões de período rápido
    handleQuickRangeClick(e) {
        const rangeType = e.target.closest('.btn-quick-range')?.dataset.range;
        if (rangeType) {
            const { startDate, endDate } = this.getDateRange(rangeType);
            
            const dateStartInput = document.getElementById('filter-data-inicio');
            const dateEndInput = document.getElementById('filter-data-fim');
            
            if (dateStartInput) dateStartInput.value = startDate;
            if (dateEndInput) dateEndInput.value = endDate;
            
            // Re-render the report
            this.applyFilterAndRender();
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