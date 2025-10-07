// js/views/relatorios.js
import { fetchAllData } from '../api.js';
import { showToast, showLoading, hideLoading } from '../helpers.js';

export class RelatoriosView {
    constructor() {
        this.container = null;
        this.data = {};
        this.workHoursChart = null;
        this.downtimeHoursChart = null; 
        this.utilizationChart = null; // RENOMEADO
    }

    async show() {
        await this.loadHTML();
        await this.loadInitialData();
        await this.renderReports();
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
    
    // ESTRUTURA HTML COM DESIGN MODERNO E NOVOS FILTROS
    getHTML() {
        return `
            <div id="relatorios-view" class="view active-view">
                <div class="report-header">
                    <h1>Relatórios Gerenciais</h1>
                </div>

                <div class="report-filters" style="padding: 0 24px 24px; display: flex; flex-wrap: wrap; gap: 16px;">
                    <div class="filter-group" style="display: flex; gap: 12px; align-items: center; background-color: var(--bg-light); border: 1px solid var(--border-color); padding: 12px; border-radius: 8px;">
                        <label style="font-weight: 600; color: var(--accent-primary);">Período:</label>
                        <label for="filter-data-inicio" style="color: var(--text-secondary); font-size: 0.9rem;">De:</label>
                        <input type="date" id="filter-data-inicio" class="form-input" style="width: 150px;">
                        <label for="filter-data-fim" style="color: var(--text-secondary); font-size: 0.9rem;">Até:</label>
                        <input type="date" id="filter-data-fim" class="form-input" style="width: 150px;">
                    </div>
                    
                    <div class="filter-group" style="display: flex; gap: 12px; align-items: center; background-color: var(--bg-light); border: 1px solid var(--border-color); padding: 12px; border-radius: 8px; flex-grow: 1;">
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

                <div class="report-export">
                    <button class="btn-secondary" id="export-pdf">
                        <i class="ph-fill ph-file-pdf"></i>
                        Exportar PDF
                    </button>
                    <button class="btn-secondary" id="export-excel">
                        <i class="ph-fill ph-file-xls"></i>
                        Exportar Excel
                    </button>
                </div>
            </div>
        `;
    }

    async loadInitialData() {
        showLoading();
        try {
            this.data = await fetchAllData();
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

        selectEquipamento.innerHTML = '<option value="">Todos os Equipamentos/Caminhões</option>' +
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

    // Método principal para renderizar todos os gráficos
    async renderReports() {
        showLoading(); 
        
        try {
            const equipamentoFilter = document.getElementById('filter-equipamento')?.value;
            const frenteFilter = document.getElementById('filter-frente')?.value;
            const proprietarioFilter = document.getElementById('filter-proprietario')?.value;
            const dataInicio = document.getElementById('filter-data-inicio')?.value;
            const dataFim = document.getElementById('filter-data-fim')?.value;
            
            const caminhoesMap = new Map((this.data.caminhoes || []).map(c => [c.id, c]));
            const equipamentosMap = new Map((this.data.equipamentos || []).map(e => [e.id, e]));

            // 1. FILTRAGEM
            let filteredWorkHistory = this.filterHistory(
                this.data.caminhao_historico, caminhoesMap, dataInicio, dataFim, 
                equipamentoFilter, frenteFilter, proprietarioFilter, 'caminhao_id'
            );
            let filteredDowntimeHistory = this.filterHistory(
                this.data.equipamento_historico, equipamentosMap, dataInicio, dataFim, 
                equipamentoFilter, frenteFilter, proprietarioFilter, 'equipamento_id'
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
            
        } catch (error) {
            showToast('Erro ao gerar os relatórios. Verifique os filtros.', 'error');
            console.error("Erro em renderReports:", error);
        } finally {
            hideLoading();
        }
    }

    // Lógica de filtragem unificada
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

    // Calcula Horas Trabalhadas por CÓDIGO de Equipamento
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

    // Calcula Horas de Inatividade por CÓDIGO de Equipamento (para o comparativo)
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

    // Função para mesclar os dados de Horas Trabalhadas e Paradas
    prepareComparisonData(workHours, downtimeHours) {
        const dataMap = new Map();

        // Combina caminhões e equipamentos (que têm horas trabalhadas)
        workHours.forEach(item => {
            dataMap.set(item.cod_equipamento, { work: item.totalHours, downtime: 0 });
        });

        // Adiciona horas paradas (apenas equipamentos têm downtime logado)
        downtimeHours.forEach(item => {
            if (dataMap.has(item.cod_equipamento)) {
                dataMap.get(item.cod_equipamento).downtime = item.totalHours;
            } else {
                 // Se o equipamento não tem horas trabalhadas (0), ele só aparecerá no filtro individual
                 dataMap.set(item.cod_equipamento, { work: 0, downtime: item.totalHours });
            }
        });

        const labels = Array.from(dataMap.keys()).sort();
        const workData = labels.map(label => dataMap.get(label).work);
        const downtimeData = labels.map(label => dataMap.get(label).downtime);
        
        return { labels, workData, downtimeData };
    }
    
    // NOVO: Calcula Taxa de Utilização com base nos dados de comparação
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

    // NOVO: Função para renderizar o Gráfico de Utilização (Gráfico de Barras Simples)
    drawUtilizationChart(canvasId, labels, data) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        
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

    // Função para o Gráfico de Comparação (Multi-Dataset)
    drawComparisonChart(canvasId, labels, datasets, type) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

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
        if (!ctx) return;
        
        if (canvasId === 'downtimeHoursChart' && this.downtimeHoursChart) this.downtimeHoursChart.destroy();

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

    addEventListeners() {
        const filterBtn = document.getElementById('apply-report-filters');
        if (filterBtn) {
            filterBtn.removeEventListener('click', this.renderReports.bind(this));
            filterBtn.addEventListener('click', this.renderReports.bind(this));
        }
        
        const exportPdfBtn = document.getElementById('export-pdf');
        if (exportPdfBtn) exportPdfBtn.addEventListener('click', () => showToast('Funcionalidade de Exportar PDF (Em Desenvolvimento)', 'info'));
        
        const exportExcelBtn = document.getElementById('export-excel');
        if (exportExcelBtn) exportExcelBtn.addEventListener('click', () => showToast('Funcionalidade de Exportar Excel (Em Desenvolvimento)', 'info'));
    }
}