// js/helpers.js
/**
 * Exibe uma notificação toast moderna com ícone e cores.
 * @param {string} message - A mensagem a ser exibida.
 * @param {string} type - O tipo de toast ('success', 'error', ou 'info').
 */
export function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const icons = {
        success: 'ph-fill ph-check-circle',
        error: 'ph-fill ph-x-circle',
        info: 'ph-fill ph-info'
    };
    
    const icon = icons[type] || icons['info'];

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Nova estrutura HTML do toast
    toast.innerHTML = `
        <i class="${icon}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Remove o toast do DOM após a animação de fadeOut terminar (4 segundos)
    setTimeout(() => {
        if (toast.parentNode === container) {
            container.removeChild(toast);
        }
    }, 4000);
}

/**
 * Lida com o resultado de uma operação, mostrando um toast de sucesso ou erro.
 * @param {Error|null} error - O objeto de erro, se houver.
 * @param {string} successMessage - A mensagem a ser exibida em caso de sucesso.
 */
export function handleOperation(error, successMessage) {
    if (error) {
        // Usa o showToast para exibir a mensagem de erro.
        showToast(`Erro: ${error.message}`, 'error');
        console.error(error);
    } else if (successMessage) {
        // Usa o showToast para exibir a mensagem de sucesso.
        showToast(successMessage, 'success');
    }
}

// MODIFICADO: Esta função agora está ATIVA.
export function showLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'flex';
}

// MODIFICADO: Esta função agora está ATIVA.
export function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
}

export function formatDate(date) {
    return new Date(date).toLocaleDateString('pt-BR');
}

export function formatDateTime(date) {
    return new Date(date).toLocaleString('pt-BR');
}

export function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

// --- MODIFICADO: Função para formatar milissegundos em H/M (Adicionado tratamento para NaN) ---
export function formatMillisecondsToHoursMinutes(diffMillis) {
    if (diffMillis < 0 || isNaN(diffMillis)) return 'Tempo Inválido'; // CORREÇÃO AQUI

    const diffHours = Math.floor(diffMillis / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMillis % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHours > 0) {
        return `${diffHours}h ${diffMinutes}m`;
    } else {
        return `${diffMinutes}m`;
    }
}
// -------------------------------------------------------------------

// --- MODIFICADO: Função para calcular e formatar o tempo de inatividade ---
export function calculateDowntimeDuration(startTime, endTime) {
    const start = new Date(startTime).getTime();
    // Se endTime for nulo, usa o tempo atual (ainda parado)
    const end = endTime ? new Date(endTime).getTime() : new Date().getTime();
    const diffMillis = end - start;

    // Reutiliza a nova função de formatação
    return formatMillisecondsToHoursMinutes(diffMillis);
}
// -------------------------------------------------------------------

// --- NOVO: Função para calcular a duração do ciclo de movimentação ---
export function calculateCycleDuration(history, cycleStatuses) {
    // 1. Classifica os logs por caminhão
    const logsByCaminhao = {};
    history.forEach(log => {
        if (!logsByCaminhao[log.caminhao_id]) logsByCaminhao[log.caminhao_id] = [];
        logsByCaminhao[log.caminhao_id].push(log);
    });

    const cycleSessions = [];

    for (const caminhaoId in logsByCaminhao) {
        const sortedLogs = logsByCaminhao[caminhaoId].sort((a, b) => new Date(a.timestamp_mudanca) - new Date(b.timestamp_mudanca));

        let cycleStartLog = null;

        for (const log of sortedLogs) {
            const isStart = log.status_novo === cycleStatuses[0] && !cycleStatuses.includes(log.status_anterior); // Indo_carregar (Primeiro status do ciclo)
            const isEnd = log.status_novo === 'disponivel' && cycleStatuses.includes(log.status_anterior); // Finalizar ciclo
            
            if (isStart) {
                // Início do ciclo (indo_carregar)
                if (cycleStartLog) {
                    // Trata ciclo anterior não finalizado (corte forçado)
                    cycleSessions.push({
                        caminhao_id: caminhaoId,
                        start_time: cycleStartLog.timestamp_mudanca,
                        end_time: log.timestamp_mudanca, // Usar o novo início como fim do ciclo anterior
                        duration: new Date(log.timestamp_mudanca).getTime() - new Date(cycleStartLog.timestamp_mudanca).getTime(),
                        frente_id: cycleStartLog.frente_id,
                        status_final: cycleStartLog.status_novo, // Status no momento do corte
                        is_complete: false,
                        start_cod: cycleStartLog.caminhoes.cod_equipamento
                    });
                }
                cycleStartLog = log; // Novo início
            } else if (isEnd && cycleStartLog) {
                // Fim do ciclo (disponivel)
                const duration = new Date(log.timestamp_mudanca).getTime() - new Date(cycleStartLog.timestamp_mudanca).getTime();
                cycleSessions.push({
                    caminhao_id: caminhaoId,
                    start_time: cycleStartLog.timestamp_mudanca,
                    end_time: log.timestamp_mudanca,
                    duration: duration,
                    frente_id: cycleStartLog.frente_id,
                    status_final: log.status_novo,
                    is_complete: true,
                    start_cod: cycleStartLog.caminhoes.cod_equipamento
                });
                cycleStartLog = null; // Ciclo finalizado
            }
        }
        
        // Se houver ciclo aberto (sem log de 'disponivel' até o final do histórico)
        if (cycleStartLog) {
            const now = new Date().getTime();
            const duration = now - new Date(cycleStartLog.timestamp_mudanca).getTime();
            cycleSessions.push({
                caminhao_id: caminhaoId,
                start_time: cycleStartLog.timestamp_mudanca,
                end_time: null,
                duration: duration,
                frente_id: cycleStartLog.frente_id,
                status_final: 'Em Ciclo (' + cycleStartLog.status_novo + ')',
                is_complete: false,
                start_cod: cycleStartLog.caminhoes.cod_equipamento
            });
        }
    }

    // Filtra ciclos com duração válida (positiva) e ordena do mais recente para o mais antigo
    return cycleSessions.filter(s => s.duration > 0).sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
}
// -------------------------------------------------------------------

export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

export function validateCPFCNPJ(value) {
    const cleaned = value.replace(/\D/g, '');
    return cleaned.length === 11 || cleaned.length === 14;
}

// --- NOVO: Função de validação de telefone ---
export function validatePhone(value) {
    const cleaned = value.replace(/\D/g, '');
    // Aceita 10 (DD + 8 dígitos) ou 11 (DD + 9 dígitos)
    return cleaned.length >= 10 && cleaned.length <= 11; 
}
// ---------------------------------------------


/**
 * NOVO: Agrupa logs de histórico em sessões de inatividade abertas ou fechadas.
 * @param {Array} history - Logs de histórico (caminhao_historico ou equipamento_historico).
 * @param {string} idColumn - Nome da coluna de ID ('caminhao_id' ou 'equipamento_id').
 * @param {Array} downtimeStatuses - Array de strings com os status de inatividade (ex: ['parado', 'quebrado']).
 * @returns {Array} Array de objetos de sessão de inatividade.
 */
export function groupDowntimeSessions(history, idColumn, downtimeStatuses) {
    // 1. Classifica os logs por tempo, do mais antigo para o mais recente (para reconstruir a linha do tempo)
    const sortedLogs = history.sort((a, b) => new Date(a.timestamp_mudanca) - new Date(b.timestamp_mudanca));

    const downtimeSessions = [];
    // Mapeia { id: { startLog, startTime, startStatus, endStatus } }
    const activeSessions = new Map(); 

    // 2. Percorre os logs para agrupar em sessões de inatividade
    for (const log of sortedLogs) {
        const itemId = log[idColumn];
        
        // Define se o status é um dos de inatividade
        const isNewStatusDowntime = downtimeStatuses.includes(log.status_novo);
        const isOldStatusDowntime = downtimeStatuses.includes(log.status_anterior);
        
        const isDowntimeStart = isNewStatusDowntime && !isOldStatusDowntime;
        const isStatusChangeDowntime = isNewStatusDowntime && isOldStatusDowntime;
        const isDowntimeEnd = !isNewStatusDowntime && isOldStatusDowntime;
        
        // Se a sessão está aberta: é um log de início (para o novo status)
        if (isDowntimeStart) {
            // Início de uma nova parada
            activeSessions.set(itemId, {
                startLog: log,
                startTime: new Date(log.timestamp_mudanca),
                startStatus: log.status_novo,
                // Associa a frente de serviço, se existir no log (apenas para equipamento)
                frente: log.equipamentos?.frentes_servico?.nome || 'N/A', 
                cod_equipamento: log.equipamentos?.cod_equipamento || log.caminhoes?.cod_equipamento || 'N/A',
                finalidade: log.equipamentos?.finalidade || 'Caminhão',
            });
        } else if (isDowntimeEnd) {
            const session = activeSessions.get(itemId);
            if (session) {
                // Fim da parada
                downtimeSessions.push({
                    ...session,
                    end_time: new Date(log.timestamp_mudanca),
                    end_status: log.status_novo, 
                });
                activeSessions.delete(itemId);
            }
        } else if (isStatusChangeDowntime) {
            // Se o status mudar entre 'parado' e 'quebrado', atualiza o log inicial com o motivo mais recente
            const session = activeSessions.get(itemId);
            if (session) {
                session.startStatus = log.status_novo; 
                session.startLog.motivo_parada = log.motivo_parada || session.startLog.motivo_parada;
            }
        }
    }
    
    // 3. Adiciona sessões que ainda estão abertas
    for (const [id, session] of activeSessions.entries()) {
        downtimeSessions.push({
            ...session,
            end_time: null, // Ainda em aberto
            end_status: session.startStatus, // O status final é o status atual (parado/quebrado)
        });
    }
    
    // 4. Ordena as sessões para exibição (mais recente primeiro)
    downtimeSessions.sort((a, b) => b.startTime - a.startTime);
    
    return downtimeSessions;
}