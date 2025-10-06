import { supabase } from './supabase.js';

// Função auxiliar para gerenciar as relações de operadores/motoristas
async function setRelatedTerceiros(itemId, terceiroIds, joinTableName, idColumnName) {
    // 1. Remove todas as associações antigas para este item
    const { error: deleteError } = await supabase.from(joinTableName).delete().eq(idColumnName, itemId);
    if (deleteError) throw deleteError;

    // 2. Se houver novos IDs, cria as novas associações
    if (terceiroIds && terceiroIds.length > 0) {
        const relations = terceiroIds.map(terceiroId => ({
            [idColumnName]: itemId,
            terceiro_id: terceiroId
        }));
        const { error: insertError } = await supabase.from(joinTableName).insert(relations);
        if (insertError) throw insertError;
    }
}

// Função para inserir um equipamento e seus operadores
export async function insertEquipment(data) {
    const { terceiros, ...equipmentData } = data; // Separa os dados principais dos IDs dos operadores
    const { data: newEquipment, error } = await supabase.from('equipamentos').insert(equipmentData).select().single();
    if (error) return { error };
    await setRelatedTerceiros(newEquipment.id, terceiros, 'equipamento_terceiros', 'equipamento_id');
    return { data: newEquipment, error: null };
}

// Função para inserir um caminhão e seus motoristas
export async function insertCaminhao(data) {
    const { terceiros, ...caminhaoData } = data;
    const { data: newCaminhao, error } = await supabase.from('caminhoes').insert(caminhaoData).select().single();
    if (error) return { error };
    await setRelatedTerceiros(newCaminhao.id, terceiros, 'caminhao_terceiros', 'caminhao_id');
    return { data: newCaminhao, error: null };
}

// Função para atualizar um equipamento e seus operadores
export async function updateEquipment(id, data) {
    const { terceiros, ...equipmentData } = data;
    const { error } = await supabase.from('equipamentos').update(equipmentData).eq('id', id);
    if (error) return { error };
    await setRelatedTerceiros(id, terceiros, 'equipamento_terceiros', 'equipamento_id');
    return { error: null };
}

// Função para atualizar um caminhão e seus motoristas
export async function updateCaminhao(id, data) {
    const { terceiros, ...caminhaoData } = data;
    const { error } = await supabase.from('caminhoes').update(caminhaoData).eq('id', id);
    if (error) return { error };
    await setRelatedTerceiros(id, terceiros, 'caminhao_terceiros', 'caminhao_id');
    return { error: null };
}

// Busca todos os dados de uma vez
export async function fetchAllData() {
    const [fazendas, caminhoes, equipamentos, frentes, fornecedores, proprietarios, terceiros] = await Promise.all([
        fetchTable('fazendas', '*, fornecedores(id, nome)'),
        fetchTable('caminhoes', '*, proprietarios(id, nome), terceiros(*)'),
        fetchTable('equipamentos', '*, proprietarios(id, nome), frentes_servico(id, nome), terceiros(*)'),
        fetchTable('frentes_servico'),
        fetchTable('fornecedores'),
        fetchTable('proprietarios'),
        fetchTable('terceiros', '*, proprietarios(id, nome)') // Busca terceiros e a empresa associada
    ]);
    return { fazendas, caminhoes, equipamentos, frentes, fornecedores, proprietarios, terceiros };
}

// Funções genéricas
export async function fetchTable(tableName, select = '*') {
    const { data, error } = await supabase.from(tableName).select(select).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
}

export async function insertItem(tableName, dataToInsert) {
    return await supabase.from(tableName).insert(dataToInsert);
}

export async function deleteItem(tableName, id) {
    return await supabase.from(tableName).delete().eq('id', id);
}

export async function fetchItemById(tableName, id) {
    const actualTableName = tableName.endsWith('s') && tableName !== 'caminhoes' ? tableName.slice(0, -1) + '_servico' : tableName;
    return await supabase.from(actualTableName).select('*, terceiros(*)').eq('id', id).single();
}

export async function updateItem(tableName, id, updateData) {
    const actualTableName = tableName.endsWith('s') && tableName !== 'caminhoes' ? tableName.slice(0, -1) + '_servico' : tableName;
    return await supabase.from(actualTableName).update(updateData).eq('id', id);
}