// js/views/gerencial.js
import { registerAppUser, fetchAppLogs, fetchAppUsers, deleteAppUser, updateAppUser } from '../api.js';
import { showToast, handleOperation, showLoading, hideLoading, formatDateTime } from '../helpers.js';
import { openModal, closeModal } from '../components/modal.js';

export class GerencialView {
    constructor() {
        this.container = null;
        this.activeTab = 'usuarios';
        this.users = []; 
        this.logs = [];  
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
                    <h1>Painel Gerencial de Usuários e Logs</h1>
                </div>

                <div class="report-internal-menu gerencial-internal-menu">
                    <button class="btn-secondary internal-menu-btn ${this.activeTab === 'usuarios' ? 'active' : ''}" data-tab="usuarios">
                        <i class="ph-fill ph-users-three"></i> Gerenciar Usuários
                    </button>
                    <button class="btn-secondary internal-menu-btn ${this.activeTab === 'logs' ? 'active' : ''}" data-tab="logs">
                        <i class="ph-fill ph-clipboard-text"></i> Logs da Aplicação
                    </button>
                </div>

                <div id="gerencial-content" class="gerencial-content" style="padding: 24px; background-color: var(--bg-light); border-radius: 12px; margin-top: 24px; border: 1px solid var(--border-color);">
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
        
        // Listener específico para ações na tabela de usuários
        document.getElementById('gerencial-content').addEventListener('click', (e) => {
             const btn = e.target.closest('#btn-add-user');
             if (btn) {
                 this.showRegisterUserModal();
                 return;
             }
             
             const btnFilter = e.target.closest('#apply-log-filters');
             if (btnFilter) {
                 this.loadLogData(true);
                 return;
             }

             // NOVO: Listener para editar usuário
             const btnEdit = e.target.closest('.edit-user-btn');
             if (btnEdit) {
                 const userId = parseInt(btnEdit.dataset.userId);
                 const user = this.users.find(u => u.id === userId);
                 if (user) {
                     this.showEditUserModal(user);
                 }
                 return;
             }
             
             // Listener para deletar usuário
             const btnDelete = e.target.closest('.delete-user-btn');
             if (btnDelete) {
                 const userId = btnDelete.dataset.userId; 
                 const userNameElement = btnDelete.closest('tr').querySelector('td:nth-child(1)');
                 const userName = userNameElement ? userNameElement.textContent.trim() : 'Usuário Desconhecido';
                 this.showDeleteUserModal(userId, userName); 
             }
        });
    }
    
