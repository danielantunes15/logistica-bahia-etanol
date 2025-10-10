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
                        <i class="ph-fill ph-tractor"></i>
                        <h2>LOGISTICA BEL</h2>
                        <p>Acesse o Painel de Controle</p>
                    </div>
                    
                    <form id="login-form">
                        <div class="form-group">
                            <label for="username">Usuário (ex: daniel.antunes)</label>
                            <input type="text" id="username" name="username" class="form-input" required>
                        </div>
                        <div class="form-group">
                            <label for="password">Senha</label>
                            <input type="password" id="password" name="password" class="form-input" required>
                        </div>
                        <button type="submit" class="btn-primary" id="btn-login">
                            <i class="ph-fill ph-sign-in"></i> Entrar
                        </button>
                    </form>
                    <p class="login-info">Sistema de Gerenciamento de Operações Agrícolas</p>
                </div>
            </div>
        `;
    }

    addEventListeners() {
        const form = document.getElementById('login-form');
        if (form) {
            form.addEventListener('submit', this.handleLogin.bind(this));
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        const username = e.target.username.value;
        const password = e.target.password.value;
        
        showLoading();
        try {
            await loginAppUser(username, password); 
            showToast('Login realizado com sucesso!', 'success');
            
            // Sucesso: Chama o método de inicialização da aplicação
            this.appManager.initializeAfterLogin(); 
        } catch (error) {
            handleOperation(error);
            showToast('Erro de login: Usuário ou senha inválidos.', 'error');
        } finally {
            hideLoading();
        }
    }
}