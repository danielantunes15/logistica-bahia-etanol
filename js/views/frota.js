// js/views/frota.js
import { fetchAllData, updateCaminhaoStatus } from '../api.js';
import { showToast, handleOperation, showLoading, hideLoading } from '../helpers.js';
import { openModal, closeModal } from '../components/modal.js'; // NOVO: Importa modal
// NOVO: Importa dataCache
import { dataCache } from '../dataCache.js';
// MODIFICADO: Importa constantes
import { CAMINHAO_STATUS_LABELS, CAMINHAO_STATUS_CYCLE } from '../constants.js';

export class FrotaView {
    constructor() {
        this.container = null;
        this.data = {};
        this.statusLabels = CAMINHAO_STATUS_LABELS;
        // Armazenar referência do manipulador para remover corretamente
        this._boundClickHandler = null;
    }

    async show() {
        await this.loadHTML();
        await this.loadData();
        this.addEventListeners();
    }

    async hide() {
        // Remove o manipulador global ao sair da view
        if (this.container && this._boundClickHandler) {
            this.container.removeEventListener('click', this._boundClickHandler);
        }
        // Remove o manipulador de clique no documento para fechar menus
        document.removeEventListener('click', this.globalMenuCloser);
    }

    async loadHTML() {
        const totalCaminhoes = this.data.caminhoes ? this.data.caminhoes.length : 0;
        const container = document.getElementById('views-container');
        container.innerHTML = `
            <div id="frota-view" class="view frota-view active-view">
                <div class="frota-header">
                    <h1>Gerenciamento de Frota</h1>
                    <div style="display: flex; gap: 20px; align-items: center;">
                        <span class="frota-total-display" id="frota-total-display">Total de Caminhões: ${totalCaminhoes}</span>
                        <button class="btn-primary" id="refresh-frota">
                            <i class="ph-fill ph-arrows-clockwise"></i>
                            Atualizar
                        </button>
                    </div>
                </div>
                <div id="frota-owner-tables-container" class="frota-table-container">
                    <div class="empty-state">Carregando dados...</div>
                </div>
                </div>
        `;
        this.container = container.querySelector('#frota-view');
    }

    async loadData(forceRefresh = false) {
        showLoading();
        try {
            this.data = await dataCache.fetchAllData(forceRefresh); // USANDO CACHE AQUI
            this.renderTable();
            // Atualiza o total no cabeçalho
            const totalCaminhoes = this.data.caminhoes ? this.data.caminhoes.length : 0;
            const totalDisplay = document.getElementById('frota-total-display');
            if (totalDisplay) {
                totalDisplay.textContent = `Total de Caminhões: ${totalCaminhoes}`;
            }
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading();
        }
    }

