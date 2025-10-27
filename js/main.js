// js/main.js

import { loadSidebar } from './components/sidebar.js';
import { loadModal, openModal, closeModal } from './components/modal.js'; 
import { initializeViews } from './views/viewManager.js';
// Importações atualizadas para o novo sistema seguro
import { getLocalSession, logoutAppUser, updateUserPassword, forceLogout } from './api.js'; 
import { showToast, showLoading, hideLoading, handleOperation } from './helpers.js';
// MUDANÇA: Importa dataCache para buscar os metadados e iniciar Real-Time
import { dataCache } from './dataCache.js';

class App {
    constructor() {
        this.currentView = 'login'; 
        this.userRole = null;
        this.sessionTimer = null;
        this.inactivityTimer = null;
        // O valor é irrelevante, mas mantido na definição da classe.
        this.INACTIVITY_TIMEOUT = 10 * 60 * 60 * 1000; 
        this.init();
    }

    async init() {
        try {
            console.log('🚀 Iniciando aplicação...');
            
            await loadModal();
            await initializeViews(this);
            
            // NOVO: Inicia a escuta Real-Time imediatamente
            dataCache.subscribeToRealTimeUpdates(); 
            
            const session = await getLocalSession(); 
            
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

        // 2. MUDANÇA: Busca dados leves para contadores e calcula.
        let counts = {};
        try {
            const data = await dataCache.fetchMetadata(true); // Força refresh inicial para dados críticos
            
            const downtimeCaminhoes = data.caminhoes.filter(c => ['quebrado', 'parado'].includes(c.status)).length;
            const downtimeEquipamentos = data.equipamentos.filter(e => ['quebrado', 'parado'].includes(e.status)).length;
            const descargaCount = data.caminhoes.filter(c => c.status === 'descarregando').length;
            
            counts = { downtimeCaminhoes, downtimeEquipamentos, descargaCount };
            
        } catch (e) {
            console.error('Erro ao buscar contadores iniciais:', e);
            // Continua com counts vazios
        }
        
        // 3. Carrega a sidebar com o nome do usuário para exibição E AS CONTAGENS
        await loadSidebar(this.userRole, session.fullName, counts); 
        
        // 4. Inicia o monitoramento de sessão (REMOVIDO TIMER, MANTIDO APENAS A ESTRUTURA)
        this.setupSessionManagement();
        
        // 5. Verifica se é primeiro login para forçar troca de senha
        if (session.isFirstLogin) {
            this.showFirstLoginChangePasswordModal(session);
        } else {
            window.viewManager.showView('dashboard');
        }
    }
    
    showLoginScreen() {
        // Para timers quando na tela de login
        this.cleanupTimers();
        
        document.getElementById('login-container').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
        window.viewManager.showView('login');
    }
    
    // --- GERENCIAMENTO DE SESSÃO E INATIVIDADE (TOTALMENTE DESATIVADO) ---
    
    setupSessionManagement() {
        // MUDANÇA PRINCIPAL: Desativa todos os timers automáticos.
        this.cleanupTimers(); 
        console.log('Monitoramento de Inatividade e Sessão Periódica Desativados.');
    }
    
    // Funções de Timer mantidas como Stubs
    resetInactivityTimer() {
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
        }
    }
    
    async handleInactivity() {
        console.log('Tentativa de handleInactivity ignorada.');
    }
    
    async checkSession() {
        console.log('Verificação de sessão periódica ignorada.');
    }
    
