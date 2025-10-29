// js/api.js

import { supabase } from './supabase.js';
// NOVO: Importa as funções de utilidade de autenticação
import { hashPassword, comparePassword } from './auth_utils.js';

// --- CONSTANTES DE SEGURANÇA ---
const USER_SESSION_KEY = 'appUserSession';
// MANTIDO: Validade da sessão estendida para 30 dias
const SESSION_TIMEOUT = 30 * 24 * 60 * 60 * 1000; // 30 dias (em milissegundos)
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutos

// Cache de tentativas de login
const loginAttempts = new Map();

// Variável local para simular a sessão do usuário (Agora cacheia o sessionStorage)
let localUserSession = JSON.parse(sessionStorage.getItem(USER_SESSION_KEY)) || null;

// --- FUNÇÕES DE SEGURANÇA ---

// Verifica se a sessão expirou
function isSessionValid(session) {
    if (!session || !session.loginTime) return false;

    const sessionAge = Date.now() - session.loginTime;
    return sessionAge < SESSION_TIMEOUT;
}

// Limpa tentativas de login expiradas
function cleanupExpiredAttempts() {
    const now = Date.now();
    for (const [key, attempt] of loginAttempts.entries()) {
        if (now - attempt.lastAttempt > LOCKOUT_TIME) {
            loginAttempts.delete(key);
        }
    }
}

/**
 * Verifica se o usuário está bloqueado por tentativas excessivas
 */
function isUserLockedOut(username) {
    cleanupExpiredAttempts();

    const attempt = loginAttempts.get(username);
    if (!attempt) return false;

    const timeSinceLastAttempt = Date.now() - attempt.lastAttempt;
    return attempt.count >= MAX_LOGIN_ATTEMPTS && timeSinceLastAttempt < LOCKOUT_TIME;
}

/**
 * Registra tentativa de login falha
 */
function recordFailedLogin(username) {
    cleanupExpiredAttempts();

    const attempt = loginAttempts.get(username) || { count: 0, lastAttempt: 0 };
    attempt.count++;
    attempt.lastAttempt = Date.now();
    loginAttempts.set(username, attempt);

    return attempt.count;
}

/**
 * Limpa tentativas de login após sucesso
 */
function clearLoginAttempts(username) {
    loginAttempts.delete(username);
}

/**
 * Gera ID único para sessão
 */
