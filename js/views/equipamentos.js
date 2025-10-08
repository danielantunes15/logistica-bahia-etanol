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
        this.frentesMap = new Map(); // Inicialização do mapa de frentes
        this._boundClickHandler = null; // Para armazenar a referência do handler e removê-lo
    }

    async show() {
        await this.loadData();
        // REMOVIDO: this.addEventListeners() - Movido para loadData para ser chamado após cada re-renderização
    }

    async hide() {}

    async loadData() {
        showLoading();
        try {
            this.data = await fetchAllData();
            // Mapeia Frentes para fácil acesso no painel de parados
            this.frentesMap = new Map(this.data.frentes_servico.map(f => [f.id, f.nome]));
            this.render();
            this.addEventListeners(); // CORREÇÃO: Rebind listeners após cada renderização
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
                
                ${this.renderParadosPanel()} 

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
                                    <th>Frente de Origem</th>
                                    <th>Status Anterior</th>
                                    <th>Status Novo</th>
                                    <th>Motivo</th>
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

    // --- PAINEL DE MAQUINÁRIO PARADO/QUEBRADO GERAL (COM BOTÃO DE AÇÃO) ---
    renderParadosPanel() {
        const { equipamentos = [], proprietarios = [] } = this.data;
        
        const proprietariosMap = new Map(proprietarios.map(p => [p.id, p]));
        const parados = equipamentos.filter(e => e.status === 'parado' || e.status === 'quebrado');

        const { equipamento_historico = [] } = this.data;
        const latestDowntime = {};

        // Lógica para encontrar o último motivo de parada *aberta*
        for (const log of equipamento_historico.sort((a, b) => new Date(b.timestamp_mudanca) - new Date(a.timestamp_mudanca))) {
            const isDowntimeStart = log.status_novo !== 'ativo';
            
            if (parados.some(e => e.id === log.equipamento_id) && isDowntimeStart && !latestDowntime[log.equipamento_id]) {
                const hasEndLog = equipamento_historico.some(
                    h => h.equipamento_id === log.equipamento_id && 
                         h.status_novo === 'ativo' && 
                         new Date(h.timestamp_mudanca) > new Date(log.timestamp_mudanca)
                );
                
                if (!hasEndLog) {
                    latestDowntime[log.equipamento_id] = {
                        motivo: log.motivo_parada || 'Não informado',
                        frenteNome: log.equipamentos?.frentes_servico?.nome || 'N/A' 
                    };
                }
            }
        }

        const rows = parados.map(e => {
            const proprietario = proprietariosMap.get(e.proprietario_id)?.nome || 'N/A';
            const downtimeInfo = latestDowntime[e.id] || { motivo: 'Não informado' };
            const statusLabel = this.statusLabels[e.status];

            return `
                <tr>
                    <td><strong>${e.cod_equipamento}</strong></td>
                    <td>${e.descricao}</td>
                    <td>${e.finalidade}</td>
                    <td>${proprietario}</td>
                    <td><span class="caminhao-status-badge status-${e.status}">${statusLabel}</span></td>
                    <td>${downtimeInfo.motivo}</td>
                    <td>
                        <button class="action-btn edit-btn-modern btn-parados-action" data-equipamento-id="${e.id}" data-frente-id="${e.frente_id || ''}" title="Finalizar Parada / Mudar Status">
                            <i class="ph-fill ph-pencil-simple"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <div class="historico-container" style="margin-bottom: 32px;">
                <div class="historico-header">
                    <h2>Maquinário Parado / Quebrado (${parados.length})</h2>
                </div>
                <div class="table-wrapper">
                    <table class="data-table-modern" id="parados-table">
                        <thead>
                            <tr>
                                <th>Cód. Equipamento</th>
                                <th>Descrição</th>
                                <th>Tipo</th>
                                <th>Proprietário</th>
                                <th>Status</th>
                                <th>Motivo da Parada</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.length > 0 ? rows : '<tr><td colspan="7">Nenhum equipamento parado ou quebrado.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
    // --- FIM DO PAINEL PARADOS ---

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
                                        <td>
                                            <button class="btn-primary btn-move-status" style="font-size: 0.8rem; padding: 6px 10px;" data-equipamento-id="${e.id}" data-frente-id="${frente.id}">Mover / Status</button>
                                        </td>
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

    // --- CORREÇÃO COMPLETA: Agrupa logs em sessões de inatividade e calcula a duração ---
    renderHistorico(equipamentoId = null, frenteId = null, date = null) {
        const { equipamento_historico = [] } = this.data;
        
        // 1. Classifica os logs por tempo, do mais antigo para o mais recente (para reconstruir a linha do tempo)
        const sortedLogs = equipamento_historico.sort((a, b) => new Date(a.timestamp_mudanca) - new Date(b.timestamp_mudanca));

        const downtimeSessions = [];
        const activeSessions = new Map(); // Para rastrear inícios de parada (log de status_novo != 'ativo' e status_anterior == 'ativo')

        // 2. Percorre os logs para agrupar em sessões de inatividade
        for (const log of sortedLogs) {
            const isDowntimeStart = log.status_novo !== 'ativo' && log.status_anterior === 'ativo';
            const isStatusChangeDowntime = log.status_novo !== 'ativo' && log.status_anterior !== 'ativo';
            const isDowntimeEnd = log.status_novo === 'ativo' && log.status_anterior !== 'ativo';

            if (isDowntimeStart) {
                // Início de uma nova parada
                activeSessions.set(log.equipamento_id, {
                    startLog: log,
                    startTime: new Date(log.timestamp_mudanca),
                    startStatus: log.status_novo,
                });
            } else if (isDowntimeEnd) {
                const session = activeSessions.get(log.equipamento_id);
                if (session) {
                    // Fim da parada
                    downtimeSessions.push({
                        cod_equipamento: log.equipamentos?.cod_equipamento || 'N/A',
                        finalidade: log.equipamentos?.finalidade || 'N/A',
                        frente: session.startLog.equipamentos?.frentes_servico?.nome || 'N/A',
                        start_time: session.startTime,
                        end_time: new Date(log.timestamp_mudanca),
                        start_status: session.startStatus,
                        end_status: log.status_novo, // 'ativo'
                        motivo: session.startLog.motivo_parada || 'Não informado',
                    });
                    activeSessions.delete(log.equipamento_id);
                }
            } else if (isStatusChangeDowntime) {
                // Se o status mudar entre 'parado' e 'quebrado', atualiza o log inicial com o motivo mais recente
                const session = activeSessions.get(log.equipamento_id);
                if (session) {
                    session.startStatus = log.status_novo; 
                    session.startLog.motivo_parada = log.motivo_parada || session.startLog.motivo_parada;
                }
            }
        }
        
        // 3. Adiciona sessões que ainda estão abertas
        for (const [id, session] of activeSessions.entries()) {
            downtimeSessions.push({
                cod_equipamento: session.startLog.equipamentos?.cod_equipamento || 'N/A',
                finalidade: session.startLog.equipamentos?.finalidade || 'N/A',
                frente: session.startLog.equipamentos?.frentes_servico?.nome || 'N/A',
                start_time: session.startTime,
                end_time: null, // Ainda em aberto
                start_status: session.startStatus,
                end_status: session.startStatus, // O status final é o status atual (parado/quebrado)
                motivo: session.startLog.motivo_parada || 'Não informado',
            });
        }
        
        // 4. Ordena as sessões para exibição (mais recente primeiro)
        downtimeSessions.sort((a, b) => b.start_time - a.start_time);
        
        // 5. Gera as linhas da tabela a partir das sessões
        return downtimeSessions.map(session => {
            const duration = calculateDowntimeDuration(session.start_time, session.end_time);
            
            const startStatusBadge = `<span class="caminhao-status-badge status-${session.start_status}">${this.statusLabels[session.start_status] || session.start_status}</span>`;
            
            let endStatusLabel;
            if (session.end_time) {
                // Se a sessão terminou (end_time existe), o status final é Ativo
                endStatusLabel = `<span class="caminhao-status-badge status-ativo">${this.statusLabels['ativo']}</span>`;
            } else {
                // Se ainda está aberta, o status final é o status atual (Parado/Quebrado)
                endStatusLabel = `<span class="caminhao-status-badge status-${session.end_status}">${this.statusLabels[session.end_status] || session.end_status}</span>`;
            }
            
            const endTimeDisplay = session.end_time ? formatDateTime(session.end_time) : '<span style="color: var(--accent-danger);">Em Aberto</span>';
            const durationDisplay = duration;

            return `
                <tr>
                    <td>${session.cod_equipamento} (${session.finalidade})</td>
                    <td>${session.frente}</td>
                    <td>${startStatusBadge}</td>
                    <td>${endStatusLabel}</td> 
                    <td>${session.motivo}</td>
                    <td>${formatDateTime(session.start_time)}</td>
                    <td>${endTimeDisplay}</td>
                    <td>${durationDisplay}</td>
                </tr>
            `;
        }).join('');
    }
    // --- FIM DA CORREÇÃO COMPLETA DO HISTÓRICO ---


    addEventListeners() {
        // CORREÇÃO: Remove listeners antigos antes de adicionar novos
        if (this.container && this._boundClickHandler) {
            this.container.removeEventListener('click', this._boundClickHandler);
        }
        
        // Cria um manipulador de eventos único e armazena a referência
        this._boundClickHandler = (e) => {
            const btnRefresh = e.target.closest('#refresh-equipamentos');
            const btnAssign = e.target.closest('.btn-assign-modal');
            const btnParadosAction = e.target.closest('.btn-parados-action');
            const btnMoveStatus = e.target.closest('.btn-move-status'); // NEW HANDLER

            if (btnMoveStatus) this.showMoveEquipmentModal(btnMoveStatus.dataset.equipamentoId, btnMoveStatus.dataset.frenteId); // NEW ACTION
            if (btnRefresh) this.loadData();
            if (btnAssign) this.showAssignmentModal(btnAssign.dataset.frenteId);
            if (btnParadosAction) this.showParadosActionModal(btnParadosAction.dataset.equipamentoId, btnParadosAction.dataset.frenteId);
        };

        // Adiciona o listener ao novo container
        if (this.container) {
            this.container.addEventListener('click', this._boundClickHandler);
        }
    }
    
    // --- NOVA FUNÇÃO: Mover para outra frente ou disponibilizar ---
    showMoveEquipmentModal(equipamentoId, currentFrenteId) {
        const equipamento = this.data.equipamentos.find(e => e.id == equipamentoId);
        if (!equipamento) return;
        
        // Frentes ativas ou cata, excluindo a frente atual. Filtra frentes que têm fazenda associada.
        const currentFrenteIntId = parseInt(currentFrenteId);
        const frentesDisponiveis = this.data.frentes_servico.filter(f => 
            f.id !== currentFrenteIntId && (f.status === 'ativa' || f.status === 'fazendo_cata') && f.fazenda_id
        );

        // Prepara as opções do seletor de frente
        const optionsHTML = frentesDisponiveis.map(f => 
            `<option value="${f.id}">${f.nome} (${f.status === 'ativa' ? 'Colheita' : 'Cata'})</option>`
        ).join('');
        
        const currentFrenteName = this.frentesMap.get(currentFrenteIntId) || 'Nenhuma (Disponível)';

        const modalContent = `
            <p>Equipamento: <strong>${equipamento.cod_equipamento} (${equipamento.finalidade})</strong></p>
            <p>Frente Atual: <strong>${currentFrenteName}</strong></p>
            
            <hr style="margin: 20px 0; border-color: var(--border-color);">
            
            <form id="move-equipment-form" class="action-modal-form" style="margin-bottom: 20px;">
                <h4>Mover para Outra Frente</h4>
                <div class="form-group">
                    <label>Frente de Destino</label>
                    <select name="new_frente_id" class="form-select" required>
                        <option value="">Selecione a Frente...</option>
                        ${optionsHTML}
                    </select>
                </div>
                <button type="submit" class="btn-primary">Mover Equipamento (Manter Ativo)</button>
            </form>

            <form id="unassign-equipment-form" class="action-modal-form">
                <h4>Disponibilizar (Tornar Livre)</h4>
                <p class="form-help">Remove o equipamento da Frente ${currentFrenteName}, mantendo o status 'Em Operação' (ativo) para ser usado por outra frente.</p>
                <button type="submit" class="btn-secondary">Disponibilizar</button>
            </form>

            <hr style="margin: 20px 0; border-color: var(--border-color);">

            <button class="btn-danger" id="btn-status-parada-quebra">Registrar Parada / Quebra</button>
        `;
        
        openModal('Gerenciar Movimentação e Status', modalContent);

        // Handler para Mover para Outra Frente
        document.getElementById('move-equipment-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const newFrenteId = e.target.new_frente_id.value;
            const newFrenteName = this.frentesMap.get(parseInt(newFrenteId));
            if (newFrenteId) {
                // Status permanece 'ativo', apenas a frente é trocada.
                await this.handleStatusUpdate(equipamento.id, 'ativo', newFrenteId, new Date().toISOString(), `Equipamento movido para Frente ${newFrenteName}!`, 'Movido para nova frente');
            }
        });

        // Handler para Tornar Disponível (Unassign)
        document.getElementById('unassign-equipment-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            // Mantém status 'ativo', mas frente_id = null
            await this.handleStatusUpdate(equipamento.id, 'ativo', null, new Date().toISOString(), `Equipamento ${equipamento.cod_equipamento} disponibilizado!`, 'Disponibilizado/desassociado da frente');
        });
        
        // Handler para Parada/Quebra (Redireciona para o modal existente)
        document.getElementById('btn-status-parada-quebra').addEventListener('click', () => {
            closeModal();
            // Chama a função que contém o formulário com o status e o motivo
            this.showStatusUpdateModal(equipamentoId, currentFrenteId); 
        });
    }

    // --- FIM DA NOVA FUNÇÃO ---

    showAssignmentModal(frenteId) {
        const { equipamentos = [] } = this.data;
        // Equipamentos que não estão associados a nenhuma frente e não estão quebrados
        // Note: Agora 'ativo' com frente_id=null é um disponível.
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
                // Ao designar, o status é 'ativo' e a frente é associada
                await updateEquipamentoStatus(equipamentoId, 'ativo', frenteId, new Date().toISOString(), 'Designado para frente');
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

    // --- Modal para Ações no Painel de Parados (Finalizar / Mudar Status) ---
    showParadosActionModal(equipamentoId, frenteId) {
        const equipamento = this.data.equipamentos.find(e => e.id == equipamentoId);
        if (!equipamento) return;

        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        const nowString = now.toISOString().slice(0,16);
        
        // Filtra frentes que possuem fazenda para designação
        const frentesComFazenda = this.data.frentes_servico.filter(f => f.fazenda_id);

        const modalContent = `
            <p>Equipamento: <strong>${equipamento.cod_equipamento} (${equipamento.finalidade})</strong></p>
            <form id="finalizar-parada-form" class="action-modal-form">
                <input type="hidden" name="equipamento_id" value="${equipamento.id}">
                <div class="form-group">
                    <label>Designar a Frente (Obrigatório para Ativar)</label>
                    <select name="frente_id" class="form-select" required>
                        <option value="">Selecione a Frente de Serviço</option>
                        ${frentesComFazenda.map(f => `<option value="${f.id}" ${f.id === frenteId ? 'selected' : ''}>${f.nome}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Hora de Finalização da Parada</label>
                    <input type="datetime-local" name="hora_fim" class="form-input" value="${nowString}" required>
                </div>
                <button type="submit" class="btn-primary">Finalizar Parada (Tornar Ativo)</button>
            </form>
            
            <hr style="margin: 20px 0; border-color: var(--border-color);">
            
            <form id="mudar-status-form-parados" class="action-modal-form">
                <p>Mudar Status de Inatividade:</p>
                <div class="form-group">
                    <label>Mudar para</label>
                    <select name="status_mudanca" class="form-select" required>
                        <option value="parado" ${equipamento.status === 'parado' ? 'selected' : ''}>Parado</option>
                        <option value="quebrado" ${equipamento.status === 'quebrado' ? 'selected' : ''}>Quebrado</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Detalhes da Mudança (Obrigatório)</label>
                    <input type="text" name="motivo_mudanca" class="form-input" required placeholder="Ex: De 'Parado' para 'Quebrado' por falha no motor">
                </div>
                <button type="submit" class="btn-secondary">Mudar Status</button>
            </form>
        `;
        openModal('Finalizar/Mudar Status de Parada', modalContent);

        // Listener para Finalizar Parada
        document.getElementById('finalizar-parada-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const horaFim = form.hora_fim.value;
            const novaFrenteId = form.frente_id.value;
            
            if (!novaFrenteId) {
                showToast('É obrigatório selecionar uma Frente de Serviço para ativar o equipamento.', 'error');
                return;
            }
            
            // O handleStatusUpdate cuida de passar a nova frente_id para o updateEquipamentoStatus
            this.handleStatusUpdate(equipamento.id, 'ativo', novaFrenteId, new Date(horaFim).toISOString(), 'Parada Finalizada! Equipamento Ativo.', 'Fim de parada: Ativado para nova frente');
        });
        
        // Listener para Mudar Status Inativo
        document.getElementById('mudar-status-form-parados').addEventListener('submit', async (e) => {
            e.preventDefault();
            const novoStatus = e.target.status_mudanca.value;
            const motivo = e.target.motivo_mudanca.value;
            
            // Note: Manter a frente_id existente (que é null para parados/quebrados), pois a máquina continua inativa
            this.handleStatusUpdate(equipamento.id, novoStatus, frenteId, new Date().toISOString(), `Status alterado para ${this.statusLabels[novoStatus]}!`, motivo);
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
            // Se estiver ativo, só pode ir para parado/quebrado. Este é o formulário de REGISTRO DE PARADA.
            modalContent = `
                <p>Equipamento: <strong>${equipamento.cod_equipamento} (${equipamento.finalidade})</strong></p>
                <form id="parada-equipamento-form" class="action-modal-form">
                    <div class="form-group">
                        <label>Motivo da Parada</label>
                        <select name="status" id="parada-status" class="form-select" required>
                            <option value="">Selecione...</option>
                            <option value="parado">Parado (Manutenção, Espera)</option>
                            <option value="quebrado">Quebrado</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Descrição/Detalhes do Motivo</label>
                        <input type="text" name="motivo" class="form-input" required placeholder="Ex: Manutenção preventiva, Esperando pneu, etc.">
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
                const motivo = e.target.motivo.value;
                
                this.handleStatusUpdate(equipamento.id, novoStatus, frenteId, new Date(horaInicio).toISOString(), 'Parada registrada com sucesso!', motivo);
            });

        } else {
             // Se estiver parado ou quebrado, redireciona para o modal completo (showParadosActionModal)
             this.showParadosActionModal(equipamentoId, frenteId);
        }
    }
    
    async handleStatusUpdate(equipamentoId, novoStatus, frenteId, timestamp, successMessage, motivoParada = null) {
        showLoading();
        try {
            // Se o novo status for ativo, a Frente_id deve ser a frente de destino (frontId ou null se for disponibilizar)
            const newFrenteId = novoStatus === 'ativo' ? (frenteId || null) : null; 
            
            await updateEquipamentoStatus(equipamentoId, novoStatus, newFrenteId, timestamp, motivoParada);
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