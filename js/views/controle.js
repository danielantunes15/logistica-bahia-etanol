// js/views/controle.js
import { fetchAllData, updateCaminhaoStatus, updateFrenteComFazenda, assignCaminhaoToFrente } from '../api.js';
import { showToast, handleOperation, showLoading, hideLoading } from '../helpers.js';
import { openModal, closeModal } from '../components/modal.js';

export class ControleView {
    constructor() {
        this.container = null;
        this.data = {};
        // --- ORDEM DO CICLO CORRIGIDA ---
        this.statusCiclo = [
            'indo_carregar', 
            'carregando', 
            'retornando', 
            'patio_carregado',
            'descarregando',
            'patio_vazio' 
        ];
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
        await this.loadData();
        this.addEventListeners();
    }

    async hide() {}

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
        const container = document.getElementById('views-container');
        container.innerHTML = `
            <div id="controle-view" class="view controle-view active-view">
                <div class="controle-header">
                    <h1>Painel de Controle de Frota</h1>
                    <button class="btn-primary" id="btn-fazer-acao">
                        <i class="ph-fill ph-plus-circle"></i>
                        Fazer Ação
                    </button>
                </div>

                ${this.renderDashboardSummary()}

                <div class="controle-grid" id="main-grid">
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
            </div>
        `;
        this.container = container.querySelector('#controle-view');
    }

    renderDashboardSummary() {
        const { caminhoes = [] } = this.data;
        const statusCounts = {};
        const statusesToCount = [...this.statusCiclo, 'quebrado'];
        
        statusesToCount.forEach(status => { statusCounts[status] = 0; });

        caminhoes.forEach(caminhao => {
            if (statusCounts.hasOwnProperty(caminhao.status)) {
                statusCounts[caminhao.status]++;
            }
        });

        return `
            <div class="controle-dashboard-summary">
                ${statusesToCount.map(status => `
                    <div class="summary-card summary-${status}">
                        <div class="summary-card-value">${statusCounts[status]}</div>
                        <div class="summary-card-label">${this.statusLabels[status]}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderFrentes() {
        const { frentes_servico = [], caminhoes = [] } = this.data;
        return frentes_servico.map(frente => {
            const caminhoesEmOperacao = caminhoes.filter(c => c.frente_id === frente.id && c.status !== 'disponivel');
            const fazendaAtual = frente.fazendas;

            return `
                <div class="frente-card">
                    <div class="frente-header">
                        <div class="frente-header-main">
                            <i class="ph-fill ph-users-three"></i><h3>${frente.nome}</h3>
                        </div>
                        <div class="frente-fazenda-info">
                            <div class="fazenda-display">
                                <i class="ph-fill ph-tree-evergreen"></i>
                                <div>
                                    <span class="fazenda-nome">${fazendaAtual?.nome || 'Nenhuma Fazenda'}</span>
                                    ${fazendaAtual ? `<span class="fazenda-codigo">${fazendaAtual.cod_equipamento}</span>` : ''}
                                </div>
                            </div>
                            <button class="btn-secondary btn-alterar-fazenda" data-frente-id="${frente.id}">Alterar</button>
                        </div>
                    </div>
                    <div class="frente-body">
                        <h4>Caminhões em Operação</h4>
                        <table class="caminhoes-em-operacao-table">
                            <thead>
                                <tr>
                                    <th>Cód. Caminhão</th>
                                    <th>Status</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${caminhoesEmOperacao.length > 0 ? caminhoesEmOperacao.map(c => `
                                    <tr>
                                        <td><strong>${c.cod_equipamento}</strong></td>
                                        <td><span class="caminhao-status-badge status-${c.status}">${this.statusLabels[c.status]}</span></td>
                                        <td><button class="btn-primary" style="font-size: 0.8rem; padding: 6px 10px;" data-caminhao-id="${c.id}">Alterar Status</button></td>
                                    </tr>
                                `).join('') : '<tr><td colspan="3">Nenhum caminhão em operação.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }).join('');
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
        this.container.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;

            if (btn.id === 'btn-fazer-acao') this.showAssignmentModal();
            if (btn.classList.contains('btn-alterar-fazenda')) this.showFazendaSelector(btn.dataset.frenteId);
            
            if (btn.dataset.caminhaoId && !btn.closest('#action-modal-form')) {
                this.showStatusUpdateModal(btn.dataset.caminhaoId);
            }
        });
    }

    showAssignmentModal() {
        const { caminhoes = [], frentes_servico = [] } = this.data;
        // --- CORREÇÃO AQUI: Mostra caminhões 'disponivel' OU sem status definido (null) ---
        const caminhoesDisponiveis = caminhoes.filter(c => c.status === 'disponivel' || !c.status);
        
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        const nowString = now.toISOString().slice(0,16);

        const modalContent = `
            <form id="action-modal-form" class="action-modal-form">
                <div class="form-group">
                    <label>1. Escolha o Caminhão</label>
                    <select name="caminhao" class="form-select" required>
                        <option value="">Selecione...</option>
                        ${caminhoesDisponiveis.map(c => `<option value="${c.id}">${c.cod_equipamento}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>2. Escolha a Frente de Destino (Apenas frentes com fazenda)</label>
                    <select name="frente" class="form-select" required>
                        <option value="">Selecione...</option>
                        ${frentes_servico.filter(f => f.fazenda_id).map(f => `<option value="${f.id}">${f.nome}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>3. Selecione a Etapa Inicial</label>
                    <select name="status" class="form-select" required>
                        ${this.statusCiclo.map(s => `<option value="${s}">${this.statusLabels[s]}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>4. Hora de Saída para Roça</label>
                    <input type="datetime-local" name="hora" class="form-input" value="${nowString}" required>
                </div>
                <button type="submit" class="btn-primary">Confirmar Ação</button>
            </form>
        `;
        openModal('Designar Caminhão para Frente', modalContent);

        document.getElementById('action-modal-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = e.target;
            const caminhaoId = formData.caminhao.value;
            const frenteId = formData.frente.value;
            const status = formData.status.value;
            const hora = formData.hora.value;

            if (!caminhaoId || !frenteId || !status || !hora) {
                showToast('Por favor, preencha todos os campos.', 'error');
                return;
            }

            showLoading();
            try {
                await assignCaminhaoToFrente(caminhaoId, frenteId, status, new Date(hora).toISOString());
                showToast('Caminhão designado com sucesso!', 'success');
                closeModal();
                await this.loadData();
            } catch (error) {
                handleOperation(error);
            } finally {
                hideLoading();
            }
        });
    }

    showStatusUpdateModal(caminhaoId) {
        const caminhao = this.data.caminhoes.find(c => c.id == caminhaoId);
        if (!caminhao) return;

        const modalContent = `
            <p>Alterando status de: <strong>${caminhao.cod_equipamento}</strong></p>
            <form id="status-update-form" class="action-modal-form">
                <div class="form-group">
                    <label>Selecione o Novo Status</label>
                    <select name="status" class="form-select" required>
                        ${[...this.statusCiclo, 'quebrado'].map(s => `<option value="${s}" ${caminhao.status === s ? 'selected' : ''}>${this.statusLabels[s]}</option>`).join('')}
                    </select>
                </div>
                <button type="submit" class="btn-primary">Atualizar Status</button>
                <button type="button" id="btn-finalizar-ciclo" class="btn-secondary">Finalizar Ciclo (Tornar Disponível)</button>
            </form>
        `;
        openModal('Alterar Status do Caminhão', modalContent);

        const form = document.getElementById('status-update-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            this.handleStatusUpdate(caminhao.id, e.target.status.value, caminhao.frente_id, 'Status atualizado!');
        });

        document.getElementById('btn-finalizar-ciclo').addEventListener('click', () => {
             this.handleStatusUpdate(caminhao.id, 'disponivel', null, 'Ciclo finalizado, caminhão disponível!');
        });
    }
    
    async handleStatusUpdate(caminhaoId, novoStatus, frenteId, successMessage) {
        showLoading();
        try {
            await updateCaminhaoStatus(caminhaoId, novoStatus, frenteId);
            showToast(successMessage, 'success');
            closeModal();
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
                <select name="fazenda" class="form-select"><option value="">Nenhuma / Limpar</option>${optionsHTML}</select>
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