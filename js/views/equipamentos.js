// js/views/equipamentos.js
import { fetchAllData, updateEquipamentoStatus } from '../api.js';
import { showToast, handleOperation, showLoading, hideLoading } from '../helpers.js';
import { formatDateTime, calculateDowntimeDuration, groupDowntimeSessions, getBrtNowString, getBrtIsoString, calculateTimeDifference, formatMillisecondsToHoursMinutes } from '../timeUtils.js'; // IMPORTAÇÕES CORRIGIDAS
import { openModal, closeModal } from '../components/modal.js';
// NOVO: Importa dataCache
import { dataCache } from '../dataCache.js';
// NOVO: Importa constantes
import { EQUIPAMENTO_STATUS_LABELS } from '../constants.js';

export class EquipamentosView {
    constructor() {
        this.container = null;
        this.data = {};
        this.tiposEquipamentos = ['Carregadeira', 'Trator Reboque', 'Colhedora', 'Trator Transbordo'];
        // REMOVIDO: Definição local de statusLabels
        this.statusLabels = EQUIPAMENTO_STATUS_LABELS;
        this.frentesMap = new Map(); // Inicialização do mapa de frentes
        this.latestDowntimeMap = new Map(); // NOVO: Mapa para armazenar o tempo de início das paradas abertas
        this._boundClickHandler = null; // Para armazenar a referência do handler e removê-lo
    }

    async show() {
        await this.loadData();
        // REMOVIDO: this.addEventListeners() - Movido para loadData para ser chamado após cada re-renderização
    }

    async hide() {}

