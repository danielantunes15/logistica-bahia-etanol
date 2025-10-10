// js/main.js
import { loadSidebar } from './components/sidebar.js';
import { loadModal } from './components/modal.js';
import { initializeViews } from './views/viewManager.js';
import { fetchUserRole, logoutAppUser, getLocalSession } from './api.js'; 
import { showToast } from './helpers.js';

class App {
    constructor() {
        this.currentView = 'login'; 
        this.userRole = null;
        this.init();
    }

    async init() {
        try {
            console.log('🚀 Iniciando aplicação...');
            
            await loadModal();
            
            // Inicializa o ViewManager passando a referência do App
            await initializeViews(this);
            
            // Verifica a sessão persistida no localStorage
            const session = await getLocalSession(); 
            
            if (session) {
                // Se houver sessão, vai para o fluxo pós-login
                await this.initializeAfterLogin(); 
            } else {
                // Caso contrário, mostra a tela de login
                this.showLoginScreen();
            }
            
            console.log('✅ Aplicação inicializada com sucesso!');
            
        } catch (error) {
            console.error('❌ Erro ao inicializar aplicação:', error);
            showToast('Erro fatal na inicialização.', 'error');
        }
    }
    
    async initializeAfterLogin() { 
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        
        const session = await getLocalSession();
        if (!session) {
            this.showLoginScreen();
            return;
        }

        // 1. Define o papel do usuário
        this.userRole = session.role; 
        
        // 2. Carrega a sidebar com o nome do usuário para exibição
        // session.fullName é o novo campo que vem do api.js
        await loadSidebar(this.userRole, session.fullName); 
        
        // 3. Mostra o Dashboard
        window.viewManager.showView('dashboard');
    }
    
    showLoginScreen() {
        document.getElementById('login-container').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
        window.viewManager.showView('login');
    }
    
    async handleLogout() {
        try {
            await logoutAppUser(); 
            
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