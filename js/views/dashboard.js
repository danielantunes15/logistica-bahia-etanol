// js/views/dashboard.js
import { mapManager } from '../maps.js';
import { fetchAllData } from '../api.js';
import { showToast } from '../helpers.js';

export class DashboardView {
    constructor() {
        this.container = null;
        this.data = {};
        this.selectedFazendas = new Set();
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
                    <h1>Mapa de Operações - LOGISTICA BEL</h1>
                    <div class="dashboard-actions">
                        <button class="btn-primary" id="refresh-operations">
                            <i class="ph-fill ph-arrows-clockwise"></i>
                            Atualizar Operações
                        </button>
                        <button class="btn-secondary" id="toggle-fazendas">
                            <i class="ph-fill ph-tree-evergreen"></i>
                            Gerenciar Fazendas
                        </button>
                    </div>
                </div>

                <div class="map-fullscreen">
                    <div id="dashboard-map"></div>
                    
                    <!-- Painel Moderno Centralizado -->
                    <div class="modern-dashboard-panel">
                        <div class="panel-header">
                            <h3>Status das Operações</h3>
                            <div class="last-update" id="last-update">
                                Atualizado agora
                            </div>
                        </div>
                        
                        <div class="stats-grid">
                            <!-- Caminhões -->
                            <div class="stat-card">
                                <div class="stat-icon">
                                    <i class="ph-fill ph-truck"></i>
                                </div>
                                <div class="stat-content">
                                    <div class="stat-main">
                                        <span class="stat-value" id="caminhoes-ativos">0</span>
                                        <span class="stat-label">Ativos</span>
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

                            <!-- Frentes -->
                            <div class="stat-card">
                                <div class="stat-icon">
                                    <i class="ph-fill ph-users-three"></i>
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

                            <!-- Equipamentos -->
                            <div class="stat-card">
                                <div class="stat-icon">
                                    <i class="ph-fill ph-tractor"></i>
                                </div>
                                <div class="stat-content">
                                    <div class="stat-main">
                                        <span class="stat-value" id="equipamentos-ativos">0</span>
                                        <span class="stat-label">Ativos</span>
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

                            <!-- Fazendas -->
                            <div class="stat-card">
                                <div class="stat-icon">
                                    <i class="ph-fill ph-tree-evergreen"></i>
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

                    <div class="map-overlay">
                        <div class="operations-panel">
                            <h3>Operações Ativas</h3>
                            <div id="active-operations">
                                <p>Carregando operações...</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Modal de Seleção de Fazendas -->
                <div id="fazendas-modal" class="modal-overlay">
                    <div class="modal-content large">
                        <div class="modal-header">
                            <h2>Selecionar Fazendas para Monitoramento</h2>
                            <button class="close-btn" id="close-fazendas-modal">
                                <i class="ph-fill ph-x"></i>
                            </button>
                        </div>
                        <div class="modal-body">
                            <div class="fazendas-list" id="fazendas-list">
                                <!-- Lista de fazendas será carregada aqui -->
                            </div>
                            <div class="modal-actions">
                                <button class="btn-primary" id="confirm-fazendas">
                                    <i class="ph-fill ph-check"></i>
                                    Confirmar Seleção
                                </button>
                                <button class="btn-secondary" id="cancel-fazendas">
                                    Cancelar
                                </button>
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
        try {
            this.data = await fetchAllData();
            this.updateDashboardStats();
            this.updateMap();
            this.updateActiveOperations();
            this.updateLastUpdateTime();
        } catch (error) {
            console.error('Erro ao carregar dados do dashboard:', error);
            showToast('Erro ao carregar dados do dashboard', 'error');
        }
    }

