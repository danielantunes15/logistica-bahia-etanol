// js/views/gerencial.js
import { registerAppUser, fetchAppLogs } from '../api.js';
import { showToast, handleOperation, showLoading, hideLoading, formatDateTime } from '../helpers.js';
import { openModal, closeModal } from '../components/modal.js';

export class GerencialView {
    constructor() {
        this.container = null;
        this.activeTab = 'usuarios';
        this.users = []; // Placeholder para usuários
        this.logs = [];  // Placeholder para logs
    }

    async show() {
        this.render();
        await this.loadTabContent();
        this.addEventListeners();
    }

    async hide() {}
    
    render() {
        const container = document.getElementById('views-container');
        container.innerHTML = `
            <div id="gerencial-view" class="view active-view gerencial-view">
                <div class="gerencial-header">
                    <h1>Painel Gerencial e Logs</h1>
                </div>

                <div class="report-internal-menu gerencial-internal-menu">
                    <button class="btn-secondary internal-menu-btn ${this.activeTab === 'usuarios' ? 'active' : ''}" data-tab="usuarios">
                        <i class="ph-fill ph-users-three"></i> Gerenciar Usuários
                    </button>
                    <button class="btn-secondary internal-menu-btn ${this.activeTab === 'logs' ? 'active' : ''}" data-tab="logs">
                        <i class="ph-fill ph-clipboard-text"></i> Logs da Aplicação
                    </button>
                </div>

                <div id="gerencial-content" class="gerencial-content">
                    </div>
            </div>
        `;
        this.container = container.querySelector('#gerencial-view');
    }

