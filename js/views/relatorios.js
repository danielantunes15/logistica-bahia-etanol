// js/views/relatorios.js
import { fetchTable } from '../api.js';
import { showToast } from '../helpers.js';

export class RelatoriosView {
    constructor() {
        this.container = null;
        this.workHoursChart = null;
    }

    async show() {
        await this.loadHTML();
        await this.renderReports();
        this.addEventListeners();
    }

    async hide() {
        if (this.workHoursChart) {
            this.workHoursChart.destroy();
        }
    }

    async loadHTML() {
        const container = document.getElementById('views-container');
        container.innerHTML = this.getHTML();
        this.container = container;
    }

    getHTML() {
        return `
            <div id="relatorios-view" class="view active-view">
                <div class="report-header">
                    <h1>Relatórios Gerenciais</h1>
                    <div class="report-filters">
                        <select id="report-period">
                            <option value="7">Últimos 7 dias</option>
                            <option value="30">Últimos 30 dias</option>
                            <option value="90">Últimos 90 dias</option>
                        </select>
                    </div>
                </div>

                <div class="charts-grid">
                    <div class="chart-container">
                        <h3>Horas Trabalhadas - Caminhões</h3>
                        <div class="chart-wrapper">
                            <canvas id="workHoursChart"></canvas>
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

    async renderReports() {
        try {
            const historico = await fetchTable('caminhao_historico', '*, caminhoes(cod_equipamento)');
            const workHours = this.calculateWorkHours(historico);
            
            const labels = workHours.map(item => item.cod_equipamento);
            const data = workHours.map(item => item.totalHours);

            this.drawWorkHoursChart(labels, data);
        } catch (error) {
            showToast('Erro ao carregar dados do relatório', 'error');
            console.error("Erro em renderReports:", error);
        }
    }

    calculateWorkHours(history) {
        const workLogs = {};
        const productiveStatus = ['ativo', 'em_viagem'];
        
        history.forEach(log => {
            const id = log.caminhao_id;
            if (!id || !log.caminhoes) return;
            
            if (!workLogs[id]) {
                workLogs[id] = { 
                    cod_equipamento: log.caminhoes.cod_equipamento, 
                    sessions: [] 
                };
            }
            
            workLogs[id].sessions.push({ 
                status: log.status_novo, 
                time: new Date(log.timestamp_mudanca) 
            });
        });

        const results = [];
        for (const id in workLogs) {
            let totalMillis = 0;
            const sessions = workLogs[id].sessions.sort((a, b) => a.time - b.time);
            
            for(let i = 0; i < sessions.length - 1; i++) {
                if (productiveStatus.includes(sessions[i].status)) {
                    totalMillis += sessions[i+1].time - sessions[i].time;
                }
            }
            
            const lastSession = sessions[sessions.length - 1];
            if (lastSession && productiveStatus.includes(lastSession.status)) {
                totalMillis += new Date() - lastSession.time;
            }

            results.push({
                caminhao_id: id,
                cod_equipamento: workLogs[id].cod_equipamento,
                totalHours: totalMillis / (1000 * 60 * 60)
            });
        }
        return results;
    }

    drawWorkHoursChart(labels, data) {
        const ctx = document.getElementById('workHoursChart');
        if (!ctx) return;
        
        if (this.workHoursChart) {
            this.workHoursChart.destroy();
        }
        
        this.workHoursChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Horas Trabalhadas (ativo/em viagem)',
                    data: data,
                    backgroundColor: 'rgba(56, 161, 105, 0.6)',
                    borderColor: 'rgba(56, 161, 105, 1)',
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
    }

    addEventListeners() {
        // Event listeners específicos de relatórios
        const periodSelect = document.getElementById('report-period');
        if (periodSelect) {
            periodSelect.addEventListener('change', () => {
                this.renderReports();
            });
        }
    }
}