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

export async function fetchAllData() {
    try {
        // --- CORREÇÃO AQUI ---
        // A variável 'frentes' foi renomeada para 'frentes_servico' para corresponder ao nome da tabela.
        const [fazendas, caminhoes, equipamentos, frentes_servico, fornecedores, proprietarios, terceiros] = await Promise.all([
            fetchTable('fazendas', '*, fornecedores(id, nome)'),
            fetchTable('caminhoes', '*, proprietarios(id, nome), caminhao_terceiros(terceiros(*))'),
            fetchTable('equipamentos', '*, proprietarios(id, nome), frentes_servico(id, nome), equipamento_terceiros(terceiros(*))'),
            fetchTable('frentes_servico'),
            fetchTable('fornecedores'),
            fetchTable('proprietarios'),
            fetchTable('terceiros', '*, empresa_id:proprietarios(id, nome)')
        ]);
        
        console.log('Dados carregados:', {
            fazendas: fazendas?.length,
            caminhoes: caminhoes?.length,
            equipamentos: equipamentos?.length,
            frentes_servico: frentes_servico?.length, // Log atualizado
            fornecedores: fornecedores?.length,
            proprietarios: proprietarios?.length,
            terceiros: terceiros?.length
        });
        
        // --- E AQUI ---
        // O objeto retornado agora usa a chave 'frentes_servico'.
        return { fazendas, caminhoes, equipamentos, frentes_servico, fornecedores, proprietarios, terceiros };
    } catch (error) {
        console.error('Erro ao buscar todos os dados:', error);
        throw error;
    }
}

export async function fetchTable(tableName, select = '*') {
    const { data, error } = await supabase.from(tableName).select(select).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
}

export async function insertItem(tableName, dataToInsert) {
    // Verificar se é um cadastro especial que precisa de tratamento
    if (tableName === 'equipamentos') {
        return await insertEquipment(dataToInsert);
    } else if (tableName === 'caminhoes') {
        return await insertCaminhao(dataToInsert);
    } else {
        const { data, error } = await supabase.from(tableName).insert(dataToInsert).select().single();
        return { data, error };
    }
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
    // Verificar se é um cadastro especial que precisa de tratamento
    if (tableName === 'equipamentos') {
        return await updateEquipment(id, updateData);
    } else if (tableName === 'caminhoes') {
        return await updateCaminhao(id, updateData);
    } else {
        const { data, error } = await supabase.from(tableName).update(updateData).eq('id', id).select().single();
        return { data, error };
    }
}