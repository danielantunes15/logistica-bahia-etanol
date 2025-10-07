// js/views/relatorios.js
import { fetchAllData } from '../api.js';
import { showToast, showLoading, hideLoading } from '../helpers.js';

export class RelatoriosView {
    constructor() {
        this.container = null;
        this.data = {};
        this.workHoursChart = null;
        this.downtimeHoursChart = null; 
        this.productivityChart = null;
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
        if (this.productivityChart) this.productivityChart.destroy();
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
                        <h3>Horas Trabalhadas por Tipo de Equipamento</h3>
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
                        <h3>Produtividade por Frente (MOCK)</h3>
                        <div class="chart-wrapper">
                            <canvas id="productivityChart"></canvas>
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

    // NOVO: Popula todos os selects de filtro
    populateFilters() {
        const selectEquipamento = document.getElementById('filter-equipamento');
        const selectFrente = document.getElementById('filter-frente');
        const selectProprietario = document.getElementById('filter-proprietario');
        if (!selectEquipamento || !selectFrente || !selectProprietario) return;
        
        // 1. Coleta todos os equipamentos e caminhões em uma lista única
        const allItems = [
            ...(this.data.caminhoes || []).map(c => ({ id: `c-${c.id}`, cod: c.cod_equipamento, tipo: 'Caminhão' })),
            ...(this.data.equipamentos || []).map(e => ({ id: `e-${e.id}`, cod: e.cod_equipamento, tipo: e.finalidade }))
        ];

        // 2. Preenche o select de equipamentos
        selectEquipamento.innerHTML = '<option value="">Todos os Equipamentos/Caminhões</option>' +
            allItems.map(item => `<option value="${item.id}">${item.cod} (${item.tipo})</option>`).join('');

        // 3. Preenche o select de Frentes
        const frentes = this.data.frentes_servico || [];
        selectFrente.innerHTML = '<option value="">Todas as Frentes</option>' + 
            frentes.map(f => `<option value="${f.id}">${f.nome}</option>`).join('');
            
        // 4. Preenche o select de Proprietários
        const proprietarios = this.data.proprietarios || [];
        selectProprietario.innerHTML = '<option value="">Todos os Proprietários</option>' + 
            proprietarios.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');

        // 5. Define a data inicial e final padrão (Ex: Últimos 7 dias)
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

            // Filtra o histórico de caminhões
            let filteredWorkHistory = this.filterHistory(
                this.data.caminhao_historico, 
                caminhoesMap, 
                dataInicio, dataFim, equipamentoFilter, frenteFilter, proprietarioFilter, 'caminhao_id'
            );
            
            // Filtra o histórico de equipamentos
            let filteredDowntimeHistory = this.filterHistory(
                this.data.equipamento_historico, 
                equipamentosMap, 
                dataInicio, dataFim, equipamentoFilter, frenteFilter, proprietarioFilter, 'equipamento_id'
            );

            // Renderiza Gráfico 1: Horas Trabalhadas (Agrupado por TIPO)
            const workHours = this.calculateWorkHours(filteredWorkHistory, this.data.caminhoes, 'caminhao_id')
                            .concat(this.calculateWorkHours(filteredDowntimeHistory, this.data.equipamentos, 'equipamento_id'));
                            
            const workLabels = workHours.map(item => item.cod_equipamento);
            const workData = workHours.map(item => item.totalHours);
            this.drawChart('workHoursChart', workLabels, workData, 'bar', 'Horas Trabalhadas (H)');

            // Renderiza Gráfico 2: Horas de Inatividade (Agrupado por TIPO)
            const downtimeHours = this.calculateDowntimeHours(filteredDowntimeHistory, this.data.equipamentos);
            const downtimeLabels = downtimeHours.map(item => item.cod_equipamento);
            const downtimeData = downtimeHours.map(item => item.totalHours);
            this.drawChart('downtimeHoursChart', downtimeLabels, downtimeData, 'bar', 'Horas de Inatividade (H)', 'rgba(197, 48, 48, 0.6)');

            // Renderiza Gráfico 3: Produtividade (MOCK)
            this.drawChart('productivityChart', ['Frente A', 'Frente B'], [450, 320], 'line', 'Produtividade (t/ha)', 'rgba(49, 130, 206, 0.6)');
            
        } catch (error) {
            showToast('Erro ao gerar os relatórios. Verifique os filtros.', 'error');
            console.error("Erro em renderReports:", error);
        } finally {
            hideLoading();
        }
    }