    async loadData(forceRefresh = false) {
        showLoading();
        try {
            this.data = await dataCache.fetchAllData(forceRefresh); // USANDO CACHE AQUI
            this.frentesMap = new Map(this.data.frentes_servico.map(f => [f.id, f.nome]));
            
            // NOVO: Calcula o mapa de inatividade uma vez para reuso (Necessário para a correção da inatividade)
            const downtimeStatuses = ['parado', 'quebrado'];
            const openDowntimeSessions = groupDowntimeSessions(this.data.equipamento_historico, 'equipamento_id', downtimeStatuses).filter(s => s.end_time === null);
            this.latestDowntimeMap = new Map(openDowntimeSessions.map(s => [
                s.startLog.equipamento_id, {
                    motivo: s.startLog.motivo_parada || 'Não informado',
                    frenteNome: s.frente,
                    startTime: s.startTime,
                }
            ]));

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

                <div class="controle-grid" id="main-grid" style="grid-template-columns: 1fr;">
                    ${this.renderEquipamentosByOwner()}
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

    // --- PAINEL DE MAQUINÁRIO PARADO/QUEBRADO GERAL (COM DURAÇÃO ATUAL) ---
    renderParadosPanel() {
        const { equipamentos = [], proprietarios = [] } = this.data;
        
        const proprietariosMap = new Map(proprietarios.map(p => [p.id, p]));
        const parados = equipamentos.filter(e => e.status === 'parado' || e.status === 'quebrado');
        
        const rows = parados.map(e => {
            const proprietario = proprietariosMap.get(e.proprietario_id)?.nome || 'N/A';
            // Usa o mapa precalculado
            const downtimeInfo = this.latestDowntimeMap.get(e.id) || { motivo: 'Não informado', frenteNome: 'N/A', startTime: e.created_at };
            const statusLabel = this.statusLabels[e.status];
            
            // NOVO: Calcula a duração da parada atual
            const duration = calculateDowntimeDuration(downtimeInfo.startTime, null);

            return `
                <tr>
                    <td><strong>${e.cod_equipamento}</strong></td>
                    <td>${e.descricao}</td>
                    <td>${e.finalidade}</td>
                    <td>${proprietario}</td>
                    <td><span class="caminhao-status-badge status-${e.status}">${statusLabel}</span></td>
                    <td>${downtimeInfo.motivo}</td>
                    <td><strong style="color: var(--accent-danger);">${duration}</strong></td>
                    <td>
                        <button class="action-btn edit-btn-modern btn-parados-action" data-equipamento-id="${e.id}" data-frente-id="${e.frente_id || ''}" title="Finalizar Parada / Mudar Status" data-start-time="${downtimeInfo.startTime}">
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
                                <th>Duração Atual</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.length > 0 ? rows : '<tr><td colspan="8">Nenhum equipamento parado ou quebrado.</td></tr>'}
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

    // NOVO: Renderiza equipamentos agrupados por Proprietário (Reaproveitando a lógica de FrotaView)
    renderEquipamentosByOwner() {
        const { equipamentos = [], frentes_servico = [], proprietarios = [] } = this.data;

        // Mapeia Proprietários e Frentes por ID para fácil acesso
        const proprietariosMap = new Map(proprietarios.map(p => [p.id, p]));
        const frentesMap = new Map(frentes_servico.map(f => [f.id, f]));
        
        // 1. Agrupar equipamentos por Proprietário
        const equipamentosByOwner = new Map();
        
        equipamentos.forEach(equipamento => {
            const ownerName = equipamento.proprietarios?.nome || 'Proprietário Não Informado';
            
            // Adiciona o equipamento ao seu grupo
            if (!equipamentosByOwner.has(ownerName)) {
                equipamentosByOwner.set(ownerName, []);
            }
            equipamentosByOwner.get(ownerName).push(equipamento);
        });

        if (equipamentos.length === 0) {
            return `<div class="empty-state"><i class="ph-fill ph-tractor"></i><p>Nenhum equipamento cadastrado.</p></div>`;
        }

        // 2. Ordenar os Proprietários alfabeticamente
        const sortedOwnerNames = Array.from(equipamentosByOwner.keys()).sort((a, b) => a.localeCompare(b));
        
        let allTablesHTML = '';

        // 3. Gerar HTML para cada grupo (Proprietário)
        sortedOwnerNames.forEach(ownerName => {
            const ownerEquipamentos = equipamentosByOwner.get(ownerName);
            
            // Ordena os equipamentos dentro do grupo por código (numérico)
            ownerEquipamentos.sort((a, b) => {
                 const codA = parseInt(a.cod_equipamento, 10) || Infinity;
                 const codB = parseInt(b.cod_equipamento, 10) || Infinity;
                 return codA - codB;
            });

            const tbodyHTML = ownerEquipamentos.map(e => {
                const frente = e.frente_id ? frentesMap.get(e.frente_id) : null;
                const statusLabel = this.statusLabels[e.status];

                // NOVO: Botão de ação (se ativo, mostra Mover/Status, se inativo, mostra Finalizar)
                let actionButton;
                if (e.status === 'ativo' && e.frente_id) {
                     actionButton = `<button class="btn-primary btn-move-status" style="font-size: 0.8rem; padding: 6px 10px;" data-equipamento-id="${e.id}" data-frente-id="${e.frente_id}">Mover / Status</button>`;
                } else if (e.status === 'ativo' && !e.frente_id) {
                     actionButton = `<button class="btn-secondary btn-assign-modal" data-frente-id="none" data-equipamento-id="${e.id}">Designar</button>`;
                } else {
                     // Máquina Inativa: Usa o startTime precalculado
                     const downtimeInfo = this.latestDowntimeMap.get(e.id) || { startTime: e.created_at };
                     actionButton = `<button class="btn-primary btn-parados-action" data-equipamento-id="${e.id}" data-frente-id="${e.frente_id || ''}" data-start-time="${downtimeInfo.startTime}">Finalizar Parada</button>`;
                }


                return `
                    <tr>
                        <td><strong>${e.cod_equipamento}</strong></td>
                        <td>${e.finalidade}</td>
                        <td>${e.descricao}</td>
                        <td><span class="caminhao-status-badge status-${e.status}">${statusLabel}</span></td>
                        <td>${frente ? frente.nome : '---'}</td>
                        <td style="width: 150px;">${actionButton}</td>
                    </tr>
                `;
            }).join('');
            
            // Estrutura do novo grupo (Reutiliza as classes CSS de frota.css)
            const tableHTML = `
                <div class="owner-frota-group">
                    <h2 class="owner-frota-title">${ownerName} (${ownerEquipamentos.length} Equipament${ownerEquipamentos.length === 1 ? 'o' : 'os'})</h2>
                    <div class="table-wrapper" style="overflow-x: auto;">
                        <table class="data-table-modern frota-owner-table">
                            <thead>
                                <tr>
                                    <th style="width: 100px;">Cód. Equipamento</th>
                                    <th>Finalidade</th>
                                    <th>Descrição</th>
                                    <th>Status</th>
                                    <th>Frente de Serviço</th>
                                    <th style="width: 150px;">Ações</th>
                                </tr>
                            </thead>
                            <tbody>${tbodyHTML}</tbody>
                        </table>
                    </div>
                </div>
            `;
            allTablesHTML += tableHTML;
        });

        // Adiciona o botão "Adicionar Novo" no final para consistência com o painel original
        const addEquipamentoButton = `
            <div style="padding: 0 24px 24px;">
                <button class="btn-primary" onclick="window.dispatchEvent(new CustomEvent('viewChanged', { detail: { view: 'cadastro-equipamentos' } }))">
                    <i class="ph-fill ph-plus-circle"></i>
                    Cadastrar Novo Equipamento
                </button>
            </div>
        `;

        return allTablesHTML + addEquipamentoButton;
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

    // --- CORREÇÃO COMPLETA: Utiliza o timeUtils.js ---
    renderHistorico(equipamentoId = null, frenteId = null, date = null) {
        const { equipamento_historico = [] } = this.data;
        const downtimeStatuses = ['parado', 'quebrado'];
        
        // 1. Agrupa os logs em sessões usando a nova função de helper
        const downtimeSessions = groupDowntimeSessions(equipamento_historico, 'equipamento_id', downtimeStatuses);
        
        // 2. Gera as linhas da tabela a partir das sessões
        return downtimeSessions.map(session => {
            const duration = calculateDowntimeDuration(session.startTime, session.end_time);
            
            const startStatusBadge = `<span class="caminhao-status-badge status-${session.startStatus}">${this.statusLabels[session.startStatus] || session.startStatus}</span>`;
            
            let endStatusLabel;
            if (session.end_time) {
                // Se a sessão terminou (end_time existe), o status final é Ativo (baseado no log de fim)
                endStatusLabel = `<span class="caminhao-status-badge status-ativo">${this.statusLabels['ativo']}</span>`;
            } else {
                // Se ainda está aberta, o status final é o status atual (Parado/Quebrado)
                endStatusLabel = `<span class="caminhao-status-badge status-${session.endStatus}">${this.statusLabels[session.endStatus] || session.endStatus}</span>`;
            }
            
            const endTimeDisplay = session.end_time ? formatDateTime(session.end_time) : '<span style="color: var(--accent-danger);">Em Aberto</span>';
            const durationDisplay = duration;

            return `
                <tr>
                    <td>${session.cod_equipamento} (${session.finalidade})</td>
                    <td>${session.frente}</td>
                    <td>${startStatusBadge}</td>
                    <td>${endStatusLabel}</td> 
                    <td>${session.startLog.motivo_parada || 'Não informado'}</td>
                    <td>${formatDateTime(session.startTime)}</td>
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
            if (btnRefresh) this.loadData(true); // Força refresh
            // MUDANÇA: O botão de designar não está mais na FrenteCard, mas na linha. A frente é determinada pelo dataset ou pelo fato de não haver frente.
            if (btnAssign) { 
                const equipamentoId = btnAssign.dataset.equipamentoId;
                const frenteId = btnAssign.dataset.frenteId === 'none' ? null : btnAssign.dataset.frenteId;
                this.showAssignmentModal(frenteId, equipamentoId);
            }
            if (btnParadosAction) {
                // NOVO: Passa o start-time do dataset do botão
                 this.showParadosActionModal(btnParadosAction.dataset.equipamentoId, btnParadosAction.dataset.frenteId, btnParadosAction.dataset.startTime);
            }
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

            <button class="btn-primary btn-danger" style="width: 100%; margin-top: 10px;" id="btn-status-parada-quebra">Registrar Parada / Quebra</button>
        `;
        
        openModal('Gerenciar Movimentação e Status', modalContent);

        // Handler para Mover para Outra Frente
        document.getElementById('move-equipment-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const newFrenteId = e.target.new_frente_id.value;
            const newFrenteName = this.frentesMap.get(parseInt(newFrenteId));
            if (newFrenteId) {
                // Status permanece 'ativo', apenas a frente é trocada. Usa a hora atual corrigida
                const logTimestamp = getBrtIsoString();
                await this.handleStatusUpdate(equipamento.id, 'ativo', newFrenteId, logTimestamp, `Equipamento movido para Frente ${newFrenteName}!`, 'Movido para nova frente');
            }
        });

        // Handler para Tornar Disponível (Unassign)
        document.getElementById('unassign-equipment-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            // Mantém status 'ativo', mas frente_id = null. Usa a hora atual corrigida
            const logTimestamp = getBrtIsoString();
            await this.handleStatusUpdate(equipamento.id, 'ativo', null, logTimestamp, `Equipamento ${equipamento.cod_equipamento} disponibilizado!`, 'Disponibilizado/desassociado da frente');
        });
        
        // Handler para Parada/Quebra (Redireciona para o modal existente)
        document.getElementById('btn-status-parada-quebra').addEventListener('click', () => {
            closeModal();
            // Chama a função que contém o formulário com o status e o motivo (hora de início é o created_at, mas isso será corrigido no modal)
            this.showStatusUpdateModal(equipamentoId, currentFrenteId); 
        });
    }

    // --- FIM DA NOVA FUNÇÃO ---

    showAssignmentModal(frenteId, equipamentoId = null) {
        const { equipamentos = [], frentes_servico = [] } = this.data;
        
        // B. Fluxo de designar um equipamento que já foi disponibilizado (vindo da lista de proprietários)
        if (equipamentoId) {
             // Filtra frentes ativas/cata com fazenda associada
             const frentesComFazenda = frentes_servico.filter(f => f.fazenda_id && (f.status === 'ativa' || f.status === 'fazendo_cata'));
             const equipamento = equipamentos.find(e => e.id == equipamentoId);


             const modalContent = `
                <p>Designando equipamento: <strong>${equipamento.cod_equipamento} (${equipamento.finalidade})</strong></p>
                <form id="assign-equipamento-form" class="action-modal-form">
                    <input type="hidden" name="equipamento" value="${equipamentoId}">
                    <div class="form-group">
                        <label>Designar para Frente</label>
                        <select name="frente_id" class="form-select" required>
                            <option value="">Selecione a Frente...</option>
                            ${frentesComFazenda.map(f => `<option value="${f.id}">${f.nome} (${this.statusLabels[f.status]})</option>`).join('')}
                        </select>
                    </div>
                    <button type="submit" class="btn-primary">Designar Equipamento</button>
                </form>
            `;
            openModal('Designar Equipamento para Frente', modalContent);

            document.getElementById('assign-equipamento-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const novaFrenteId = e.target.frente_id.value;
                
                showLoading();
                try {
                    // Ao designar, o status é 'ativo' e a frente é associada. Usa a hora atual corrigida
                    const logTimestamp = getBrtIsoString();
                    await updateEquipamentoStatus(equipamentoId, 'ativo', novaFrenteId, logTimestamp, 'Designado para frente');
                    
                    dataCache.invalidateAllData();

                    showToast('Equipamento designado com sucesso!', 'success');
                    closeModal();
                    await this.loadData(true); 
                } catch (error) {
                    handleOperation(error);
                } finally {
                    hideLoading();
                }
            });
             return;
        } 
        
        // Fluxo original do botão + Adicionar (Não é mais usado pelo novo layout de proprietários, mas mantido como fallback)
        
        // Equipamentos que não estão associados a nenhuma frente e não estão quebrados
        const equipamentosDisponiveis = equipamentos.filter(e => !e.frente_id && e.status !== 'quebrado');
        const targetFrente = frentes_servico.find(f => f.id == frenteId);

        if (!targetFrente) return;
        
        if (equipamentosDisponiveis.length === 0) {
             showToast('Nenhum equipamento disponível para designar.', 'info');
             return;
        }

        const modalContent = `
            <form id="assign-equipamento-form" class="action-modal-form">
                <input type="hidden" name="frente_id" value="${frenteId}">
                <div class="form-group">
                    <label>1. Escolha o Equipamento Disponível para a Frente ${targetFrente.nome}</label>
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
                // Ao designar, o status é 'ativo' e a frente é associada. Usa a hora atual corrigida
                const logTimestamp = getBrtIsoString();
                await updateEquipamentoStatus(equipamentoId, 'ativo', frenteId, logTimestamp, 'Designado para frente');
                
                // Invalida o Cache (NOVO)
                dataCache.invalidateAllData();

                showToast('Equipamento designado com sucesso!', 'success');
                closeModal();
                await this.loadData(true); // Força refresh após escrita
            } catch (error) {
                handleOperation(error);
            } finally {
                hideLoading();
            }
        });
    }

    // --- Modal para Ações no Painel de Parados (Finalizar / Mudar Status) ---
    showParadosActionModal(equipamentoId, frenteId, downtimeStartTime) {
        const equipamento = this.data.equipamentos.find(e => e.id == equipamentoId);
        if (!equipamento) return;
        
        const startTime = downtimeStartTime;

        // CORREÇÃO: Usa a função getBrtNowString
        const nowString = getBrtNowString();
        
        // Calcula a duração inicial (para o display)
        const initialDiffMillis = calculateTimeDifference(startTime, nowString);
        const initialDuration = formatMillisecondsToHoursMinutes(initialDiffMillis);
        const durationColor = initialDiffMillis < 0 ? 'var(--accent-danger)' : 'var(--accent-primary)';


        // Filtra frentes que possuem fazenda para designação
        const frentesComFazenda = this.data.frentes_servico.filter(f => f.fazenda_id);

        const modalContent = `
            <p>Equipamento: <strong>${equipamento.cod_equipamento} (${equipamento.finalidade})</strong></p>
            <p style="font-size: 0.9rem; color: var(--text-secondary);">Início da Parada: ${formatDateTime(startTime)}</p>
            
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
                    <input type="datetime-local" name="hora_fim" id="hora_fim_input" class="form-input" value="${nowString}" required>
                </div>
                
                <p style="text-align: center; font-size: 1.1rem; margin-top: 15px;">
                    Duração Total: <strong id="downtime-duration-display" style="color: ${durationColor};">${initialDuration}</strong>
                </p>

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
            
            <script>
                const startTimeIso = '${startTime}';
                const horaFimInput = document.getElementById('hora_fim_input');
                const durationDisplay = document.getElementById('downtime-duration-display');

                // Mapeia as funções de utilidade de tempo para o script inline (Corrigido para Concatenação)
                window.timeUtils = {
                    calculateTimeDifference: (start, end) => {
                         const startMs = new Date(start).getTime();
                         const endMs = new Date(end).getTime();
                         return endMs - startMs;
                    },
                    formatMillisecondsToHoursMinutes: (ms) => {
                         if (ms < 0) ms = 0;
                         const diffHours = Math.floor(ms / (1000 * 60 * 60));
                         const diffMinutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
                         if (diffHours > 0) {
                             return diffHours + 'h ' + diffMinutes + 'm'; 
                         } else {
                             return diffMinutes + 'm'; 
                         }
                    }
                };
                
                function updateDuration() {
                    const endTime = horaFimInput.value;
                    if (!endTime) return;

                    const diffMillis = window.timeUtils.calculateTimeDifference(startTimeIso, endTime);
                    const durationText = window.timeUtils.formatMillisecondsToHoursMinutes(Math.abs(diffMillis));
                    
                    durationDisplay.textContent = durationText;

                    if (diffMillis < 0) {
                        durationDisplay.style.color = 'var(--accent-danger)';
                        durationDisplay.textContent += ' (Inválida)';
                        horaFimInput.classList.add('is-invalid');
                    } else {
                        durationDisplay.style.color = 'var(--accent-primary)';
                        horaFimInput.classList.remove('is-invalid');
                    }
                }
                
                horaFimInput.addEventListener('input', updateDuration);
                updateDuration(); // Garante o estado inicial
            </script>
        `;
        openModal('Finalizar/Mudar Status de Parada', modalContent);

        // Listener para Finalizar Parada
        document.getElementById('finalizar-parada-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const horaFim = form.hora_fim.value;
            const novaFrenteId = form.frente_id.value;
            
            if (calculateTimeDifference(startTime, horaFim) < 0) {
                 showToast('A Hora de Retorno não pode ser anterior à Hora de Início.', 'error');
                 document.getElementById('hora_fim_input').classList.add('is-invalid');
                 return;
            }

            if (!novaFrenteId) {
                showToast('É obrigatório selecionar uma Frente de Serviço para ativar o equipamento.', 'error');
                return;
            }
            
            // O handleStatusUpdate cuida de passar a nova frente_id para o updateEquipamentoStatus
            // Usa a hora de fim do formulário.
            await this.handleStatusUpdate(equipamento.id, 'ativo', novaFrenteId, getBrtIsoString(horaFim), 'Parada Finalizada! Equipamento Ativo.', 'Fim de parada: Ativado para nova frente');
        });
        
        // Listener para Mudar Status Inativo
        document.getElementById('mudar-status-form-parados').addEventListener('submit', async (e) => {
            e.preventDefault();
            const novoStatus = e.target.status_mudanca.value;
            const motivo = e.target.motivo_mudanca.value;
            
            // Usa a hora atual corrigida para logar a mudança de status.
            const logTimestamp = getBrtIsoString();
            
            // Note: Manter a frente_id existente (que é null para parados/quebrados), pois a máquina continua inativa
            await this.handleStatusUpdate(equipamento.id, novoStatus, frenteId, logTimestamp, `Status alterado para ${this.statusLabels[novoStatus]}!`, motivo);
        });
    }


