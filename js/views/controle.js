// js/views/controle.js
import { fetchAllData } from '../api.js';
import { showToast } from '../helpers.js';

export class ControleView {
    constructor() {
        this.container = null;
        this.data = {};
    }

    async show() {
        await this.loadHTML();
        await this.loadData();
        this.addEventListeners();
    }

    async hide() {
        // Limpar recursos
    }

    async loadHTML() {
        const container = document.getElementById('views-container');
        container.innerHTML = this.getHTML();
        this.container = container;
    }

    getHTML() {
        return `
            <div id="controle-view" class="view">
                <div class="controle-header">
                    <h1>Painel de Controle - Frentes de Colheita</h1>
                    <div class="controle-actions">
                        <button class="btn-primary" id="refresh-controle">
                            <i class="ph-fill ph-arrows-clockwise"></i>
                            Atualizar Dados
                        </button>
                        <button class="btn-secondary" id="export-controle">
                            <i class="ph-fill ph-file-pdf"></i>
                            Exportar Relatório
                        </button>
                    </div>
                </div>

                <div class="frentes-container">
                    <div class="frentes-grid" id="frentes-grid">
                        <!-- Frentes serão carregadas aqui -->
                    </div>
                    
                    <div class="controle-sidebar">
                        <div class="controle-card">
                            <h3>Resumo das Operações</h3>
                            <div class="resumo-stats" id="resumo-stats">
                                <!-- Estatísticas serão carregadas aqui -->
                            </div>
                        </div>
                        
                        <div class="controle-card">
                            <h3>Fazendas Ativas</h3>
                            <div class="fazendas-ativas" id="fazendas-ativas">
                                <!-- Fazendas ativas serão carregadas aqui -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async loadData() {
        try {
            this.data = await fetchAllData();
            this.renderFrentes();
            this.renderResumo();
            this.renderFazendasAtivas();
        } catch (error) {
            console.error('Erro ao carregar dados do controle:', error);
            showToast('Erro ao carregar dados do painel de controle', 'error');
        }
    }

    renderFrentes() {
        const container = document.getElementById('frentes-grid');
        if (!container) return;

        const { frentes, equipamentos, fazendas } = this.data;
        
        if (!frentes || frentes.length === 0) {
            container.innerHTML = '<div class="no-frentes"><p>Nenhuma frente de serviço cadastrada</p></div>';
            return;
        }

        const frentesHTML = frentes.map(frente => {
            // Equipamentos desta frente
            const equipamentosFrente = (equipamentos || []).filter(e => 
                e.frente_id === frente.id && e.status === 'ativo'
            );
            
            // Fazendas associadas (via equipamentos)
            const fazendasFrente = this.getFazendasDaFrente(frente.id, equipamentosFrente, fazendas);

            return `
                <div class="frente-card ${frente.status === 'ativa' ? 'active' : 'inactive'}">
                    <div class="frente-header">
                        <h3>${frente.nome}</h3>
                        <span class="frente-status ${frente.status}">${frente.status}</span>
                    </div>
                    
                    <div class="frente-info">
                        <div class="info-item">
                            <i class="ph-fill ph-tractor"></i>
                            <span>${equipamentosFrente.length} equipamentos</span>
                        </div>
                        <div class="info-item">
                            <i class="ph-fill ph-tree-evergreen"></i>
                            <span>${fazendasFrente.length} fazendas</span>
                        </div>
                    </div>

                    <div class="frente-equipamentos">
                        <h4>Equipamentos Ativos</h4>
                        ${equipamentosFrente.length > 0 ? 
                            equipamentosFrente.map(equip => `
                                <div class="equipamento-item">
                                    <span class="equip-codigo">${equip.cod_equipamento}</span>
                                    <span class="equip-tipo">${equip.finalidade}</span>
                                    <span class="equip-status ${equip.status}">${equip.status}</span>
                                </div>
                            `).join('') :
                            '<p class="no-equipamentos">Nenhum equipamento ativo</p>'
                        }
                    </div>

                    <div class="frente-fazendas">
                        <h4>Fazendas em Operação</h4>
                        ${fazendasFrente.length > 0 ? 
                            fazendasFrente.map(fazenda => `
                                <div class="fazenda-item">
                                    <span class="fazenda-nome">${fazenda.nome}</span>
                                    <span class="fazenda-status ${fazenda.status}">${fazenda.status}</span>
                                </div>
                            `).join('') :
                            '<p class="no-fazendas">Nenhuma fazenda em operação</p>'
                        }
                    </div>

                    <div class="frente-actions">
                        <button class="btn-small btn-primary" data-frente="${frente.id}">
                            <i class="ph-fill ph-play"></i>
                            Iniciar Operação
                        </button>
                        <button class="btn-small btn-secondary" data-frente="${frente.id}">
                            <i class="ph-fill ph-chart-line"></i>
                            Detalhes
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = frentesHTML;
    }

