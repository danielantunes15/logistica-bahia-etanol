// js/main.js
import { loadSidebar } from './components/sidebar.js';
import { loadModal } from './components/modal.js';
import { initializeViews } from './views/viewManager.js';

class App {
    constructor() {
        this.currentView = 'dashboard';
        this.init();
    }

    async init() {
        try {
            console.log('🚀 Iniciando aplicação...');
            
            // Carregar componentes básicos
            await loadSidebar();
            await loadModal();
            
            // Inicializar views
            await initializeViews();
            
            console.log('✅ Aplicação inicializada com sucesso!');
            
        } catch (error) {
            console.error('❌ Erro ao inicializar aplicação:', error);
        }
    }
}

// Inicializar aplicação quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});