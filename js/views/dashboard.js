// js/views/dashboard.js
import { mapManager } from '../maps.js';
import { fetchAllData } from '../api.js';
import { showToast, showLoading, hideLoading } from '../helpers.js';

export class DashboardView {
    constructor() {
        this.container = null;
        this.data = {};
        this.autoRefreshInterval = null;
    }

    async show() {
        await this.loadHTML();
        await this.initializeMap();
        await this.loadData();
        this.startAutoRefresh();
        this.addEventListeners();
    }

    async hide() {
        this.stopAutoRefresh();
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
                    <h1>Dashboard de Operações - LOGISTICA BEL</h1>
                    <div class="dashboard-actions">
                        <button class="btn-primary" id="refresh-operations">
                            <i class="ph-fill ph-arrows-clockwise"></i>
                            Atualizar
                        </button>
                    </div>
                </div>

                <div class="map-fullscreen">
                    <div id="dashboard-map"></div>
                    
                    <div class="modern-dashboard-overlay">
                        <div class="stats-panel">
                            <div class="panel-header">
                                <h3>Status das Operações</h3>
                                <div class="last-update" id="last-update">
                                    Atualizado agora
                                </div>
                            </div>
                            
                            <div class="stats-grid">
                                <div class="stat-card">
                                    <div class="stat-header">
                                        <div class="stat-icon">
                                            <i class="ph-fill ph-truck"></i>
                                        </div>
                                        <div class="stat-title">Caminhões</div>
                                    </div>
                                    <div class="stat-content">
                                        <div class="stat-main">
                                            <span class="stat-value" id="caminhoes-ativos">0</span>
                                            <span class="stat-label">Em Operação</span>
                                        </div>
                                        <div class="stat-secondary">
                                            <span class="stat-badge danger" id="caminhoes-parados">0</span>
                                            <span class="stat-label">Parados</span>
                                        </div>
                                    </div>
                                    <div class="stat-total">
                                        Total: <span id="caminhoes-total">0</span>
                                    </div>
                                </div>

                                <div class="stat-card">
                                    <div class="stat-header">
                                        <div class="stat-icon">
                                            <i class="ph-fill ph-users-three"></i>
                                        </div>
                                        <div class="stat-title">Frentes</div>
                                    </div>
                                    <div class="stat-content">
                                        <div class="stat-main">
                                            <span class="stat-value" id="frentes-ativas">0</span>
                                            <span class="stat-label">Ativas</span>
                                        </div>
                                        <div class="stat-secondary">
                                            <span class="stat-badge danger" id="frentes-inativas">0</span>
                                            <span class="stat-label">Inativas</span>
                                        </div>
                                    </div>
                                    <div class="stat-total">
                                        Total: <span id="frentes-total">0</span>
                                    </div>
                                </div>

                                <div class="stat-card">
                                    <div class="stat-header">
                                        <div class="stat-icon">
                                            <i class="ph-fill ph-tractor"></i>
                                        </div>
                                        <div class="stat-title">Equipamentos</div>
                                    </div>
                                    <div class="stat-content">
                                        <div class="stat-main">
                                            <span class="stat-value" id="equipamentos-ativos">0</span>
                                            <span class="stat-label">Em Operação</span>
                                        </div>
                                        <div class="stat-secondary">
                                            <span class="stat-badge danger" id="equipamentos-parados">0</span>
                                            <span class="stat-label">Parados</span>
                                        </div>
                                    </div>
                                    <div class="stat-total">
                                        Total: <span id="equipamentos-total">0</span>
                                    </div>
                                </div>

                                <div class="stat-card">
                                    <div class="stat-header">
                                        <div class="stat-icon">
                                            <i class="ph-fill ph-tree-evergreen"></i>
                                        </div>
                                        <div class="stat-title">Fazendas</div>
                                    </div>
                                    <div class="stat-content">
                                        <div class="stat-main">
                                            <span class="stat-value" id="fazendas-colhendo">0</span>
                                            <span class="stat-label">Colhendo</span>
                                        </div>
                                        <div class="stat-secondary">
                                            <span class="stat-badge" id="fazendas-disponiveis">0</span>
                                            <span class="stat-label">Disponíveis</span>
                                        </div>
                                    </div>
                                    <div class="stat-total">
                                        Total: <span id="fazendas-total">0</span>
                                    </div>
                                </div>
                            </div>

                            <div class="panel-footer">
                                <div class="efficiency-metric">
                                    <div class="metric-label">Eficiência Geral</div>
                                    <div class="metric-value">
                                        <span id="eficiencia-geral">0%</span>
                                        <div class="metric-bar">
                                            <div class="metric-fill" id="eficiencia-bar"></div>
                                        </div>
                                    </div>
                                </div>
                                <div class="active-now">
                                    <i class="ph-fill ph-pulse"></i>
                                    <span id="operacoes-ativas">0</span> operações ativas
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="map-legend">
                        <div class="legend-title">Legenda</div>
                        <div class="legend-items">
                            <div class="legend-item">
                                <div class="legend-color usina"></div>
                                <span>Usina</span>
                            </div>
                            <div class="legend-item">
                                <div class="legend-color colhendo"></div>
                                <span>Colhendo</span>
                            </div>
                            <div class="legend-item">
                                <div class="legend-color disponivel"></div>
                                <span>Disponível</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async initializeMap() {
        setTimeout(() => {
            const map = mapManager.initDashboardMap();
            if (map) {
                console.log('Mapa principal inicializado com sucesso');
                mapManager.invalidateSize('dashboard-map');
            }
        }, 100);
    }

    async loadData() {
        showLoading();
        try {
            this.data = await fetchAllData();
            this.updateDashboardStats();
            this.updateMap();
            this.updateLastUpdateTime();
        } catch (error) {
            console.error('Erro ao carregar dados do dashboard:', error);
            showToast('Erro ao carregar dados', 'error');
        } finally {
            hideLoading();
        }
    }

    startAutoRefresh() {
        // Atualizar a cada 30 segundos
        this.autoRefreshInterval = setInterval(() => {
            this.loadData();
        }, 30000);
    }

    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }

    updateDashboardStats() {
        // --- CORREÇÃO AQUI ---
        // Alterado de 'frentes' para 'frentes_servico'
        const { caminhoes, frentes_servico, equipamentos, fazendas } = this.data;

        // -------------------------------------------------------------
        // NOVO: Definir status do ciclo operacional dos caminhões
        const cycleStatuses = [
            'indo_carregar', 
            'carregando', 
            'retornando', 
            'patio_carregado',
            'descarregando',
            'patio_vazio' 
        ];
        // -------------------------------------------------------------

        // Estatísticas de Caminhões
        const totalCaminhoes = caminhoes ? caminhoes.length : 0;
        const caminhoesAtivos = caminhoes ? caminhoes.filter(c => 
            cycleStatuses.includes(c.status) // Filtra APENAS pelos status do ciclo
        ).length : 0;
        // Caminhões parados = Total - (Caminhões em qualquer fase do ciclo)
        // Isso inclui 'disponivel', 'quebrado' e status nulos
        const caminhoesParados = totalCaminhoes - caminhoesAtivos;

        // Estatísticas de Frentes
        const totalFrentes = frentes_servico ? frentes_servico.length : 0;
        const frentesAtivas = frentes_servico ? frentes_servico.filter(f => f.status === 'ativa').length : 0;
        const frentesInativas = totalFrentes - frentesAtivas;

        // Estatísticas de Equipamentos
        const totalEquipamentos = equipamentos ? equipamentos.length : 0;
        const equipamentosAtivos = equipamentos ? equipamentos.filter(e => 
            e.status === 'ativo' || e.status === 'em_viagem'
        ).length : 0;
        const equipamentosParados = totalEquipamentos - equipamentosAtivos;

        // Estatísticas de Fazendas
        const totalFazendas = fazendas ? fazendas.length : 0;
        const fazendasColhendo = fazendas ? fazendas.filter(f => f.status === 'colhendo').length : 0;
        const fazendasDisponiveis = fazendas ? fazendas.filter(f => f.status === 'disponível').length : 0;

        // Atualizar elementos
        this.updateStatElement('caminhoes-ativos', caminhoesAtivos);
        this.updateStatElement('caminhoes-parados', caminhoesParados);
        this.updateStatElement('caminhoes-total', totalCaminhoes);

        this.updateStatElement('frentes-ativas', frentesAtivas);
        this.updateStatElement('frentes-inativas', frentesInativas);
        this.updateStatElement('frentes-total', totalFrentes);

        this.updateStatElement('equipamentos-ativos', equipamentosAtivos);
        this.updateStatElement('equipamentos-parados', equipamentosParados);
        this.updateStatElement('equipamentos-total', totalEquipamentos);

        this.updateStatElement('fazendas-colhendo', fazendasColhendo);
        this.updateStatElement('fazendas-disponiveis', fazendasDisponiveis);
        this.updateStatElement('fazendas-total', totalFazendas);

        // Calcular eficiência geral
        const totalAtivos = caminhoesAtivos + equipamentosAtivos;
        const totalRecursos = totalCaminhoes + totalEquipamentos;
        const eficiencia = totalRecursos > 0 ? Math.round((totalAtivos / totalRecursos) * 100) : 0;
        
        this.updateStatElement('eficiencia-geral', `${eficiencia}%`);
        this.updateEfficiencyBar(eficiencia);

        // Operações ativas
        const operacoesAtivas = caminhoesAtivos + equipamentosAtivos + fazendasColhendo;
        this.updateStatElement('operacoes-ativas', operacoesAtivas);
    }

