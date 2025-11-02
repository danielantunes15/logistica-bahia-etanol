// js/views/frota.js
import { fetchAllData, updateCaminhaoStatus, removeCaminhaoFromFila } from '../api.js'; // Adiciona removeCaminhaoFromFila
import { showToast, handleOperation, showLoading, hideLoading } from '../helpers.js';
import { openModal, closeModal } from '../components/modal.js';
import { dataCache } from '../dataCache.js';
import { CAMINHAO_STATUS_LABELS, CAMINHAO_STATUS_CYCLE, PREDEFINED_MOTIVES } from '../constants.js';
import { calculateActiveDuration, calculateDowntimeDuration, formatDateTime, groupDowntimeSessions, getBrtNowString, getBrtIsoString, calculateTimeDifference, formatMillisecondsToHoursMinutes } from '../timeUtils.js'; // Adiciona novos imports de utilidade

const ESTACIONAMENTO_STATUS = ['disponivel', 'patio_vazio']; // Reutiliza a constante para a finalização

export class FrotaView {
    constructor() {
        this.container = null;
        this.data = {};
        this.statusLabels = CAMINHAO_STATUS_LABELS;
        // Armazenar referência do manipulador para remover corretamente
        this._boundClickHandler = null;
    }

    async show() {
        await this.loadData(); // Modificado: Apenas carrega os dados
        this.addEventListeners(); // Modificado: Adiciona listeners após o render
    }

    async hide() {
        // Remove o manipulador global ao sair da view
        if (this.container && this._boundClickHandler) {
            this.container.removeEventListener('click', this._boundClickHandler);
        }
        // Remove o manipulador de clique no documento para fechar menus
        document.removeEventListener('click', this.globalMenuCloser);
    }

    async loadHTML() {
        const totalCaminhoes = this.data.caminhoes ? this.data.caminhoes.length : 0;
        const container = document.getElementById('views-container');
        container.innerHTML = `
            <div id="frota-view" class="view frota-view active-view">
                <div class="frota-header">
                    <h1>Gerenciamento de Frota</h1>
                    <div style="display: flex; gap: 20px; align-items: center;">
                        <span class="frota-total-display" id="frota-total-display">Total de Caminhões: ${totalCaminhoes}</span>
                        <button class="btn-primary" id="refresh-frota">
                            <i class="ph-fill ph-arrows-clockwise"></i>
                            Atualizar
                        </button>
                    </div>
                </div>
                
                <div id="frota-parados-container"></div>
                
                <div id="frota-owner-tables-container" class="frota-table-container">
                    <div class="empty-state">Carregando dados...</div>
                </div>
                </div>
        `;
        this.container = container.querySelector('#frota-view');
    }

    async loadData(forceRefresh = false) {
        showLoading();
        try {
            // Usa fetchAllData para ter acesso ao caminhao_historico
            this.data = await dataCache.fetchAllData(forceRefresh); 
            await this.loadHTML(); // Modificado: Carrega o HTML primeiro
            this.render(); // Modificado: Chama o render principal
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading();
        }
    }

    // NOVO: Método render() para estruturar a view
    render() {
        // Atualiza o total no cabeçalho
        const totalCaminhoes = this.data.caminhoes ? this.data.caminhoes.length : 0;
        const totalDisplay = document.getElementById('frota-total-display');
        if (totalDisplay) {
            totalDisplay.textContent = `Total de Caminhões: ${totalCaminhoes}`;
        }
        
        // 1. Renderiza o novo painel de Caminhões Parados / Quebrados
        const paradosContainer = document.getElementById('frota-parados-container');
        if(paradosContainer) {
            paradosContainer.innerHTML = this.renderParadosPanel();
        }
        
        // 2. Renderiza o conteúdo principal (tabelas por proprietário)
        const ownerTablesContainer = document.getElementById('frota-owner-tables-container');
        if(ownerTablesContainer) {
            this.renderOwnerTables(ownerTablesContainer); // Passa o container
        }
    }

    // NOVO MÉTODO: Copiado e adaptado do controle.js
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
                    <h2>Caminhões Parados / Quebrados (${paradosQuebrados.length})</h2> </div>
                <div class="table-wrapper">
                    <table class="data-table-modern" id="parados-caminhoes-table-frota">
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

