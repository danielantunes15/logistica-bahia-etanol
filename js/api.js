// js/api.js

import { supabase } from './supabase.js';

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
 * NOVO: Função otimizada para buscar apenas metadados necessários para o Dashboard e Cadastros.
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

// --- NOVA FUNÇÃO INTERNA: Busca Logs Históricos com Filtro de Tempo ---
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
 * CORRIGIDO: Função para buscar todos os dados, incluindo histórico, usada por Relatórios e Vistas detalhadas.
 * MELHORIA: Adiciona limite de 90 dias para histórico para mitigar grandes volumes de dados.
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

/**
 * MUDANÇA AQUI: Designa um caminhão para uma frente com status e horário.
 */
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

    // Se o novo status é 'disponivel' (fim de ciclo), 'quebrado' ou 'parado', desassocia da frente.
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
    const { data, error } = await supabase.from(tableName).update(updateData).eq('id', id).select().single();
    return { data, error };
}