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
 * Busca todos os dados principais da aplicação.
 */
export async function fetchAllData() {
    try {
        const [fazendas, caminhoes, equipamentos, frentes_servico, fornecedores, proprietarios, terceiros, caminhao_historico] = await Promise.all([
            fetchTable('fazendas', '*, fornecedores(id, nome)'),
            // --- CORREÇÃO AQUI ---
            // A busca direta de 'frentes_servico' foi removida, pois causava o erro.
            // A coluna 'frente_id' já é trazida pelo '*'
            fetchTable('caminhoes', '*, proprietarios(id, nome)'),
            fetchTable('equipamentos', '*, proprietarios(id, nome), frentes_servico(id, nome), equipamento_terceiros(terceiros(*))'),
            fetchTable('frentes_servico'),
            fetchTable('fornecedores'),
            fetchTable('proprietarios'),
            fetchTable('terceiros', '*, empresa_id:proprietarios(id, nome)'),
            fetchTable('caminhao_historico', '*, caminhoes(cod_equipamento)')
        ]);
        
        return { fazendas, caminhoes, equipamentos, frentes_servico, fornecedores, proprietarios, terceiros, caminhao_historico };
    } catch (error) {
        console.error('Erro ao buscar todos os dados:', error);
        throw error;
    }
}

/**
 * Função genérica para buscar dados de uma tabela.
 */
export async function fetchTable(tableName, select = '*') {
    const { data, error } = await supabase.from(tableName).select(select).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
}

/**
 * Função para atualizar o status de um caminhão e registrar no histórico.
 */
export async function updateCaminhaoStatus(caminhaoId, novoStatus, frenteId = null) {
    const { data: caminhaoAtual, error: fetchError } = await supabase
        .from('caminhoes')
        .select('status')
        .eq('id', caminhaoId)
        .single();

    if (fetchError) throw fetchError;
    const statusAnterior = caminhaoAtual.status;
    const timestamp = new Date().toISOString();

    const { error: historyError } = await supabase
        .from('caminhao_historico')
        .insert({
            caminhao_id: caminhaoId,
            status_anterior: statusAnterior,
            status_novo: novoStatus,
            timestamp_mudanca: timestamp
        });
    
    if (historyError) throw historyError;

    const { data, error } = await supabase
        .from('caminhoes')
        .update({
            status: novoStatus,
            frente_id: frenteId
        })
        .eq('id', caminhaoId)
        .select()
        .single();

    if (error) throw error;
    return { data };
}

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