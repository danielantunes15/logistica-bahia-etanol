import { supabase } from './supabase.js';

// Funções base do CRUD
export async function fetchAllData() {
    try {
        const [fazendas, caminhoes, equipamentos, frentes, fornecedores, proprietarios, terceiros] = await Promise.all([
            fetchTable('fazendas', '*, fornecedores(id, nome)'),
            fetchTable('caminhoes', '*, proprietarios(id, nome), caminhao_terceiros(terceiros(*))'),
            fetchTable('equipamentos', '*, proprietarios(id, nome), frentes_servico(id, nome), equipamento_terceiros(terceiros(*))'),
            fetchTable('frentes_servico'),
            fetchTable('fornecedores'),
            fetchTable('proprietarios'),
            fetchTable('terceiros', '*, empresa_id:proprietarios(id, nome)')
        ]);
        
        return { fazendas, caminhoes, equipamentos, frentes, fornecedores, proprietarios, terceiros };
    } catch (error) {
        console.error('Erro ao buscar todos os dados:', error);
        throw error;
    }
}

export async function fetchTable(tableName, select = '*') {
    const { data, error } = await supabase
        .from(tableName)
        .select(select)
        .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
}

export async function insertItem(tableName, dataToInsert) {
    const { data, error } = await supabase
        .from(tableName)
        .insert(dataToInsert)
        .select()
        .single();
    
    return { data, error };
}

export async function updateItem(tableName, id, updateData) {
    const { data, error } = await supabase
        .from(tableName)
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
    
    return { data, error };
}

export async function deleteItem(tableName, id) {
    const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id);
    
    return { error };
}

export async function fetchItemById(tableName, id, select = '*') {
    const { data, error } = await supabase
        .from(tableName)
        .select(select)
        .eq('id', id)
        .single();
    
    return { data, error };
}