// js/views/controle.js
import { fetchAllData, updateCaminhaoStatus } from '../api.js';
import { showToast, handleOperation, showLoading, hideLoading } from '../helpers.js';

export class ControleView {
    constructor() {
        this.container = null;
        this.data = {};
        this.statusOrder = [
            'disponivel', 
            'indo_carregar', 
            'carregando', 
            'retornando', 
            'patio', 
            'descarregando'
        ];
        this.statusLabels = {
            disponivel: 'Disponível',
            indo_carregar: 'Indo Carregar',
            carregando: 'Carregando',
            retornando: 'Retornando p/ Usina',
            patio: 'Pátio Externo',
            descarregando: 'Descarregando'
        };
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
        container.innerHTML = `
            <div id="controle-view" class="view controle-view active-view">
                <div class="controle-header">
                    <h1>Painel de Controle de Frota</h1>
                    <button class="btn-primary" id="refresh-controle">
                        <i class="ph-fill ph-arrows-clockwise"></i>
                        Atualizar
                    </button>
                </div>

                <div class="controle-grid" id="frentes-grid">
                    </div>

                <div class="historico-container">
                    <div class="historico-header">
                        <h2>Histórico de Movimentação da Frota</h2>
                    </div>
                    <div class="table-wrapper">
                        <table class="data-table-modern" id="historico-table">
                            <thead>
                                <tr>
                                    <th>Horário</th>
                                    <th>Caminhão</th>
                                    <th>Status Anterior</th>
                                    <th>Status Novo</th>
                                </tr>
                            </thead>
                            <tbody>
                                </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        this.container = container;
    }

    async loadData() {
        showLoading();
        try {
            this.data = await fetchAllData();
            this.renderFrentes();
            this.renderHistorico();
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading();
        }
    }

    renderFrentes() {
        const grid = document.getElementById('frentes-grid');
        const { frentes_servico = [], caminhoes = [] } = this.data;

        const frentesHTML = frentes_servico.map(frente => {
            const caminhoesDisponiveis = caminhoes.filter(c => c.status === 'disponivel');
            const caminhoesEmOperacao = caminhoes.filter(c => c.frente_id === frente.id && c.status !== 'disponivel');

            return `
                <div class="frente-card">
                    <div class="frente-header">
                        <i class="ph-fill ph-users-three"></i>
                        <h3>${frente.nome}</h3>
                    </div>
                    <div class="frente-body">
                        <div class="caminhoes-coluna">
                            <h4>Disponíveis p/ Envio</h4>
                            <div class="caminhoes-disponiveis-list">
                                ${caminhoesDisponiveis.map(c => `
                                    <div class="caminhao-item">
                                        <span class="caminhao-item-info">${c.cod_equipamento}</span>
                                        <button class="btn-primary btn-enviar" data-caminhao-id="${c.id}" data-frente-id="${frente.id}">
                                            <i class="ph-fill ph-arrow-circle-right"></i> Enviar
                                        </button>
                                    </div>
                                `).join('') || '<p class="text-secondary">Nenhum</p>'}
                            </div>
                        </div>
                        <div class="caminhoes-coluna">
                            <h4>Em Operação na Frente</h4>
                            <div class="caminhoes-em-operacao-list">
                                ${caminhoesEmOperacao.map(c => this.renderCaminhaoEmOperacao(c)).join('') || '<p class="text-secondary">Nenhum</p>'}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        grid.innerHTML = frentesHTML;
    }
    
    renderCaminhaoEmOperacao(caminhao) {
        const currentStatus = caminhao.status || 'disponivel';
        const currentIndex = this.statusOrder.indexOf(currentStatus);
        
        const nextStatus = this.statusOrder[currentIndex + 1];
        const prevStatus = currentIndex > 1 ? this.statusOrder[currentIndex - 1] : null;

        return `
            <div class="caminhao-operacao-item">
                <div class="caminhao-operacao-header">
                    <strong>${caminhao.cod_equipamento}</strong>
                    <span class="caminhao-status-badge status-${currentStatus}">
                        ${this.statusLabels[currentStatus]}
                    </span>
                </div>
                <div class="status-actions">
                    ${prevStatus ? `<button class="btn-status-change" data-caminhao-id="${caminhao.id}" data-frente-id="${caminhao.frente_id}" data-novo-status="${prevStatus}">&lt; ${this.statusLabels[prevStatus]}</button>` : `<div></div>`}
                    ${nextStatus ? `<button class="btn-status-change" data-caminhao-id="${caminhao.id}" data-frente-id="${caminhao.frente_id}" data-novo-status="${nextStatus}">${this.statusLabels[nextStatus]} &gt;</button>` : `<div></div>`}
                    <button class="btn-status-change full-width" data-caminhao-id="${caminhao.id}" data-novo-status="disponivel">Finalizar (Disponível)</button>
                </div>
            </div>
        `;
    }

    renderHistorico() {
        const tbody = document.getElementById('historico-table')?.querySelector('tbody');
        if (!tbody) return;

        const { caminhao_historico = [] } = this.data;
        tbody.innerHTML = caminhao_historico.slice(0, 10).map(log => `
            <tr>
                <td>${new Date(log.timestamp_mudanca).toLocaleString('pt-BR')}</td>
                <td>${log.caminhoes?.cod_equipamento || 'N/A'}</td>
                <td><span class="caminhao-status-badge status-${log.status_anterior}">${this.statusLabels[log.status_anterior]}</span></td>
                <td><span class="caminhao-status-badge status-${log.status_novo}">${this.statusLabels[log.status_novo]}</span></td>
            </tr>
        `).join('');
    }

    addEventListeners() {
        this.container.addEventListener('click', async (e) => {
            if (e.target.closest('.btn-enviar')) {
                const btn = e.target.closest('.btn-enviar');
                const caminhaoId = btn.dataset.caminhaoId;
                const frenteId = btn.dataset.frenteId;
                
                showLoading();
                try {
                    await updateCaminhaoStatus(caminhaoId, 'indo_carregar', frenteId);
                    showToast('Caminhão enviado com sucesso!', 'success');
                    await this.loadData();
                } catch (error) {
                    handleOperation(error);
                } finally {
                    hideLoading();
                }
            }

            if (e.target.closest('.btn-status-change')) {
                const btn = e.target.closest('.btn-status-change');
                const caminhaoId = btn.dataset.caminhaoId;
                const novoStatus = btn.dataset.novoStatus;
                const frenteId = novoStatus === 'disponivel' ? null : btn.dataset.frenteId;

                showLoading();
                try {
                    await updateCaminhaoStatus(caminhaoId, novoStatus, frenteId);
                    showToast('Status atualizado!', 'success');
                    await this.loadData();
                } catch (error) {
                    handleOperation(error);
                } finally {
                    hideLoading();
                }
            }
        });
        
        document.getElementById('refresh-controle').addEventListener('click', () => this.loadData());
    }
}