    renderTable() {
        // Altera o seletor para o novo container
        const tableContainer = this.container.querySelector('#frota-owner-tables-container');
        if (!tableContainer) return;
        
        const { caminhoes = [], frentes_servico = [] } = this.data;

        // Mapeia as frentes por ID para fácil acesso
        const frentesMap = new Map(frentes_servico.map(f => [f.id, f]));
        
        // 1. Agrupar caminhões por Proprietário
        const trucksByOwner = new Map();
        
        caminhoes.forEach(caminhao => {
            // Usa o nome do proprietário para o agrupamento
            const ownerName = caminhao.proprietarios?.nome || 'Proprietário Não Informado';
            
            // Adiciona o caminhão ao seu grupo
            if (!trucksByOwner.has(ownerName)) {
                trucksByOwner.set(ownerName, []);
            }
            trucksByOwner.get(ownerName).push(caminhao);
        });

        if (caminhoes.length === 0) {
            tableContainer.innerHTML = `<div class="empty-state"><i class="ph-fill ph-truck"></i><p>Nenhum caminhão cadastrado.</p></div>`;
            return;
        }

        // 2. Ordenar os Proprietários alfabeticamente
        const sortedOwnerNames = Array.from(trucksByOwner.keys()).sort((a, b) => a.localeCompare(b));
        
        let allTablesHTML = '';

        // 3. Gerar HTML para cada grupo (Proprietário)
        sortedOwnerNames.forEach(ownerName => {
            const ownerTrucks = trucksByOwner.get(ownerName);
            
            // Ordena os caminhões dentro do grupo por código (numérico)
            ownerTrucks.sort((a, b) => {
                 const codA = parseInt(a.cod_equipamento, 10) || Infinity;
                 const codB = parseInt(b.cod_equipamento, 10) || Infinity;
                 return codA - codB;
            });

            const tbodyHTML = ownerTrucks.map(caminhao => {
                const status = caminhao.status || 'disponivel';
                const frente = caminhao.frente_id ? frentesMap.get(caminhao.frente_id) : null;
                const fazenda = frente?.fazendas;

                // NOVO: Lógica do Ciclo
                const cycleIndex = CAMINHAO_STATUS_CYCLE.indexOf(status);
                const isCycleActive = cycleIndex !== -1;
                const totalSteps = CAMINHAO_STATUS_CYCLE.length;
                const currentStep = isCycleActive ? cycleIndex + 1 : 0;
                const progressPercentage = isCycleActive ? ((currentStep / totalSteps) * 100).toFixed(0) : 0;
                
                // MODIFICADO: HTML do Progresso
                const progressHTML = `
                    <div class="cycle-progress-wrapper">
                        <div class="cycle-progress-bar">
                            <div class="progress-fill status-${status}" style="width: ${progressPercentage}%;"></div>
                        </div>
                        <span class="progress-percentage">${progressPercentage}%</span>
                    </div>
                `;
                
                // NOVO RÓTULO DA ETAPA (SEMPRE VISÍVEL ABAIXO DO CÓDIGO)
                const stageNameHTML = `<span class="cycle-stage-name">${this.statusLabels[status]}</span>`;

                return `
                    <tr>
                        <td>
                            <strong>${caminhao.cod_equipamento}</strong>
                            <div class="cycle-status-info">
                                ${stageNameHTML}
                                ${isCycleActive ? progressHTML : `<span class="caminhao-status-badge status-${status} non-cycle-status">${this.statusLabels[status]}</span>`}
                            </div>
                        </td>
                        <td>${frente ? `${frente.nome} ${fazenda ? `(${fazenda.nome})` : ''}` : '---'}</td>
                        <td style="text-align: center;">${this.renderActionMenu(caminhao)}</td>
                    </tr>
                `;
            }).join('');
            
            // Estrutura do novo grupo
            const tableHTML = `
                <div class="owner-frota-group">
                    <h2 class="owner-frota-title">${ownerName} (${ownerTrucks.length} Caminh${ownerTrucks.length === 1 ? 'ão' : 'ões'})</h2>
                    <div class="table-wrapper" style="overflow-x: auto;">
                        <table class="data-table-modern frota-owner-table">
                            <thead>
                                <tr>
                                    <th style="width: 300px;">Caminhão / Etapa do Ciclo</th>
                                    <th>Frente de Serviço Atual</th>
                                    <th style="width: 150px; text-align: center;">Ações</th>
                                </tr>
                            </thead>
                            <tbody>${tbodyHTML}</tbody>
                        </table>
                    </div>
                </div>
            `;
            allTablesHTML += tableHTML;
        });

        tableContainer.innerHTML = allTablesHTML;
    }

    // Lógica do menu de ações refatorada
    renderActionMenu(caminhao) {
        const status = caminhao.status;
        let actions = '';
        const cycleStatus = ['indo_carregar', 'carregando', 'retornando', 'patio_carregado', 'descarregando', 'patio_vazio'];

        // Ação 1: Finalizar Ciclo (se estiver em operação/ciclo)
        if (cycleStatus.includes(status)) {
            actions += `
                <button class="btn-status-change" data-caminhao-id="${caminhao.id}" data-novo-status="disponivel">
                    <i class="ph-fill ph-check-circle"></i> Finalizar Ciclo
                </button>`;
        }
        
        // Ação 2: Registrar Parada/Quebra (se não estiver já inativo)
        if (!['quebrado', 'parado'].includes(status)) {
             actions += `
                <button class="btn-status-action btn-danger" data-caminhao-id="${caminhao.id}" data-action="downtime">
                    <i class="ph-fill ph-x-circle"></i> Registrar Parada/Quebra
                </button>`;
        }

        // Ação 3: Marcar como Disponível/Ativo (se estiver quebrado/parado)
        if (['quebrado', 'parado'].includes(status)) {
            actions += `
                <button class="btn-status-action" data-caminhao-id="${caminhao.id}" data-action="makeAvailable">
                    <i class="ph-fill ph-wrench"></i> Marcar como Disponível
                </button>`;
        }

        return `
            <div class="action-menu">
                <button class="action-menu-button">Ações</button>
                <div class="action-menu-content">
                    ${actions || '<span style="padding: 12px; font-size: 0.8rem; color: var(--text-secondary);">Nenhuma ação</span>'}
                </div>
            </div>
        `;
    }
    