    // Lógica de filtragem unificada para todos os históricos
    filterHistory(history, itemMap, start, end, itemFilter, frenteFilter, proprietarioFilter, idColumn) {
        let filtered = history;
        const numericFrenteId = frenteFilter ? parseInt(frenteFilter) : null;
        const numericProprietarioId = proprietarioFilter ? parseInt(proprietarioFilter) : null;

        // 1. Filtro de Data
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
        
        // 2. Filtro por Item (Caminhão ou Equipamento)
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
        
        // 3. Filtro por Frente e Proprietário (Aplica-se ao item associado ao log)
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

    // MUDANÇA: Calcula Horas Trabalhadas AGRUPADO POR TIPO
    calculateWorkHours(history, items, idColumn) {
        const itemMap = new Map(items.map(i => [i.id, i]));
        const productiveStatus = ['ativo', 'indo_carregar', 'carregando', 'retornando', 'patio_carregado', 'descarregando', 'patio_vazio'];
        
        // PASSO 1: Agrupar sessões por ITEM ID
        const itemWorkLogs = {};
        
        history.forEach(log => {
            const id = log[idColumn];
            const item = itemMap.get(id);
            if (!id || !item) return;

            // Define o rótulo do grupo (tipo): 'Caminhão' ou a finalidade do equipamento
            const groupKey = idColumn === 'caminhao_id' ? 'Caminhão' : item.finalidade;
            
            if (!itemWorkLogs[id]) {
                itemWorkLogs[id] = { 
                    groupKey: groupKey,
                    sessions: [] 
                };
            }
            
            itemWorkLogs[id].sessions.push({ 
                status: log.status_novo, 
                time: new Date(log.timestamp_mudanca) 
            });
        });

        // PASSO 2: Calcular o total de horas para cada ITEM e AGREGAR pelo TIPO.
        const groupedResults = {};

        for (const id in itemWorkLogs) {
            let totalMillis = 0;
            const { sessions, groupKey } = itemWorkLogs[id];
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
            
            // Acumula no grupo
            if (!groupedResults[groupKey]) {
                groupedResults[groupKey] = 0;
            }
            groupedResults[groupKey] += totalMillis;
        }

        // PASSO 3: Formatar o resultado final
        const finalResults = Object.keys(groupedResults).map(groupKey => ({
            cod_equipamento: groupKey, 
            totalHours: (groupedResults[groupKey] / (1000 * 60 * 60)).toFixed(2)
        }));
        
        return finalResults;
    }

    // MUDANÇA: Calcula Horas de Inatividade AGRUPADO POR TIPO
    calculateDowntimeHours(history, equipamentos) {
        const itemMap = new Map(equipamentos.map(i => [i.id, i]));
        const nonProductiveStatus = ['parado', 'quebrado'];
        
        // PASSO 1: Agrupar sessões por ITEM ID primeiro.
        const itemDowntimeLogs = {};
        
        history.forEach(log => {
            const id = log.equipamento_id;
            const item = itemMap.get(id);
            if (!id || !item) return;
            
            if (!itemDowntimeLogs[id]) {
                itemDowntimeLogs[id] = { 
                    groupKey: item.finalidade, // Finalidade é o tipo do equipamento
                    sessions: [] 
                };
            }
            
            itemDowntimeLogs[id].sessions.push({ 
                status: log.status_novo, 
                time: new Date(log.timestamp_mudanca) 
            });
        });

        // PASSO 2: Calcular o total de horas de inatividade para cada ITEM e AGREGAR pelo TIPO.
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
            
            // Acumula no grupo
            if (!groupedResults[groupKey]) {
                groupedResults[groupKey] = 0;
            }
            groupedResults[groupKey] += totalMillis;
        }

        // PASSO 3: Formatar o resultado final
        const finalResults = Object.keys(groupedResults).map(groupKey => ({
            cod_equipamento: groupKey, 
            totalHours: (groupedResults[groupKey] / (1000 * 60 * 60)).toFixed(2)
        }));
        
        return finalResults;
    }

    drawChart(canvasId, labels, data, type, label, color = 'rgba(56, 161, 105, 0.6)') {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        
        if (canvasId === 'workHoursChart' && this.workHoursChart) this.workHoursChart.destroy();
        if (canvasId === 'downtimeHoursChart' && this.downtimeHoursChart) this.downtimeHoursChart.destroy();
        if (canvasId === 'productivityChart' && this.productivityChart) this.productivityChart.destroy();

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
        
        if (canvasId === 'workHoursChart') this.workHoursChart = newChart;
        if (canvasId === 'downtimeHoursChart') this.downtimeHoursChart = newChart;
        if (canvasId === 'productivityChart') this.productivityChart = newChart;
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