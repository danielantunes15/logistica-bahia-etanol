import { supabase } from './supabase.js';
import * as api from './api.js';
import * as ui from './ui.js';
import * as maps from './maps.js';
import * as reports from './reports.js';
import { showToast } from './helpers.js';

function initializeApp() {
    ui.injectHTMLContent();
    ui.addEventListeners();
    maps.initDashboardMap();
    refreshAllData();
    setupRealtime();
    console.log('Aplicação modularizada inicializada.');
}

async function refreshAllData() {
    try {
        const allData = await api.fetchAllData();
        ui.renderDashboard(allData.fazendas, allData.caminhoes, allData.equipamentos);
        maps.updateFazendaMarkers(allData.fazendas);
        maps.updateCaminhaoMarkers(allData.caminhoes);
        maps.updateEquipamentoMarkers(allData.equipamentos);
        ui.renderControle(allData.fazendas, allData.caminhoes, allData.equipamentos, allData.frentes);
        ui.renderCadastros(allData);
        if (document.querySelector('#relatorios-view.active-view')) {
            reports.renderReports();
        }
    } catch (error) {
        console.error("Erro ao buscar dados:", error);
        showToast('Erro ao carregar dados.', 'error');
    }
}

function setupRealtime() {
    supabase.channel('public:tables').on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
        console.log('Mudança detectada no banco de dados!', payload);
        refreshAllData();
    }).subscribe();
}

document.addEventListener('DOMContentLoaded', initializeApp);