// js/views/controle.js
import { fetchAllData, updateCaminhaoStatus, updateFrenteComFazenda } from '../api.js';
import { showToast, handleOperation, showLoading, hideLoading } from '../helpers.js';
import { openModal, closeModal } from '../components/modal.js';

export class ControleView {
    constructor() {
        this.container = null;
        this.data = {};
        // Lista de status para o ciclo principal de operação
        this.statusCiclo = [
            'indo_carregar', 
            'carregando', 
            'retornando', 
            'patio', 
            'descarregando'
        ];
        // Todos os status possíveis com suas legendas
        this.statusLabels = {
            disponivel: 'Disponível',
            indo_carregar: 'Sentido Carreg.',
            carregando: 'Carregando',
            retornando: 'Sentido Usina',
            patio: 'Pátio Externo',
            descarregando: 'Descarregando',
            quebrado: 'Quebrado' // Novo status
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
        container.innerHTML = `<div id="controle-view" class="view controle-view active-view"></div>`;
        this.container = container.querySelector('#controle-view');
    }

    async loadData() {
        showLoading();
        try {
            this.data = await fetchAllData();
            this.render();
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading();
        }
    }
    
    render() {
        this.container.innerHTML = `
            <div class="controle-header">
                <h1>Painel de Controle de Frota</h1>
                <button class="btn-primary" id="refresh-controle">
                    <i class="ph-fill ph-arrows-clockwise"></i>
                    Atualizar
                </button>
            </div>

            ${this.renderDashboardSummary()}

            <div class="controle-grid" id="frentes-grid">
                ${this.renderFrentes()}
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
                            ${this.renderHistorico()}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    renderDashboardSummary() {
        const { caminhoes = [] } = this.data;
        const statusCounts = {};

        // Inicializa a contagem para todos os status de ciclo e 'quebrado'
        [...this.statusCiclo, 'quebrado'].forEach(status => {
            statusCounts[status] = 0;
        });

        // Conta os caminhões em cada status
        caminhoes.forEach(caminhao => {
            if (statusCounts.hasOwnProperty(caminhao.status)) {
                statusCounts[caminhao.status]++;
            }
        });

        return `
            <div class="controle-dashboard-summary">
                ${Object.entries(statusCounts).map(([status, count]) => `
                    <div class="summary-card summary-${status}">
                        <div class="summary-card-value">${count}</div>
                        <div class="summary-card-label">${this.statusLabels[status]}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderFrentes() {
        const { frentes_servico = [], caminhoes = [] } = this.data;

        return frentes_servico.map(frente => {
            const caminhoesDisponiveis = caminhoes.filter(c => c.status === 'disponivel');
            const caminhoesEmOperacao = caminhoes.filter(c => c.frente_id === frente.id && c.status !== 'disponivel' && c.status !== 'quebrado');
            const fazendaAtual = frente.fazendas;

            return `
                <div class="frente-card">
                    <div class="frente-header">
                        <div class="frente-header-main">
                            <i class="ph-fill ph-users-three"></i>
                            <h3>${frente.nome}</h3>
                        </div>
                        <div class="frente-fazenda-info">
                            <div class="fazenda-display">
                                <i class="ph-fill ph-tree-evergreen"></i>
                                <div>
                                    <span class="fazenda-nome">${fazendaAtual?.nome || 'Nenhuma Fazenda Designada'}</span>
                                    ${fazendaAtual ? `<span class="fazenda-codigo">${fazendaAtual.cod_equipamento}</span>` : ''}
                                </div>
                            </div>
                            <button class="btn-secondary btn-alterar-fazenda" data-frente-id="${frente.id}">Alterar</button>
                        </div>
                    </div>
                    <div class="frente-body">
                        <div class="caminhoes-coluna">
                            <h4>Disponíveis p/ Envio</h4>
                            <div class="caminhoes-disponiveis-list">
                                ${caminhoesDisponiveis.map(c => `
                                    <div class="caminhao-item">
                                        <span class="caminhao-item-info">${c.cod_equipamento}</span>
                                        <button class="btn-primary btn-enviar" data-caminhao-id="${c.id}" data-frente-id="${frente.id}" ${!fazendaAtual ? 'disabled' : ''}>
                                            <i class="ph-fill ph-arrow-circle-right"></i> Enviar
                                        </button>
                                    </div>
                                `).join('') || '<p>Nenhum</p>'}
                            </div>
                        </div>
                        <div class="caminhoes-coluna">
                            <h4>Em Operação na Frente</h4>
                            <div class="caminhoes-em-operacao-list">
                                ${caminhoesEmOperacao.map(c => this.renderCaminhaoEmOperacao(c)).join('') || '<p>Nenhum</p>'}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    renderCaminhaoEmOperacao(caminhao) {
        const currentStatus = caminhao.status || 'disponivel';
        const currentIndex = this.statusCiclo.indexOf(currentStatus);
        const nextStatus = (currentIndex > -1 && currentIndex < this.statusCiclo.length - 1) ? this.statusCiclo[currentIndex + 1] : null;
        const prevStatus = (currentIndex > 0) ? this.statusCiclo[currentIndex - 1] : null;

        return `
            <div class="caminhao-operacao-item">
                <div class="caminhao-operacao-header">
                    <strong>${caminhao.cod_equipamento}</strong>
                    <span class="caminhao-status-badge status-${currentStatus}">${this.statusLabels[currentStatus]}</span>
                </div>
                <div class="status-actions">
                    ${prevStatus ? `<button class="btn-status-change" data-caminhao-id="${caminhao.id}" data-frente-id="${caminhao.frente_id}" data-novo-status="${prevStatus}">&lt; Voltar</button>` : `<div></div>`}
                    ${nextStatus ? `<button class="btn-status-change" data-caminhao-id="${caminhao.id}" data-frente-id="${caminhao.frente_id}" data-novo-status="${nextStatus}">Avançar &gt;</button>` : `<div></div>`}
                    <button class="btn-status-change full-width" data-caminhao-id="${caminhao.id}" data-novo-status="disponivel">Finalizar Ciclo</button>
                    <button class="btn-status-change full-width btn-danger" data-caminhao-id="${caminhao.id}" data-novo-status="quebrado">Registrar Quebra</button>
                </div>
            </div>
        `;
    }

    renderHistorico() {
        const { caminhao_historico = [] } = this.data;
        return caminhao_historico.slice(0, 15).map(log => `
            <tr>
                <td>${new Date(log.timestamp_mudanca).toLocaleString('pt-BR')}</td>
                <td>${log.caminhoes?.cod_equipamento || 'N/A'}</td>
                <td><span class="caminhao-status-badge status-${log.status_anterior}">${this.statusLabels[log.status_anterior] || log.status_anterior}</span></td>
                <td><span class="caminhao-status-badge status-${log.status_novo}">${this.statusLabels[log.status_novo] || log.status_novo}</span></td>
            </tr>
        `).join('');
    }

    addEventListeners() {
        this.container.addEventListener('click', async (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;

            if (btn.id === 'refresh-controle') {
                this.loadData();
            }
            
            if (btn.classList.contains('btn-enviar')) {
                const caminhaoId = btn.dataset.caminhaoId;
                const frenteId = btn.dataset.frenteId;
                this.handleStatusUpdate(caminhaoId, 'indo_carregar', frenteId, 'Caminhão enviado com sucesso!');
            }

            if (btn.classList.contains('btn-status-change')) {
                const caminhaoId = btn.dataset.caminhaoId;
                const novoStatus = btn.dataset.novoStatus;
                // Se finalizar ciclo, quebrar ou voltar a ser disponível, a frente é desassociada
                const frenteId = (novoStatus === 'disponivel' || novoStatus === 'quebrado') ? null : btn.dataset.frenteId;
                this.handleStatusUpdate(caminhaoId, novoStatus, frenteId, 'Status atualizado!');
            }
            
            if (btn.classList.contains('btn-alterar-fazenda')) {
                const frenteId = btn.dataset.frenteId;
                this.showFazendaSelector(frenteId);
            }
        });
    }

    async handleStatusUpdate(caminhaoId, novoStatus, frenteId, successMessage) {
        showLoading();
        try {
            await updateCaminhaoStatus(caminhaoId, novoStatus, frenteId);
            showToast(successMessage, 'success');
            await this.loadData();
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading();
        }
    }
    
    showFazendaSelector(frenteId) {
        const { fazendas = [] } = this.data;
        const optionsHTML = fazendas.map(f => `<option value="${f.id}">${f.cod_equipamento} - ${f.nome}</option>`).join('');

        const modalContent = `
            <form id="fazenda-select-form" class="fazenda-select-form">
                <p>Selecione a nova fazenda para esta frente de serviço.</p>
                <select name="fazenda" class="form-select">
                    <option value="">Nenhuma / Limpar</option>
                    ${optionsHTML}
                </select>
                <button type="submit" class="btn-primary">Salvar Alteração</button>
            </form>
        `;
        
        openModal('Alterar Fazenda da Frente', modalContent);

        document.getElementById('fazenda-select-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const selectedFazendaId = e.target.fazenda.value;
            
            showLoading();
            try {
                await updateFrenteComFazenda(frenteId, selectedFazendaId || null);
                showToast('Fazenda atualizada com sucesso!', 'success');
                closeModal();
                await this.loadData();
            } catch (error) {
                handleOperation(error);
            } finally {
                hideLoading();
            }
        });
    }
}