    updateStatElement(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            if (typeof value === 'number') {
                this.animateCount(element, parseInt(element.textContent) || 0, value);
            } else {
                element.textContent = value;
            }
        }
    }

    animateCount(element, start, end) {
        const duration = 800;
        const startTime = performance.now();
        
        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const currentValue = Math.floor(start + (end - start) * easeOut);
            
            element.textContent = currentValue;
            
            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                element.textContent = end;
            }
        }
        
        requestAnimationFrame(update);
    }

    updateEfficiencyBar(percentage) {
        const bar = document.getElementById('eficiencia-bar');
        if (bar) {
            bar.style.width = `${percentage}%`;
            
            if (percentage >= 80) {
                bar.style.background = 'linear-gradient(90deg, #38A169, #2F855A)';
            } else if (percentage >= 60) {
                bar.style.background = 'linear-gradient(90deg, #D69E2E, #B7791F)';
            } else {
                bar.style.background = 'linear-gradient(90deg, #E53E3E, #C53030)';
            }
        }
    }

    updateLastUpdateTime() {
        const element = document.getElementById('last-update');
        if (element) {
            const now = new Date();
            element.textContent = `Atualizado: ${now.toLocaleTimeString('pt-BR')}`;
        }
    }

    updateMap() {
        const { fazendas } = this.data;
        if (fazendas && fazendas.length > 0) {
            // Mostrar todas as fazendas com cores diferentes por status
            mapManager.updateFazendaMarkersWithStatus(fazendas);
            
            // Ajustar o zoom para mostrar TODAS as fazendas que estão colhendo
            const fazendasColhendo = fazendas.filter(f => f.status === 'colhendo');
            if (fazendasColhendo.length > 0) {
                this.adjustMapToShowFazendas(fazendasColhendo);
            } else {
                // Se não há fazendas colhendo, mostrar todas as fazendas disponíveis
                const fazendasDisponiveis = fazendas.filter(f => f.status === 'disponível');
                if (fazendasDisponiveis.length > 0) {
                    this.adjustMapToShowFazendas(fazendasDisponiveis);
                } else {
                    // Mostrar todas as fazendas
                    this.adjustMapToShowFazendas(fazendas);
                }
            }
        }
    }

    adjustMapToShowFazendas(fazendas) {
        const map = mapManager.maps.get('dashboard-map');
        if (!map) return;

        const bounds = this.calculateBounds(fazendas);
        if (bounds.isValid()) {
            // Ajustar o zoom com padding para garantir que todos os marcadores sejam visíveis
            map.fitBounds(bounds, { 
                padding: [50, 50],
                maxZoom: 15 // Limitar o zoom máximo para não ficar muito próximo
            });
        }
    }

    calculateBounds(fazendas) {
        const bounds = L.latLngBounds();
        let hasValidCoords = false;
        
        fazendas.forEach(fazenda => {
            if (fazenda.latitude && fazenda.longitude) {
                bounds.extend([parseFloat(fazenda.latitude), parseFloat(fazenda.longitude)]);
                hasValidCoords = true;
            }
        });

        // Se não há coordenadas válidas, usar coordenadas padrão da usina
        if (!hasValidCoords) {
            bounds.extend(USINA_COORDS);
        }
        
        return bounds;
    }

    addEventListeners() {
        const refreshBtn = document.getElementById('refresh-operations');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadData();
                showToast('Operações atualizadas', 'success');
            });
        }
    }
}

// Coordenadas da usina (definir se não estiver definido)
const USINA_COORDS = [-17.642301, -40.181525];