    // RENOMEADO: De renderTable para renderOwnerTables
    renderOwnerTables(tableContainer) {
        // Altera o seletor para o novo container
        // const tableContainer = this.container.querySelector('#frota-owner-tables-container'); // Movido para render()
        if (!tableContainer) return;
        
        const { caminhoes = [], frentes_servico = [], caminhao_historico = [] } = this.data;

        // Mapeia as frentes por ID para fácil acesso
        const frentesMap = new Map(frentes_servico.map(f => [f.id, f]));
        
        // NEW: Map latest log timestamp for each truck
        const latestStatusTimeMap = new Map();
        caminhao_historico
            .sort((a, b) => new Date(b.timestamp_mudanca) - new Date(a.timestamp_mudanca))
            .forEach(log => {
                if (!latestStatusTimeMap.has(log.caminhao_id)) {
                    latestStatusTimeMap.set(log.caminhao_id, log.timestamp_mudanca);
                }
            });
        
        // 1. Agrupar caminhões por Proprietário
        const trucksByOwner = new Map();
        
        caminhoes.forEach(caminhao => {
            // Usa o nome do proprietário para o agrupamento
            const ownerName = caminhao.proprietarios?.nome || 'Proprietário Não Informado';
            
            // Adiciona o caminhão ao seu grupo
            if (!trucksByOwner.has(ownerName)) {
                trucksByOwner.set(ownerName, []);
            }
            trucksByOwner.get(ownerName).push(caminhao);
        });

        if (caminhoes.length === 0) {
            tableContainer.innerHTML = `<div class="empty-state"><i class="ph-fill ph-truck"></i><p>Nenhum caminhão cadastrado.</p></div>`;
            return;
        }

        // 2. Ordenar os Proprietários alfabeticamente
        const sortedOwnerNames = Array.from(trucksByOwner.keys()).sort((a, b) => a.localeCompare(b));
        
        let allTablesHTML = '';

        // 3. Gerar HTML para cada grupo (Proprietário)
        sortedOwnerNames.forEach(ownerName => {
            const ownerTrucks = trucksByOwner.get(ownerName);
            
            // Ordena os caminhões dentro do grupo por código (numérico)
            ownerTrucks.sort((a, b) => {
                 const codA = parseInt(a.cod_equipamento, 10) || Infinity;
                 const codB = parseInt(b.cod_equipamento, 10) || Infinity;
                 return codA - codB;
            });

            const tbodyHTML = ownerTrucks.map(caminhao => {
                const status = caminhao.status || 'disponivel';
                const frente = caminhao.frente_id ? frentesMap.get(caminhao.frente_id) : null;
                const fazenda = frente?.fazendas;

                // NEW: Get the start time of the current status
                const currentStatusStartTime = latestStatusTimeMap.get(caminhao.id);
                const activeDuration = currentStatusStartTime ? calculateActiveDuration(currentStatusStartTime) : 'N/A';
                
                // NOVO: Lógica do Ciclo
                const cycleIndex = CAMINHAO_STATUS_CYCLE.indexOf(status);
                const isCycleActive = cycleIndex !== -1;
                const totalSteps = CAMINHAO_STATUS_CYCLE.length;
                const currentStep = isCycleActive ? cycleIndex + 1 : 0;
                const progressPercentage = isCycleActive ? ((currentStep / totalSteps) * 100).toFixed(0) : 0;
                
                // MODIFICADO: HTML do Progresso
                const progressHTML = `
                    <div class="cycle-progress-wrapper">
                        <div class="cycle-progress-bar">
                            <div class="progress-fill status-${status}" style="width: ${progressPercentage}%;"></div>
                        </div>
                        <span class="progress-percentage">${progressPercentage}%</span>
                    </div>
                `;
                
                // MODIFIED: Rótulo da Etapa (Inclui a Duração Ativa)
                const stageNameHTML = `
                    <span class="cycle-stage-name">${this.statusLabels[status]}</span>
                    <span class="cycle-active-duration"> — ${activeDuration}</span>
                `;

                return `
                    <tr>
                        <td>
                            <strong>#${caminhao.cod_equipamento}</strong>
                            <div class="cycle-status-info">
                                ${stageNameHTML}
                                ${isCycleActive ? progressHTML : `<span class="caminhao-status-badge status-${status} non-cycle-status">${this.statusLabels[status]}</span>`}
                            </div>
                        </td>
                        <td>${frente ? `${frente.nome} ${fazenda ? `(${fazenda.nome})` : ''}` : '---'}</td>
                        <td style="text-align: center;">${this.renderActionMenu(caminhao)}</td>
                    </tr>
                `;
            }).join('');
            
            // Estrutura do novo grupo
            const tableHTML = `
                <div class="owner-frota-group">
                    <h2 class="owner-frota-title">${ownerName} (${ownerTrucks.length} Caminh${ownerTrucks.length === 1 ? 'ão' : 'ões'})</h2>
                    <div class="table-wrapper" style="overflow-x: auto;">
                        <table class="data-table-modern frota-owner-table">
                            <thead>
                                <tr>
                                    <th style="width: 300px;">Caminhão / Etapa do Ciclo</th>
                                    <th>Frente de Serviço Atual</th>
                                    <th style="width: 150px; text-align: center;">Ações</th>
                                </tr>
                            </thead>
                            <tbody>${tbodyHTML}</tbody>
                        </table>
                    </div>
                </div>
            `;
            allTablesHTML += tableHTML;
        });

        tableContainer.innerHTML = allTablesHTML;
    }

