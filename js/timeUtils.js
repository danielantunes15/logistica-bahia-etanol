// js/timeUtils.js
/**
 * Corrige o problema de fuso horário na exibição (Definitivo).
 * Converte o tempo UTC salvo no banco diretamente para o Horário de Brasília (UTC-03:00).
 */
export function formatDateTime(date) {
    if (!date) return '---';
    const d = new Date(date);
    
    if (isNaN(d)) return 'N/A';
    
    // BRT é UTC - 3 horas (-180 minutos)
    const BRT_OFFSET_HOURS = -3;
    
    // Pega o tempo UTC (do banco) e ajusta por -3 horas.
    const utcMillis = d.getTime();
    const brtMillis = utcMillis + (BRT_OFFSET_HOURS * 60 * 60 * 1000);
    const brtTime = new Date(brtMillis);
    
    // As chamadas .getHours(), .getMinutes() etc. em 'brtTime' retornam a hora BRT correta.
    const hours = String(brtTime.getHours()).padStart(2, '0');
    const minutes = String(brtTime.getMinutes()).padStart(2, '0');
    const day = String(brtTime.getDate()).padStart(2, '0');
    const month = String(brtTime.getMonth() + 1).padStart(2, '0');
    const year = brtTime.getFullYear();

    // Monta a string no formato pt-BR
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

// --- Funções de Fuso Horário ---

/**
 * Retorna a hora atual em BRT (UTC-03:00) para preencher campos de formulário.
 */
export function getBrtNowString() {
    const now = new Date();
    // BRT é UTC - 3 horas (-180 minutos)
    const brtOffsetMillis = -3 * 60 * 60 * 1000;
    
    // Obtém o tempo UTC do momento atual (sem a conversão de fuso local do navegador)
    const utcTime = now.getTime() + now.getTimezoneOffset() * 60000; 
    
    // Aplica o offset do BRT
    const brtTime = new Date(utcTime + brtOffsetMillis); 
    
    // Formata no padrão YYYY-MM-DDTHH:mm (necessário para <input type="datetime-local">)
    const year = brtTime.getFullYear();
    const month = String(brtTime.getMonth() + 1).padStart(2, '0');
    const day = String(brtTime.getDate()).padStart(2, '0');
    const hours = String(brtTime.getHours()).padStart(2, '0');
    const minutes = String(brtTime.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Retorna o instante no formato ISO (UTC) que representa a hora de Brasília.
 * @param {string} [timeString] - String de data/hora do input datetime-local (BRT).
 * @returns {string} ISO 8601 string (UTC).
 */
export function getBrtIsoString(timeString) {
    let targetTime = timeString ? new Date(timeString) : new Date();
    
    // Se a string for inválida, retorna a hora atual do momento da chamada
    if (isNaN(targetTime.getTime()) && timeString) {
        targetTime = new Date(); 
    }
    
    // BRT é UTC - 3 horas (-180 minutos)
    const brtOffsetMinutes = -180; 
    
    // Calcula a diferença entre o fuso local do navegador e o BRT.
    const timezoneOffsetMinutes = targetTime.getTimezoneOffset();
    const offsetDifference = (timezoneOffsetMinutes - brtOffsetMinutes) * 60000;
    
    // Aplica a diferença ao tempo atual para obter o instante BRT no objeto Date.
    const brtMoment = new Date(targetTime.getTime() - offsetDifference);
    
    // Retorna o ISO string que será o UTC salvo no banco (e que formatDateTime irá corrigir).
    return brtMoment.toISOString();
}

// --- Funções de Duração e Ciclo ---

/**
 * Função para formatar milissegundos em H/M.
 */
export function formatMillisecondsToHoursMinutes(diffMillis) {
    if (diffMillis < 0 || isNaN(diffMillis)) return 'Tempo Inválido';

    const diffHours = Math.floor(diffMillis / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMillis % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHours > 0) {
        return `${diffHours}h ${diffMinutes}m`;
    } else {
        return `${diffMinutes}m`;
    }
}

/**
 * Função para calcular e formatar o tempo de inatividade.
 */
export function calculateDowntimeDuration(startTime, endTime) {
    const start = new Date(startTime).getTime(); 
    
    let end;
    if (endTime) {
        end = new Date(endTime).getTime();
    } else {
        const nowBrtIso = getBrtIsoString();
        end = new Date(nowBrtIso).getTime();
    }
    
    const diffMillis = end - start;
    return formatMillisecondsToHoursMinutes(diffMillis);
}

/**
 * Agrupa logs de histórico em sessões de inatividade abertas ou fechadas.
 */
export function groupDowntimeSessions(history, idColumn, downtimeStatuses) {
    const sortedLogs = history.sort((a, b) => new Date(a.timestamp_mudanca) - new Date(b.timestamp_mudanca));

    const downtimeSessions = [];
    const activeSessions = new Map(); 

    for (const log of sortedLogs) {
        const itemId = log[idColumn];
        
        const isNewStatusDowntime = downtimeStatuses.includes(log.status_novo);
        const isOldStatusDowntime = downtimeStatuses.includes(log.status_anterior);
        
        const isDowntimeStart = isNewStatusDowntime && !isOldStatusDowntime;
        const isStatusChangeDowntime = isNewStatusDowntime && isOldStatusDowntime;
        const isDowntimeEnd = !isNewStatusDowntime && isOldStatusDowntime;
        
        if (isDowntimeStart) {
            activeSessions.set(itemId, {
                startLog: log,
                startTime: new Date(log.timestamp_mudanca),
                startStatus: log.status_novo,
                frente: log.equipamentos?.frentes_servico?.nome || 'N/A', 
                cod_equipamento: log.equipamentos?.cod_equipamento || log.caminhoes?.cod_equipamento || 'N/A',
                finalidade: log.equipamentos?.finalidade || 'Caminhão',
            });
        } else if (isDowntimeEnd) {
            const session = activeSessions.get(itemId);
            if (session) {
                downtimeSessions.push({
                    ...session,
                    end_time: new Date(log.timestamp_mudanca),
                    end_status: log.status_novo, 
                });
                activeSessions.delete(itemId);
            }
        } else if (isStatusChangeDowntime) {
            const session = activeSessions.get(itemId);
            if (session) {
                session.startStatus = log.status_novo; 
                session.startLog.motivo_parada = log.motivo_parada || session.startLog.motivo_parada;
            }
        }
    }
    
    for (const [id, session] of activeSessions.entries()) {
        downtimeSessions.push({
            ...session,
            end_time: null,
            end_status: session.startStatus,
        });
    }
    
    downtimeSessions.sort((a, b) => b.startTime - a.startTime);
    return downtimeSessions;
}

/**
 * Função para calcular a duração do ciclo de movimentação.
 */
export function calculateCycleDuration(history, cycleStatuses) {
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
            const isStart = log.status_novo === cycleStatuses[0] && !cycleStatuses.includes(log.status_anterior);
            const isEnd = log.status_novo === 'disponivel' && cycleStatuses.includes(log.status_anterior);
            
            if (isStart) {
                if (cycleStartLog) {
                    cycleSessions.push({
                        caminhao_id: caminhaoId,
                        start_time: cycleStartLog.timestamp_mudanca,
                        end_time: log.timestamp_mudanca,
                        duration: new Date(log.timestamp_mudanca).getTime() - new Date(cycleStartLog.timestamp_mudanca).getTime(),
                        frente_id: cycleStartLog.frente_id,
                        status_final: cycleStartLog.status_novo,
                        is_complete: false,
                        start_cod: cycleStartLog.caminhoes.cod_equipamento
                    });
                }
                cycleStartLog = log;
            } else if (isEnd && cycleStartLog) {
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
                cycleStartLog = null;
            }
        }
        
        if (cycleStartLog) {
            const now = new Date(getBrtIsoString()).getTime();
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

    return cycleSessions.filter(s => s.duration > 0).sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
}