    // NOVO: Função para fechar todos os menus
    globalMenuCloser = (e) => {
        // Encontra o botão de menu de ação clicado, se houver
        const clickedActionMenu = e.target.closest('.action-menu');
        
        // Fecha todos os menus que estão abertos E que não são o menu clicado
        this.container.querySelectorAll('.action-menu.show').forEach(menu => {
            if (menu !== clickedActionMenu) {
                 menu.classList.remove('show');
            }
        });
    }

    // NOVO: Modal para Parada/Quebra com Motivo
    showDowntimeModal(caminhaoId) {
        const caminhao = this.data.caminhoes.find(c => c.id == caminhaoId);
        if (!caminhao) return;

        const modalContent = `
            <p>Registrar Inatividade para: <strong>${caminhao.cod_equipamento}</strong></p>
            <form id="downtime-form" class="action-modal-form">
                <div class="form-group">
                    <label>Status</label>
                    <select name="status" class="form-select" required>
                        <option value="parado">${this.statusLabels['parado']}</option>
                        <option value="quebrado">${this.statusLabels['quebrado']}</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Motivo da Parada / Quebra</label>
                    <input type="text" name="motivo" class="form-input" required placeholder="Ex: Manutenção, Esperando Peça, Observação">
                </div>
                <button type="submit" class="btn-primary">Registrar</button>
            </form>
        `;
        openModal('Registrar Parada ou Quebra', modalContent);

        document.getElementById('downtime-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const novoStatus = e.target.status.value;
            const motivo = e.target.motivo.value;
            
            // Fecha o menu de ações antes de iniciar a operação (se ainda estiver aberto)
            e.target.closest('.action-menu.show')?.classList.remove('show');

            this.handleStatusUpdate(caminhao.id, novoStatus, motivo);
        });
    }

    // Lógica unificada de atualização de status
    async handleStatusUpdate(caminhaoId, novoStatus, motivoParada = null) {
        showLoading();
        const successMessage = novoStatus === 'disponivel' ? 
            'Status do caminhão atualizado para Disponível!' : 
            `Status do caminhão atualizado para ${this.statusLabels[novoStatus]}!`;
            
        try {
            // Note: A API já trata frente_id = null para 'disponivel', 'quebrado', 'parado'.
            await updateCaminhaoStatus(caminhaoId, novoStatus, null, motivoParada); 
            
            // Invalida o Cache (NOVO)
            dataCache.invalidateAllData();
            
            showToast(successMessage, 'success');
            closeModal(); // Fecha o modal se estiver aberto
            await this.loadData(true); // Força refresh após escrita
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading();
        }
    }


    addEventListeners() {
        // Remove listeners antigos antes de adicionar novos
        if (this.container && this._boundClickHandler) {
            this.container.removeEventListener('click', this._boundClickHandler);
        }
        // Adiciona o manipulador de clique global para fechar menus
        document.addEventListener('click', this.globalMenuCloser); 
        
        // Cria um manipulador de eventos único e armazena a referência
        this._boundClickHandler = async (e) => {
            const target = e.target;
            
            const actionMenuButton = target.closest('.action-menu-button');
            if (actionMenuButton) {
                const menu = actionMenuButton.closest('.action-menu');
                // Abre/Fecha o menu clicado
                menu.classList.toggle('show');
                return;
            }
            
            if (target.closest('#refresh-frota')) {
                this.loadData(true); // Força refresh
                return;
            }

            // Ação Simples: Finalizar Ciclo (data-novo-status="disponivel")
            const simpleStatusBtn = target.closest('.btn-status-change');
            if (simpleStatusBtn) {
                const caminhaoId = simpleStatusBtn.dataset.caminhaoId;
                simpleStatusBtn.closest('.action-menu.show')?.classList.remove('show');
                this.handleStatusUpdate(caminhaoId, 'disponivel');
                return;
            }
            
            // Ações Complexas: Registrar Parada/Quebra ou Marcar como Disponível
            const complexActionBtn = target.closest('.btn-status-action');
            if (complexActionBtn) {
                const caminhaoId = complexActionBtn.dataset.caminhaoId;
                const actionType = complexActionBtn.dataset.action;
                
                complexActionBtn.closest('.action-menu.show')?.classList.remove('show');

                if (actionType === 'downtime') {
                    // Abre o modal para escolher Parado/Quebrado e Motivo
                    this.showDowntimeModal(caminhaoId);
                } else if (actionType === 'makeAvailable') {
                    // Marcar como Disponível (Fim de Parada/Quebra)
                    this.handleStatusUpdate(caminhaoId, 'disponivel');
                }
            }
        };

        // Adiciona o listener ao container
        if (this.container) {
            this.container.addEventListener('click', this._boundClickHandler);
        }
    }
}