// js/views/dashboard.js
export class DashboardView {
    constructor() {
        this.container = null;
    }

    async show() {
        await this.loadHTML();
        await this.loadData();
        this.addEventListeners();
    }

    async hide() {
        // Limpar recursos se necessário
    }

    async loadHTML() {
        const container = document.getElementById('views-container');
        container.innerHTML = this.getHTML();
        this.container = container;
    }

    getHTML() {
        return `
            <div id="dashboard-view" class="view active-view">
                <div class="dashboard-header">
                    <h1>Dashboard de Operações</h1>
                </div>
                
                <div class="kpi-container">
                    <div class="kpi-card">
                        <h3>Caminhões Ativos</h3>
                        <p id="kpi-caminhoes-ativos">0</p>
                    </div>
                    <div class="kpi-card">
                        <h3>Equipamentos Ativos</h3>
                        <p id="kpi-equipamentos-ativos">0</p>
                    </div>
                    <div class="kpi-card">
                        <h3>Fazendas Colhendo</h3>
                        <p id="kpi-fazendas-colhendo">0</p>
                    </div>
                </div>

                <div class="map-container">
                    <div id="dashboard-map"></div>
                </div>
            </div>
        `;
    }

    async loadData() {
        // Simular carregamento de dados
        document.getElementById('kpi-caminhoes-ativos').textContent = '12';
        document.getElementById('kpi-equipamentos-ativos').textContent = '8';
        document.getElementById('kpi-fazendas-colhendo').textContent = '5';
    }

    addEventListeners() {
        // Event listeners específicos do dashboard
    }
}