// js/main.js
import { loadSidebar } from './components/sidebar.js';
import { loadModal } from './components/modal.js';
import { initializeViews } from './views/viewManager.js';
import { supabase } from './supabase.js';
import { fetchUserRole, logoutAppUser } from './api.js'; // Importa logoutAppUser
import { showToast } from './helpers.js';

class App {
    constructor() {
        this.currentView = 'login'; // Começa com login
        this.userRole = null;
        this.init();
    }

    async init() {
        try {
            console.log('🚀 Iniciando aplicação...');
            
            // Carregar componentes básicos
            await loadModal();
            
            // Inicializar ViewManager (passando a referência do App)
            await initializeViews(this);
            
            // Verifica a sessão atual
            const { data: { session } } = await supabase.auth.getSession();
            
            if (session) {
                await this.initializeAfterLogin();
            } else {
                this.showLoginScreen();
            }
            
            console.log('✅ Aplicação inicializada com sucesso!');
            
        } catch (error) {
            console.error('❌ Erro ao inicializar aplicação:', error);
            showToast('Erro fatal na inicialização.', 'error');
        }
    }
    
    // --- NOVO: Lógica de inicialização após login/sessão ---
    async initializeAfterLogin() {
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        
        // 1. Busca o papel do usuário
        const { role } = await fetchUserRole();
        this.userRole = role;
        
        // 2. Carrega a sidebar com base no papel
        await loadSidebar(this.userRole);
        
        // 3. Mostra o Dashboard
        window.viewManager.showView('dashboard');
    }
    
    // --- NOVO: Lógica para mostrar a tela de login ---
    showLoginScreen() {
        document.getElementById('login-container').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
        window.viewManager.showView('login');
    }
    
    // --- NOVO: Lógica de Logout ---
    async handleLogout() {
        try {
            await logoutAppUser(); // Usa a função do API.js
            
            this.userRole = null;
            showToast('Logout realizado.', 'info');
            this.showLoginScreen();
        } catch (error) {
            console.error('Erro ao fazer logout:', error);
            showToast('Erro ao fazer logout.', 'error');
        }
    }
}

// Inicializar aplicação quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});