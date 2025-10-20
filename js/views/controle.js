// js/views/controle.js

import { fetchAllData, updateCaminhaoStatus, updateFrenteComFazenda, assignCaminhaoToFrente, updateFrenteStatus, removeCaminhaoFromFila } from '../api.js';
import { showToast, handleOperation, showLoading, hideLoading } from '../helpers.js';
import { formatDateTime, calculateDowntimeDuration, getBrtNowString, getBrtIsoString, groupDowntimeSessions } from '../timeUtils.js'; // IMPORTAÇÃO CORRIGIDA (Adiciona groupDowntimeSessions)
import { openModal, closeModal } from '../components/modal.js';
import { dataCache } from '../dataCache.js';
import { CAMINHAO_STATUS_LABELS, CAMINHAO_STATUS_CYCLE, FRENTE_STATUS_LABELS } from '../constants.js';

const ESTACIONAMENTO_STATUS = ['disponivel', 'patio_vazio']; // Status que indicam que o caminhão está na fila/pátio

export class ControleView {
    constructor() {
        this.container = null;
        this.data = {};
        this.statusCiclo = CAMINHAO_STATUS_CYCLE;
        this.statusLabels = CAMINHAO_STATUS_LABELS;
        
        this.frenteStatusLabels = FRENTE_STATUS_LABELS;
        
        // NOVO: Expor a view no window para o script do modal funcionar
        if (window.viewManager) {
             window.viewManager.views.set('controle', this);
        }
    }

    async show() {
        await this.loadData();
    }

    async hide() {}

