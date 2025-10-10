// js/main.js

import { loadSidebar } from './components/sidebar.js';
import { loadModal, openModal, closeModal } from './components/modal.js'; 
import { initializeViews } from './views/viewManager.js';
// Importações atualizadas para o novo sistema seguro
import { getLocalSession, logoutAppUser, updateUserPassword, forceLogout } from './api.js'; 
import { showToast, showLoading, hideLoading, handleOperation } from './helpers.js';

class App {
    constructor() {
        this.currentView = 'login'; 
        this.userRole = null;
        this.sessionTimer = null;
        this.inactivityTimer = null;
        // MANTIDO: O timeout é irrelevante, mas o AppManager exige a propriedade.
        this.INACTIVITY_TIMEOUT = 10 * 60 * 60 * 1000; // 10 horas de inatividade
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
                // Se houver sessão válida, vai para o fluxo pós-login
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
        await loadSidebar(this.userRole, session.fullName); 
        
        // 3. Inicia o monitoramento de sessão (REMOVIDO TIMER, MANTIDO APENAS A ESTRUTURA)
        this.setupSessionManagement();
        
        // 4. Verifica se é primeiro login para forçar troca de senha
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
    
    // --- GERENCIAMENTO DE SESSÃO E INATIVIDADE ---
    
    // MUDANÇA PRINCIPAL: Desativa todos os timers automáticos.
    setupSessionManagement() {
        // MUDANÇA: Timer de Inatividade e listeners de mouse/teclado desativados.
        
        // MUDANÇA: A verificação periódica de sessão (que causava o logout) foi removida.
        // O logout só ocorrerá se o usuário limpar o localStorage ou clicar em 'Sair'.
        
        console.log('Monitoramento de Inatividade Desativado para Modo TV.');
    }
    
    resetInactivityTimer() {
        // Função mantida, mas não é chamada por eventos do usuário no setupSessionManagement
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
        }
        
        this.inactivityTimer = setTimeout(() => {
            // Se o AppManager for mantido aberto por mais de 10h, este código será executado uma vez.
            this.handleInactivity(); 
        }, this.INACTIVITY_TIMEOUT);
    }
    
    async handleInactivity() {
        const session = await getLocalSession();
        if (session) {
            await forceLogout();
            this.handleLogout();
            showToast('Sessão expirada por inatividade prolongada. Faça login novamente.', 'warning');
        }
    }
    
    async checkSession() {
        // MUDANÇA: A função de verificação periódica de sessão foi removida
        // do setInterval em setupSessionManagement, portando este método não é mais usado para logout automático.
        const session = await getLocalSession();
        if (!session) {
            this.handleLogout();
        }
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
    
    // --- LÓGICA DE TROCA DE SENHA OBRIGATÓRIA (ATUALIZADA) ---
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