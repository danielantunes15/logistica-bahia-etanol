// O maestro da aplicação. Importa e organiza as chamadas para os outros módulos.
import { supabase } from './supabase.js';
import * as api from './api.js';
import * as ui from './ui.js';
import * as maps from './maps.js';
import * as reports from './reports.js';

// --- INICIALIZAÇÃO ---
function initializeApp() {
    ui.injectHTMLContent();
    ui.addEventListeners();
    maps.initDashboardMap();
    refreshAllData();
    setupRealtime();
    console.log('Aplicação modularizada inicializada.');
}

// --- FUNÇÃO DE ATUALIZAÇÃO GERAL ---
async function refreshAllData() {
    try {
        const allData = await api.fetchAllData();
        ui.renderDashboard(allData);
        ui.renderControle(allData);
        ui.renderCadastros(allData);
        // (As funções de renderização de mapa são chamadas dentro do renderDashboard)
    } catch (error) {
        console.error("Erro ao buscar dados:", error);
        ui.showToast('Erro ao carregar dados.', 'error');
    }
}

// --- TEMPO REAL ---
function setupRealtime() {
    supabase.channel('public:tables').on('postgres_changes', { event: '*', schema: 'public' }, refreshAllData).subscribe();
}

// --- PONTO DE ENTRADA ---
document.addEventListener('DOMContentLoaded', initializeApp);