    updateDashboardStats() {
        const { caminhoes, frentes, equipamentos, fazendas } = this.data;

        // Estatísticas de Caminhões
        const totalCaminhoes = caminhoes ? caminhoes.length : 0;
        const caminhoesAtivos = caminhoes ? caminhoes.filter(c => 
            c.status === 'ativo' || c.status === 'em_viagem'
        ).length : 0;
        const caminhoesParados = totalCaminhoes - caminhoesAtivos;

        // Estatísticas de Frentes
        const totalFrentes = frentes ? frentes.length : 0;
        const frentesAtivas = frentes ? frentes.filter(f => f.status === 'ativa').length : 0;
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
            // Animação de contagem se for número
            if (typeof value === 'number') {
                this.animateCount(element, parseInt(element.textContent) || 0, value);
            } else {
                element.textContent = value;
            }
        }
    }

    animateCount(element, start, end) {
        const duration = 1000; // 1 segundo
        const startTime = performance.now();
        
        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Easing function para animação suave
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
            
            // Cor baseada na eficiência
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
            element.textContent = `Atualizado ${now.toLocaleTimeString('pt-BR')}`;
        }
    }

    updateMap() {
        const { fazendas } = this.data;
        if (fazendas && fazendas.length > 0) {
            const fazendasColhendo = fazendas.filter(f => f.status === 'colhendo');
            mapManager.updateFazendaMarkers(fazendasColhendo);
            
            if (fazendasColhendo.length > 0) {
                const bounds = this.calculateBounds(fazendasColhendo);
                const map = mapManager.maps.get('dashboard-map');
                if (map && bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [20, 20] });
                }
            }
        }
    }

    calculateBounds(fazendas) {
        const bounds = L.latLngBounds();
        fazendas.forEach(fazenda => {
            if (fazenda.latitude && fazenda.longitude) {
                bounds.extend([parseFloat(fazenda.latitude), parseFloat(fazenda.longitude)]);
            }
        });
        return bounds;
    }

    updateActiveOperations() {
        const container = document.getElementById('active-operations');
        if (!container) return;

        const { fazendas, caminhoes, equipamentos } = this.data;
        
        const activeItems = [];
        
        // Fazendas colhendo
        const fazendasColhendo = (fazendas || []).filter(f => f.status === 'colhendo');
        if (fazendasColhendo.length > 0) {
            activeItems.push(`
                <div class="operation-category">
                    <h4><i class="ph-fill ph-tree-evergreen"></i> Fazendas Colhendo</h4>
                    ${fazendasColhendo.map(fazenda => `
                        <div class="operation-item">
                            <div class="operation-info">
                                <strong>${fazenda.nome}</strong>
                                <span>${fazenda.hectares || 'N/A'} hectares</span>
                                <small>Fornecedor: ${fazenda.fornecedores?.nome || 'N/A'}</small>
                            </div>
                            <div class="operation-status active"></div>
                        </div>
                    `).join('')}
                </div>
            `);
        }

        // Caminhões ativos
        const caminhoesAtivos = (caminhoes || []).filter(c => 
            c.status === 'ativo' || c.status === 'em_viagem'
        );
        if (caminhoesAtivos.length > 0) {
            activeItems.push(`
                <div class="operation-category">
                    <h4><i class="ph-fill ph-truck"></i> Caminhões Ativos</h4>
                    ${caminhoesAtivos.map(caminhao => `
                        <div class="operation-item">
                            <div class="operation-info">
                                <strong>${caminhao.cod_equipamento}</strong>
                                <span>${caminhao.placa} - ${caminhao.status}</span>
                                <small>${caminhao.proprietarios?.nome || 'N/A'}</small>
                            </div>
                            <div class="operation-status ${caminhao.status === 'em_viagem' ? 'warning' : 'active'}"></div>
                        </div>
                    `).join('')}
                </div>
            `);
        }

        // Equipamentos ativos
        const equipamentosAtivos = (equipamentos || []).filter(e => 
            e.status === 'ativo' || e.status === 'em_viagem'
        );
        if (equipamentosAtivos.length > 0) {
            activeItems.push(`
                <div class="operation-category">
                    <h4><i class="ph-fill ph-tractor"></i> Equipamentos Ativos</h4>
                    ${equipamentosAtivos.map(equipamento => `
                        <div class="operation-item">
                            <div class="operation-info">
                                <strong>${equipamento.cod_equipamento}</strong>
                                <span>${equipamento.finalidade} - ${equipamento.status}</span>
                                <small>Frente: ${equipamento.frentes_servico?.nome || 'N/A'}</small>
                            </div>
                            <div class="operation-status ${equipamento.status === 'em_viagem' ? 'warning' : 'active'}"></div>
                        </div>
                    `).join('')}
                </div>
            `);
        }

        container.innerHTML = activeItems.length > 0 ? 
            activeItems.join('') : 
            '<div class="no-operations"><p>Nenhuma operação ativa no momento</p></div>';
    }

    showFazendasModal() {
        const modal = document.getElementById('fazendas-modal');
        const fazendasList = document.getElementById('fazendas-list');
        
        if (!modal || !fazendasList) return;

        const { fazendas } = this.data;
        
        if (fazendas && fazendas.length > 0) {
            fazendasList.innerHTML = fazendas.map(fazenda => `
                <div class="fazenda-item">
                    <label class="checkbox-label">
                        <input type="checkbox" value="${fazenda.id}" 
                               ${this.selectedFazendas.has(fazenda.id) ? 'checked' : ''}
                               ${fazenda.status === 'colhendo' ? 'checked' : ''}>
                        <span class="checkmark"></span>
                        <div class="fazenda-info">
                            <strong>${fazenda.nome}</strong>
                            <span>${fazenda.hectares || 'N/A'} hectares - ${fazenda.status}</span>
                            <small>${fazenda.fornecedores?.nome || 'N/A'}</small>
                        </div>
                    </label>
                </div>
            `).join('');
        } else {
            fazendasList.innerHTML = '<p>Nenhuma fazenda cadastrada</p>';
        }

        modal.classList.add('active');
    }

    confirmFazendasSelection() {
        const checkboxes = document.querySelectorAll('#fazendas-list input[type="checkbox"]');
        this.selectedFazendas.clear();
        
        checkboxes.forEach(checkbox => {
            if (checkbox.checked) {
                this.selectedFazendas.add(checkbox.value);
            }
        });

        this.closeFazendasModal();
        this.updateMapWithSelectedFazendas();
        showToast('Fazendas selecionadas para monitoramento', 'success');
    }

    updateMapWithSelectedFazendas() {
        const { fazendas } = this.data;
        if (!fazendas) return;

        const fazendasParaMostrar = fazendas.filter(fazenda => 
            this.selectedFazendas.has(fazenda.id.toString())
        );

        mapManager.updateFazendaMarkers(fazendasParaMostrar);
        
        if (fazendasParaMostrar.length > 0) {
            const bounds = this.calculateBounds(fazendasParaMostrar);
            const map = mapManager.maps.get('dashboard-map');
            if (map && bounds.isValid()) {
                map.fitBounds(bounds, { padding: [20, 20] });
            }
        }
    }

    closeFazendasModal() {
        const modal = document.getElementById('fazendas-modal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    addEventListeners() {
        const refreshBtn = document.getElementById('refresh-operations');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadData();
                showToast('Operações atualizadas', 'success');
            });
        }

        const toggleFazendasBtn = document.getElementById('toggle-fazendas');
        if (toggleFazendasBtn) {
            toggleFazendasBtn.addEventListener('click', () => {
                this.showFazendasModal();
            });
        }

        const closeModalBtn = document.getElementById('close-fazendas-modal');
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => {
                this.closeFazendasModal();
            });
        }

        const confirmFazendasBtn = document.getElementById('confirm-fazendas');
        if (confirmFazendasBtn) {
            confirmFazendasBtn.addEventListener('click', () => {
                this.confirmFazendasSelection();
            });
        }

        const cancelFazendasBtn = document.getElementById('cancel-fazendas');
        if (cancelFazendasBtn) {
            cancelFazendasBtn.addEventListener('click', () => {
                this.closeFazendasModal();
            });
        }

        const fazendasModal = document.getElementById('fazendas-modal');
        if (fazendasModal) {
            fazendasModal.addEventListener('click', (e) => {
                if (e.target === fazendasModal) {
                    this.closeFazendasModal();
                }
            });
        }
    }
}