    // Lógica do menu de ações refatorada
    renderActionMenu(caminhao) {
        const status = caminhao.status;
        let actions = '';
        const cycleStatus = ['indo_carregar', 'carregando', 'retornando', 'patio_carregado', 'descarregando', 'patio_vazio'];

        // Ação 1: Finalizar Ciclo (se estiver em operação/ciclo)
        if (cycleStatus.includes(status)) {
            actions += `
                <button class="btn-status-change" data-caminhao-id="${caminhao.id}" data-novo-status="disponivel">
                    <i class="ph-fill ph-check-circle"></i> Finalizar Ciclo
                </button>`;
        }
        
        // Ação 2: Registrar Parada/Quebra (se não estiver já inativo)
        if (!['quebrado', 'parado'].includes(status)) {
             actions += `
                <button class="btn-status-action btn-danger" data-caminhao-id="${caminhao.id}" data-action="downtime">
                    <i class="ph-fill ph-x-circle"></i> Registrar Parada/Quebra
                </button>`;
        }

        // Ação 3: Marcar como Disponível/Ativo (se estiver quebrado/parado)
        if (['quebrado', 'parado'].includes(status)) {
            actions += `
                <button class="btn-status-action" data-caminhao-id="${caminhao.id}" data-action="makeAvailable">
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
    
    // NOVO: Função para fechar todos os menus
    globalMenuCloser = (e) => {
        // Encontra o botão de menu de ação clicado, se houver
        const clickedActionMenu = e.target.closest('.action-menu');
        
        // Fecha todos os menus que estão abertos E que não são o menu clicado
        this.container.querySelectorAll('.action-menu.show').forEach(menu => {
            if (menu !== clickedActionMenu) {
                 menu.classList.remove('show');
            }
        });
    }

    // NOVO: Modal para Parada/Quebra com Motivo (MODIFICADO para incluir lista)
    showDowntimeModal(caminhaoId) {
        const caminhao = this.data.caminhoes.find(c => c.id == caminhaoId);
        if (!caminhao) return;
        
        // CORREÇÃO: Usa a constante importada
        const motivesOptions = PREDEFINED_MOTIVES.map(motive => 
            `<option value="${motive}">${motive}</option>`
        ).join('');

        const modalContent = `
            <p>Registrar Inatividade para: <strong>${caminhao.cod_equipamento}</strong></p>
            <form id="downtime-form" class="action-modal-form">
                <div class="form-group">
                    <label>Status</label>
                    <select name="status" class="form-select" required>
                        <option value="parado">${this.statusLabels['parado']}</option>
                        <option value="quebrado">${this.statusLabels['quebrado']}</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label>Motivo Pré-Definido (Obrigatório)</label>
                    <select name="motivo_predefinido" id="motivo-predefinido" class="form-select" required>
                        <option value="">Selecione um motivo...</option>
                        ${motivesOptions}
                    </select>
                </div>
                
                <div class="form-group" id="motivo-outros-group" style="display: none;">
                    <label>Especifique o Motivo (Outros)</label>
                    <input type="text" name="motivo_outros" id="motivo-outros" class="form-input" placeholder="Descreva o motivo...">
                </div>
                
                <button type="submit" class="btn-primary">Registrar</button>
            </form>
            `;
        openModal('Registrar Parada ou Quebra', modalContent);

        // CORREÇÃO: Anexar o listener AGORA, após a injeção do HTML no DOM
        const motiveSelect = document.getElementById('motivo-predefinido');
        const othersGroup = document.getElementById('motivo-outros-group');
        const othersInput = document.getElementById('motivo-outros');

        // Lógica para mostrar/ocultar e exigir o campo 'Outros'
        if (motiveSelect && othersGroup && othersInput) {
            motiveSelect.addEventListener('change', function() {
                if (this.value === 'Outros') {
                    // Usa 'flex' porque form-group é display: flex (conforme css)
                    othersGroup.style.display = 'flex'; 
                    othersInput.setAttribute('required', 'required');
                } else {
                    othersGroup.style.display = 'none';
                    othersInput.removeAttribute('required');
                }
            });
        }

        document.getElementById('downtime-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const novoStatus = e.target.status.value;
            const motivoPredefinido = e.target.motivo_predefinido.value;
            const motivoOutros = e.target.motivo_outros.value;
            
            // Lógica para determinar o motivo final
            let motivoFinal = motivoPredefinido;
            if (motivoPredefinido === 'Outros') {
                motivoFinal = motivoOutros.trim() || 'Outros - Não Especifiçado'; 
            }

            // Garante que o campo "Outros" foi preenchido se selecionado
            if (motivoPredefinido === 'Outros' && !motivoOutros.trim()) {
                 showToast('Por favor, especifique o motivo em "Outros".', 'error');
                 return;
            }

            // Fecha o menu de ações antes de iniciar a operação (se ainda estiver aberto)
            e.target.closest('.action-menu.show')?.classList.remove('show');

            // CHAMA A NOVA FUNÇÃO DE FINALIZAÇÃO (que é a antiga handleStatusUpdate)
            this.handleDowntimeFinalization(caminhao.id, novoStatus, `Status atualizado para ${this.statusLabels[novoStatus]}!`, null, motivoFinal);
        });
    }

    // NOVO MÉTODO: Copiado do controle.js para finalizar a inatividade
    showFinalizeDowntimeModal(caminhaoId, startTime) {
        const caminhao = this.data.caminhoes.find(c => c.id == caminhaoId);
        if (!caminhao) return;

        // CORREÇÃO: Usa a função getBrtNowString
        const nowString = getBrtNowString();
        
        // Calcula a duração inicial (para o display)
        const initialDiffMillis = calculateTimeDifference(startTime, nowString);
        const initialDuration = formatMillisecondsToHoursMinutes(initialDiffMillis);
        
        // Define a cor de alerta se a duração inicial for negativa (o que não deveria ocorrer com nowString, mas é uma proteção)
        const durationColor = initialDiffMillis < 0 ? 'var(--accent-danger)' : 'var(--accent-primary)';


        const modalContent = `
            <p>Finalizando inatividade para: <strong>${caminhao.cod_equipamento}</strong></p>
            <p style="font-size: 0.9rem; color: var(--text-secondary);">Início da Inatividade: ${formatDateTime(startTime)}</p>
            
            <form id="finalize-downtime-form-frota" class="action-modal-form">
                <div class="form-group">
                    <label>Hora de Retorno (Fim da Inatividade)</label>
                    <input type="datetime-local" name="hora_fim" id="hora_fim_input_frota" class="form-input" value="${nowString}" required>
                    <p class="form-help">Edite se a hora de retorno for diferente da hora atual.</p>
                </div>
                
                <p style="text-align: center; font-size: 1.1rem; margin-top: 15px;">
                    Duração Total: <strong id="downtime-duration-display-frota" style="color: ${durationColor};">${initialDuration}</strong>
                </p>
                
                <button type="submit" class="btn-primary">Finalizar (Tornar Disponível)</button>
            </form>
            
            <script>
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

                const startTimeIso = '${startTime}';
                const horaFimInput = document.getElementById('hora_fim_input_frota');
                const durationDisplay = document.getElementById('downtime-duration-display-frota');

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
        openModal('Finalizar Inatividade - ' + this.statusLabels[caminhao.status], modalContent);

        document.getElementById('finalize-downtime-form-frota').addEventListener('submit', async (e) => {
            e.preventDefault();
            const horaFim = e.target.hora_fim.value;
            
            // Validação final: o tempo de fim não pode ser anterior ao tempo de início.
            if (calculateTimeDifference(startTime, horaFim) < 0) {
                 showToast('A Hora de Retorno não pode ser anterior à Hora de Início.', 'error');
                 document.getElementById('hora_fim_input_frota').classList.add('is-invalid');
                 return;
            }
            
            // Passa a hora de fim (BRT) e o novo status 'disponivel'
            this.handleDowntimeFinalization(caminhao.id, 'disponivel', 'Inatividade finalizada! Caminhão disponível.', getBrtIsoString(horaFim));
        });
    }

    // NOVO: Lógica unificada de atualização de status (baseada na de controle.js)
    async handleDowntimeFinalization(caminhaoId, novoStatus, successMessage, timestamp = null, motivoParada = null) {
        showLoading(); // INICIA AQUI
        try {
            // CORREÇÃO: Força o uso do instante BRT atual se nenhum timestamp foi fornecido (ação rápida)
            const logTimestamp = timestamp || getBrtIsoString();
            
            // 1. Atualiza o DB (o API.js já cuida de desassociar a frente se for 'disponivel', 'quebrado' ou 'parado')
            await updateCaminhaoStatus(caminhaoId, novoStatus, null, motivoParada, logTimestamp);
            
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


    addEventListeners() {
        // Remove listeners antigos antes de adicionar novos
        if (this.container && this._boundClickHandler) {
            this.container.removeEventListener('click', this._boundClickHandler);
        }
        // Adiciona o manipulador de clique global para fechar menus
        document.addEventListener('click', this.globalMenuCloser); 
        
        // Cria um manipulador de eventos único e armazena a referência
        this._boundClickHandler = async (e) => {
            const target = e.target;
            
            // NOVO: Listener para o botão de finalizar inatividade na nova tabela
            const finalizeDowntimeBtn = target.closest('.btn-finalize-downtime');
            if (finalizeDowntimeBtn) {
                 const caminhaoId = finalizeDowntimeBtn.dataset.caminhaoId;
                 const startTime = finalizeDowntimeBtn.dataset.startTime;
                 this.showFinalizeDowntimeModal(caminhaoId, startTime);
                 return;
            }
            
            const actionMenuButton = target.closest('.action-menu-button');
            if (actionMenuButton) {
                const menu = actionMenuButton.closest('.action-menu');
                // Abre/Fecha o menu clicado
                menu.classList.toggle('show');
                return;
            }
            
            if (target.closest('#refresh-frota')) {
                this.loadData(true); // Força refresh
                return;
            }

            // Ação Simples: Finalizar Ciclo (data-novo-status="disponivel")
            const simpleStatusBtn = target.closest('.btn-status-change');
            if (simpleStatusBtn) {
                const caminhaoId = simpleStatusBtn.dataset.caminhaoId;
                simpleStatusBtn.closest('.action-menu.show')?.classList.remove('show');
                this.handleDowntimeFinalization(caminhaoId, 'disponivel', 'Status do caminhão atualizado para Disponível!');
                return;
            }
            
            // Ações Complexas: Registrar Parada/Quebra ou Marcar como Disponível
            const complexActionBtn = target.closest('.btn-status-action');
            if (complexActionBtn) {
                const caminhaoId = complexActionBtn.dataset.caminhaoId;
                const actionType = complexActionBtn.dataset.action;
                
                complexActionBtn.closest('.action-menu.show')?.classList.remove('show');

                if (actionType === 'downtime') {
                    // Abre o modal para escolher Parado/Quebrado e Motivo
                    this.showDowntimeModal(caminhaoId);
                } else if (actionType === 'makeAvailable') {
                    // Marcar como Disponível (Fim de Parada/Quebra)
                    // (Esta lógica agora é tratada pelo modal de finalização, mas mantemos o fallback)
                    this.handleDowntimeFinalization(caminhaoId, 'disponivel', 'Status do caminhão atualizado para Disponível!');
                }
            }
        };

        // Adiciona o listener ao container
        if (this.container) {
            this.container.addEventListener('click', this._boundClickHandler);
        }
    }
}