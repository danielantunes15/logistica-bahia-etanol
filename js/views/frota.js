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
            patio: 'Pátio Externo',
            descarregando: 'Descarregando',
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
                                <th>Frente de Serviço</th>
                                <th>Proprietário</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            </tbody>
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
        const { caminhoes = [] } = this.data;

        tbody.innerHTML = caminhoes.map(caminhao => {
            const status = caminhao.status || 'disponivel';
            const frente = caminhao.frentes_servico;
            const fazenda = frente?.fazendas;

            return `
                <tr>
                    <td><strong>${caminhao.cod_equipamento}</strong></td>
                    <td><span class="caminhao-status-badge status-${status}">${this.statusLabels[status]}</span></td>
                    <td>${frente ? `${frente.nome} ${fazenda ? `(${fazenda.nome})` : ''}` : '---'}</td>
                    <td>${caminhao.proprietarios?.nome || 'N/A'}</td>
                    <td>${this.renderActionMenu(caminhao)}</td>
                </tr>
            `;
        }).join('');
    }

    renderActionMenu(caminhao) {
        const status = caminhao.status;
        let actions = '';

        if (status !== 'disponivel' && status !== 'quebrado') {
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
                    ${actions}
                </div>
            </div>
        `;
    }

    addEventListeners() {
        this.container.addEventListener('click', async (e) => {
            const target = e.target;
            
            // Lógica para abrir/fechar o menu de ações
            const actionMenuButton = target.closest('.action-menu-button');
            if (actionMenuButton) {
                const menu = actionMenuButton.closest('.action-menu');
                menu.classList.toggle('show');
                return; // Impede que outros listeners sejam acionados
            }

            // Fecha menus abertos se clicar fora
            if (!target.closest('.action-menu')) {
                document.querySelectorAll('.action-menu.show').forEach(menu => menu.classList.remove('show'));
            }
            
            // Botão de atualizar
            if (target.closest('#refresh-frota')) {
                this.loadData();
            }

            // Botão de mudança de status
            const statusChangeBtn = target.closest('.btn-status-change');
            if (statusChangeBtn) {
                const caminhaoId = statusChangeBtn.dataset.caminhaoId;
                const novoStatus = statusChangeBtn.dataset.novoStatus;
                
                showLoading();
                try {
                    // Ao mudar status aqui, a frente é sempre desassociada
                    await updateCaminhaoStatus(caminhaoId, novoStatus, null);
                    showToast('Status do caminhão atualizado!', 'success');
                    await this.loadData(); // Recarrega os dados da tabela
                } catch (error) {
                    handleOperation(error);
                } finally {
                    hideLoading();
                }
            }
        });
    }
}