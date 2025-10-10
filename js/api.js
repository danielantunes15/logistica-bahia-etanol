// js/api.js

import { supabase } from './supabase.js';

// --- CHAVE DE STORAGE ---
const USER_SESSION_KEY = 'appUserSession';
// Variável local para simular a sessão do usuário (Agora cacheia o localStorage)
let localUserSession = JSON.parse(localStorage.getItem(USER_SESSION_KEY)) || null;

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
 * Função otimizada para buscar apenas metadados necessários para o Dashboard e Cadastros.
 */
export async function fetchMetadata() {
    try {
        const [fazendas, caminhoes, equipamentos, frentes_servico, fornecedores, proprietarios, terceiros] = await Promise.all([
            fetchTable('fazendas', '*, fornecedores(id, nome)'),
            fetchTable('caminhoes', '*, proprietarios(id, nome)'),
            fetchTable('equipamentos', '*, proprietarios(id, nome), frentes_servico(id, nome)'),
            fetchTable('frentes_servico', '*, fazendas(cod_equipamento, nome)'),
            fetchTable('fornecedores'),
            fetchTable('proprietarios'),
            fetchTable('terceiros', '*, empresa_id:proprietarios(id, nome)'),
        ]);
        
        return { fazendas, caminhoes, equipamentos, frentes_servico, fornecedores, proprietarios, terceiros }; 
    } catch (error) {
        console.error('Erro ao buscar metadados:', error);
        throw error;
    }
}

// --- NOVA FUNÇÃO INTERNA: Busca Logs Históricos com Filtro de Tempo (90 dias) ---
async function fetchHistoricalTable(tableName, select, dateLimitISO) {
    // Busca logs mais recentes que a data limite
    const { data, error } = await supabase
        .from(tableName)
        .select(select)
        .gte('timestamp_mudanca', dateLimitISO) 
        .order('timestamp_mudanca', { ascending: false }); 
    if (error) throw error;
    return data;
}
// -------------------------------------------------------------------

/**
 * Função para buscar todos os dados, incluindo histórico (90 dias), usada por Relatórios e Vistas detalhadas.
 */