    async loadTabContent() {
        const contentContainer = document.getElementById('gerencial-content');
        if (!contentContainer) return;
        
        showLoading();
        try {
            if (this.activeTab === 'usuarios') {
                await this.loadUserData(); 
                contentContainer.innerHTML = this.renderUsersTab();
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
    async loadUserData() {
        try {
            this.users = await fetchAppUsers();
        } catch (error) {
            handleOperation(error);
            this.users = [];
        }
    }
    
    renderUsersTab() {
        const userRowsHTML = this.users.map(user => `
            <tr>
                <td>${user.nome_completo}</td>
                <td>${user.username_app}</td>
                <td><span class="caminhao-status-badge status-${user.tipo_usuario === 'admin' ? 'ativa' : 'disponivel'}">${user.tipo_usuario.charAt(0).toUpperCase() + user.tipo_usuario.slice(1)}</span></td>
                <td>
                    <div class="action-buttons-modern" style="justify-content: center;">
                        <button class="action-btn edit-btn-modern edit-user-btn" data-user-id="${user.id}" title="Editar Nome, Usuário e Tipo">
                            <i class="ph-fill ph-pencil-simple"></i>
                        </button>
                        <button class="action-btn delete-btn-modern delete-user-btn" data-user-id="${user.id}" title="Excluir Usuário">
                            <i class="ph-fill ph-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
        
        const usersTableHTML = `
            <div class="list-container-modern" style="padding: 0; border: none; background: transparent;">
                <h2 style="padding-bottom: 12px; border-bottom: 1px solid var(--border-color); font-size: 1.3rem;">Lista de Usuários</h2>
                <div class="table-wrapper" style="overflow-x: auto;">
                    <table class="data-table-modern" style="min-width: 600px;">
                        <thead>
                            <tr>
                                <th>Nome Completo</th>
                                <th>Usuário</th>
                                <th>Tipo</th>
                                <th style="width: 120px; text-align: center;">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${userRowsHTML.length > 0 ? userRowsHTML : '<tr><td colspan="4">Nenhum usuário cadastrado.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        return `
            <div class="users-tab">
                <button class="btn-primary" id="btn-add-user" style="margin-bottom: 24px;">
                    <i class="ph-fill ph-user-plus"></i> Adicionar Novo Usuário
                </button>
                ${usersTableHTML}
            </div>
        `;
    }

    // --- NOVO: Modal de Edição de Usuário ---
    showEditUserModal(user) {
        const modalContent = `
            <form id="edit-user-form" class="action-modal-form">
                <input type="hidden" name="userId" value="${user.id}">
                <div class="form-group">
                    <label for="nome_completo_edit">Nome Completo</label>
                    <input type="text" id="nome_completo_edit" name="nome_completo" class="form-input" value="${user.nome_completo}" required>
                </div>
                <div class="form-group">
                    <label for="username_app_edit">Usuário (Sem espaços ou caracteres especiais)</label>
                    <input type="text" id="username_app_edit" name="username_app" class="form-input" value="${user.username_app}" required placeholder="ex: joao.silva">
                </div>
                <div class="form-group">
                    <label for="tipo_usuario_edit">Tipo de Usuário</label>
                    <select id="tipo_usuario_edit" name="tipo_usuario" class="form-select" required>
                        <option value="usuario" ${user.tipo_usuario === 'usuario' ? 'selected' : ''}>Usuário Padrão</option>
                        <option value="admin" ${user.tipo_usuario === 'admin' ? 'selected' : ''}>Administrador (Acesso Gerencial)</option>
                    </select>
                    <p class="form-help">Para alterar a senha, use o menu 'Meu Perfil' na lateral.</p>
                </div>
                <button type="submit" class="btn-primary">Salvar Alterações</button>
            </form>
        `;
        openModal(`Editar Perfil: ${user.nome_completo}`, modalContent);

        document.getElementById('edit-user-form').addEventListener('submit', this.handleUserEdit.bind(this));
    }

    // --- NOVO: Handler de Edição de Usuário ---
    async handleUserEdit(e) {
        e.preventDefault();
        const form = e.target;
        const userId = parseInt(form.userId.value);
        const nome_completo = form.nome_completo.value;
        const username_app = form.username_app.value;
        const tipo_usuario = form.tipo_usuario.value;
        
        const updateData = { nome_completo, username_app, tipo_usuario };

        showLoading();
        try {
            await updateAppUser(userId, updateData);
            showToast(`Usuário ${nome_completo} atualizado com sucesso!`, 'success');
            closeModal();
            await this.loadUserData(); 
            this.renderUsersTab();
        } catch (error) {
            handleOperation(error);
            showToast(`Erro ao editar usuário: ${error.message}`, 'error');
        } finally {
            hideLoading();
        }
    }
    // --- FIM NOVO ---


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
                    <p class="form-help">Este será seu nome de usuário para login.</p>
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
            await this.loadUserData(); 
            this.renderUsersTab();
        } catch (error) {
            handleOperation(error);
            showToast(`Erro ao registrar usuário: ${error.message}`, 'error');
        } finally {
            hideLoading();
        }
    }

    showDeleteUserModal(userId, userName) {
        const modalContent = `
            <p>Deseja realmente excluir o usuário <strong>${userName}</strong>?</p>
            <p style="color: var(--accent-danger); font-size: 0.9rem;">
                ATENÇÃO: A exclusão é irreversível e remove a conta de login e o perfil da tabela de usuários.
            </p>
            <div class="modal-actions">
                <button id="cancel-delete-btn" class="btn-secondary">Cancelar</button>
                <button id="confirm-delete-btn" class="btn-primary" style="background-color: var(--accent-danger);">Excluir Usuário</button>
            </div>
        `;
        openModal('Confirmar Exclusão de Usuário', modalContent);

        document.getElementById('confirm-delete-btn').onclick = () => this.handleRealDeleteUser(userId, userName);
        document.getElementById('cancel-delete-btn').onclick = closeModal;
    }

    async handleRealDeleteUser(userId, userName) {
        closeModal();
        showLoading();
        try {
            await deleteAppUser(userId);
            
            showToast(`Usuário ${userName} excluído com sucesso!`, 'success');
            
            await this.loadUserData(); 
            this.renderUsersTab();

        } catch (error) {
            handleOperation(error);
            showToast(`Erro ao excluir usuário: ${error.message}`, 'error');
        } finally {
            hideLoading();
        }
    }

    async loadLogData(applyFilter = false) {
         if (!applyFilter) {
              const mockLogs = [
                { timestamp: new Date(), tipo_log: 'LOGIN', mensagem: 'Usuário daniel.antunes logou com sucesso.', tipo_usuario: 'admin' },
                { timestamp: new Date(Date.now() - 3600000), tipo_log: 'UPDATE', mensagem: 'Status do caminhão 101 alterado para Carregando.', tipo_usuario: 'usuario' },
                { timestamp: new Date(Date.now() - 7200000), tipo_log: 'INSERT', mensagem: 'Novo caminhão CAM-90 cadastrado.', tipo_usuario: 'admin' },
            ];
            this.logs = mockLogs; 
            return;
         }
         
         const filters = {
             tipo_usuario: document.getElementById('log-filter-role')?.value,
             dataInicio: document.getElementById('log-filter-start')?.value,
             dataFim: document.getElementById('log-filter-end')?.value,
         };
         
         showLoading();
         try {
             this.logs = await fetchAppLogs(filters); 
             this.renderLogsTab(); 
         } catch (error) {
              handleOperation(error);
              this.logs = [];
         } finally {
             hideLoading();
         }
    }

    renderLogsTab() {
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
                <div class="report-filters log-filters" style="margin-bottom: 20px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; background-color: var(--bg-dark); border: 1px solid var(--border-color); padding: 12px; border-radius: 8px;">
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
                
                <div class="table-wrapper" style="overflow-x: auto;">
                    <table class="data-table-modern" style="min-width: 800px;">
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