import { supabase } from './supabase.js';

// Função auxiliar para gerenciar as relações de operadores/motoristas
async function setRelatedTerceiros(itemId, terceiroIds, joinTableName, idColumnName) {
    const { error: deleteError } = await supabase.from(joinTableName).delete().eq(idColumnName, itemId);
    if (deleteError) throw deleteError;
    if (terceiroIds && terceiroIds.length > 0) {
        const relations = terceiroIds.map(terceiroId => ({ [idColumnName]: itemId, terceiro_id: terceiroId }));
        const { error: insertError } = await supabase.from(joinTableName).insert(relations);
        if (insertError) throw insertError;
    }
}

// Funções específicas para itens com relações Muitos-para-Muitos
export async function insertEquipment(data) {
    const { terceiros, ...equipmentData } = data;
    const { data: newEquipment, error } = await supabase.from('equipamentos').insert(equipmentData).select().single();
    if (error) return { error };
    if (terceiros) await setRelatedTerceiros(newEquipment.id, terceiros, 'equipamento_terceiros', 'equipamento_id');
    return { data: newEquipment, error: null };
}

export async function insertCaminhao(data) {
    const { terceiros, ...caminhaoData } = data;
    const { data: newCaminhao, error } = await supabase.from('caminhoes').insert(caminhaoData).select().single();
    if (error) return { error };
    if (terceiros) await setRelatedTerceiros(newCaminhao.id, terceiros, 'caminhao_terceiros', 'caminhao_id');
    return { data: newCaminhao, error: null };
}

export async function updateEquipment(id, data) {
    const { terceiros, ...equipmentData } = data;
    const { error } = await supabase.from('equipamentos').update(equipmentData).eq('id', id);
    if (error) return { error };
    if (terceiros) await setRelatedTerceiros(id, terceiros, 'equipamento_terceiros', 'equipamento_id');
    return { error: null };
}

export async function updateCaminhao(id, data) {
    const { terceiros, ...caminhaoData } = data;
    const { error } = await supabase.from('caminhoes').update(caminhaoData).eq('id', id);
    if (error) return { error };
    if (terceiros) await setRelatedTerceiros(id, terceiros, 'caminhao_terceiros', 'caminhao_id');
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
        fetchTable('terceiros', '*, proprietarios(id, nome)')
    ]);
    return { fazendas, caminhoes, equipamentos, frentes, fornecedores, proprietarios, terceiros };
}

// --- FUNÇÕES GENÉRICAS CORRIGIDAS ---

// Função genérica para buscar dados de uma tabela
export async function fetchTable(tableName, select = '*') {
    const { data, error } = await supabase.from(tableName).select(select).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
}

// Função genérica para inserir um item (sem lógica de renomeação)
export async function insertItem(tableName, dataToInsert) {
    return await supabase.from(tableName).insert(dataToInsert);
}

// Função genérica para deletar um item (sem lógica de renomeação)
export async function deleteItem(tableName, id) {
    return await supabase.from(tableName).delete().eq('id', id);
}

// Função genérica para buscar um único item por ID (sem lógica de renomeação)
export async function fetchItemById(tableName, id) {
    return await supabase.from(tableName).select('*, terceiros(*)').eq('id', id).single();
}

// Função genérica para atualizar um item (sem lógica de renomeação)
export async function updateItem(tableName, id, updateData) {
    return await supabase.from(tableName).update(updateData).eq('id', id);
}