    cleanupTimers() {
        if (this.sessionTimer) {
            clearInterval(this.sessionTimer);
            this.sessionTimer = null;
        }
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
            this.inactivityTimer = null;
        }
    }
    
    async handleLogout() {
        try {
            this.cleanupTimers();
            await logoutAppUser(); 
            
            this.userRole = null;
            showToast('Logout realizado com sucesso.', 'info');
            this.showLoginScreen();
        } catch (error) {
            console.error('Erro ao fazer logout:', error);
            showToast('Erro ao fazer logout.', 'error');
        }
    }
    
    // --- LÓGICA DE TROCA DE SENHA OBRIGATÓRIA (MANTIDA) ---
    showFirstLoginChangePasswordModal(session) {
         // Desabilita a sidebar e o main-content para forçar a interação com o modal
         document.getElementById('sidebar').style.pointerEvents = 'none';
         document.querySelector('.main-content').style.pointerEvents = 'none';

         const modalContent = `
            <form id="change-password-form" class="action-modal-form">
                <h3 style="margin-bottom: 5px;">Bem-vindo(a), ${session.fullName}!</h3>
                <p class="form-help" style="color: var(--accent-danger); font-size: 1rem; margin-bottom: 20px;">
                    <strong>SEGURANÇA OBRIGATÓRIA:</strong> Este é seu primeiro acesso. 
                    Por favor, defina uma nova senha segura para continuar.
                </p>
                <div class="form-group">
                    <label for="current_password">Senha Atual Provisória</label>
                    <input type="password" id="current_password" name="current_password" class="form-input" required>
                    <p class="form-help">Digite a senha temporária fornecida pelo administrador.</p>
                </div>
                <div class="form-group">
                    <label for="new_password">Nova Senha (Mínimo 6 caracteres)</label>
                    <input type="password" id="new_password" name="new_password" class="form-input" required minlength="6">
                    <p class="form-help">Use uma senha forte com letras, números e caracteres especiais.</p>
                </div>
                <div class="form-group">
                    <label for="confirm_password">Confirmar Nova Senha</label>
                    <input type="password" id="confirm_password" name="confirm_password" class="form-input" required>
                </div>
                <button type="submit" class="btn-primary">Criar Nova Senha e Continuar</button>
            </form>
        `;

        // Abre o modal. O parâmetro 'false' impede que ele seja fechado pelo overlay.
        openModal('Troca de Senha Obrigatória', modalContent, false); 
        document.getElementById('modal-close-btn').style.display = 'none'; // Esconde o botão de fechar

        // Associa o handler
        document.getElementById('change-password-form').addEventListener('submit', this.handleFirstLoginChangePasswordSubmit.bind(this, session.id));
    }

    // Lógica de submissão da nova senha no PRIMEIRO LOGIN
    async handleFirstLoginChangePasswordSubmit(userId, e) {
        e.preventDefault();
        const form = e.target;
        const currentPassword = form.current_password.value;
        const newPassword = form.new_password.value;
        const confirmPassword = form.confirm_password.value;

        if (!currentPassword) {
            showToast('Digite a senha atual provisória.', 'error');
            return;
        }

        if (newPassword !== confirmPassword) {
            showToast('A nova senha e a confirmação não coincidem.', 'error');
            return;
        }

        if (newPassword.length < 6) {
             showToast('A nova senha deve ter no mínimo 6 caracteres.', 'error');
             return;
        }
        
        // Validação básica de força da senha
        if (newPassword === currentPassword) {
            showToast('A nova senha não pode ser igual à senha atual.', 'error');
            return;
        }
        
        showLoading();
        try {
            // Atualiza a senha (agora usando bcrypt seguro)
            await updateUserPassword(userId, currentPassword, newPassword);
            
            showToast('Senha atualizada com sucesso! Acesso liberado.', 'success');
            
            // Reabilita a interface e fecha o modal
            closeModal();
            document.getElementById('sidebar').style.pointerEvents = 'auto';
            document.querySelector('.main-content').style.pointerEvents = 'auto';

            // Redireciona para o dashboard
            window.viewManager.showView('dashboard');
            
        } catch (error) {
            console.error('Erro ao trocar senha:', error);
            showToast(error.message, 'error');
        } finally {
            hideLoading();
        }
    }

    // Modal de troca de senha normal (não primeiro login)
    async showChangePasswordModal() {
        const session = await getLocalSession();
        if (!session) return;

        const modalContent = `
            <form id="change-password-form" class="action-modal-form">
                <p>Alterando senha para: <strong>${session.fullName}</strong></p>
                <div class="form-group">
                    <label for="current_password">Senha Atual</label>
                    <input type="password" id="current_password" name="current_password" class="form-input" required autocomplete="current-password">
                </div>
                <div class="form-group">
                    <label for="new_password">Nova Senha (Mínimo 6 caracteres)</label>
                    <input type="password" id="new_password" name="new_password" class="form-input" required minlength="6" autocomplete="new-password">
                    <p class="form-help">Use uma senha forte com letras, números e caracteres especiais.</p>
                </div>
                <div class="form-group">
                    <label for="confirm_password">Confirmar Nova Senha</label>
                    <input type="password" id="confirm_password" name="confirm_password" class="form-input" required autocomplete="new-password">
                </div>
                <button type="submit" class="btn-primary">Trocar Senha</button>
            </form>
        `;

        openModal('Trocar Senha do Usuário', modalContent);

        document.getElementById('change-password-form').addEventListener('submit', this.handleChangePasswordSubmit.bind(this, session.id));
    }

    async handleChangePasswordSubmit(userId, e) {
        e.preventDefault();
        const form = e.target;
        const currentPassword = form.current_password.value;
        const newPassword = form.new_password.value;
        const confirmPassword = form.confirm_password.value;

        if (newPassword !== confirmPassword) {
            showToast('A nova senha e a confirmação não coincidem.', 'error');
            return;
        }

        if (newPassword.length < 6) {
             showToast('A nova senha deve ter no mínimo 6 caracteres.', 'error');
             return;
        }
        
        if (newPassword === currentPassword) {
            showToast('A nova senha não pode ser igual à senha atual.', 'error');
            return;
        }
        
        showLoading();
        try {
            await updateUserPassword(userId, currentPassword, newPassword);
            
            showToast('Senha alterada com sucesso! Você será desconectado para logar novamente.', 'success');
            closeModal();
            
            // Pequeno delay para mostrar a mensagem de sucesso
            setTimeout(() => {
                this.handleLogout(); 
            }, 1500);
            
        } catch (error) {
            console.error('Erro ao trocar senha:', error);
            showToast(error.message, 'error');
        } finally {
            hideLoading();
        }
    }
}

// Event listener para forçar logout quando a sessão expirar
window.addEventListener('forceLogout', () => {
    if (window.app) {
        window.app.handleLogout();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});