// js/views/controle.js

import { fetchAllData, updateCaminhaoStatus, updateFrenteComFazenda, assignCaminhaoToFrente, updateFrenteStatus, removeCaminhaoFromFila } from '../api.js';
import { showToast, handleOperation, showLoading, hideLoading } from '../helpers.js';
import { formatDateTime, calculateDowntimeDuration, getBrtNowString, getBrtIsoString, groupDowntimeSessions, formatMillisecondsToHoursMinutes, calculateTimeDifference } from '../timeUtils.js'; // IMPORTAÇÃO CORRIGIDA (Adiciona calculateTimeDifference e formatMillisecondsToHoursMinutes)
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
        
        // NOVO: 1. Adiciona a referência para o handler
        this._boundStatusUpdateHandler = this.handleStatusUpdate.bind(this);

        // NOVO: Expor a view no window para o script do modal funcionar
        if (window.viewManager) {
             window.viewManager.views.set('controle', this);
        }
        
        // ADICIONADO: Mapa para armazenar a hora da última movimentação
        this.latestStatusTimeMap = new Map();
    }

    async show() {
        await this.loadData();
        // NOVO: 2. Adiciona o listener de Real-Time ao mostrar a view
        window.addEventListener('statusUpdated', this._boundStatusUpdateHandler);
    }

    async hide() {
        // NOVO: 3. Remove o listener ao esconder a view
        window.removeEventListener('statusUpdated', this._boundStatusUpdateHandler);
    }

    // NOVO: 4. Handler para o evento global 'statusUpdated'
    handleStatusUpdate(e) {
        // Tabelas relevantes para esta view
        const relevantTables = ['caminhoes', 'frentes_servico'];
        
        if (relevantTables.includes(e.detail.table)) {
            console.log('Real-Time: ControleView detectou mudança, recarregando...');
            // O dataCache.js já invalidou o cache.
            // loadData(true) força a busca dos novos dados.
            this.loadData(true); 
        }
    }

    async loadData(forceRefresh = false) {
        showLoading(); // Chamada inicial de loading para o show()
        
        // NOVO: 1. Salva a posição de scroll antes de renderizar
        let savedScrollTop = 0;
        // O elemento de view tem a rolagem (overflow-y: auto)
        if (this.container && this.container.scrollTop > 0) {
            savedScrollTop = this.container.scrollTop;
            console.log(`Scroll: Salvando posição ${savedScrollTop}`);
        }

        try {
            this.data = await dataCache.fetchAllData(forceRefresh); // USANDO CACHE AQUI
            
            // ADICIONADO: Pré-calcula o mapa do último status de movimento para a visualização
            this.latestStatusTimeMap = this.calculateLatestStatusTimes(this.data.caminhao_historico);
            
            this.render();
            this.addEventListeners(); // CORREÇÃO: Rebind listeners após renderizar o HTML
            
            // NOVO: 2. Restaura a posição de scroll após renderizar
            if (savedScrollTop > 0) {
                // Pequeno delay para garantir que o navegador complete o redesenho do DOM
                setTimeout(() => {
                     if (this.container) {
                          this.container.scrollTop = savedScrollTop;
                          console.log(`Scroll: Resturando para ${savedScrollTop}`);
                     }
                }, 50); 
            }
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading();
        }
    }
    
    // NOVO MÉTODO
    calculateLatestStatusTimes(history = []) {
        const latestStatusTimeMap = new Map();
        
        // Classifica o histórico do mais recente para o mais antigo (para garantir o primeiro é o mais recente)
        const sortedHistory = history.sort((a, b) => 
            new Date(b.timestamp_mudanca) - new Date(a.timestamp_mudanca)
        );
        
        sortedHistory.forEach(log => {
            // Apenas registra o primeiro (mais recente) log para cada caminhão
            if (!latestStatusTimeMap.has(log.caminhao_id)) {
                latestStatusTimeMap.set(log.caminhao_id, log.timestamp_mudanca);
            }
        });
        
        return latestStatusTimeMap;
    }

    render() {
        // --- MODIFICAÇÃO INICIA AQUI: Lógica de Agrupamento e Contagem ---
        const { frentes_servico = [], caminhoes = [] } = this.data;
        
        // 1. Agrupar Frentes
        const frentesCanaInteira = frentes_servico
            .filter(f => f.tipo_producao === 'MANUAL')
            .sort((a, b) => a.nome.localeCompare(b.nome));
            
        const frentesCanaMecanizada = frentes_servico
            .filter(f => f.tipo_producao === 'MECANIZADA')
            .sort((a, b) => a.nome.localeCompare(b.nome));
            
        const frentesOutras = frentes_servico
            .filter(f => f.tipo_producao !== 'MANUAL' && f.tipo_producao !== 'MECANIZADA')
            .sort((a, b) => a.nome.localeCompare(b.nome));

        // 2. Obter IDs para contagem
        const inteiraIDs = new Set(frentesCanaInteira.map(f => f.id));
        const mecanizadaIDs = new Set(frentesCanaMecanizada.map(f => f.id));
        const outrasIDs = new Set(frentesOutras.map(f => f.id));

        // 3. Contar Caminhões 
        let countInteira = 0;
        let countMecanizada = 0;
        let countOutras = 0;

        // Contar apenas caminhões que estão em operação (não 'disponivel', 'parado', 'quebrado')
        const operationalStatuses = ['indo_carregar', 'carregando', 'retornando', 'patio_carregado', 'descarregando', 'patio_vazio'];
        
        caminhoes.forEach(c => {
            if (c.frente_id && operationalStatuses.includes(c.status)) {
                if (inteiraIDs.has(c.frente_id)) {
                    countInteira++;
                } else if (mecanizadaIDs.has(c.frente_id)) {
                    countMecanizada++;
                } else if (outrasIDs.has(c.frente_id)) {
                    countOutras++;
                }
            }
        });
        // --- MODIFICAÇÃO TERMINA AQUI ---

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
                
                <div class="frente-group-header">
                    <h2>Frentes de Cana Inteira</h2>
                    <span class="frente-group-truck-count">
                        <i class="ph-fill ph-truck"></i> ${countInteira} Caminhões 
                    </span>
                </div>
                <div class="controle-grid" id="main-grid-top">
                    ${this.renderFrentes(frentesCanaInteira)}
                </div>
                
                <div class="frente-group-header">
                    <h2>Frentes de Cana Mecanizada</h2>
                    <span class="frente-group-truck-count">
                        <i class="ph-fill ph-truck"></i> ${countMecanizada} Caminhões 
                    </span>
                </div>
                <div class="controle-grid" id="main-grid-bottom">
                    ${this.renderFrentes(frentesCanaMecanizada)}
                </div>
                
                ${frentesOutras.length > 0 ? `
                <div class="frente-group-header">
                    <h2>Outras Frentes (Sem Grupo / Agro Unione)</h2>
                    <span class="frente-group-truck-count">
                        <i class="ph-fill ph-truck"></i> ${countOutras} Caminhões 
                    </span>
                </div>
                <div class="controle-grid" id="main-grid-outras">
                    ${this.renderFrentes(frentesOutras)}
                </div>
                ` : ''}
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

    // renderParadosPanel() FOI MOVIDO PARA frota.js

    // --- MODIFICAÇÃO AQUI: Aceita um array de frentes como argumento ---
    renderFrentes(frentesArray) {
        const { caminhoes = [] } = this.data;
        
        // Se o array estiver vazio, mostra uma mensagem
        if (frentesArray.length === 0) {
            return `<div class="empty-state-frente-grid">Nenhuma frente ativa neste grupo.</div>`;
        }
        
        return frentesArray.map(frente => {
        // --- FIM DA MODIFICAÇÃO ---
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
                                ${caminhoesEmOperacao.length > 0 ? caminhoesEmOperacao.map(c => {
                                     // ALTERAÇÃO PRINCIPAL AQUI: Adiciona o tooltip com a hora da última movimentação
                                     const latestTime = this.latestStatusTimeMap.get(c.id);
                                     const formattedTime = latestTime ? formatDateTime(latestTime) : 'N/A';
                                     const tooltip = `Última Movimentação: ${formattedTime}`;
                                     
                                     return `
                                    <tr>
                                        <td>
                                            <strong title="${tooltip}">${c.cod_equipamento}</strong>
                                        </td>
                                        <td><span class="caminhao-status-badge status-${c.status}">${this.statusLabels[c.status]}</span></td>
                                        <td><button class="btn-primary" style="font-size: 0.8rem; padding: 6px 10px;" data-caminhao-id="${c.id}">Alterar Status</button></td>
                                    </tr>
                                    `
                                }).join('') : '<tr><td colspan="3">Nenhum caminhão em operação.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }).join('');
    }

    // NOVO: Função dedicada para a lógica de atribuição (reutilizável)
    async handleAssignTruck(caminhaoId, frenteId, status, hora) {
        showLoading();
        try {
            // 1. Designa o caminhão e atualiza status no DB
            await assignCaminhaoToFrente(caminhaoId, frenteId, status, getBrtIsoString(hora));
            
            // 2. Remove da fila de estacionamento persistida
            await removeCaminhaoFromFila(caminhaoId); 
            
            // 3. Invalida o Cache
            dataCache.invalidateAllData();

            // *** MELHORIA: Mensagem de toast mais genérica ***
            showToast('Caminhão realocado e novo ciclo iniciado!', 'success');
            closeModal();
            await this.loadData(true); 
        } catch (error) {
            handleOperation(error); 
        } finally {
            hideLoading(); 
        }
    }
    
    // MODIFICADO: Modal para o fluxo de Finalizar Ciclo (com seletor de status)
    showFinalizeCycleModal(caminhaoId) {
        const { caminhoes = [], frentes_servico = [] } = this.data;
        const caminhao = caminhoes.find(c => c.id == caminhaoId);
        if (!caminhao) return;

        // Filtra para mostrar apenas frentes ATIVAS (ativa ou fazendo_cata) e com fazenda associada
        const frentesAtivas = frentes_servico
            .filter(f => f.fazenda_id && (f.status === 'ativa' || f.status === 'fazendo_cata'))
            .sort((a, b) => a.nome.localeCompare(b.nome));

        // Usa a função getBrtNowString para o valor inicial do formulário
        const nowString = getBrtNowString();
        
        // *** MELHORIA: Gera as opções de status do ciclo ***
        const statusOptionsHTML = this.statusCiclo.map(s => 
            `<option value="${s}">${this.statusLabels[s]}</option>`
        ).join('');
        
        const modalContent = `
            <p>Caminhão: <strong>${caminhao.cod_equipamento}</strong> - Ciclo Finalizado.</p>
            <p class="form-help">Escolha a ação para o caminhão após o ciclo de retorno/descarga:</p>

            <hr style="margin: 20px 0; border-color: var(--border-color);">

            <h4>Opção 1: Realocar para Nova Frente de Serviço</h4>
            <form id="reallocate-cycle-form" class="action-modal-form" style="margin-bottom: 20px;">
                <input type="hidden" name="caminhaoId" value="${caminhaoId}">
                <div class="form-group">
                    <label>Frente de Destino</label>
                    <select name="frente" class="form-select" required>
                        <option value="">Selecione a Frente (Obrigatório)</option>
                        ${frentesAtivas.map(f => `<option value="${f.id}">${f.nome} (${this.frenteStatusLabels[f.status]})</option>`).join('')}
                    </select>
                </div>
                
                <div class="form-group">
                    <label>Etapa Inicial do Novo Ciclo</label>
                    <select name="status" class="form-select" required>
                        ${statusOptionsHTML}
                    </select>
                </div>
                
                <div class="form-group">
                    <label>Hora de Início da Etapa</label>
                    <input type="datetime-local" name="hora" class="form-input" value="${nowString}" required>
                </div>
                <button type="submit" class="btn-primary">
                    <i class="ph-fill ph-plus-circle"></i> Iniciar Novo Ciclo
                </button>
            </form>

            <hr style="margin: 20px 0; border-color: var(--border-color);">

            <h4>Opção 2: Deixar no Pátio Vazio</h4>
            <p class="form-help">O caminhão será marcado como "Pátio Vazio" e estará pronto para ser designado manualmente via "Fila Estacionamento" ou "Fazer Ação".</p>
            <button id="btn-set-patio-vazio" class="btn-secondary" style="background-color: #805AD5;">
                <i class="ph-fill ph-warehouse"></i> Marcar como Pátio Vazio
            </button>
        `;
        openModal('Ação Pós-Ciclo - ' + caminhao.cod_equipamento, modalContent);

        // Listener para Opção 1: Realocar
        document.getElementById('reallocate-cycle-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = e.target;
            const frenteId = formData.frente.value;
            const status = formData.status.value; // *** MELHORIA: Lê o status selecionado ***
            const hora = formData.hora.value;
            
            if (!frenteId) {
                showToast('Selecione uma Frente de Destino.', 'error');
                return;
            }
            
            // *** MELHORIA: Passa o status selecionado ***
            this.handleAssignTruck(caminhaoId, frenteId, status, hora); 
        });

        // Listener para Opção 2: Pátio Vazio
        document.getElementById('btn-set-patio-vazio').addEventListener('click', () => {
            // Usa 'patio_vazio' e o status atual para a frente (null, pois está finalizando o ciclo)
            this.handleStatusUpdate(caminhaoId, 'patio_vazio', null, 'Caminhão movido para Pátio Vazio!');
        });
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
            
            // REMOVIDO: Listener para finalizar inatividade (movido para frota.js)
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

            // REUTILIZA A NOVA FUNÇÃO
            this.handleAssignTruck(caminhaoId, frenteId, status, hora);
        });
    }

    // showFinalizeDowntimeModal() FOI MOVIDO PARA frota.js

    // MODIFICADO: showStatusUpdateModal agora chama o NOVO modal de finalizar ciclo
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

                `;
             openModal('Gerenciar Inatividade - ' + caminhao.cod_equipamento, downtimeForm);
             
             document.getElementById('status-update-form').addEventListener('submit', async (e) => {
                 e.preventDefault();
                 const novoStatus = e.target.status.value;
                 const motivo = e.target.motivo.value;
                 this.handleStatusUpdate(caminhao.id, novoStatus, caminhao.frente_id, 'Status e motivo atualizados!', motivo);
             });
             
             // Este botão não funcionará mais aqui, pois a função foi movida.
             // A lógica de finalização agora está em frota.js
             document.getElementById('btn-finalizar-downtime').addEventListener('click', () => {
                 showToast('Esta ação foi movida para a tela de Gerenciamento de Frota.', 'info');
                 closeModal();
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
                <button type="button" id="btn-finalizar-ciclo" class="btn-secondary">Finalizar Ciclo</button>
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

        // MODIFICAÇÃO CHAVE AQUI: Chama o novo modal de escolha
        document.getElementById('btn-finalizar-ciclo').addEventListener('click', () => {
             closeModal();
             this.showFinalizeCycleModal(caminhao.id);
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