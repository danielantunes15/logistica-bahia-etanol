// js/timeUtils.js
/**
 * ✅ VERSÃO CORRIGIDA (2025-10-12)
 * Correção definitiva dos horários: sem dupla conversão de fuso.
 * Agora o JavaScript trata automaticamente o fuso local (BRT).
 */

// --- Funções de Formatação ---

/**
 * Formata uma data/hora em formato legível (dd/mm/yyyy hh:mm)
 * usando o fuso horário local (ex: BRT).
 */
export function formatDateTime(date) {
    if (!date) return '---';
    const d = new Date(date);

    if (isNaN(d)) return 'N/A';

    // Exibe no fuso horário local (BRT)
    const options = {
        timeZone: 'America/Sao_Paulo',
        hour12: false,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    return d.toLocaleString('pt-BR', options).replace(',', '');
}

// --- Funções de Fuso Horário ---

/**
 * Retorna o horário atual (local) no formato YYYY-MM-DDTHH:mm,
 * ideal para preencher inputs datetime-local.
 */
export function getBrtNowString() {
    const now = new Date();
    
    // CORREÇÃO: Força a string a ser gerada no fuso de São Paulo
    const options = {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
    };
    
    // Usar 'sv-SE' (Sueco) formata como YYYY-MM-DD HH:MM
    const parts = new Intl.DateTimeFormat('sv-SE', options).formatToParts(now);
    const map = new Map(parts.map(p => [p.type, p.value]));

    // Formato 'datetime-local' (YYYY-MM-DDTHH:MM)
    return `${map.get('year')}-${map.get('month')}-${map.get('day')}T${map.get('hour')}:${map.get('minute')}`;
}


/**
 * ✅ CORRIGIDO: Converte um horário local (BRT) para formato ISO UTC.
 * Esta é a correção principal: força o fuso -03:00.
 */
export function getBrtIsoString(timeString) {
    // timeString é "YYYY-MM-DDTHH:MM" (em BRT)
    if (timeString) {
        try {
            // 1. Divide a string "YYYY-MM-DDTHH:MM"
            const parts = timeString.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
            if (!parts) throw new Error('Formato de data inválido');
            
            const [ , year, month, day, hour, minute] = parts.map(Number);
            
            // 2. Cria a data como se fosse UTC (mas usando os números do BRT)
            // Ex: 02:00h BRT -> Date.UTC(..., 2, ...)
            const timestampAsUtc = Date.UTC(year, month - 1, day, hour, minute);
            
            // 3. Adiciona as 3 horas de offset para SALVAR o UTC correto (02:00 BRT -> 05:00 UTC)
            const correctUtcTime = timestampAsUtc + (3 * 60 * 60 * 1000);
            
            // 4. Converte o timestamp UTC final para ISO string
            return new Date(correctUtcTime).toISOString();

        } catch (e) {
             console.error("Erro ao converter BRT para ISO:", e, timeString);
             // Fallback se a string estiver mal formatada
             return new Date().toISOString();
        }
    }
    return new Date().toISOString();
}

/**
 * @NOVO: Converte um timestamp ISO (UTC) de volta para a hora BRT (0-23)
 * Esta é a correção de leitura.
 */
export function getBrtHour(isoTimestamp) {
    if (!isoTimestamp) return 0;
    
    const d = new Date(isoTimestamp);
    
    // Pega a hora universal (UTC)
    const utcHour = d.getUTCHours();
    
    // Nanuque/Bahia é BRT (UTC-3) e não adota horário de verão.
    // (utcHour - 3 + 24) % 24 lida com horas negativas (ex: 01:00 UTC - 3 = -2 + 24 = 22h BRT)
    const brtHour = (utcHour - 3 + 24) % 24; 
    
    return brtHour;
}


/**
 * Função alternativa, gera ISO diretamente a partir da hora local atual.
 */
export function getBrtIsoStringAlt() {
    const now = new Date();
    return now.toISOString();
}

// NOVO: Calcula a diferença em milissegundos entre dois timestamps ISO ou T-strings
export function calculateTimeDifference(startTime, endTime) {
    if (!startTime || !endTime) return 0;
    
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();

    // Retorna a diferença (pode ser negativo)
    return end - start;
}

// --- NOVAS FUNÇÕES DE TURNO ---

/**
 * Determina o turno atual com base na hora local.
 */
export function getCurrentShift() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    
    // Converte a hora atual para um número decimal para fácil comparação (ex: 15:05 -> 15.083)
    const currentTime = hours + (minutes / 60);

    const turnoA_start = 7;
    const turnoA_end = 15 + (5 / 60);

    const turnoB_start = turnoA_end;
    const turnoB_end = 23 + (40 / 60);

    // Turno C: das 23:40 até 07:00 do dia seguinte
    if (currentTime >= turnoB_end || currentTime < turnoA_start) {
        return { turno: 'C', nome: 'Turno C', inicio: '23:40', fim: '07:00' };
    } 
    // Turno A: das 07:00 até 15:05
    else if (currentTime >= turnoA_start && currentTime < turnoA_end) {
        return { turno: 'A', nome: 'Turno A', inicio: '07:00', fim: '15:05' };
    }
    // Turno B: das 15:05 até 23:40
    else {
        return { turno: 'B', nome: 'Turno B', inicio: '15:05', fim: '23:40' };
    }
}


