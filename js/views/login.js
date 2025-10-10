// js/views/login.js
import { loginAppUser, fetchUserRole } from '../api.js';
import { showToast, handleOperation, showLoading, hideLoading } from '../helpers.js';

export class LoginView {
    constructor(appManager) {
        this.appManager = appManager;
    }

    async show() {
        this.loadHTML();
        this.addEventListeners();
    }
    
    async hide() {} // Não faz nada ao esconder

    async loadHTML() {
        const container = document.getElementById('login-container');
        // Carregar o conteúdo do partials/login.html
        container.innerHTML = `
            <div class="login-wrapper">
                <div class="login-card">
                    <div class="login-header">
                        <img src="assets/logo-bel.png" alt="Logo LOGÍSTICA  BEL" id="login-logo">
                        <h2>LOGÍSTICA  BEL</h2>
                        <p>Acesse o Painel de Controle</p>
                    </div>
                    
                    <form id="login-form">
                        <div class="form-group">
                            <label for="username">Usuário</label>
                            <input type="text" id="username" name="username" class="form-input" required autocomplete="username">
                        </div>
                        <div class="form-group">
                            <label for="password">Senha</label>
                            <input type="password" id="password" name="password" class="form-input" required autocomplete="current-password">
                        </div>
                        <button type="submit" class="btn-primary" id="btn-login">
                            <i class="ph-fill ph-sign-in"></i> Entrar
                        </button>
                    </form>
                    <p class="login-info">Sistema de Gerenciamento de Operações Agrícolas</p>
                    
                    <div class="login-security-info">
                        <i class="ph-fill ph-shield-check"></i>
                        <small>Sistema seguro • Suas credenciais são criptografadas</small>
                    </div>
                </div>
            </div>
        `;
    }

    addEventListeners() {
        const form = document.getElementById('login-form');
        if (form) {
            form.addEventListener('submit', this.handleLogin.bind(this));
        }
        
        // Enter key support
        document.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && document.activeElement.closest('#login-form')) {
                form.dispatchEvent(new Event('submit'));
            }
        });
    }

    async handleLogin(e) {
        e.preventDefault();
        const username = e.target.username.value.trim();
        const password = e.target.password.value;
        
        // Validações client-side
        if (!username || !password) {
            showToast('Preencha todos os campos.', 'error');
            return;
        }
        
        if (username.length < 3) {
            showToast('Usuário deve ter pelo menos 3 caracteres.', 'error');
            return;
        }
        
        if (password.length < 1) {
            showToast('Senha é obrigatória.', 'error');
            return;
        }
        
        const loginBtn = document.getElementById('btn-login');
        const originalText = loginBtn.innerHTML;
        loginBtn.innerHTML = '<i class="ph-fill ph-circle-notch ph-spin"></i> Entrando...';
        loginBtn.disabled = true;
        
        showLoading();
        try {
            const userData = await loginAppUser(username, password);
            
            if (userData.isFirstLogin) {
                showToast('Login realizado! Como é seu primeiro acesso, você deve alterar sua senha.', 'warning');
            } else {
                showToast(`Bem-vindo, ${userData.fullName}!`, 'success');
            }
            
            // CORREÇÃO: Chama o initializeAfterLogin em todos os casos de sucesso.
            // O AppManager em js/main.js lida com a lógica de showFirstLoginChangePasswordModal.
            this.appManager.initializeAfterLogin(); 
            
        } catch (error) {
            console.error('Erro no login:', error);
            showToast(error.message, 'error');
            
            // Foca no campo apropriado
            if (error.message.includes('Usuário')) {
                document.getElementById('username').focus();
            } else {
                document.getElementById('password').focus();
            }
            
        } finally {
            hideLoading();
            loginBtn.innerHTML = originalText;
            loginBtn.disabled = false;
        }
    }
}