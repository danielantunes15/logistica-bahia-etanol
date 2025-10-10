// js/views/gerencial.js
import { registerAppUser, fetchAppLogs, fetchAppUsers, deleteAppUser } from '../api.js';
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
             
             // NOVO: Listener para deletar usuário
             const btnDelete = e.target.closest('.delete-user-btn');
             if (btnDelete) {
                 // Usa o ID primário da tabela app_users (que é 'id' neste fluxo)
                 const userId = btnDelete.dataset.userId; 
                 // Tenta encontrar o nome completo na linha da tabela
                 const userNameElement = btnDelete.closest('tr').querySelector('td:nth-child(1)');
                 const userName = userNameElement ? userNameElement.textContent.trim() : 'Usuário Desconhecido';
                 this.showDeleteUserModal(userId, userName); // Chama o modal de confirmação
             }
        });
    }
    
    async loadTabContent() {
        const contentContainer = document.getElementById('gerencial-content');
        if (!contentContainer) return;
        
        showLoading();
        try {
            if (this.activeTab === 'usuarios') {
                await this.loadUserData(); // Carrega dados reais
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
                <td><span class="caminhao-status-badge status-${user.tipo_usuario === 'admin' ? 'ativo' : 'disponivel'}">${user.tipo_usuario.charAt(0).toUpperCase() + user.tipo_usuario.slice(1)}</span></td>
                <td>
                    <button class="action-btn delete-btn-modern delete-user-btn" data-user-id="${user.id}">
                        <i class="ph-fill ph-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
        
        const usersTableHTML = `
            <table class="data-table-modern">
                <thead>
                    <tr>
                        <th>Nome Completo</th>
                        <th>Usuário</th>
                        <th>Tipo</th>
                        <th style="width: 1%;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${userRowsHTML.length > 0 ? userRowsHTML : '<tr><td colspan="4">Nenhum usuário cadastrado.</td></tr>'}
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
            await this.loadUserData(); // Recarrega a lista
            this.renderUsersTab();
        } catch (error) {
            handleOperation(error);
            showToast(`Erro ao registrar usuário: ${error.message}`, 'error');
        } finally {
            hideLoading();
        }
    }

    // Modal de Confirmação de Exclusão
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

    // Função para exclusão real (AGORA É UMA EXCLUSÃO ÚNICA)
    async handleRealDeleteUser(userId, userName) {
        closeModal();
        showLoading();
        try {
            await deleteAppUser(userId);
            
            showToast(`Usuário ${userName} excluído com sucesso!`, 'success');
            
            await this.loadUserData(); // Recarrega a lista
            this.renderUsersTab();

        } catch (error) {
            handleOperation(error);
            showToast(`Erro ao excluir usuário: ${error.message}`, 'error');
        } finally {
            hideLoading();
        }
    }

    // --- LOGS ---
    async loadLogData(applyFilter = false) {
         // Esta função deve ser chamada após o renderLogsTab ter criado os filtros
         if (!applyFilter) {
              const mockLogs = [
                { timestamp: new Date(), tipo_log: 'LOGIN', mensagem: 'Usuário daniel.antunes logou com sucesso.', tipo_usuario: 'admin' },
                { timestamp: new Date(Date.now() - 3600000), tipo_log: 'UPDATE', mensagem: 'Status do caminhão 101 alterado para Carregando.', tipo_usuario: 'usuario' },
                { timestamp: new Date(Date.now() - 7200000), tipo_log: 'INSERT', mensagem: 'Novo caminhão CAM-90 cadastrado.', tipo_usuario: 'admin' },
            ];
            this.logs = mockLogs; // Usa mocklogs se não for para aplicar o filtro
            return;
         }
         
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