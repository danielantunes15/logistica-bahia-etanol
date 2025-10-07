// js/views/equipamentos.js
import { fetchAllData, updateEquipamentoStatus } from '../api.js';
import { showToast, handleOperation, showLoading, hideLoading, formatDateTime, calculateDowntimeDuration } from '../helpers.js';
import { openModal, closeModal } from '../components/modal.js';

export class EquipamentosView {
    constructor() {
        this.container = null;
        this.data = {};
        this.tiposEquipamentos = ['Carregadeira', 'Trator Reboque', 'Colhedora', 'Trator Transbordo'];
        this.statusLabels = {
            ativo: 'Em Operação',
            parado: 'Parado',
            quebrado: 'Quebrado',
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
            <div id="equipamentos-view" class="view controle-view active-view">
                <div class="controle-header">
                    <h1>Gerenciador de Equipamentos</h1>
                    <button class="btn-primary" id="refresh-equipamentos">
                        <i class="ph-fill ph-arrows-clockwise"></i>
                        Atualizar
                    </button>
                </div>

                ${this.renderDashboardSummary()}

                <div class="controle-grid" id="main-grid">
                    ${this.renderFrentes()}
                </div>

                <div class="historico-container">
                    <div class="historico-header">
                        <h2>Histórico de Inatividade</h2>
                        ${this.renderHistoricoFilters()}
                    </div>
                    <div class="table-wrapper">
                        <table class="data-table-modern" id="historico-equipamento-table">
                            <thead>
                                <tr>
                                    <th>Equipamento</th>
                                    <th>Status Anterior</th>
                                    <th>Status Novo</th>
                                    <th>Início</th>
                                    <th>Fim</th>
                                    <th>Duração (Horas/Min)</th>
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
        this.container = container.querySelector('#equipamentos-view');
    }

    renderDashboardSummary() {
        const { equipamentos = [] } = this.data;
        const statusCounts = {};

        this.tiposEquipamentos.forEach(tipo => {
            const total = equipamentos.filter(e => e.finalidade === tipo).length;
            const ativos = equipamentos.filter(e => e.finalidade === tipo && e.status === 'ativo').length;
            const parados = total - ativos;
            statusCounts[tipo] = { total, ativos, parados };
        });

        return `
            <div class="controle-dashboard-summary">
                ${this.tiposEquipamentos.map(tipo => `
                    <div class="summary-card summary-ativo">
                        <div class="summary-card-label">${tipo}</div>
                        <div class="summary-card-value">${statusCounts[tipo].ativos}</div>
                        <div class="summary-card-label">Em Operação</div>
                        <div class="summary-card-value" style="font-size: 1.5rem; color: var(--accent-danger);">${statusCounts[tipo].parados}</div>
                        <div class="summary-card-label">Parados/Quebrados</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderFrentes() {
        const { frentes_servico = [], equipamentos = [] } = this.data;
        return frentes_servico.map(frente => {
            // Inclui equipamentos ativos e parados na frente para fácil controle
            const equipamentosNaFrente = equipamentos.filter(e => e.frente_id === frente.id);
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
                                <span class="fazenda-nome">${fazendaAtual?.nome || 'Nenhuma Fazenda Associada'}</span>
                            </div>
                        </div>
                    </div>
                    <div class="frente-body">
                        <h4>Equipamentos em Operação / Parados na Frente</h4>
                        <table class="caminhoes-em-operacao-table">
                            <thead>
                                <tr>
                                    <th>Cód. Equipamento</th>
                                    <th>Finalidade</th>
                                    <th>Status</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${equipamentosNaFrente.length > 0 ? equipamentosNaFrente.map(e => `
                                    <tr>
                                        <td><strong>${e.cod_equipamento}</strong></td>
                                        <td>${e.finalidade}</td>
                                        <td><span class="caminhao-status-badge status-${e.status}">${this.statusLabels[e.status] || 'N/A'}</span></td>
                                        <td><button class="btn-primary btn-status-modal" style="font-size: 0.8rem; padding: 6px 10px;" data-equipamento-id="${e.id}" data-frente-id="${frente.id}">Alterar Status</button></td>
                                    </tr>
                                `).join('') : '<tr><td colspan="4">Nenhum equipamento nesta frente.</td></tr>'}
                                
                                <tr>
                                    <td colspan="4">
                                        <button class="btn-secondary btn-assign-modal" data-frente-id="${frente.id}" style="width: 100%; margin-top: 10px;">
                                            + Adicionar Equipamento
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderHistoricoFilters() {
        // Implementação básica de filtros (apenas HTML, a lógica de filtragem seria mais complexa)
        const { equipamentos = [], frentes_servico = [] } = this.data;
        return `
            <div class="report-filters">
                <select id="filter-equipamento" class="form-select">
                    <option value="">Equipamento (Todos)</option>
                    ${equipamentos.map(e => `<option value="${e.id}">${e.cod_equipamento} - ${e.finalidade}</option>`).join('')}
                </select>
                <select id="filter-frente" class="form-select">
                    <option value="">Frente (Todas)</option>
                    ${frentes_servico.map(f => `<option value="${f.id}">${f.nome}</option>`).join('')}
                </select>
                <input type="date" id="filter-data" class="form-input">
                <button class="btn-secondary" id="apply-filters">Filtrar</button>
            </div>
        `;
    }

    renderHistorico(equipamentoId = null, frenteId = null, date = null) {
        const { equipamento_historico = [] } = this.data;
        
        let logs = equipamento_historico.filter(log => log.status_novo !== 'ativo');
        
        // Simples lógica de agrupamento para calcular a duração da inatividade
        const downtimeSessions = [];
        let currentSession = null;

        for (const log of logs) {
            const isDowntimeStart = log.status_novo !== 'ativo';
            const isDowntimeEnd = log.status_novo === 'ativo';

            if (isDowntimeStart) {
                // Inicia uma nova sessão se não houver ou se for um equipamento diferente
                if (!currentSession || currentSession.equipamento_id !== log.equipamento_id) {
                    if (currentSession) downtimeSessions.push(currentSession); // Salva sessão anterior
                    currentSession = {
                        equipamento_id: log.equipamento_id,
                        cod_equipamento: log.equipamentos?.cod_equipamento || 'N/A',
                        finalidade: log.equipamentos?.finalidade || 'N/A',
                        start_time: log.timestamp_mudanca,
                        start_status: log.status_novo,
                        end_time: null,
                        end_status: null
                    };
                } else {
                    // Atualiza o status inicial se a máquina já estava em inatividade (ex: de parado para quebrado)
                    currentSession.start_status = log.status_novo;
                }
            } else if (isDowntimeEnd && currentSession && currentSession.equipamento_id === log.equipamento_id) {
                // Finaliza a sessão atual
                currentSession.end_time = log.timestamp_mudanca;
                currentSession.end_status = log.status_novo;
                downtimeSessions.push(currentSession);
                currentSession = null;
            }
        }
        if (currentSession) downtimeSessions.push(currentSession); // Salva a última sessão se ainda aberta

        // Ordenar por início de inatividade
        downtimeSessions.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
        
        return downtimeSessions.map(session => {
            const duration = calculateDowntimeDuration(session.start_time, session.end_time);
            return `
                <tr>
                    <td>${session.cod_equipamento} (${session.finalidade})</td>
                    <td><span class="caminhao-status-badge status-ativo">Ativo</span></td>
                    <td><span class="caminhao-status-badge status-${session.start_status}">${this.statusLabels[session.start_status] || session.start_status}</span></td>
                    <td>${formatDateTime(session.start_time)}</td>
                    <td>${session.end_time ? formatDateTime(session.end_time) : '<span style="color: var(--accent-danger);">Em Aberto</span>'}</td>
                    <td>${duration}</td>
                </tr>
            `;
        }).join('');
    }

    addEventListeners() {
        this.container.addEventListener('click', (e) => {
            const btnStatus = e.target.closest('.btn-status-modal');
            const btnRefresh = e.target.closest('#refresh-equipamentos');
            const btnAssign = e.target.closest('.btn-assign-modal');

            if (btnStatus) this.showStatusUpdateModal(btnStatus.dataset.equipamentoId, btnStatus.dataset.frenteId);
            if (btnRefresh) this.loadData();
            if (btnAssign) this.showAssignmentModal(btnAssign.dataset.frenteId);
        });

        // Event listener for finishing a stop (to be added to modal form)
        this.container.addEventListener('submit', (e) => {
            if (e.target.id === 'finalizar-parada-form') {
                e.preventDefault();
                const equipamentoId = e.target.equipamento_id.value;
                const horaFim = e.target.hora_fim.value;
                const frenteId = e.target.frente_id.value;
                
                this.handleStatusUpdate(equipamentoId, 'ativo', frenteId, new Date(horaFim).toISOString(), 'Parada Finalizada! Equipamento Ativo.');
            }
        });
    }

    showAssignmentModal(frenteId) {
        const { equipamentos = [] } = this.data;
        // Equipamentos que não estão associados a nenhuma frente e não estão quebrados
        const equipamentosDisponiveis = equipamentos.filter(e => !e.frente_id && e.status !== 'quebrado');
        
        const modalContent = `
            <form id="assign-equipamento-form" class="action-modal-form">
                <input type="hidden" name="frente_id" value="${frenteId}">
                <div class="form-group">
                    <label>1. Escolha o Equipamento Disponível</label>
                    <select name="equipamento" class="form-select" required>
                        <option value="">Selecione...</option>
                        ${equipamentosDisponiveis.map(e => `<option value="${e.id}">${e.cod_equipamento} (${e.finalidade})</option>`).join('')}
                    </select>
                </div>
                <button type="submit" class="btn-primary">Designar Equipamento</button>
            </form>
        `;
        openModal('Designar Equipamento para Frente', modalContent);

        document.getElementById('assign-equipamento-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const equipamentoId = e.target.equipamento.value;
            
            showLoading();
            try {
                await updateEquipamentoStatus(equipamentoId, 'ativo', frenteId);
                showToast('Equipamento designado com sucesso!', 'success');
                closeModal();
                await this.loadData();
            } catch (error) {
                handleOperation(error);
            } finally {
                hideLoading();
            }
        });
    }

    showStatusUpdateModal(equipamentoId, frenteId) {
        const equipamento = this.data.equipamentos.find(e => e.id == equipamentoId);
        if (!equipamento) return;

        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        const nowString = now.toISOString().slice(0,16);

        let modalContent;

        if (equipamento.status === 'ativo') {
            // Se estiver ativo, só pode parar (parado ou quebrado)
            modalContent = `
                <p>Equipamento: <strong>${equipamento.cod_equipamento} (${equipamento.finalidade})</strong></p>
                <form id="parada-equipamento-form" class="action-modal-form">
                    <div class="form-group">
                        <label>Motivo da Parada</label>
                        <select name="status" class="form-select" required>
                            <option value="">Selecione...</option>
                            <option value="parado">Parado (Manutenção, Espera)</option>
                            <option value="quebrado">Quebrado</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Hora de Início da Parada</label>
                        <input type="datetime-local" name="hora_inicio" class="form-input" value="${nowString}" required>
                    </div>
                    <button type="submit" class="btn-primary">Registrar Parada</button>
                </form>
            `;
            openModal('Registrar Parada', modalContent);

            document.getElementById('parada-equipamento-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const novoStatus = e.target.status.value;
                const horaInicio = e.target.hora_inicio.value;
                
                this.handleStatusUpdate(equipamento.id, novoStatus, frenteId, new Date(horaInicio).toISOString(), 'Parada registrada com sucesso!');
            });

        } else if (equipamento.status === 'parado' || equipamento.status === 'quebrado') {
            // Se estiver parado ou quebrado, pode ser finalizado (tornar ativo) ou mudar o status entre parado/quebrado.
            modalContent = `
                <p>Equipamento: <strong>${equipamento.cod_equipamento} (${equipamento.finalidade})</strong></p>
                <form id="finalizar-parada-form" class="action-modal-form">
                    <input type="hidden" name="equipamento_id" value="${equipamento.id}">
                    <input type="hidden" name="frente_id" value="${frenteId}">
                    <div class="form-group">
                        <label>Hora de Finalização da Parada</label>
                        <input type="datetime-local" name="hora_fim" class="form-input" value="${nowString}" required>
                    </div>
                    <button type="submit" class="btn-primary">Finalizar Parada (Tornar Ativo)</button>
                </form>
                
                <hr style="margin: 20px 0; border-color: var(--border-color);">
                
                <form id="mudar-status-form" class="action-modal-form">
                    <p>Mudar Status de Inatividade:</p>
                    <div class="form-group">
                        <label>Mudar para</label>
                        <select name="status_mudanca" class="form-select" required>
                            <option value="parado" ${equipamento.status === 'parado' ? 'selected' : ''}>Parado</option>
                            <option value="quebrado" ${equipamento.status === 'quebrado' ? 'selected' : ''}>Quebrado</option>
                        </select>
                    </div>
                    <button type="submit" class="btn-secondary">Mudar Status</button>
                </form>
            `;
            openModal('Finalizar/Mudar Status', modalContent);

            document.getElementById('mudar-status-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const novoStatus = e.target.status_mudanca.value;
                this.handleStatusUpdate(equipamento.id, novoStatus, frenteId, new Date().toISOString(), `Status alterado para ${this.statusLabels[novoStatus]}!`);
            });
            // O form de finalizar parada é capturado pelo event listener do container (linha 308)
        }
    }
    
    async handleStatusUpdate(equipamentoId, novoStatus, frenteId, timestamp, successMessage) {
        showLoading();
        try {
            // Se o novo status for ativo, precisamos manter a frente_id, senão desassociamos (null)
            const newFrenteId = novoStatus === 'ativo' ? frenteId : null;
            await updateEquipamentoStatus(equipamentoId, novoStatus, newFrenteId, timestamp);
            showToast(successMessage, 'success');
            closeModal();
            await this.loadData();
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading();
        }
    }
}