// js/views/dashboard.js
import { mapManager } from '../maps.js';
import { fetchAllData } from '../api.js';
import { showToast } from '../helpers.js';

export class DashboardView {
    constructor() {
        this.container = null;
        this.data = {};
    }

    async show() {
        await this.loadHTML();
        await this.initializeMap();
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
                    <div class="dashboard-actions">
                        <button class="btn-secondary" id="refresh-dashboard">
                            <i class="ph-fill ph-arrows-clockwise"></i>
                            Atualizar
                        </button>
                    </div>
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
                    <div class="kpi-card">
                        <h3>Total de Fazendas</h3>
                        <p id="kpi-total-fazendas">0</p>
                    </div>
                </div>

                <div class="map-container">
                    <div id="dashboard-map" style="height: 100%; width: 100%;"></div>
                </div>

                <div class="dashboard-grid">
                    <div class="dashboard-card">
                        <h3>Operações Recentes</h3>
                        <div id="recent-operations">
                            <p>Carregando operações...</p>
                        </div>
                    </div>
                    <div class="dashboard-card">
                        <h3>Alertas do Sistema</h3>
                        <div id="system-alerts">
                            <p>Nenhum alerta no momento.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async initializeMap() {
        // Aguardar um pouco para o container ser renderizado
        setTimeout(() => {
            const map = mapManager.initDashboardMap();
            if (map) {
                console.log('Mapa do dashboard inicializado com sucesso');
            }
        }, 100);
    }

    async loadData() {
        try {
            this.data = await fetchAllData();
            this.updateKPIs();
            this.updateMap();
            this.updateRecentOperations();
        } catch (error) {
            console.error('Erro ao carregar dados do dashboard:', error);
            showToast('Erro ao carregar dados do dashboard', 'error');
        }
    }

    updateKPIs() {
        const { caminhoes, equipamentos, fazendas } = this.data;
        
        // Caminhões ativos
        const caminhoesAtivos = (caminhoes || []).filter(c => 
            c.status === 'ativo' || c.status === 'em_viagem'
        ).length;
        document.getElementById('kpi-caminhoes-ativos').textContent = caminhoesAtivos;

        // Equipamentos ativos
        const equipamentosAtivos = (equipamentos || []).filter(e => 
            e.status === 'ativo' || e.status === 'em_viagem'
        ).length;
        document.getElementById('kpi-equipamentos-ativos').textContent = equipamentosAtivos;

        // Fazendas colhendo
        const fazendasColhendo = (fazendas || []).filter(f => 
            f.status === 'colhendo'
        ).length;
        document.getElementById('kpi-fazendas-colhendo').textContent = fazendasColhendo;

        // Total de fazendas
        const totalFazendas = (fazendas || []).length;
        document.getElementById('kpi-total-fazendas').textContent = totalFazendas;
    }

    updateMap() {
        const { fazendas } = this.data;
        if (fazendas && fazendas.length > 0) {
            mapManager.updateFazendaMarkers(fazendas);
        }
    }

    updateRecentOperations() {
        const container = document.getElementById('recent-operations');
        if (!container) return;

        const { caminhoes, equipamentos } = this.data;
        const recentItems = [];

        // Adicionar últimos caminhões
        if (caminhoes) {
            caminhoes.slice(0, 3).forEach(caminhao => {
                recentItems.push(`
                    <div class="operation-item">
                        <i class="ph-fill ph-truck"></i>
                        <div>
                            <strong>${caminhao.cod_equipamento}</strong>
                            <span>${caminhao.placa} - ${caminhao.status}</span>
                        </div>
                    </div>
                `);
            });
        }

        // Adicionar últimos equipamentos
        if (equipamentos) {
            equipamentos.slice(0, 2).forEach(equipamento => {
                recentItems.push(`
                    <div class="operation-item">
                        <i class="ph-fill ph-tractor"></i>
                        <div>
                            <strong>${equipamento.cod_equipamento}</strong>
                            <span>${equipamento.finalidade} - ${equipamento.status}</span>
                        </div>
                    </div>
                `);
            });
        }

        container.innerHTML = recentItems.length > 0 ? 
            recentItems.join('') : 
            '<p>Nenhuma operação recente</p>';
    }

    addEventListeners() {
        const refreshBtn = document.getElementById('refresh-dashboard');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadData();
                showToast('Dados atualizados', 'success');
            });
        }
    }
}