// js/main.js

import { loadSidebar } from './components/sidebar.js';
import { loadModal, openModal, closeModal } from './components/modal.js'; 
import { initializeViews } from './views/viewManager.js';
// CORRIGIDO: Certifica-se que a importação é relativa
import { fetchUserRole, logoutAppUser, getLocalSession, updateUserPassword, finalizeFirstLogin } from './api.js'; 
import { showToast, showLoading, hideLoading, handleOperation } from './helpers.js';

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
        await loadSidebar(this.userRole, session.fullName); 
        
        // 3. A verificação de 'isFirstLogin' foi REMOVIDA para desativar a troca obrigatória.
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
    
    // --- LÓGICA DE TROCA DE SENHA OBRIGATÓRIA (MANTIDA, MAS NÃO SERÁ CHAMADA NO FLUXO NORMAL) ---
    showFirstLoginChangePasswordModal(session) {
         // Desabilita a sidebar e o main-content para forçar a interação com o modal
         document.getElementById('sidebar').style.pointerEvents = 'none';
         document.querySelector('.main-content').style.pointerEvents = 'none'; // Usa querySelector para a classe

         const modalContent = `
            <form id="change-password-form" class="action-modal-form">
                <h3 style="margin-bottom: 5px;">Bem-vindo(a), ${session.fullName}!</h3>
                <p class="form-help" style="color: var(--accent-danger); font-size: 1rem; margin-bottom: 20px;">
                    <strong>SEGURANÇA OBRIGATÓRIA:</strong> Sua senha inicial é provisória. 
                    Por favor, defina uma nova senha para continuar.
                </p>
                <div class="form-group">
                    <label for="new_password">Nova Senha (Mínimo 4 caracteres)</label>
                    <input type="password" id="new_password" name="new_password" class="form-input" required minlength="4">
                </div>
                <div class="form-group">
                    <label for="confirm_password">Confirmar Nova Senha</label>
                    <input type="password" id="confirm_password" name="confirm_password" class="form-input" required>
                </div>
                <button type="submit" class="btn-primary">Criar Nova Senha e Continuar</button>
            </form>
            <p class="form-help" style="color: var(--accent-danger); margin-top: 10px;">AVISO: A senha será salva de forma segura pelo Supabase Auth.</p>
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
        // REMOVIDO: const currentPassword = form.current_password.value;
        const newPassword = form.new_password.value;
        const confirmPassword = form.confirm_password.value;

        if (newPassword !== confirmPassword) {
            showToast('A nova senha e a confirmação não coincidem.', 'error');
            return;
        }

        if (newPassword.length < 4) {
             showToast('A nova senha deve ter no mínimo 4 caracteres.', 'error');
             return;
        }
        
        showLoading();
        try {
            // 1. Tenta atualizar a senha e desativa a flag 'primeiro_login' no DB
            // ALTERADO: A API agora só precisa do userId e newPassword
            await updateUserPassword(userId, newPassword);
            
            // REMOVIDO: finalizeFirstLogin é obsoleto
            
            showToast('Senha atualizada com sucesso! Acesso liberado.', 'success');
            
            // 3. Reabilita a interface e fecha o modal
            closeModal();
            document.getElementById('sidebar').style.pointerEvents = 'auto';
            document.querySelector('.main-content').style.pointerEvents = 'auto';

            // 4. Redireciona para o dashboard
            window.viewManager.showView('dashboard');
            
        } catch (error) {
            handleOperation(error);
            showToast(error.message, 'error'); // Exibe a mensagem de erro da API (ex: Senha atual incorreta)
        } finally {
            hideLoading();
        }
    }


    async showChangePasswordModal() {
        const session = await getLocalSession();
        if (!session) return; // Não faz nada se não estiver logado

        const modalContent = `
            <form id="change-password-form" class="action-modal-form">
                <p>Alterando senha para: <strong>${session.fullName}</strong></p>
                <p class="form-help" style="color: var(--accent-danger); font-size: 1rem; margin-bottom: 20px;">
                    Ao alterar sua senha, sua sessão será encerrada.
                </p>
                <div class="form-group">
                    <label for="new_password">Nova Senha (Mínimo 4 caracteres)</label>
                    <input type="password" id="new_password" name="new_password" class="form-input" required minlength="4">
                </div>
                <div class="form-group">
                    <label for="confirm_password">Confirmar Nova Senha</label>
                    <input type="password" id="confirm_password" name="confirm_password" class="form-input" required>
                </div>
                <button type="submit" class="btn-primary">Trocar Senha</button>
            </form>
            <p class="form-help" style="color: var(--accent-danger); margin-top: 10px;">AVISO: A senha será salva de forma segura pelo Supabase Auth.</p>
        `;

        openModal('Trocar Senha do Usuário', modalContent);

        document.getElementById('change-password-form').addEventListener('submit', this.handleChangePasswordSubmit.bind(this, session.id));
    }

    async handleChangePasswordSubmit(userId, e) {
        e.preventDefault();
        const form = e.target;
        // REMOVIDO: const currentPassword = form.current_password.value;
        const newPassword = form.new_password.value;
        const confirmPassword = form.confirm_password.value;

        if (newPassword !== confirmPassword) {
            showToast('A nova senha e a confirmação não coincidem.', 'error');
            return;
        }

        if (newPassword.length < 4) {
             showToast('A nova senha deve ter no mínimo 4 caracteres.', 'error');
             return;
        }
        
        showLoading();
        try {
            // ALTERADO: A API agora só precisa do userId e newPassword
            await updateUserPassword(userId, newPassword);
            
            showToast('Senha alterada com sucesso! Você será desconectado para logar novamente.', 'success');
            closeModal();
            
            // Força logout para garantir que o usuário se autentique com a nova senha
            this.handleLogout(); 
            
        } catch (error) {
            handleOperation(error);
            showToast(error.message, 'error'); // Exibe a mensagem de erro da API (ex: Senha atual incorreta)
        } finally {
            hideLoading();
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});