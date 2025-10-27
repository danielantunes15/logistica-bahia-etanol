// js/dataCache.js
import { fetchAllData, fetchMetadata, fetchMasterData } from './api.js';
import { supabase } from './supabase.js'; // Importar supabase

class DataCache {
    constructor() {
        this.cache = new Map();
        this.lastFetchTime = 0;
        this.CACHE_DURATION = 15000; // 15 segundos de cache para dados mestres
        this.MASTER_DATA_KEY = 'MASTER_DATA'; // NOVO: Chave para dados cadastrais
        this.ALL_DATA_KEY = 'ALL_DATA'; // Chave para dados completos (com histórico)
        this.channel = null; // Para guardar a referência do canal de Real-Time
    }

    /**
     * Busca ou retorna do cache TODOS os dados necessários (incluindo histórico).
     */
    async fetchAllData(forceRefresh = false) {
        if (!forceRefresh && (Date.now() - this.lastFetchTime) < this.CACHE_DURATION && this.cache.has(this.ALL_DATA_KEY)) {
            console.log('Cache Hit: Retornando ALL data do cache.');
            return this.cache.get(this.ALL_DATA_KEY);
        }

        console.log('Cache Miss/Stale: Buscando ALL data da API.');
        // daysBack = 90 (padrão)
        const data = await fetchAllData(); 
        this.cache.set(this.ALL_DATA_KEY, data);
        // Atualiza MASTER_DATA também, pois ALL_DATA contém o MASTER_DATA
        this.cache.set(this.MASTER_DATA_KEY, data); 
        this.lastFetchTime = Date.now();
        return data;
    }

    /**
     * NOVO: Busca apenas os dados cadastrais, sem logs de histórico.
     */
    async fetchMasterDataOnly(forceRefresh = false) {
        if (!forceRefresh && (Date.now() - this.lastFetchTime) < this.CACHE_DURATION && this.cache.has(this.MASTER_DATA_KEY)) {
            console.log('Cache Hit: Retornando MASTER data do cache.');
            return this.cache.get(this.MASTER_DATA_KEY);
        }

        console.log('Cache Miss/Stale: Buscando MASTER data da API.');
        const data = await fetchMasterData();
        this.cache.set(this.MASTER_DATA_KEY, data);
        this.lastFetchTime = Date.now();
        return data;
    }
    
    /**
     * Busca ou retorna do cache apenas os metadados necessários para o Dashboard.
     */
    async fetchMetadata(forceRefresh = false) {
        const cachedData = this.cache.get('METADATA');
        const lastMetaFetch = this.cache.get('LAST_META_FETCH') || 0;
        const META_CACHE_DURATION = 10000; 

        if (!forceRefresh && cachedData && (Date.now() - lastMetaFetch) < META_CACHE_DURATION) {
            console.log('Cache Hit: Retornando METADATA do cache.');
            return cachedData;
        }

        console.log('Cache Miss/Stale: Buscando METADATA da API.');
        const data = await fetchMetadata();
        this.cache.set('METADATA', data);
        this.cache.set('LAST_META_FETCH', Date.now());
        return data;
    }

    /**
     * Invalida o cache principal após uma operação de escrita.
     */
    invalidateAllData() {
        this.cache.delete(this.ALL_DATA_KEY);
        this.cache.delete(this.MASTER_DATA_KEY); // Invalida o novo cache master
        this.cache.delete('METADATA');
        this.lastFetchTime = 0;
        console.log('Cache de dados mestres invalidado.');
    }

    /**
     * NOVO: Inicia a escuta em tempo real do Supabase para alterações de status.
     */
    subscribeToRealTimeUpdates() {
        // Verifica se a inscrição já foi feita para evitar duplicidade
        if (this.channel) return; 

        this.channel = supabase.channel('status_updates')
            .on(
                'postgres_changes',
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'caminhoes' 
                },
                (payload) => {
                    this.handleRealTimeChange(payload, 'caminhoes');
                }
            )
            .on(
                'postgres_changes',
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'frentes_servico' 
                },
                (payload) => {
                    this.handleRealTimeChange(payload, 'frentes_servico');
                }
            )
            .on(
                'postgres_changes',
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'ocorrencias' 
                },
                (payload) => {
                    this.handleRealTimeChange(payload, 'ocorrencias');
                }
            )
            .subscribe((status, err) => {
                if (err) {
                    console.error('Erro na subscrição Real-Time:', err);
                } else {
                    console.log('Status da subscrição Real-Time:', status);
                }
            });
        
        console.log('Inscrição Real-Time para status e frentes iniciada.');
    }
    
    /**
     * Lida com o evento Real-Time, invalidando o cache e notificando as views.
     */
    handleRealTimeChange(payload, table) {
        console.log(`Alteração Real-Time detectada na tabela: ${table}`, payload.eventType);
        
        // 1. Invalida os caches relevantes
        this.invalidateAllData();
        
        // 2. Dispara evento global para que as views possam reagir
        window.dispatchEvent(new CustomEvent('statusUpdated', {
            detail: { table: table, payload: payload }
        }));
    }
}

export const dataCache = new DataCache();