// --- Funções de Duração e Ciclo ---

/**
 * Converte milissegundos em formato legível (xh ym).
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
 * NOVO: Calcula a duração desde o timestamp de uma sessão ativa até agora.
 * @param {string|Date} startTime - Timestamp de início.
 * @returns {string} Duração formatada (xh ym).
 */
export function calculateActiveDuration(startTime) {
    const start = new Date(startTime).getTime();
    const nowBrtIso = getBrtIsoStringAlt(); // Usa a função alternativa que pega o instante atual.
    const end = new Date(nowBrtIso).getTime();

    const diffMillis = end - start;
    if (diffMillis < 0 || isNaN(diffMillis)) return 'Tempo Inválido';
    
    return formatMillisecondsToHoursMinutes(diffMillis);
}

/**
 * Calcula e formata a duração de inatividade.
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
    const sortedLogs = history.sort(
        (a, b) => new Date(a.timestamp_mudanca) - new Date(b.timestamp_mudanca)
    );

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
 * Calcula a duração dos ciclos de movimentação.
 */
export function calculateCycleDuration(history, cycleStatuses) {
    const logsByCaminhao = {};
    history.forEach(log => {
        if (!logsByCaminhao[log.caminhao_id]) logsByCaminhao[log.caminhao_id] = [];
        logsByCaminhao[log.caminhao_id].push(log);
    });

    const cycleSessions = [];

    for (const caminhaoId in logsByCaminhao) {
        const sortedLogs = logsByCaminhao[caminhaoId].sort(
            (a, b) => new Date(a.timestamp_mudanca) - new Date(b.timestamp_mudanca)
        );

        let cycleStartLog = null;

        for (const log of sortedLogs) {
            const isStart =
                log.status_novo === cycleStatuses[0] && !cycleStatuses.includes(log.status_anterior);
            const isEnd =
                log.status_novo === 'disponivel' && cycleStatuses.includes(log.status_anterior);

            if (isStart) {
                if (cycleStartLog) {
                    cycleSessions.push({
                        caminhao_id: caminhaoId,
                        start_time: cycleStartLog.timestamp_mudanca,
                        end_time: log.timestamp_mudanca,
                        duration:
                            new Date(log.timestamp_mudanca).getTime() -
                            new Date(cycleStartLog.timestamp_mudanca).getTime(),
                        frente_id: cycleStartLog.frente_id,
                        status_final: cycleStartLog.status_novo,
                        is_complete: false,
                        start_cod: cycleStartLog.caminhoes.cod_equipamento,
                    });
                }
                cycleStartLog = log;
            } else if (isEnd && cycleStartLog) {
                const duration =
                    new Date(log.timestamp_mudanca).getTime() -
                    new Date(cycleStartLog.timestamp_mudanca).getTime();
                cycleSessions.push({
                    caminhao_id: caminhaoId,
                    start_time: cycleStartLog.timestamp_mudanca,
                    end_time: log.timestamp_mudanca,
                    duration: duration,
                    frente_id: cycleStartLog.frente_id,
                    status_final: log.status_novo,
                    is_complete: true,
                    start_cod: cycleStartLog.caminhoes.cod_equipamento,
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
                start_cod: cycleStartLog.caminhoes.cod_equipamento,
            });
        }
    }

    return cycleSessions
        .filter(s => s.duration > 0)
        .sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
}

// --- Funções de Depuração ---

/**
 * Exibe logs no console para testar e verificar os horários.
 */
export function debugTimeFunctions() {
    const now = new Date();
    console.log('=== DEBUG DE HORÁRIO ===');
    console.log('📍 Horário LOCAL:', now.toString());
    console.log('⏰ Hora local (BRT):', now.getHours() + ':' + now.getMinutes());
    console.log('🔄 getBrtNowString():', getBrtNowString());
    console.log('🌐 getBrtIsoString():', getBrtIsoString());
    console.log('📅 getBrtIsoStringAlt():', getBrtIsoStringAlt());
    console.log('👀 Conversão de volta:', formatDateTime(getBrtIsoString()));
    console.log('========================');
}

/**
 * Função de emergência: retorna o horário correto, sempre.
 */
export function getEmergencyBrtIso() {
    const now = new Date();
    return now.toISOString();
}