    getFazendasDaFrente(frenteId, equipamentosFrente, fazendas) {
        if (!fazendas || !equipamentosFrente) return [];
        
        // Para simplificar, retornar fazendas que estão colhendo
        return fazendas.filter(fazenda => 
            fazenda.status === 'colhendo'
        ).slice(0, 3); // Limitar a 3 fazendas por frente para demonstração
    }

    renderResumo() {
        const container = document.getElementById('resumo-stats');
        if (!container) return;

        const { frentes, equipamentos, caminhoes, fazendas } = this.data;
        
        const stats = {
            frentesAtivas: (frentes || []).filter(f => f.status === 'ativa').length,
            totalFrentes: (frentes || []).length,
            equipamentosAtivos: (equipamentos || []).filter(e => e.status === 'ativo').length,
            caminhoesAtivos: (caminhoes || []).filter(c => c.status === 'ativo').length,
            fazendasColhendo: (fazendas || []).filter(f => f.status === 'colhendo').length
        };

        container.innerHTML = `
            <div class="stat-item">
                <div class="stat-value">${stats.frentesAtivas}/${stats.totalFrentes}</div>
                <div class="stat-label">Frentes Ativas</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${stats.equipamentosAtivos}</div>
                <div class="stat-label">Equipamentos</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${stats.caminhoesAtivos}</div>
                <div class="stat-label">Caminhões</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${stats.fazendasColhendo}</div>
                <div class="stat-label">Fazendas Colhendo</div>
            </div>
        `;
    }

    renderFazendasAtivas() {
        const container = document.getElementById('fazendas-ativas');
        if (!container) return;

        const { fazendas } = this.data;
        const fazendasAtivas = (fazendas || []).filter(f => f.status === 'colhendo');

        if (fazendasAtivas.length === 0) {
            container.innerHTML = '<p class="no-fazendas">Nenhuma fazenda ativa</p>';
            return;
        }

        const fazendasHTML = fazendasAtivas.map(fazenda => `
            <div class="fazenda-ativa-item">
                <div class="fazenda-info">
                    <strong>${fazenda.nome}</strong>
                    <span>${fazenda.hectares || 'N/A'} hectares</span>
                    <small>${fazenda.fornecedores?.nome || 'N/A'}</small>
                </div>
                <div class="fazenda-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${Math.random() * 100}%"></div>
                    </div>
                    <span class="progress-text">${Math.floor(Math.random() * 100)}%</span>
                </div>
            </div>
        `).join('');

        container.innerHTML = fazendasHTML;
    }

    addEventListeners() {
        // Botão de atualizar
        const refreshBtn = document.getElementById('refresh-controle');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadData();
                showToast('Dados do painel atualizados', 'success');
            });
        }

        // Botão de exportar
        const exportBtn = document.getElementById('export-controle');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                showToast('Relatório exportado com sucesso', 'success');
            });
        }

        // Ações das frentes
        this.container.addEventListener('click', (e) => {
            if (e.target.closest('[data-frente]')) {
                const button = e.target.closest('[data-frente]');
                const frenteId = button.dataset.frente;
                this.handleFrenteAction(frenteId, button.textContent.trim());
            }
        });
    }

    handleFrenteAction(frenteId, action) {
        const frente = (this.data.frentes || []).find(f => f.id == frenteId);
        if (!frente) return;

        switch(action) {
            case 'Iniciar Operação':
                showToast(`Operação iniciada na frente ${frente.nome}`, 'success');
                break;
            case 'Detalhes':
                showToast(`Mostrando detalhes da frente ${frente.nome}`, 'info');
                break;
        }
    }
}