function generateSessionId() {
    return 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Registra ações do usuário para auditoria
 */
async function logUserAction(userId, action, details) {
    try {
        await supabase
            .from('user_audit_logs')
            .insert({
                user_id: userId,
                action: action,
                details: details,
                ip_address: 'client_ip_not_available', // Em produção, capture IP real
                user_agent: navigator.userAgent,
                timestamp: new Date().toISOString()
            });
    } catch (error) {
        console.error('Erro ao registrar log de auditoria:', error);
    }
}

// --- FUNÇÕES DO SISTEMA PRINCIPAL ---

async function setRelatedTerceiros(itemId, terceiroIds, joinTableName, idColumnName) {
    const { error: deleteError } = await supabase.from(joinTableName).delete().eq(idColumnName, itemId);
    if (deleteError) throw deleteError;
    if (terceiroIds && terceiroIds.length > 0) {
        const relations = terceiroIds.map(terceiroId => ({ [idColumnName]: itemId, terceiro_id: terceiroId }));
        const { error: insertError } = await supabase.from(joinTableName).insert(relations);
        if (insertError) throw insertError;
    }
}

export async function insertEquipment(data) {
    const { operadores, ...equipmentData } = data;
    const { data: newEquipment, error } = await supabase.from('equipamentos').insert(equipmentData).select().single();
    if (error) return { error };
    if (operadores) await setRelatedTerceiros(newEquipment.id, operadores, 'equipamento_terceiros', 'equipamento_id');
    return { data: newEquipment, error: null };
}

export async function insertCaminhao(data) {
    const { motoristas, ...caminhaoData } = data;
    const { data: newCaminhao, error } = await supabase.from('caminhoes').insert(caminhaoData).select().single();
    if (error) return { error };
    if (motoristas) await setRelatedTerceiros(newCaminhao.id, motoristas, 'caminhao_terceiros', 'caminhao_id');
    return { data: newCaminhao, error: null };
}

export async function updateEquipment(id, data) {
    const { operadores, ...equipmentData } = data;
    const { error } = await supabase.from('equipamentos').update(equipmentData).eq('id', id);
    if (error) return { error };
    if (operadores) await setRelatedTerceiros(id, operadores, 'equipamento_terceiros', 'equipamento_id');
    return { error: null };
}

export async function updateCaminhao(id, data) {
    const { motoristas, ...caminhaoData } = data;
    const { error } = await supabase.from('caminhoes').update(caminhaoData).eq('id', id);
    if (error) return { error };
    if (motoristas) await setRelatedTerceiros(id, motoristas, 'caminhao_terceiros', 'caminhao_id');
    return { error: null };
}

/**
 * Função otimizada para buscar todos os dados cadastrais (Master Data) sem logs de histórico.
 * Usada por Cadastros e outras views leves.
 */
export async function fetchMasterData() {
    try {
        const [fazendas, caminhoes, equipamentos, frentes_servico, fornecedores, proprietarios, terceiros] = await Promise.all([
            fetchTable('fazendas', '*, fornecedores(id, nome)'),
            fetchTable('caminhoes', '*, proprietarios(id, nome)'),
            fetchTable('equipamentos', '*, proprietarios(id, nome), frentes_servico(id, nome)'),
            // --- MODIFICAÇÃO AQUI: Inclui as metas na busca ---
            fetchTable('frentes_servico', '*, fazendas(cod_equipamento, nome), frentes_metas(meta_toneladas)'),
            fetchTable('fornecedores'),
            fetchTable('proprietarios'),
            fetchTable('terceiros', '*, empresa_id:proprietarios(id, nome)'),
        ]);

        return { fazendas, caminhoes, equipamentos, frentes_servico, fornecedores, proprietarios, terceiros };
    } catch (error) {
        console.error('Erro ao buscar master data:', error);
        throw error;
    }
}

/**
 * Função otimizada para buscar apenas metadados necessários para o Dashboard.
 */
export async function fetchMetadata() {
    // Busca um subconjunto de dados mestre. Note que esta função não precisa do cache interno,
    // pois o dataCache.js gerencia isso, mas a deixamos mais leve.
    try {
        const [caminhoes, equipamentos, frentes_servico, fazendas, ocorrencias] = await Promise.all([
            fetchTable('caminhoes', 'id, status, frente_id'), // Apenas o essencial para contadores
            fetchTable('equipamentos', 'id, status, frente_id, finalidade'),
            // --- MODIFICAÇÃO AQUI: Inclui as metas na busca (embora o dashboard não use, mantém consistência) ---
            fetchTable('frentes_servico', 'id, nome, status, fazenda_id, fazendas(nome), frentes_metas(meta_toneladas)'), 
            fetchTable('fazendas', 'id, latitude, longitude, nome'), // Adicionado 'nome' aqui também para consistência, caso necessário em outros locais
            fetchTable('ocorrencias', 'id, status'), // Apenas o essencial para contadores
        ]);

        return { caminhoes, equipamentos, frentes_servico, fazendas, ocorrencias };
    } catch (error) {
        console.error('Erro ao buscar metadados:', error);
        throw error;
    }
}


// --- NOVA FUNÇÃO INTERNA: Busca Logs Históricos com Filtro de Tempo ---
async function fetchHistoricalTable(tableName, select, dateLimitISO, dateStartISO = null, dateEndISO = null) {
    let query = supabase
        .from(tableName)
        .select(select);

    // 1. Aplica filtro de Data Fim se fornecido
    if (dateEndISO) {
        query = query.lte('timestamp_mudanca', dateEndISO);
    }

    // 2. Aplica filtro de Data Início se fornecido
    if (dateStartISO) {
        query = query.gte('timestamp_mudanca', dateStartISO);
    }

    // 3. Aplica o filtro de limite de 90 dias APENAS se nenhum filtro de data explícito for usado
    // Se startDateISO ou endDateISO forem fornecidos, o dateLimitISO (90 dias) é ignorado.
    if (!dateStartISO && !dateEndISO && dateLimitISO) {
        query = query.gte('timestamp_mudanca', dateLimitISO);
    }

    query = query.order('timestamp_mudanca', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    return data;
}
// -------------------------------------------------------------------

/**
 * Função para buscar todos os dados, incluindo histórico, usada por Relatórios e Vistas detalhadas.
 *
 * @param {number|null} daysBack - Limite de dias a buscar. Use null para não aplicar limite.
 * @param {string|null} startDateISO - Data de início explícita para o histórico (ISO).
 * @param {string|null} endDateISO - Data de fim explícita para o histórico (ISO).
 */
export async function fetchAllData(daysBack = 90, startDateISO = null, endDateISO = null) {
    try {
        let dateLimitISO = null;

        // Se daysBack for usado (com valor diferente de null) E não houver datas explícitas
        if (daysBack !== null && !startDateISO && !endDateISO) {
            const dateLimit = new Date();
            dateLimit.setDate(dateLimit.getDate() - daysBack);
            dateLimitISO = dateLimit.toISOString();
        }

        // Se houver datas explícitas, elas serão passadas para o logFetcher e anularão o dateLimitISO internamente.
        const logFetcher = (tableName, select) =>
            fetchHistoricalTable(tableName, select, dateLimitISO, startDateISO, endDateISO);

        const [fazendas, caminhoes, equipamentos, frentes_servico, fornecedores, proprietarios, terceiros, caminhao_historico, equipamento_historico, ocorrencias] = await Promise.all([
            fetchTable('fazendas', '*, fornecedores(id, nome)'),
            fetchTable('caminhoes', '*, proprietarios(id, nome)'),
            fetchTable('equipamentos', '*, proprietarios(id, nome), frentes_servico(id, nome)'),
            // --- MODIFICAÇÃO AQUI: Inclui as metas na busca ---
            fetchTable('frentes_servico', '*, fazendas(cod_equipamento, nome), frentes_metas(meta_toneladas)'),
            fetchTable('fornecedores'),
            fetchTable('proprietarios'),
            fetchTable('terceiros', '*, empresa_id:proprietarios(id, nome)'),

            logFetcher('caminhao_historico', '*, caminhoes(cod_equipamento)'),
            logFetcher('equipamento_historico', '*, equipamentos(cod_equipamento, finalidade, proprietario_id, frente_id, frentes_servico(nome)), motivo_parada'),
            // NOVO: Adiciona a tabela de ocorrências
            fetchTable('ocorrencias', '*')
        ]);

        return { fazendas, caminhoes, equipamentos, frentes_servico, fornecedores, proprietarios, terceiros, caminhao_historico, equipamento_historico, ocorrencias };
    } catch (error) {
        console.error('Erro ao buscar todos os dados (FULL):', error);
        throw error;
    }
}

export async function fetchTable(tableName, select = '*') {
    const { data, error } = await supabase.from(tableName).select(select).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
}

// --- AUTENTICAÇÃO E GERENCIAMENTO DE USUÁRIOS (SEGURO) ---

/**
 * Realiza o login do usuário contra a tabela app_users (SEGURO).
 */
export async function loginAppUser(username, password) {
    // Validações básicas
    if (!username || !password) {
        throw new Error('Usuário e senha são obrigatórios.');
    }

    const cleanUsername = username.trim().toLowerCase();

    // Verifica se está bloqueado
    if (isUserLockedOut(cleanUsername)) {
        const remainingTime = Math.ceil((LOCKOUT_TIME - (Date.now() - loginAttempts.get(cleanUsername).lastAttempt)) / 60000);
        throw new Error(`Muitas tentativas falhas. Tente novamente em ${remainingTime} minutos.`);
    }

    try {
        // 1. Consulta a tabela para buscar o usuário e o HASH da senha
        const { data, error } = await supabase
            .from('app_users')
            .select('id, username_app, nome_completo, tipo_usuario, senha_app, primeiro_login, ativo, ultimo_login')
            .eq('username_app', cleanUsername)
            .single();

        // Proteção contra timing attacks - sempre executa comparação
        const fakeHash = '$2b$12$fakeHashForTimingProtection.fake';
        const hashedPassword = data?.senha_app || fakeHash;

        // Sempre executa a comparação para evitar timing attacks
        const isPasswordValid = await comparePassword(password, hashedPassword);

        if (error || !data || !isPasswordValid) {
            const attemptsLeft = MAX_LOGIN_ATTEMPTS - recordFailedLogin(cleanUsername);
            throw new Error(`Credenciais inválidas. ${attemptsLeft > 0 ? `${attemptsLeft} tentativas restantes.` : 'Conta bloqueada temporariamente.'}`);
        }

        // Verifica se usuário está ativo
        if (data.ativo === false) {
            throw new Error('Conta inativa. Contate o administrador do sistema.');
        }

        // Limpa tentativas após sucesso
        clearLoginAttempts(cleanUsername);

        // Atualiza último login
        await supabase
            .from('app_users')
            .update({ ultimo_login: new Date().toISOString() })
            .eq('id', data.id);

        // Cria sessão segura
        const sessionData = {
            id: data.id,
            username: data.username_app,
            role: data.tipo_usuario,
            fullName: data.nome_completo,
            isFirstLogin: data.primeiro_login === true,
            loginTime: Date.now(),
            sessionId: generateSessionId()
        };

        // Salva sessão no SESSIONSTORAGE (MUDANÇA APLICADA AQUI)
        localUserSession = sessionData;
        sessionStorage.setItem(USER_SESSION_KEY, JSON.stringify(sessionData));

        // Registra log de login bem-sucedido
        await logUserAction(data.id, 'LOGIN_SUCCESS', `Usuário ${data.username_app} fez login`);

        return sessionData;

    } catch (error) {
        // Registra log de tentativa falha
        await logUserAction(null, 'LOGIN_FAILED', `Tentativa de login falha para usuário: ${username}`);

        if (error.code === 'PGRST116') {
            const attemptsLeft = MAX_LOGIN_ATTEMPTS - recordFailedLogin(cleanUsername);
            throw new Error(`Credenciais inválidas. ${attemptsLeft > 0 ? `${attemptsLeft} tentativas restantes.` : 'Conta bloqueada temporariamente.'}`);
        }
        throw error;
    }
}

/**
 * Faz o logout do usuário, limpando a sessão local e o sessionStorage.
 */
export async function logoutAppUser() {
    if (localUserSession) {
        // Registra log de logout
        await logUserAction(localUserSession.id, 'LOGOUT', `Usuário ${localUserSession.username} fez logout`);
    }

    localUserSession = null;
    sessionStorage.removeItem(USER_SESSION_KEY); // MUDANÇA APLICADA AQUI

    return { error: null };
}

/**
 * Busca a sessão do usuário logado (agora verifica o sessionStorage e validade).
 */
export async function getLocalSession() {
    // Se não tem sessão local, verifica storage
    if (!localUserSession) {
        const storedSession = sessionStorage.getItem(USER_SESSION_KEY); // MUDANÇA APLICADA AQUI
        localUserSession = storedSession ? JSON.parse(storedSession) : null;
    }

    // Verifica se a sessão é válida
    if (localUserSession && !isSessionValid(localUserSession)) {
        await logoutAppUser();
        return null;
    }

    return localUserSession;
}

/**
 * Busca o papel (role) do usuário logado na sessão local.
 */
export async function fetchUserRole() {
    const session = await getLocalSession();
    if (!session) return { role: null };
    return { role: session.role };
}

/**
 * Atualiza a senha do usuário logado após verificar a senha atual.
 */
export async function updateUserPassword(userId, currentPassword, newPassword) {
    // 1. Busca o HASH atual para verificação
    const { data: user, error: fetchError } = await supabase
        .from('app_users')
        .select('senha_app') // Busca apenas o hash
        .eq('id', userId)
        .single();

    if (fetchError && fetchError.code === 'PGRST116') {
        throw new Error('Usuário não encontrado.');
    }
    if (fetchError) {
        throw fetchError;
    }

    // PASSO DE SEGURANÇA - COMPARAÇÃO DO HASH DA SENHA ATUAL
    const isCurrentPasswordValid = await comparePassword(currentPassword, user.senha_app);

    if (!isCurrentPasswordValid) {
        throw new Error('A senha atual está incorreta.');
    }

    // Valida força da nova senha
    if (newPassword.length < 6) {
        throw new Error('A nova senha deve ter pelo menos 6 caracteres.');
    }

    // 2. Gera o HASH da nova senha
    const newHashedPassword = await hashPassword(newPassword);

    // 3. Atualiza a senha (HASH) no banco e DESATIVA a flag de primeiro login
    const { error: updateError } = await supabase
        .from('app_users')
        .update({ senha_app: newHashedPassword, primeiro_login: false })
        .eq('id', userId);

    if (updateError) {
        throw updateError;
    }

    // Atualiza a sessão local
    if (localUserSession && localUserSession.id === userId) {
        localUserSession.isFirstLogin = false;
        sessionStorage.setItem(USER_SESSION_KEY, JSON.stringify(localUserSession)); // MUDANÇA APLICADA AQUI
    }

    // Registra log de alteração de senha
    await logUserAction(userId, 'PASSWORD_CHANGE', 'Senha alterada com sucesso');

    return { error: null };
}

/**
 * Atualiza dados de um usuário (nome, username, tipo_usuario, **ativo**) na tabela app_users.
 * Não permite alterar a senha por esta rota.
 */
export async function updateAppUser(userId, updateData) {
    // Remove a senha do objeto de dados se ela estiver presente, para evitar alterações acidentais
    delete updateData.password;

    // 1. Verifica se o username já existe (apenas se estiver mudando o username)
    if (updateData.username_app) {
        const { data: existingUser, error: fetchError } = await supabase
            .from('app_users')
            .select('id')
            .eq('username_app', updateData.username_app);

        if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

        // Se encontrar outro usuário com o mesmo username
        if (existingUser && existingUser.length > 0 && existingUser[0].id !== userId) {
            throw new Error(`O usuário '${updateData.username_app}' já existe e pertence a outro perfil.`);
        }
    }

    // 2. Atualiza os dados (agora incluindo 'ativo')
    const { data, error: updateError } = await supabase
        .from('app_users')
        .update(updateData)
        .eq('id', userId)
        .select()
        .single();

    if (updateError) throw updateError;

    // Registra log de atualização
    await logUserAction(userId, 'USER_UPDATE', `Dados do usuário atualizados: ${Object.keys(updateData).join(', ')}`);

    return { data, error: null };
}

/**
 * Registra um novo usuário na tabela app_users (SEGURO).
 */
export async function registerAppUser(username_app, password, nome_completo, tipo_usuario) {
    // Validações
    if (!username_app || !password || !nome_completo) {
        throw new Error('Todos os campos são obrigatórios.');
    }

    if (password.length < 6) {
        throw new Error('A senha deve ter pelo menos 6 caracteres.');
    }

    const cleanUsername = username_app.trim().toLowerCase();

    // 1. Verifica se o username já existe
    const { data: existingUser, error: fetchError } = await supabase
        .from('app_users')
        .select('id')
        .eq('username_app', cleanUsername);

    if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;
    if (existingUser && existingUser.length > 0) {
        throw new Error(`O usuário '${cleanUsername}' já existe.`);
    }

    // GERA O HASH DA SENHA ANTES DE SALVAR
    const hashedPassword = await hashPassword(password);

    // 2. Insere o novo registro (SALVANDO O HASH)
    const { data, error: insertError } = await supabase.from('app_users').insert({
        nome_completo: nome_completo,
        tipo_usuario: tipo_usuario,
        username_app: cleanUsername,
        senha_app: hashedPassword, // Salva o HASH da senha
        primeiro_login: true,
        ativo: true
    }).select().single();

    if (insertError) throw insertError;

    // Registra log de criação de usuário
    await logUserAction(data.id, 'USER_CREATED', `Novo usuário criado: ${cleanUsername}`);

    return { data, error: null };
}

/**
 * Busca todos os usuários da aplicação (Gerencial) - Incluindo o status 'ativo'.
 */
export async function fetchAppUsers() {
    // Busca a lista de perfis (incluindo o ID para exclusão e o novo campo 'ativo')
    const { data, error } = await supabase.from('app_users').select('id, nome_completo, tipo_usuario, username_app, ativo, ultimo_login').order('username_app');
    if (error) throw error;
    return data;
}

/**
 * EXCLUSÃO TOTAL: Exclui o registro do usuário da tabela app_users (controle total).
 */
export async function deleteAppUser(userId) {
    const { error } = await supabase.from('app_users').delete().eq('id', userId);

    if (error) throw error;

    // Registra log de exclusão
    await logUserAction(userId, 'USER_DELETED', 'Usuário excluído do sistema');

    return { error: null };
}

/**
 * Busca logs da aplicação.
 */
export async function fetchAppLogs(filters = {}) {
     let query = supabase.from('app_logs').select('*');

     if (filters.tipo_usuario) {
         query = query.eq('tipo_usuario', filters.tipo_usuario);
     }
     if (filters.dataInicio) {
         query = query.gte('timestamp', filters.dataInicio);
     }
     if (filters.dataFim) {
         query = query.lte('timestamp', filters.dataFim);
     }

     // Ordena do mais recente para o mais antigo
     const { data, error } = await query.order('timestamp', { ascending: false });

     if (error) throw error;
     return data;
}

/**
 * Busca logs de auditoria de usuários
 */
export async function fetchUserAuditLogs(userId = null, limit = 100) {
    let query = supabase
        .from('user_audit_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

    if (userId) {
        // CORREÇÃO: Usar user_id, que é o campo inserido por logUserAction
        query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data;
}

/**
 * Força logout por inatividade
 */
export async function forceLogout() {
    if (localUserSession) {
        await logUserAction(localUserSession.id, 'SESSION_EXPIRED', 'Sessão expirada por inatividade');
    }
    await logoutAppUser();
    return { error: null };
}

/**
 * Verifica permissões do usuário
 */
export function hasPermission(requiredRole, userRole) {
    const roleHierarchy = {
        'usuario': 1,
        'admin': 2,
        'superadmin': 3
    };

    const userLevel = roleHierarchy[userRole] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;

    return userLevel >= requiredLevel;
}

/**
 * Middleware de autenticação para funções protegidas
 */
export async function requireAuth(requiredRole = 'usuario') {
    const session = await getLocalSession();

    if (!session) {
        throw new Error('Autenticação necessária');
    }

    if (!hasPermission(requiredRole, session.role)) {
        throw new Error('Permissão insuficiente');
    }

    return session;
}

// --- FIM DAS FUNÇÕES DE AUTENTICAÇÃO ---

export async function assignCaminhaoToFrente(caminhaoId, frenteId, statusInicial, horaSaida) {
     // 1. Atualiza o caminhão com o novo status e frente
    const { data: updatedCaminhao, error: updateError } = await supabase
        .from('caminhoes')
        .update({
            status: statusInicial,
            frente_id: frenteId
        })
        .eq('id', caminhaoId)
        .select()
        .single();

    if (updateError) throw updateError;

    // 2. Cria o primeiro registro no histórico com a hora de saída informada
    const { error: historyError } = await supabase
        .from('caminhao_historico')
        .insert({
            caminhao_id: caminhaoId,
            status_anterior: 'disponivel',
            status_novo: statusInicial,
            timestamp_mudanca: horaSaida // Usa a hora informada pelo usuário
        });

    if (historyError) throw historyError;

    return { data: updatedCaminhao };
}

export async function updateCaminhaoStatus(caminhaoId, novoStatus, frenteId = null, motivoParada = null, timestamp) {
    const { data: caminhaoAtual, error: fetchError } = await supabase
        .from('caminhoes')
        .select('status')
        .eq('id', caminhaoId)
        .single();

    if (fetchError) throw fetchError;
    const statusAnterior = caminhaoAtual.status;

    // CORREÇÃO: Verifica se o timestamp é nulo/indefinido e usa a hora atual se for o caso.
    const logTimestamp = timestamp || new Date().toISOString();

    const { error: historyError } = await supabase
        .from('caminhao_historico')
        .insert({
            caminhao_id: caminhaoId,
            status_anterior: statusAnterior,
            status_novo: novoStatus,
            timestamp_mudanca: logTimestamp, // USANDO O TIMESTAMP CORRIGIDO
            motivo_parada: motivoParada
        });

    if (historyError) throw historyError;

    // --- Lógica de Desassociação Automática ---
    let frenteParaAtualizar = frenteId;

    // Se o novo status é 'disponivel' (fim de ciclo), 'quebrado' ou 'parado), desassocia da frente.
    if (novoStatus === 'disponivel' || novoStatus === 'quebrado' || novoStatus === 'parado') {
        frenteParaAtualizar = null;
    }
    // ------------------------------------------

    const { data, error } = await supabase
        .from('caminhoes')
        .update({
            status: novoStatus,
            frente_id: frenteParaAtualizar // Usa a variável corrigida
        })
        .eq('id', caminhaoId)
        .select()
        .single();

    if (error) throw error;
    return { data };
}

// --- FUNÇÃO: Remove um caminhão da tabela de persistência de filas ---
export async function removeCaminhaoFromFila(caminhaoId) {
    const { error } = await supabase
        .from('fila_carregamento')
        .delete()
        .eq('caminhao_id', caminhaoId);
    if (error) throw error;
    return { error: null };
}
// ------------------------------------------------------------------------

export async function updateEquipamentoStatus(equipamentoId, novoStatus, frenteId = null, timestamp = new Date().toISOString(), motivoParada = null) {
    const { data: equipamentoAtual, error: fetchError } = await supabase
        .from('equipamentos')
        .select('status')
        .eq('id', equipamentoId)
        .single();

    if (fetchError) throw fetchError;
    const statusAnterior = equipamentoAtual.status;

    // 1. Cria o registro no histórico
    const logData = {
        equipamento_id: equipamentoId,
        status_anterior: statusAnterior,
        status_novo: novoStatus,
        timestamp_mudanca: timestamp,
        motivo_parada: motivoParada // Envia o motivo para o banco
    };

    const { error: historyError } = await supabase
        .from('equipamento_historico')
        .insert(logData);

    if (historyError) throw historyError;

    // 2. Atualiza o status do equipamento e, se estiver ativo, associa à frente
    const updateData = { status: novoStatus, frente_id: null };
    // Se o status for ativo, usa a frente de destino
    if (novoStatus === 'ativo' && frenteId) {
        updateData.frente_id = frenteId;
    }

    const { data, error } = await supabase
        .from('equipamentos')
        .update(updateData)
        .eq('id', equipamentoId)
        .select()
        .single();

    if (error) throw error;
    return { data };
}
// ------------------------------------------------------------------------

export async function updateFrenteComFazenda(frenteId, fazendaId) {
    const { data, error } = await supabase
        .from('frentes_servico')
        .update({ fazenda_id: fazendaId })
        .eq('id', frenteId)
        .select();
    if (error) throw error;
    return { data };
}

// --- NOVO: Função para atualizar apenas o status da Frente ---
export async function updateFrenteStatus(frenteId, newStatus) {
    const { data, error } = await supabase.from('frentes_servico').update({ status: newStatus }).eq('id', frenteId).select().single();
    if (error) throw error;
    return { data };
}

// --- FUNÇÕES PARA PERSISTÊNCIA DA FILA ---

export async function fetchFila() {
    const { data, error } = await supabase
        .from('fila_carregamento')
        .select('caminhao_id, tipo_fila, ordem')
        .order('ordem', { ascending: true });

    if (error) throw error;
    return data;
}

/**
 * Atualiza o estado completo da fila, incluindo remoção e inserção de todos os itens.
 * @param {Array} filasData - Array de objetos: [{ caminhao_id, tipo_fila, ordem }]
 */
export async function updateFilaCarregamento(filasData) {

    // 1. Apaga todos os registros de fila existentes
    const { error: deleteError } = await supabase
        .from('fila_carregamento')
        .delete()
        .neq('caminhao_id', '00000000-0000-0000-0000-000000000000'); // Deleta TUDO

    if (deleteError) {
        console.error('Erro ao limpar tabela fila_carregamento:', deleteError);
        throw deleteError;
    }

    // 2. Insere todos os novos registros de uma vez
    if (filasData.length > 0) {
        const { error: insertError } = await supabase
            .from('fila_carregamento')
            .insert(filasData);

        if (insertError) {
            console.error('Erro ao inserir novos registros de fila:', insertError);
            throw insertError;
        }
    }

    return { error: null };
}

// ----------------------------------------------------------------

// --- NOVAS FUNÇÕES PARA A ESCALA ---
/**
 * Busca funcionários da escala.
 */
export async function fetchEscalaFuncionarios() {
    return await fetchTable('escala_funcionarios', '*');
}

/**
 * Busca os turnos de uma escala dentro de um período.
 * @param {string} startDate - Data de início no formato ISO (YYYY-MM-DD).
 * @param {string} endDate - Data de fim no formato ISO (YYYY-MM-DD).
 */
export async function fetchEscalaTurnos(startDate, endDate) {
    const { data, error } = await supabase
        .from('escala_turnos')
        .select('*')
        .gte('data', startDate)
        .lte('data', endDate);
    if (error) throw error;
    return data;
}

/**
 * Salva (insere ou atualiza) os turnos da escala.
 * @param {Array} turnosData - Array de objetos: [{ funcionario_id, data, turno }]
 */
export async function saveEscalaTurnos(turnosData) {
    const { data, error } = await supabase
        .from('escala_turnos')
        .upsert(turnosData, { onConflict: 'funcionario_id, data' });
    if (error) throw error;
    return { data };
}
// --- FIM DAS FUNÇÕES DE ESCALA ---

// --- NOVA FUNÇÃO PARA GERENCIAR METAS ---
/**
 * Insere ou atualiza a meta de uma frente de serviço.
 * @param {string} frenteId - O UUID da frente de serviço.
 * @param {number} meta - O valor da meta (cota) em toneladas.
 */
export async function saveFrenteMeta(frenteId, meta) {
    const { data, error } = await supabase
        .from('frentes_metas')
        .upsert(
            { frente_id: frenteId, meta_toneladas: meta },
            { onConflict: 'frente_id' } // Garante que ele atualize se o frente_id já existir
        )
        .select()
        .single();
        
    if (error) throw error;
    return { data };
}
// --- FIM DA NOVA FUNÇÃO ---


export async function insertItem(tableName, dataToInsert) {
    if (tableName === 'equipamentos') return await insertEquipment(dataToInsert);
    if (tableName === 'caminhoes') return await insertCaminhao(dataToInsert);
    const { data, error } = await supabase.from(tableName).insert(dataToInsert).select().single();
    return { data, error };
}

export async function deleteItem(tableName, id) {
    const { error } = await supabase.from(tableName).delete().eq('id', id);
    return { error };
}

export async function fetchItemById(tableName, id, select = '*') {
    const { data, error } = await supabase.from(tableName).select(select).eq('id', id).single();
    return { data, error };
}

export async function updateItem(tableName, id, updateData) {
    if (tableName === 'equipamentos') return await updateEquipment(id, updateData);
    if (tableName === 'caminhoes') return await updateCaminhao(id, updateData);
    const { data, error } = await supabase.from(tableName).update(updateData).eq('id', id).single();
    return { data, error };
}