    addEventListeners() {
        this.container.querySelectorAll('.internal-menu-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                if (tab) {
                    this.activeTab = tab;
                    this.container.querySelectorAll('.internal-menu-btn').forEach(b => b.classList.remove('active'));
                    e.currentTarget.classList.add('active');
                    this.loadTabContent();
                }
            });
        });
        
        // Listener específico para o botão de Adicionar Usuário (se a aba for Usuários)
        document.getElementById('gerencial-content').addEventListener('click', (e) => {
             const btn = e.target.closest('#btn-add-user');
             if (btn) {
                 this.showRegisterUserModal();
             }
             
             // Listener para aplicar filtros de Logs
             const btnFilter = e.target.closest('#apply-log-filters');
             if (btnFilter) {
                 this.loadLogData(true);
             }
        });
    }
    
    async loadTabContent() {
        const contentContainer = document.getElementById('gerencial-content');
        if (!contentContainer) return;
        
        showLoading();
        try {
            if (this.activeTab === 'usuarios') {
                contentContainer.innerHTML = this.renderUsersTab();
                // Assumindo que a lista de usuários pode ser buscada da tabela app_users
                // await this.loadUserData(); 
            } else if (this.activeTab === 'logs') {
                await this.loadLogData();
                contentContainer.innerHTML = this.renderLogsTab();
            }
        } catch (error) {
            handleOperation(error);
            contentContainer.innerHTML = `<div class="empty-state">Erro ao carregar conteúdo.</div>`;
        } finally {
            hideLoading();
        }
    }
    
    // --- USUÁRIOS ---
    renderUsersTab() {
        // Mockup da lista de usuários, você precisará buscar isso da tabela 'app_users'
        const usersTableHTML = `
            <table class="data-table-modern">
                <thead>
                    <tr>
                        <th>Nome Completo</th>
                        <th>Usuário App</th>
                        <th>Tipo</th>
                        <th style="width: 1%;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Daniel Antunes (Admin)</td>
                        <td>daniel.antunes</td>
                        <td><span class="caminhao-status-badge status-ativo">Admin</span></td>
                        <td><button class="action-btn delete-btn-modern"><i class="ph-fill ph-trash"></i></button></td>
                    </tr>
                    <tr>
                        <td>Operador de Teste</td>
                        <td>op.teste</td>
                        <td><span class="caminhao-status-badge status-disponivel">Usuário</span></td>
                        <td><button class="action-btn delete-btn-modern"><i class="ph-fill ph-trash"></i></button></td>
                    </tr>
                </tbody>
            </table>
        `;
        
        return `
            <div class="users-tab">
                <button class="btn-primary" id="btn-add-user" style="margin-bottom: 20px;">
                    <i class="ph-fill ph-user-plus"></i> Adicionar Novo Usuário
                </button>
                <div class="table-wrapper">
                    ${usersTableHTML}
                </div>
                <p style="margin-top: 15px; font-size: 0.9rem; color: var(--text-secondary);">Atenção: Ações como editar ou resetar senha devem ser gerenciadas via console do Supabase (Auth > Users) ou implementadas separadamente.</p>
            </div>
        `;
    }

    showRegisterUserModal() {
        const modalContent = `
            <form id="register-user-form" class="action-modal-form">
                <div class="form-group">
                    <label for="nome_completo">Nome Completo</label>
                    <input type="text" id="nome_completo" name="nome_completo" class="form-input" required>
                </div>
                <div class="form-group">
                    <label for="username_app">Usuário (Sem espaços ou caracteres especiais)</label>
                    <input type="text" id="username_app" name="username_app" class="form-input" required placeholder="ex: joao.silva">
                </div>
                <div class="form-group">
                    <label for="password">Senha (Mínimo 6 caracteres)</label>
                    <input type="password" id="password" name="password" class="form-input" required minlength="6">
                </div>
                <div class="form-group">
                    <label for="tipo_usuario">Tipo de Usuário</label>
                    <select id="tipo_usuario" name="tipo_usuario" class="form-select" required>
                        <option value="usuario">Usuário Padrão</option>
                        <option value="admin">Administrador (Acesso Gerencial)</option>
                    </select>
                </div>
                <button type="submit" class="btn-primary">Criar Usuário</button>
            </form>
        `;
        openModal('Cadastrar Novo Usuário', modalContent);
        
        document.getElementById('register-user-form').addEventListener('submit', this.handleUserRegistration.bind(this));
    }
    
    async handleUserRegistration(e) {
        e.preventDefault();
        const form = e.target;
        const nome_completo = form.nome_completo.value;
        const username_app = form.username_app.value;
        const password = form.password.value;
        const tipo_usuario = form.tipo_usuario.value;
        
        showLoading();
        try {
            await registerAppUser(username_app, password, nome_completo, tipo_usuario);
            showToast(`Usuário ${username_app} criado com sucesso!`, 'success');
            closeModal();
            // Recarrega a lista de usuários (após implementação)
            // await this.loadUserData(); 
        } catch (error) {
            handleOperation(error);
            showToast(`Erro ao registrar usuário: ${error.message}`, 'error');
        } finally {
            hideLoading();
        }
    }

    // --- LOGS ---
    async loadLogData(applyFilter = false) {
         // Esta função deve ser chamada após o renderLogsTab ter criado os filtros
         if (!applyFilter) return; // Se não for para aplicar o filtro, apenas retorna o mock
         
         const filters = {
             tipo_usuario: document.getElementById('log-filter-role')?.value,
             dataInicio: document.getElementById('log-filter-start')?.value,
             dataFim: document.getElementById('log-filter-end')?.value,
         };
         
         showLoading();
         try {
             // Mockando a busca de logs para demonstrar o filtro
             // Em produção, a tabela 'app_logs' deve ser populada por triggers no DB
             this.logs = await fetchAppLogs(filters); 
             this.renderLogsTab(); // Re-renderiza a tabela com os novos dados
         } catch (error) {
              handleOperation(error);
              this.logs = [];
         } finally {
             hideLoading();
         }
    }

    renderLogsTab() {
        // Mock de Logs se a tabela real não for populada
        const mockLogs = [
            { timestamp: new Date(), tipo_log: 'LOGIN', mensagem: 'Usuário daniel.antunes logou com sucesso.', tipo_usuario: 'admin' },
            { timestamp: new Date(Date.now() - 3600000), tipo_log: 'UPDATE', mensagem: 'Status do caminhão 101 alterado para Carregando.', tipo_usuario: 'usuario' },
            { timestamp: new Date(Date.now() - 7200000), tipo_log: 'INSERT', mensagem: 'Novo caminhão CAM-90 cadastrado.', tipo_usuario: 'admin' },
        ];
        
        const logsToDisplay = this.logs.length > 0 ? this.logs : mockLogs;
        
        const logRows = logsToDisplay.map(log => `
            <tr>
                <td>${formatDateTime(log.timestamp)}</td>
                <td>${log.tipo_log}</td>
                <td>${log.mensagem}</td>
                <td>${log.tipo_usuario || 'N/A'}</td>
            </tr>
        `).join('');

        return `
            <div class="logs-tab">
                <div class="report-filters log-filters" style="margin-bottom: 20px;">
                    <select id="log-filter-role" class="form-select">
                        <option value="">Tipo Usuário (Todos)</option>
                        <option value="admin">Administrador</option>
                        <option value="usuario">Usuário Padrão</option>
                    </select>
                    <label for="log-filter-start">De:</label>
                    <input type="date" id="log-filter-start" class="form-input" style="width: 150px;">
                    <label for="log-filter-end">Até:</label>
                    <input type="date" id="log-filter-end" class="form-input" style="width: 150px;">
                    <button class="btn-primary" id="apply-log-filters">
                        <i class="ph-fill ph-funnel"></i> Filtrar Logs
                    </button>
                </div>
                
                <div class="table-wrapper">
                    <table class="data-table-modern">
                        <thead>
                            <tr>
                                <th>Horário</th>
                                <th>Tipo</th>
                                <th>Mensagem</th>
                                <th>Usuário</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${logRows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
}