    async loadData(forceRefresh = false) {
        showLoading(); // Chamada inicial de loading para o show()
        try {
            this.data = await dataCache.fetchAllData(forceRefresh); // USANDO CACHE AQUI
            this.render();
            this.addEventListeners(); // CORREÇÃO: Rebind listeners após renderizar o HTML
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
                
                ${this.renderParadosPanel()} 

                <div class="controle-grid" id="main-grid">
                    ${this.renderFrentes()}
                </div>
            </div>
        `;
        this.container = container.querySelector('#controle-view');
    }

    renderDashboardSummary() {
        const { caminhoes = [] } = this.data;
        // Incluído 'parado' na contagem
        const statusesToCount = [...this.statusCiclo, 'quebrado', 'parado']; 
        const statusCounts = {};
        
        // Contagem de todos os status (incluindo 'disponivel')
        const allStatuses = [...statusesToCount, 'disponivel'];
        allStatuses.forEach(status => { statusCounts[status] = 0; });


        caminhoes.forEach(caminhao => {
            if (statusCounts.hasOwnProperty(caminhao.status)) {
                statusCounts[caminhao.status]++;
            }
        });

        // --- CÁLCULO PARA O NOVO CARD DE DISPONIBILIDADE ---
        const disponiveisParaUso = (statusCounts['disponivel'] || 0) + (statusCounts['patio_vazio'] || 0);
        
        const summaryCards = `
            <div class="summary-card summary-disponivel" style="border-color: var(--accent-primary);">
                <div class="summary-card-value">${disponiveisParaUso}</div>
                <div class="summary-card-label">Caminhões Disponíveis</div>
            </div>
            ${statusesToCount.map(status => `
                <div class="summary-card summary-${status}">
                    <div class="summary-card-value">${statusCounts[status]}</div>
                    <div class="summary-card-label">${this.statusLabels[status]}</div>
                </div>
            `).join('')}
        `;

        return `
            <div class="controle-dashboard-summary">
                ${summaryCards}
            </div>
        `;
    }

    // MODIFICADO: Painel de Caminhões Parados / Quebrados (Com Data/Hora e Duração)
    renderParadosPanel() {
        const { caminhoes = [], caminhao_historico = [] } = this.data;
        const downtimeStatus = ['parado', 'quebrado'];
        const paradosQuebrados = caminhoes.filter(c => downtimeStatus.includes(c.status));
        
        // CORREÇÃO DA LÓGICA: Usa a função de utilidade para obter SESSÕES de inatividade.
        const allDowntimeSessions = groupDowntimeSessions(caminhao_historico, 'caminhao_id', downtimeStatus);
        
        // Filtra apenas as sessões ATIVAS (end_time === null)
        const openDowntimeSessions = allDowntimeSessions.filter(s => s.end_time === null);
        
        // Mapeia as sessões abertas pelo ID do caminhão para fácil lookup
        const downtimeInfoMap = new Map();
        openDowntimeSessions.forEach(session => {
            // Usa os dados do log de início para o motivo e hora de início
            downtimeInfoMap.set(session.startLog.caminhao_id, {
                startTime: session.startTime, 
                motivo: session.startLog.motivo_parada || 'Não informado',
                currentStatus: session.startStatus 
            });
        });

        // Re-processa apenas os caminhões atualmente parados
        const rows = paradosQuebrados.map(c => {
            // Tenta encontrar a sessão aberta no mapa
            const info = downtimeInfoMap.get(c.id) || { startTime: c.created_at, motivo: 'N/A', currentStatus: c.status };
            
            // Calcula a duração da parada atual
            const duration = calculateDowntimeDuration(info.startTime, null); 
            
            return `
                <tr>
                    <td><strong>${c.cod_equipamento}</strong></td>
                    <td><span class="caminhao-status-badge status-${c.status}">${this.statusLabels[c.status]}</span></td>
                    <td>${info.motivo}</td>
                    <td>${formatDateTime(info.startTime)}</td>
                    <td><span style="font-weight: 600;">${duration}</span></td>
                    <td>
                        <button class="btn-secondary btn-finalize-downtime" style="font-size: 0.8rem; padding: 6px 10px;" data-caminhao-id="${c.id}" data-start-time="${info.startTime}">
                            Finalizar
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <div class="historico-container" style="margin-bottom: 32px;">
                <div class="historico-header">
                    <h2>Caminhões Parados / Quebrados</h2> </div>
                <div class="table-wrapper">
                    <table class="data-table-modern" id="parados-caminhoes-table">
                        <thead>
                            <tr>
                                <th>Cód. Caminhão</th>
                                <th>Status</th>
                                <th>Motivo da Parada / Quebra</th>
                                <th>Início da Parada</th>
                                <th>Duração (H/M)</th>
                                <th style="width: 1%;">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.length > 0 ? rows : '<tr><td colspan="6">Nenhum caminhão atualmente parado ou quebrado.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    renderFrentes() {
        const { frentes_servico = [], caminhoes = [] } = this.data;
        
        // NOVO: Ordenar frentes por nome alfabeticamente
        frentes_servico.sort((a, b) => a.nome.localeCompare(b.nome)); 
        
        return frentes_servico.map(frente => {
            const caminhoesEmOperacao = caminhoes.filter(c => c.frente_id === frente.id && c.status !== 'disponivel');
            const fazendaAtual = frente.fazendas;
            const frenteStatus = frente.status || 'inativa'; // Garante um status

            return `
                <div class="frente-card">
                    <div class="frente-header">
                        <div class="frente-header-main">
                            <i class="ph-fill ph-users-three"></i><h3>${frente.nome}</h3>
                            <span class="frente-status-badge status-${frenteStatus}">${this.frenteStatusLabels[frenteStatus]}</span>
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
                        <h4>Ações da Frente</h4>
                        <div class="frente-status-actions">
                            <button class="btn-secondary btn-frente-status" data-frente-id="${frente.id}" data-current-status="${frenteStatus}">Mudar Status</button>
                        </div>
                        
                        <h4 style="margin-top: 15px;">Caminhões em Operação</h4>
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

    addEventListeners() {
        this.container.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;

            if (btn.id === 'btn-fazer-acao') this.showAssignmentModal();
            if (btn.classList.contains('btn-alterar-fazenda')) this.showFazendaSelector(btn.dataset.frenteId);
            if (btn.classList.contains('btn-frente-status')) this.showFrenteStatusModal(btn.dataset.frenteId, btn.dataset.currentStatus); 
            
            if (btn.dataset.caminhaoId && !btn.closest('#action-modal-form')) {
                this.showStatusUpdateModal(btn.dataset.caminhaoId);
            }
            
            // NOVO: Listener para finalizar inatividade
            if (btn.classList.contains('btn-finalize-downtime')) {
                this.showFinalizeDowntimeModal(btn.dataset.caminhaoId, btn.dataset.startTime);
            }
        });
    }

    showFrenteStatusModal(frenteId, currentStatus) {
        const optionsHTML = Object.entries(this.frenteStatusLabels).map(([statusKey, statusLabel]) => 
            `<option value="${statusKey}" ${statusKey === currentStatus ? 'selected' : ''}>${statusLabel}</option>`
        ).join('');

        const modalContent = `
            <form id="frente-status-form" class="action-modal-form">
                <p>Status atual: <strong>${this.frenteStatusLabels[currentStatus]}</strong></p>
                <div class="form-group">
                    <label>Novo Status da Frente</label>
                    <select name="new_status" class="form-select" required>
                        ${optionsHTML}
                    </select>
                </div>
                <button type="submit" class="btn-primary">Atualizar Status</button>
            </form>
        `;
        openModal('Alterar Status da Frente', modalContent);

        document.getElementById('frente-status-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const newStatus = e.target.new_status.value;
            this.handleFrenteStatusUpdate(frenteId, newStatus);
        });
    }

    async handleFrenteStatusUpdate(frenteId, newStatus) {
        showLoading(); // INICIA AQUI
        try {
            // 1. Atualiza o DB
            await updateFrenteStatus(frenteId, newStatus);
            
            // 2. Invalida o Cache (NOVO)
            dataCache.invalidateAllData();
            
            // 3. Feedback RÁPIDO para o usuário
            showToast(`Status da frente atualizado para ${this.frenteStatusLabels[newStatus]}!`, 'success');
            closeModal();
            
            // 4. Recarrega os DADOS (a parte LENTA)
            await this.loadData(true); // Força refresh após escrita
            
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading(); // FINALIZA APÓS O loadData() (ou após o erro)
        }
    }

    showAssignmentModal() {
        const { caminhoes = [], frentes_servico = [] } = this.data;
        // --- CORREÇÃO AQUI: Mostra caminhões 'disponivel' OU sem status definido (null) ---
        let caminhoesDisponiveis = caminhoes.filter(c => c.status === 'disponivel' || c.status === 'patio_vazio' || !c.status);
        
        // NOVO: Ordenação numérica dos caminhões disponíveis
        caminhoesDisponiveis.sort((a, b) => {
            const codA = parseInt(a.cod_equipamento, 10);
            const codB = parseInt(b.cod_equipamento, 10);
            return codA - codB;
        });
        
        // CORREÇÃO: Usa a função getBrtNowString para o valor inicial do formulário
        const nowString = getBrtNowString();

        // Filtra para mostrar apenas frentes ATIVAS (ativa ou fazendo_cata) e com fazenda associada
        // E ORDENA POR NOME ALFABETICAMENTE
        const frentesAtivas = frentes_servico
            .filter(f => f.fazenda_id && (f.status === 'ativa' || f.status === 'fazendo_cata'))
            .sort((a, b) => a.nome.localeCompare(b.nome));

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
                    <label>2. Escolha a Frente de Destino (Apenas frentes Ativas)</label>
                    <select name="frente" class="form-select" required>
                        <option value="">Selecione...</option>
                        ${frentesAtivas.map(f => `<option value="${f.id}">${f.nome} (${this.frenteStatusLabels[f.status]})</option>`).join('')}
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
                // 1. Designa o caminhão e atualiza status no DB
                await assignCaminhaoToFrente(caminhaoId, frenteId, status, getBrtIsoString(hora));
                
                // 2. Remove da fila de estacionamento persistida
                await removeCaminhaoFromFila(caminhaoId); 
                
                // 3. Invalida o Cache (NOVO)
                dataCache.invalidateAllData();

                showToast('Caminhão designado com sucesso!', 'success');
                closeModal();
                await this.loadData(true); // Força refresh após escrita
            } catch (error) {
                handleOperation(error);
            } finally {
                hideLoading();
            }
        });
    }

    // NOVO: Modal para finalizar inatividade com edição de data/hora
    showFinalizeDowntimeModal(caminhaoId, startTime) {
        const caminhao = this.data.caminhoes.find(c => c.id == caminhaoId);
        if (!caminhao) return;

        // CORREÇÃO: Usa a função getBrtNowString
        const nowString = getBrtNowString();

        const modalContent = `
            <p>Finalizando inatividade para: <strong>${caminhao.cod_equipamento}</strong></p>
            <p style="font-size: 0.9rem; color: var(--text-secondary);">Início da Inatividade: ${formatDateTime(startTime)}</p>
            
            <form id="finalize-downtime-form" class="action-modal-form">
                <div class="form-group">
                    <label>Hora de Retorno (Fim da Inatividade)</label>
                    <input type="datetime-local" name="hora_fim" class="form-input" value="${nowString}" required>
                    <p class="form-help">Edite se a hora de retorno for diferente da hora atual.</p>
                </div>
                
                <button type="submit" class="btn-primary">Finalizar (Tornar Disponível)</button>
            </form>
        `;
        openModal('Finalizar Inatividade - ' + this.statusLabels[caminhao.status], modalContent);

        document.getElementById('finalize-downtime-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const horaFim = e.target.hora_fim.value;
            
            // Passa a hora de fim (BRT) e o novo status 'disponivel'
            this.handleStatusUpdate(caminhaoId, 'disponivel', null, 'Ciclo finalizado, caminhão disponível!', null, getBrtIsoString(horaFim));
        });
    }

    // MODIFICADO: showStatusUpdateModal agora chama showFinalizeDowntimeModal quando for o caso.
    showStatusUpdateModal(caminhaoId) {
        const caminhao = this.data.caminhoes.find(c => c.id == caminhaoId);
        if (!caminhao) return;

        const isDowntimeStatus = ['quebrado', 'parado'];
        const isCurrentDowntime = isDowntimeStatus.includes(caminhao.status);
        
        let initialMotivo = '';
        if (isCurrentDowntime) {
             const latestLog = this.data.caminhao_historico.find(log => log.caminhao_id === caminhaoId && isDowntimeStatus.includes(log.status_novo));
             initialMotivo = latestLog?.motivo_parada || '';
        }

        // Se o caminhão está parado/quebrado, oferece o modal de gerenciamento/finalização da inatividade.
        if (isCurrentDowntime) {
             // Tenta encontrar a hora de início para passar ao modal de finalização
             const openSessions = groupDowntimeSessions(this.data.caminhao_historico, 'caminhao_id', isDowntimeStatus).filter(s => s.end_time === null && s.startLog.caminhao_id === caminhaoId);
             
             let startTime = caminhao.created_at; // Fallback
             if (openSessions.length > 0) {
                 startTime = openSessions[0].startTime;
             }

             
             // Se o status é de inatividade, oferece o modal de finalização/edição do status da inatividade
             const downtimeForm = `
                <p>Status atual: <strong>${this.statusLabels[caminhao.status]}</strong></p>
                <p style="font-size: 0.9rem; color: var(--text-secondary);">Início da Inatividade: ${formatDateTime(startTime)}</p>
                
                <form id="status-update-form" class="action-modal-form">
                    <div class="form-group">
                        <label>Alterar para Status de Inatividade (Mudar Motivo)</label>
                        <select name="status" id="novo-status-caminhao" class="form-select" required>
                        <option value="parado" ${caminhao.status === 'parado' ? 'selected' : ''}>${this.statusLabels['parado']}</option>
                        <option value="quebrado" ${caminhao.status === 'quebrado' ? 'selected' : ''}>${this.statusLabels['quebrado']}</option>
                        </select>
                    </div>
                    
                    <div class="form-group" id="motivo-parada-group">
                        <label>Novo Motivo (Obrigatório para atualização)</label>
                        <input type="text" name="motivo" class="form-input" value="${initialMotivo}" required placeholder="Ex: Manutenção preventiva, Esperando pneu">
                    </div>
                    
                    <button type="submit" class="btn-secondary">Atualizar Status/Motivo</button>
                    
                </form>
                
                <hr style="margin: 20px 0; border-color: var(--border-color);">
                
                <button type="button" id="btn-finalizar-downtime" class="btn-primary">
                    <i class="ph-fill ph-check-circle"></i> Finalizar Inatividade
                </button>

                <script>
                    document.getElementById('btn-finalizar-downtime').addEventListener('click', function() {
                        closeModal(); // Fecha o modal atual
                        // Chama o método da instância da view
                        window.viewManager.views.get('controle').showFinalizeDowntimeModal('${caminhaoId}', '${startTime}'); 
                    });
                </script>
             `;
             openModal('Gerenciar Inatividade - ' + caminhao.cod_equipamento, downtimeForm);
             
             document.getElementById('status-update-form').addEventListener('submit', async (e) => {
                 e.preventDefault();
                 const novoStatus = e.target.status.value;
                 const motivo = e.target.motivo.value;
                 this.handleStatusUpdate(caminhaoId, novoStatus, caminhao.frente_id, 'Status e motivo atualizados!', motivo);
             });
             
             return;
        }


        // Caso Normal: Caminhão em Ciclo ou Disponível
        const statusOptions = [...this.statusCiclo, 'quebrado', 'disponivel', 'parado']; 

        const modalContent = `
            <p>Alterando status de: <strong>${caminhao.cod_equipamento}</strong></p>
            <form id="status-update-form" class="action-modal-form">
                <div class="form-group">
                    <label>Selecione o Novo Status</label>
                    <select name="status" id="novo-status-caminhao" class="form-select" required>
                    ${statusOptions.map(s => `<option value="${s}" ${caminhao.status === s ? 'selected' : ''}>${this.statusLabels[s]}</option>`).join('')}
                    </select>
                </div>
                
                <div class="form-group" id="motivo-parada-group" style="display: none;">
                    <label>Motivo da Parada / Quebra (Obrigatório para Parado/Quebrado)</label>
                    <input type="text" name="motivo" class="form-input" placeholder="Ex: Manutenção preventiva, Esperando pneu">
                </div>
                
                <button type="submit" class="btn-primary">Atualizar Status</button>
                <button type="button" id="btn-finalizar-ciclo" class="btn-secondary">Finalizar Ciclo (Tornar Disponível)</button>
            </form>
            
            <script>
                document.getElementById('novo-status-caminhao').addEventListener('change', function() {
                    const statusGroup = document.getElementById('motivo-parada-group');
                    const selectedStatus = this.value;
                    if (selectedStatus === 'quebrado' || selectedStatus === 'parado') {
                        statusGroup.style.display = 'flex';
                        statusGroup.querySelector('input').setAttribute('required', 'required');
                    } else {
                        statusGroup.style.display = 'none';
                        statusGroup.querySelector('input').removeAttribute('required');
                    }
                });
            </script>
        `;
        openModal('Alterar Status do Caminhão', modalContent);

        const form = document.getElementById('status-update-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const novoStatus = e.target.status.value;
            const motivo = e.target.motivo.value;
            
            const motivoParaAPI = (novoStatus === 'quebrado' || novoStatus === 'parado') ? motivo : null;
            
            this.handleStatusUpdate(caminhao.id, novoStatus, caminhao.frente_id, 'Status atualizado!', motivoParaAPI);
        });

        document.getElementById('btn-finalizar-ciclo').addEventListener('click', () => {
             this.handleStatusUpdate(caminhao.id, 'disponivel', null, 'Ciclo finalizado, caminhão disponível!');
        });
    }
    
    // MODIFICADO: Inclui timestamp para permitir edição da hora de fim de ciclo
    async handleStatusUpdate(caminhaoId, novoStatus, frenteId, successMessage, motivoParada = null, timestamp = null) {
        showLoading(); // INICIA AQUI
        try {
            // CORREÇÃO: Força o uso do instante BRT atual se nenhum timestamp foi fornecido (ação rápida)
            const logTimestamp = timestamp || getBrtIsoString();
            
            // 1. Atualiza o DB (o API.js já cuida de desassociar a frente se for 'disponivel', 'quebrado' ou 'parado')
            await updateCaminhaoStatus(caminhaoId, novoStatus, frenteId, motivoParada, logTimestamp);
            
            // 2. NOVO: Se o caminhão saiu do pátio/fila (status não é de estacionamento), remove da tabela fila_carregamento
            if (!ESTACIONAMENTO_STATUS.includes(novoStatus)) {
                 await removeCaminhaoFromFila(caminhaoId);
            }
            
            // 3. Invalida o Cache (NOVO)
            dataCache.invalidateAllData();
            
            // 4. Feedback RÁPIDO para o usuário
            showToast(successMessage, 'success');
            closeModal();
            
            // 5. Recarrega os DADOS (a parte LENTA)
            await this.loadData(true); // Força refresh após escrita
            
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
                
                // Invalida o Cache (NOVO)
                dataCache.invalidateAllData();

                showToast('Fazenda atualizada com sucesso!', 'success');
                closeModal();
                await this.loadData(true); // Força refresh após escrita
            } catch (error) {
                handleOperation(error);
            } finally {
                hideLoading();
            }
        });
    }
}