// js/dataCache.js
import { fetchAllData, fetchMetadata } from './api.js';

class DataCache {
    constructor() {
        this.cache = new Map();
        this.lastFetchTime = 0;
        this.CACHE_DURATION = 15000; // 15 segundos de cache para dados mestres
    }

    /**
     * Busca ou retorna do cache TODOS os dados necessários para views complexas (Controle, Equipamentos, Relatórios).
     * @param {boolean} forceRefresh - Força o fetch da API.
     * @returns {Promise<Object>} Dados completos.
     */
    async fetchAllData(forceRefresh = false) {
        if (!forceRefresh && (Date.now() - this.lastFetchTime) < this.CACHE_DURATION) {
            console.log('Cache Hit: Retornando ALL data do cache.');
            return this.cache.get('ALL_DATA');
        }

        console.log('Cache Miss/Stale: Buscando ALL data da API.');
        const data = await fetchAllData();
        this.cache.set('ALL_DATA', data);
        this.lastFetchTime = Date.now();
        return data;
    }
    
    /**
     * Busca ou retorna do cache apenas os metadados necessários para o Dashboard.
     * @param {boolean} forceRefresh - Força o fetch da API.
     * @returns {Promise<Object>} Dados de metadados.
     */
    async fetchMetadata(forceRefresh = false) {
        // Usa uma chave de cache mais curta (10s) para o Dashboard, que tem seu próprio auto-refresh de 30s.
        const cachedData = this.cache.get('METADATA');
        const lastMetaFetch = this.cache.get('LAST_META_FETCH') || 0;
        const META_CACHE_DURATION = 10000; // 10 segundos para metadados

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
     * Invalida o cache principal após uma operação de escrita (insert, update, delete).
     */
    invalidateAllData() {
        this.cache.delete('ALL_DATA');
        this.cache.delete('METADATA');
        this.lastFetchTime = 0;
        console.log('Cache de dados mestres invalidado.');
    }
}

export const dataCache = new DataCache();