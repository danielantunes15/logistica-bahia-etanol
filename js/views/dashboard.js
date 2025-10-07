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
        // Aguardar um pouco para o container ser renderizado
        setTimeout(() => {
            const map = mapManager.initDashboardMap();
            if (map) {
                console.log('Mapa principal inicializado com sucesso');
                // Ajustar o mapa para ocupar toda a área
                mapManager.invalidateSize('dashboard-map');
            }
        }, 100);
    }

    async loadData() {
        try {
            this.data = await fetchAllData();
            this.updateMap();
            this.updateActiveOperations();
        } catch (error) {
            console.error('Erro ao carregar dados do dashboard:', error);
            showToast('Erro ao carregar dados do dashboard', 'error');
        }
    }

    updateMap() {
        const { fazendas } = this.data;
        if (fazendas && fazendas.length > 0) {
            // Mostrar apenas fazendas que estão colhendo
            const fazendasColhendo = fazendas.filter(f => f.status === 'colhendo');
            mapManager.updateFazendaMarkers(fazendasColhendo);
            
            // Ajustar view do mapa para mostrar todas as fazendas ativas
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
        
        // Ajustar view do mapa
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
        // Botão de atualizar
        const refreshBtn = document.getElementById('refresh-operations');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadData();
                showToast('Operações atualizadas', 'success');
            });
        }

        // Botão de gerenciar fazendas
        const toggleFazendasBtn = document.getElementById('toggle-fazendas');
        if (toggleFazendasBtn) {
            toggleFazendasBtn.addEventListener('click', () => {
                this.showFazendasModal();
            });
        }

        // Modal de fazendas
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

        // Fechar modal clicando fora
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