export async function fetchAllData(daysBack = 90) {
    try {
        const dateLimit = new Date();
        // Se daysBack for nulo (passado por Relatórios para não aplicar filtro de tempo se já houver filtro de data), não aplica.
        if (daysBack !== null) {
            dateLimit.setDate(dateLimit.getDate() - daysBack);
        }
        const dateLimitISO = daysBack !== null ? dateLimit.toISOString() : null;

        const [fazendas, caminhoes, equipamentos, frentes_servico, fornecedores, proprietarios, terceiros, caminhao_historico, equipamento_historico] = await Promise.all([
            fetchTable('fazendas', '*, fornecedores(id, nome)'),
            fetchTable('caminhoes', '*, proprietarios(id, nome)'),
            fetchTable('equipamentos', '*, proprietarios(id, nome), frentes_servico(id, nome)'),
            fetchTable('frentes_servico', '*, fazendas(cod_equipamento, nome)'),
            fetchTable('fornecedores'),
            fetchTable('proprietarios'),
            fetchTable('terceiros', '*, empresa_id:proprietarios(id, nome)'),
            
            // Filtro de tempo para histórico
            dateLimitISO ? fetchHistoricalTable('caminhao_historico', '*, caminhoes(cod_equipamento)', dateLimitISO) : fetchTable('caminhao_historico', '*, caminhoes(cod_equipamento)'),
            dateLimitISO ? fetchHistoricalTable('equipamento_historico', '*, equipamentos(cod_equipamento, finalidade, proprietario_id, frente_id, frentes_servico(nome)), motivo_parada', dateLimitISO) : fetchTable('equipamento_historico', '*, equipamentos(cod_equipamento, finalidade, proprietario_id, frente_id, frentes_servico(nome)), motivo_parada')
        ]);
        
        return { fazendas, caminhoes, equipamentos, frentes_servico, fornecedores, proprietarios, terceiros, caminhao_historico, equipamento_historico }; 
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


// --- AUTENTICAÇÃO E GERENCIAMENTO DE USUÁRIOS (REVERTIDO PARA LÓGICA DB) ---

/**
 * Realiza o login do usuário contra a tabela app_users (CHECK INSEGURO).
 */
export async function loginAppUser(username, password) {
    // 1. Consulta a tabela, incluindo senha_app
    const { data, error } = await supabase
        .from('app_users')
        .select('id, username_app, nome_completo, tipo_usuario, senha_app, primeiro_login')
        .eq('username_app', username)
        .eq('senha_app', password) // CHECK INSEGURO: Verificação em texto simples
        .single();

    if (error && error.code === 'PGRST116') {
        throw new Error('Credenciais de login inválidas.'); 
    }
    if (error) {
        throw error;
    }
    
    // --- LÓGICA DE PRIMEIRO LOGIN ---
    let isFirstLogin = false;
    
    // Simulação: A senha '1234' é a senha inicial/padrão.
    if (data.senha_app === '1234' || data.primeiro_login === true) { 
        isFirstLogin = true;
    }
    // ------------------------------------

    // 2. Cria o objeto de sessão
    const sessionData = {
        id: data.id, // O ID primário da tabela app_users
        username: data.username_app,
        role: data.tipo_usuario,
        fullName: data.nome_completo,
        isFirstLogin: isFirstLogin
    };

    // 3. Simula a sessão localmente e persiste no localStorage
    localUserSession = sessionData;
    localStorage.setItem(USER_SESSION_KEY, JSON.stringify(sessionData));
    
    return data;
}

/**
 * Faz o logout do usuário, limpando a sessão local e o localStorage.
 */
export async function logoutAppUser() {
    localUserSession = null;
    localStorage.removeItem(USER_SESSION_KEY);
    return { error: null };
}

/**
 * Busca a sessão do usuário logado (agora verifica o localStorage).
 */
export async function getLocalSession() {
    // Retorna o valor já carregado ou atualiza a partir do storage
    if (!localUserSession) {
        const storedSession = localStorage.getItem(USER_SESSION_KEY);
        localUserSession = storedSession ? JSON.parse(storedSession) : null;
    }
    return localUserSession;
}


/**
 * Busca o papel (role) do usuário logado na sessão local.
 */
export async function fetchUserRole() {
    if (!localUserSession) return { role: null };
    return { role: localUserSession.role };
}

/**
 * Atualiza a senha do usuário logado após verificar a senha atual.
 */
export async function updateUserPassword(userId, currentPassword, newPassword) {
    // 1. Verifica se a senha atual está correta
    const { data: user, error: verifyError } = await supabase
        .from('app_users')
        .select('id')
        .eq('id', userId)
        .eq('senha_app', currentPassword) // CHECK INSEGURO
        .single();

    if (verifyError && verifyError.code === 'PGRST116') {
        throw new Error('A senha atual está incorreta.');
    }
    if (verifyError) {
        throw verifyError;
    }

    // 2. Atualiza a senha no banco e DESATIVA a flag de primeiro login
    const { error: updateError } = await supabase
        .from('app_users')
        .update({ senha_app: newPassword, primeiro_login: false })
        .eq('id', userId);

    if (updateError) {
        throw updateError;
    }
    
    return { error: null };
}

/**
 * Função para marcar o primeiro login como concluído na sessão local (após troca de senha).
 */
export async function finalizeFirstLogin(userId) {
     // Apenas limpa a flag isFirstLogin na sessão local.
     if (localUserSession && localUserSession.id === userId) {
         localUserSession.isFirstLogin = false;
         localStorage.setItem(USER_SESSION_KEY, JSON.stringify(localUserSession));
     }
}

/* NOVO: Função para atualizar nome, username e tipo de usuário */
/**
 * Atualiza dados de um usuário (nome, username, tipo_usuario) na tabela app_users.
 * Não permite alterar a senha por esta rota.
 */
export async function updateAppUser(userId, updateData) {
    // Remove a senha do objeto de dados se ela estiver presente, para evitar alterações acidentais
    // (A senha é tratada na rota updateUserPassword)
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

    // 2. Atualiza os dados
    const { data, error: updateError } = await supabase
        .from('app_users')
        .update(updateData)
        .eq('id', userId)
        .select()
        .single();
        
    if (updateError) throw updateError;
    
    return { data, error: null };
}
/* FIM NOVO */


/**
 * Registra um novo usuário na tabela app_users (SALVAMENTO INSEGURO).
 */
export async function registerAppUser(username_app, password, nome_completo, tipo_usuario) {
    // 1. Verifica se o username já existe
    const { data: existingUser, error: fetchError } = await supabase
        .from('app_users')
        .select('id')
        .eq('username_app', username_app);
        
    if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;
    if (existingUser && existingUser.length > 0) {
        throw new Error(`O usuário '${username_app}' já existe.`);
    }

    // 2. Insere o novo registro (SALVAMENTO INSEGURO)
    const { data, error: insertError } = await supabase.from('app_users').insert({
        nome_completo: nome_completo,
        tipo_usuario: tipo_usuario,
        username_app: username_app,
        senha_app: password, // SALVAMENTO INSEGURO
        primeiro_login: true
    }).select().single();

    if (insertError) throw insertError;

    return { data, error: null };
}

/**
 * Busca todos os usuários da aplicação (Gerencial).
 */
export async function fetchAppUsers() {
    // Busca a lista de perfis (incluindo o ID para exclusão)
    const { data, error } = await supabase.from('app_users').select('id, nome_completo, tipo_usuario, username_app').order('username_app');
    if (error) throw error;
    return data;
}

/**
 * EXCLUSÃO TOTAL: Exclui o registro do usuário da tabela app_users (controle total).
 */
export async function deleteAppUser(userId) {
    const { error } = await supabase.from('app_users').delete().eq('id', userId);
    
    if (error) throw error;
    return { error: null };
}


/**
 * Busca logs da aplicação (Simulação).
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


// --- FIM NOVAS FUNÇÕES DE AUTENTICAÇÃO ---

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