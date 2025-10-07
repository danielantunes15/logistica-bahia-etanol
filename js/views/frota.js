// js/views/frota.js
import { fetchAllData, updateCaminhaoStatus } from '../api.js';
import { showToast, handleOperation, showLoading, hideLoading } from '../helpers.js';

export class FrotaView {
    constructor() {
        this.container = null;
        this.data = {};
        this.statusLabels = {
            disponivel: 'Disponível',
            indo_carregar: 'Sentido Carreg.',
            carregando: 'Carregando',
            retornando: 'Sentido Usina',
            patio_carregado: 'Pátio Carregado',
            descarregando: 'Descarregando',
            patio_vazio: 'Pátio Vazio',
            quebrado: 'Quebrado'
        };
    }

    async show() {
        await this.loadHTML();
        await this.loadData();
        this.addEventListeners();
    }

    async hide() {}

    async loadHTML() {
        const container = document.getElementById('views-container');
        container.innerHTML = `
            <div id="frota-view" class="view frota-view active-view">
                <div class="frota-header">
                    <h1>Gerenciamento de Frota</h1>
                    <button class="btn-primary" id="refresh-frota">
                        <i class="ph-fill ph-arrows-clockwise"></i>
                        Atualizar
                    </button>
                </div>
                <div class="frota-table-container">
                    <table class="data-table-modern" id="frota-table">
                        <thead>
                            <tr>
                                <th>Caminhão</th>
                                <th>Status</th>
                                <th>Frente de Serviço Atual</th>
                                <th>Proprietário</th>
                                <th style="text-align: center;">Ações</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
            </div>
        `;
        this.container = container.querySelector('#frota-view');
    }

    async loadData() {
        showLoading();
        try {
            this.data = await fetchAllData();
            this.renderTable();
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading();
        }
    }

    renderTable() {
        const tbody = this.container.querySelector('#frota-table tbody');
        const { caminhoes = [], frentes_servico = [] } = this.data;

        // Mapeia as frentes por ID para fácil acesso
        const frentesMap = new Map(frentes_servico.map(f => [f.id, f]));

        tbody.innerHTML = caminhoes.map(caminhao => {
            const status = caminhao.status || 'disponivel';
            const frente = caminhao.frente_id ? frentesMap.get(caminhao.frente_id) : null;
            const fazenda = frente?.fazendas;

            return `
                <tr>
                    <td><strong>${caminhao.cod_equipamento}</strong></td>
                    <td><span class="caminhao-status-badge status-${status}">${this.statusLabels[status] || 'Disponível'}</span></td>
                    <td>${frente ? `${frente.nome} ${fazenda ? `(${fazenda.nome})` : ''}` : '---'}</td>
                    <td>${caminhao.proprietarios?.nome || 'N/A'}</td>
                    <td style="text-align: center;">${this.renderActionMenu(caminhao)}</td>
                </tr>
            `;
        }).join('');
    }

    renderActionMenu(caminhao) {
        const status = caminhao.status;
        let actions = '';

        if (status && status !== 'disponivel' && status !== 'quebrado') {
            actions += `
                <button class="btn-status-change" data-caminhao-id="${caminhao.id}" data-novo-status="disponivel">
                    <i class="ph-fill ph-check-circle"></i> Finalizar Ciclo
                </button>`;
        }
        
        if (status !== 'quebrado') {
            actions += `
                <button class="btn-status-change btn-danger" data-caminhao-id="${caminhao.id}" data-novo-status="quebrado">
                    <i class="ph-fill ph-x-circle"></i> Registrar Quebra
                </button>`;
        }

        if (status === 'quebrado') {
            actions += `
                <button class="btn-status-change" data-caminhao-id="${caminhao.id}" data-novo-status="disponivel">
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

    addEventListeners() {
        this.container.addEventListener('click', async (e) => {
            const target = e.target;
            
            const actionMenuButton = target.closest('.action-menu-button');
            if (actionMenuButton) {
                const menu = actionMenuButton.closest('.action-menu');
                // Fecha outros menus antes de abrir o novo
                document.querySelectorAll('.action-menu.show').forEach(m => {
                    if (m !== menu) m.classList.remove('show');
                });
                menu.classList.toggle('show');
                return;
            }

            if (!target.closest('.action-menu')) {
                document.querySelectorAll('.action-menu.show').forEach(menu => menu.classList.remove('show'));
            }
            
            if (target.closest('#refresh-frota')) {
                this.loadData();
            }

            const statusChangeBtn = target.closest('.btn-status-change');
            if (statusChangeBtn) {
                const caminhaoId = statusChangeBtn.dataset.caminhaoId;
                const novoStatus = statusChangeBtn.dataset.novoStatus;
                
                showLoading();
                try {
                    await updateCaminhaoStatus(caminhaoId, novoStatus, null); // Sempre desassocia a frente aqui
                    showToast('Status do caminhão atualizado!', 'success');
                    await this.loadData();
                } catch (error) {
                    handleOperation(error);
                } finally {
                    hideLoading();
                }
            }
        });
    }
}