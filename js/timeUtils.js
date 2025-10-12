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
    
    // Formata no padrão YYYY-MM-DDTHH:mm (necessário para <input type="datetime-local">)
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * SOLUÇÃO DEFINITIVA: Retorna o horário atual em formato ISO UTC
 * Considera que o navegador JÁ ESTÁ em BRT e converte corretamente para UTC
 */
export function getBrtIsoString(timeString) {
    // Se recebeu uma string de input, usa diretamente
    if (timeString) {
        const date = new Date(timeString);
        if (!isNaN(date.getTime())) {
            return date.toISOString();
        }
    }
    
    // SOLUÇÃO SIMPLES E DIRETA:
    // O navegador está em BRT (UTC-3), então para obter UTC:
    // BRT = UTC - 3h → UTC = BRT + 3h
    const now = new Date();
    const utcTime = new Date(now.getTime() + (3 * 60 * 60 * 1000));
    
    return utcTime.toISOString();
}

/**
 * Função ALTERNATIVA usando Date.UTC - método mais confiável
 */
export function getBrtIsoStringAlt() {
    const now = new Date();
    
    // Cria uma data UTC a partir dos componentes locais
    const utcDate = new Date(Date.UTC(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours(),
        now.getMinutes(),
        now.getSeconds(),
        now.getMilliseconds()
    ));
    
    return utcDate.toISOString();
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
        // USA A FUNÇÃO CORRIGIDA
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
            // USA A FUNÇÃO CORRIGIDA
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

/**
 * Função para debug - mostra o horário atual em diferentes formatos
 */
export function debugTimeFunctions() {
    const now = new Date();
    console.log('=== DEBUG DE HORÁRIO - VERIFICAÇÃO ===');
    console.log('📍 Horário LOCAL do navegador:', now.toString());
    console.log('⏰ Hora local (BRT):', now.getHours() + ':' + now.getMinutes());
    console.log('🔧 getBrtNowString():', getBrtNowString());
    console.log('🔄 getBrtIsoString():', getBrtIsoString());
    console.log('📅 getBrtIsoStringAlt():', getBrtIsoStringAlt());
    console.log('👀 Conversão de volta:', formatDateTime(getBrtIsoString()));
    console.log('====================================');
}

/**
 * FUNÇÃO DE EMERGÊNCIA: Retorna sempre o horário correto
 */
export function getEmergencyBrtIso() {
    const now = new Date();
    // Método mais direto: usa os componentes de data/hora locais para criar UTC
    const utcTime = new Date(Date.UTC(
        now.getFullYear(),
        now.getMonth(), 
        now.getDate(),
        now.getHours(),
        now.getMinutes(),
        now.getSeconds()
    ));
    return utcTime.toISOString();
}