    showStatusUpdateModal(equipamentoId, frenteId) {
        const equipamento = this.data.equipamentos.find(e => e.id == equipamentoId);
        if (!equipamento) return;

        // CORREÇÃO: Usa a função getBrtNowString
        const nowString = getBrtNowString();

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
                
                // Usa a hora de início do formulário
                await this.handleStatusUpdate(equipamento.id, novoStatus, frenteId, getBrtIsoString(horaInicio), 'Parada registrada com sucesso!', motivo);
            });

        } else {
             // Se estiver parado ou quebrado, redireciona para o modal completo (showParadosActionModal)
             // Tenta encontrar o start time do downtime
             const downtimeInfo = this.latestDowntimeMap.get(equipamentoId) || { startTime: equipamento.created_at };
             this.showParadosActionModal(equipamentoId, frenteId, downtimeInfo.startTime); 
        }
    }
    
    async handleStatusUpdate(equipamentoId, novoStatus, frenteId, timestamp, successMessage, motivoParada = null) {
        showLoading();
        try {
            // Se o novo status for ativo, a Frente_id deve ser a frente de destino (frontId ou null se for disponibilizar)
            const newFrenteId = novoStatus === 'ativo' ? (frenteId || null) : null; 
            
            await updateEquipamentoStatus(equipamentoId, novoStatus, newFrenteId, timestamp, motivoParada);
            
            // Invalida o Cache (NOVO)
            dataCache.invalidateAllData();
            
            showToast(successMessage, 'success');
            closeModal();
            await this.loadData(true); // Força refresh após escrita
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading();
        }
    }
}