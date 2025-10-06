// Este arquivo centraliza todas as chamadas ao banco de dados.
import { supabase } from './supabase.js';

// Busca todos os dados de uma vez
export async function fetchAllData() {
    const [fazendas, caminhoes, equipamentos, frentes, fornecedores, proprietarios] = await Promise.all([
        fetchTable('fazendas', '*, fornecedores(id, nome)'),
        fetchTable('caminhoes', '*, proprietarios(id, nome)'),
        fetchTable('equipamentos', '*, proprietarios(id, nome)'),
        fetchTable('frentes_servico'),
        fetchTable('fornecedores'),
        fetchTable('proprietarios')
    ]);
    return { fazendas, caminhoes, equipamentos, frentes, fornecedores, proprietarios };
}

// Função genérica para buscar dados de uma tabela
export async function fetchTable(tableName, select = '*') {
    const { data, error } = await supabase.from(tableName).select(select).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
}

// Função genérica para inserir um item
export async function insertItem(tableName, dataToInsert) {
    return await supabase.from(tableName).insert(dataToInsert);
}

// Função genérica para deletar um item
export async function deleteItem(tableName, id) {
    return await supabase.from(tableName).delete().eq('id', id);
}

// Função genérica para buscar um único item por ID
export async function fetchItemById(tableName, id) {
    return await supabase.from(tableName).select('*').eq('id', id).single();
}

// Função genérica para atualizar um item
export async function updateItem(tableName, id, updateData) {
    return await supabase.from(tableName).update(updateData).eq('id', id);
}

// Funções específicas para operações do painel de controle
export async function updateCaminhaoStatus(caminhaoId, novoStatus) {
    const { data: caminhaoAtual, error: fetchError } = await fetchItemById('caminhoes', caminhaoId);
    if (fetchError) throw fetchError;

    await insertItem('caminhao_historico', {
        caminhao_id: caminhaoId,
        status_anterior: caminhaoAtual.status,
        status_novo: novoStatus,
        motorista_no_momento: caminhaoAtual.motorista_atual
    });

    return await updateItem('caminhoes', caminhaoId, { status: novoStatus });
}