// js/views/gerencial.js
import { 
    registerAppUser, 
    fetchAppUsers, 
    deleteAppUser, 
    updateAppUser, 
    fetchEscalaFuncionarios, 
    fetchEscalaTurnos, 
    saveEscalaTurnos, 
    insertItem, 
    deleteItem, 
    updateItem,
    saveFrenteMeta // <-- NOVA IMPORTAÇÃO
} from '../api.js';
import { showToast, handleOperation, showLoading, hideLoading } from '../helpers.js';
import { formatDateTime, getCurrentShift } from '../timeUtils.js';
import { openModal, closeModal } from '../components/modal.js';
import { dataCache } from '../dataCache.js'; // <-- NOVA IMPORTAÇÃO

export class GerencialView {
    constructor() {
        this.container = null;
        this.activeTab = 'escala'; // Padrão agora é a escala
        this.users = [];
        // Estado para a aba de Escala
        this.funcionarios = [];
        this.escalaData = {}; 
        this.scheduleChanged = false;
        this.funcoes = [
            'Líder de Produção Agrícola',
            'Balanceiro',
            'Motorista de Pipa',
            'Auxiliar de Serviços Gerais'
        ];
        // Estado para a aba de Metas
        this.frentes = []; // <-- NOVO
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
                    <h1>Painel Gerencial</h1>
                </div>

                <div class="report-internal-menu gerencial-internal-menu">
                    <button class="btn-secondary internal-menu-btn ${this.activeTab === 'escala' ? 'active' : ''}" data-tab="escala">
                        <i class="ph-fill ph-calendar-check"></i> Escala de Turnos
                    </button>
                    <button class="btn-secondary internal-menu-btn ${this.activeTab === 'usuarios' ? 'active' : ''}" data-tab="usuarios">
                        <i class="ph-fill ph-users-three"></i> Gerenciar Usuários
                    </button>
                    <button class="btn-secondary internal-menu-btn ${this.activeTab === 'metas' ? 'active' : ''}" data-tab="metas">
                        <i class="ph-fill ph-chart-line"></i> Gerenciar Metas
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
        
        // Listener delegado para todo o conteúdo gerencial
        document.getElementById('gerencial-content').addEventListener('click', (e) => {
            const target = e.target;

            // Ações da aba Usuários
            if (target.closest('#btn-add-user')) this.showRegisterUserModal();
            if (target.closest('.edit-user-btn')) {
                const userId = parseInt(target.closest('.edit-user-btn').dataset.userId);
                const user = this.users.find(u => u.id === userId);
                if (user) this.showEditUserModal(user);
            }
            if (target.closest('.toggle-active-btn')) {
                const userId = parseInt(target.closest('.toggle-active-btn').dataset.userId);
                const user = this.users.find(u => u.id === userId);
                if (user) this.showToggleActiveModal(user);
            }
            if (target.closest('.delete-user-btn')) {
                const userId = target.closest('.delete-user-btn').dataset.userId;
                const userName = target.closest('tr')?.querySelector('td:nth-child(1)')?.textContent.trim() || 'Usuário';
                this.showDeleteUserModal(userId, userName);
            }

            // Ações da aba Escala
            if (target.closest('#btn-manage-funcionarios')) this.showManageFuncionariosModal();
            if (target.closest('#btn-save-escala')) this.handleSaveEscala();

            // --- AÇÕES DA ABA METAS (NOVO) ---
            if (e.target.closest('.btn-save-meta')) {
                const button = e.target.closest('.btn-save-meta');
                const frenteId = button.dataset.frenteId;
                const input = document.getElementById(`meta-input-${frenteId}`);
                if (frenteId && input) {
                    this.handleSaveMeta(frenteId, input.value, button);
                }
            }
        });
    }
    
    async loadTabContent() {
        const contentContainer = document.getElementById('gerencial-content');
        if (!contentContainer) return;
        
        showLoading();
        try {
            if (this.activeTab === 'escala') {
                await this.loadEscalaData();
                contentContainer.innerHTML = this.renderEscalaTab();
                // Adiciona listener de change após renderizar o calendário
                const calendarContainer = this.container.querySelector('.escala-calendario-container');
                if (calendarContainer) {
                    calendarContainer.addEventListener('change', (e) => {
                        if (e.target.classList.contains('turno-select')) {
                            this.scheduleChanged = true;
                            const saveButton = document.getElementById('btn-save-escala');
                            if (saveButton) {
                                saveButton.style.display = 'inline-flex';
                                saveButton.classList.remove('btn-secondary');
                                saveButton.classList.add('btn-primary');
                            }
                        }
                    });
                }
            } else if (this.activeTab === 'usuarios') {
                await this.loadUserData(); 
                contentContainer.innerHTML = this.renderUsersTab();
            } else if (this.activeTab === 'metas') { // --- NOVA CONDIÇÃO ---
                await this.loadMetasData();
                contentContainer.innerHTML = this.renderMetasTab();
            }
        } catch (error) {
            handleOperation(error);
            contentContainer.innerHTML = `<div class="empty-state">Erro ao carregar conteúdo.</div>`;
        } finally {
            hideLoading();
        }
    }

    // --- MÉTODOS DA ABA DE ESCALA ---

    generate6x2Schedule(funcionarioId, startDateStr, initialTurno) {
        const schedule = [];
        const turnSequence = ['C', 'B', 'A'];
        let currentTurn = initialTurno;
        let workDayCounter = 0;
        let offDayCounter = 0;

        for (let i = 0; i < 30; i++) { // Gera 30 dias de escala
            const currentDate = new Date(startDateStr);
            currentDate.setUTCDate(currentDate.getUTCDate() + i);
            const currentDateStr = currentDate.toISOString().split('T')[0];

            if (workDayCounter < 6) {
                schedule.push({
                    funcionario_id: funcionarioId,
                    data: currentDateStr,
                    turno: currentTurn
                });
                workDayCounter++;
            } else {
                offDayCounter++;
                if (offDayCounter === 2) {
                    workDayCounter = 0;
                    offDayCounter = 0;
                    const currentTurnIndex = turnSequence.indexOf(currentTurn);
                    currentTurn = turnSequence[(currentTurnIndex + 1) % turnSequence.length];
                }
            }
        }
        return schedule;
    }
    
    /**
     * Gera escala 6x2 SEM rodízio de turno (turno fixo).
     */
    generate6x2FixedTurnSchedule(funcionarioId, startDateStr, fixedTurno) {
        const schedule = [];
        let workDayCounter = 0;
        let offDayCounter = 0;

        for (let i = 0; i < 30; i++) { // Gera 30 dias de escala
            const currentDate = new Date(startDateStr);
            currentDate.setUTCDate(currentDate.getUTCDate() + i);
            const currentDateStr = currentDate.toISOString().split('T')[0];

            if (workDayCounter < 6) {
                schedule.push({
                    funcionario_id: funcionarioId,
                    data: currentDateStr,
                    turno: fixedTurno // Turno é sempre o inicial/fixo
                });
                workDayCounter++;
            } else {
                offDayCounter++;
                if (offDayCounter === 2) {
                    workDayCounter = 0;
                    offDayCounter = 0;
                    // Nenhuma lógica para mudar o turno aqui
                }
            }
        }
        return schedule;
    }

    /**
     * NOVO: Gera escala 5x1 SEM rodízio de turno (turno fixo).
     */
    generate5x1FixedTurnSchedule(funcionarioId, startDateStr, fixedTurno) {
        const schedule = [];
        let workDayCounter = 0;
        let offDayCounter = 0;

        for (let i = 0; i < 30; i++) { // Gera 30 dias de escala
            const currentDate = new Date(startDateStr);
            currentDate.setUTCDate(currentDate.getUTCDate() + i);
            const currentDateStr = currentDate.toISOString().split('T')[0];

            if (workDayCounter < 5) { // Trabalha 5 dias
                schedule.push({
                    funcionario_id: funcionarioId,
                    data: currentDateStr,
                    turno: fixedTurno // Turno é sempre o inicial/fixo
                });
                workDayCounter++;
            } else {
                offDayCounter++;
                if (offDayCounter === 1) { // Folga 1 dia
                    workDayCounter = 0;
                    offDayCounter = 0;
                    // Nenhuma lógica para mudar o turno aqui
                }
            }
        }
        return schedule;
    }

    async loadEscalaData() {
        try {
            this.funcionarios = await fetchEscalaFuncionarios() || [];
            const today = new Date();
            const endDate = new Date();
            endDate.setDate(today.getDate() + 7);
            const turnosData = await fetchEscalaTurnos(
                today.toISOString().split('T')[0],
                endDate.toISOString().split('T')[0]
            ) || [];
            this.escalaData = {};
            turnosData.forEach(turno => {
                if (!this.escalaData[turno.funcionario_id]) {
                    this.escalaData[turno.funcionario_id] = {};
                }
                this.escalaData[turno.funcionario_id][turno.data] = turno.turno;
            });
        } catch (error) {
            handleOperation(error);
            this.funcionarios = [];
            this.escalaData = {};
        }
    }

    renderEscalaTab() {
        const currentShift = getCurrentShift();
        const funcionariosNoTurno = this.funcionarios.filter(f => {
            const todayStr = new Date().toISOString().split('T')[0];
            const turnoDoFuncionario = this.escalaData[f.id]?.[todayStr];
            return turnoDoFuncionario === currentShift.turno;
        });

        return `
            <div class="escala-view">
                <div class="escala-actions">
                    <button class="btn-primary" id="btn-manage-funcionarios">
                        <i class="ph-fill ph-users"></i> Gerenciar Funcionários
                    </button>
                    <button class="btn-secondary" id="btn-save-escala" style="display: none;">
                        <i class="ph-fill ph-floppy-disk"></i> Salvar Alterações na Escala
                    </button>
                </div>
                <div class="turno-atual-dashboard">
                    ${this.renderEscalaDashboard(currentShift, funcionariosNoTurno)}
                </div>
                <div class="escala-calendario-container">
                    ${this.renderEscalaCalendar()}
                </div>
            </div>
        `;
    }

    renderEscalaDashboard(currentShift, funcionarios) {
        return `
            <div class="turno-header">
                <div class="turno-info">
                    <h3>Dashboard do Turno Atual</h3>
                    <p>Funcionários trabalhando agora (${currentShift.inicio} - ${currentShift.fim})</p>
                </div>
                <span class="turno-badge turno-${currentShift.turno.toLowerCase()}">${currentShift.nome}</span>
            </div>
            <div class="turno-funcionarios-grid">
                ${this.funcoes.map(funcao => {
                    const funcionariosDaFuncao = funcionarios.filter(f => f.funcao === funcao);
                    return `
                        <div class="funcao-card">
                            <h4><i class="ph-fill ph-user-gear"></i> ${funcao}</h4>
                            <div class="funcionarios-list">
                                ${funcionariosDaFuncao.length > 0 ? 
                                    funcionariosDaFuncao.map(f => `<div class="funcionario-item"><i class="ph-fill ph-user"></i> ${f.nome}</div>`).join('') :
                                    '<p class="empty-state-funcao">Nenhum funcionário neste turno.</p>'
                                }
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    renderEscalaCalendar() {
        const today = new Date();
        const dates = Array.from({ length: 8 }, (_, i) => {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            return date;
        });

        const headerHTML = dates.map(date => {
            const day = date.toLocaleDateString('pt-BR', { weekday: 'short' });
            const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            return `<th>${day.toUpperCase()}<span class="header-date">${dateStr}</span></th>`;
        }).join('');

        let allCalendarsHTML = '';

        this.funcoes.forEach(funcao => {
            const funcionariosDaFuncao = this.funcionarios.filter(f => f.funcao === funcao);
            if (funcionariosDaFuncao.length > 0) {
                const bodyHTML = funcionariosDaFuncao.map(func => {
                    const cellsHTML = dates.map(date => {
                        const dateStr = date.toISOString().split('T')[0];
                        const turno = this.escalaData[func.id]?.[dateStr] || 'Folga';
                        const selectId = `turno-${func.id}-${dateStr}`;
                        return `
                            <td>
                                <select class="turno-select turno-${turno}" id="${selectId}" data-funcionario-id="${func.id}" data-date="${dateStr}">
                                    <option value="Folga" ${turno === 'Folga' ? 'selected' : ''}>Folga</option>
                                    <option value="A" ${turno === 'A' ? 'selected' : ''}>Turno A</option>
                                    <option value="B" ${turno === 'B' ? 'selected' : ''}>Turno B</option>
                                    <option value="C" ${turno === 'C' ? 'selected' : ''}>Turno C</option>
                                </select>
                            </td>
                        `;
                    }).join('');
                    return `
                        <tr>
                            <td class="funcionario-info">
                                <span class="funcionario-nome">${func.nome}</span>
                                <span class="funcionario-funcao">${func.funcao}</span>
                            </td>
                            ${cellsHTML}
                        </tr>
                    `;
                }).join('');
                allCalendarsHTML += `
                    <h3 style="margin-top: 32px;">${funcao}</h3>
                    <div class="escala-table-wrapper">
                        <table class="escala-table">
                            <thead>
                                <tr>
                                    <th class="funcionario-header">Funcionário</th>
                                    ${headerHTML}
                                </tr>
                            </thead>
                            <tbody>
                                ${bodyHTML}
                            </tbody>
                        </table>
                    </div>
                `;
            }
        });

        return `
            <h2 style="font-size: 1.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">Calendário de Escala (Próximos 7 dias)</h2>
            ${allCalendarsHTML || '<p class="empty-state">Nenhum funcionário cadastrado para exibir a escala.</p>'}
        `;
    }

    async handleSaveEscala() {
        if (!this.scheduleChanged) {
            showToast('Nenhuma alteração na escala para salvar.', 'info');
            return;
        }
        showLoading();
        try {
            const upsertData = [];
            this.container.querySelectorAll('.turno-select').forEach(select => {
                const turno = select.value;
                if (turno !== 'Folga') {
                    upsertData.push({
                        funcionario_id: parseInt(select.dataset.funcionarioId, 10),
                        data: select.dataset.date,
                        turno: turno
                    });
                }
            });
            await saveEscalaTurnos(upsertData);
            showToast('Escala salva com sucesso!', 'success');
            this.scheduleChanged = false;
            const saveButton = document.getElementById('btn-save-escala');
            if (saveButton) saveButton.style.display = 'none';
            await this.loadTabContent();
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading();
        }
    }
    
    showManageFuncionariosModal() {
        const funcoesOptions = this.funcoes.map(f => `<option value="${f}">${f}</option>`).join('');
        const todayString = new Date().toISOString().split('T')[0];
        const rows = this.funcionarios.map(f => `
            <tr>
                <td>${f.nome}</td>
                <td>${f.funcao}</td>
                <td>
                    <div class="action-buttons-modern">
                        <button class="action-btn edit-btn-modern btn-edit-funcionario" data-id="${f.id}"><i class="ph-fill ph-pencil-simple"></i></button>
                        <button class="action-btn delete-btn-modern btn-delete-funcionario" data-id="${f.id}"><i class="ph-fill ph-trash"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');
        const modalContent = `
            <div class="gerenciar-funcionarios-modal">
                <form id="form-add-funcionario" class="form-modern" style="margin-bottom: 24px;">
                    <h4>Adicionar Novo Funcionário</h4>
                    <div class="form-group">
                        <label for="nome-funcionario">Nome</label>
                        <input type="text" id="nome-funcionario" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="funcao-funcionario">Função</label>
                        <select id="funcao-funcionario" class="form-select" required>
                            <option value="">Selecione...</option>
                            ${funcoesOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="data-inicio-escala">Data de Início na Escala</label>
                        <input type="date" id="data-inicio-escala" class="form-input" value="${todayString}" required>
                    </div>
                    <div class="form-group">
                        <label for="turno-inicial">Turno Inicial</label>
                        <select id="turno-inicial" class="form-select" required>
                            <option value="">Selecione...</option>
                            <option value="A">Turno A</option>
                            <option value="B">Turno B</option>
                            <option value="C">Turno C</option>
                        </select>
                    </div>
                    <button type="submit" class="btn-primary">Adicionar</button>
                </form>
                <h4>Funcionários Cadastrados</h4>
                <div class="table-wrapper" style="max-height: 300px; overflow-y: auto;">
                    <table class="data-table-modern">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Função</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="lista-funcionarios-body">
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        openModal('Gerenciar Funcionários da Escala', modalContent);

        document.getElementById('form-add-funcionario').addEventListener('submit', async (e) => {
            e.preventDefault();
            const nome = document.getElementById('nome-funcionario').value;
            const funcao = document.getElementById('funcao-funcionario').value;
            const dataInicio = document.getElementById('data-inicio-escala').value;
            const turnoInicial = document.getElementById('turno-inicial').value;
            showLoading();
            try {
                const { data: novoFuncionario, error: insertError } = await insertItem('escala_funcionarios', { nome, funcao });
                if(insertError) throw insertError;
                
                let escalaGerada;
                let successMessage;

                if (funcao === 'Motorista de Pipa') {
                     // Ciclo 6x2 com Turno Fixo
                     escalaGerada = this.generate6x2FixedTurnSchedule(novoFuncionario.id, dataInicio, turnoInicial);
                     successMessage = 'Funcionário adicionado e escala 6x2 (Turno Fixo) gerada!';
                } else if (funcao === 'Auxiliar de Serviços Gerais') {
                     // Ciclo 5x1 com Turno Fixo (NOVO)
                     escalaGerada = this.generate5x1FixedTurnSchedule(novoFuncionario.id, dataInicio, turnoInicial);
                     successMessage = 'Funcionário adicionado e escala 5x1 (Turno Fixo) gerada!';
                } else {
                     // Padrão: Ciclo 6x2 com Turno Rotativo (para Líder e Balanceiro)
                     escalaGerada = this.generate6x2Schedule(novoFuncionario.id, dataInicio, turnoInicial);
                     successMessage = 'Funcionário adicionado e escala 6x2 (Turno Rotativo) gerada!';
                }
                
                await saveEscalaTurnos(escalaGerada);

                closeModal();
                await this.loadTabContent();
                showToast(successMessage, 'success');

            } catch (error) {
                handleOperation(error);
            } finally {
                hideLoading();
            }
        });

        document.getElementById('lista-funcionarios-body').addEventListener('click', async (e) => {
            const deleteButton = e.target.closest('.btn-delete-funcionario');
            const editButton = e.target.closest('.btn-edit-funcionario');

            if (deleteButton) {
                const id = deleteButton.dataset.id;
                if (confirm('Deseja realmente excluir este funcionário? As escalas associadas também serão removidas.')) {
                    showLoading();
                    try {
                        await deleteItem('escala_funcionarios', id);
                        closeModal();
                        await this.loadTabContent();
                        showToast('Funcionário excluído!', 'success');
                    } catch (error) {
                        handleOperation(error);
                    } finally {
                        hideLoading();
                    }
                }
            } else if (editButton) {
                const id = editButton.dataset.id;
                const funcionario = this.funcionarios.find(f => f.id == id);
                if (funcionario) {
                    this.showEditFuncionarioModal(funcionario);
                }
            }
        });
    }
    
    showEditFuncionarioModal(funcionario) {
        const funcoesOptions = this.funcoes.map(f => `<option value="${f}" ${f === funcionario.funcao ? 'selected' : ''}>${f}</option>`).join('');
        const modalContent = `
            <form id="form-edit-funcionario" class="form-modern">
                <h4>Editando Funcionário</h4>
                <input type="hidden" id="edit-funcionario-id" value="${funcionario.id}">
                <div class="form-group">
                    <label for="edit-nome-funcionario">Nome</label>
                    <input type="text" id="edit-nome-funcionario" class="form-input" value="${funcionario.nome}" required>
                </div>
                <div class="form-group">
                    <label for="edit-funcao-funcionario">Função</label>
                    <select id="edit-funcao-funcionario" class="form-select" required>
                        ${funcoesOptions}
                    </select>
                </div>
                <p class="form-help">Nota: A alteração da escala (turnos/dias) deve ser feita diretamente no calendário.</p>
                <button type="submit" class="btn-primary">Salvar Alterações</button>
            </form>
        `;
        openModal('Editar Funcionário', modalContent);

        document.getElementById('form-edit-funcionario').addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('edit-funcionario-id').value;
            const nome = document.getElementById('edit-nome-funcionario').value;
            const funcao = document.getElementById('edit-funcao-funcionario').value;

            showLoading();
            try {
                await updateItem('escala_funcionarios', id, { nome, funcao });
                closeModal();
                await this.loadTabContent();
                showToast('Funcionário atualizado com sucesso!', 'success');
            } catch(error) {
                handleOperation(error);
            } finally {
                hideLoading();
            }
        });
    }

    // --- MÉTODOS DA ABA DE USUÁRIOS ---
    async loadUserData() {
        try {
            this.users = await fetchAppUsers();
        } catch (error) {
            handleOperation(error);
            this.users = [];
        }
    }
    
    renderUsersTab() {
        const userRowsHTML = this.users.map(user => {
            const statusText = user.ativo ? 'Ativo' : 'Inativo';
            const statusClass = user.ativo ? 'ativa' : 'inativa';
            const toggleIcon = user.ativo ? 'ph-fill ph-user-x' : 'ph-fill ph-user-check';
            const toggleTitle = user.ativo ? 'Inativar Usuário (Bloquear Acesso)' : 'Ativar Usuário (Permitir Acesso)';
            const toggleBgColor = user.ativo ? 'var(--accent-danger)' : 'var(--accent-primary)'; 
            return `
                <tr class="${user.ativo ? '' : 'inactive-row'}">
                    <td>${user.nome_completo}</td>
                    <td>${user.username_app}</td>
                    <td><span class="caminhao-status-badge status-${user.tipo_usuario === 'admin' ? 'disponivel' : 'manutencao'}">${user.tipo_usuario.charAt(0).toUpperCase() + user.tipo_usuario.slice(1)}</span></td>
                    <td><span class="caminhao-status-badge status-${statusClass}">${statusText}</span></td>
                    <td>
                        <div class="action-buttons-modern" style="justify-content: center;">
                            <button class="action-btn edit-btn-modern edit-user-btn" data-user-id="${user.id}" title="Editar Nome, Usuário e Tipo">
                                <i class="ph-fill ph-pencil-simple"></i>
                            </button>
                            <button class="action-btn toggle-active-btn" 
                                    data-user-id="${user.id}" 
                                    data-is-active="${user.ativo}"
                                    title="${toggleTitle}"
                                    style="background-color: ${toggleBgColor}; color: white; padding: 8px 10px; border-radius: 6px;">
                                <i class="${toggleIcon}"></i>
                            </button>
                            <button class="action-btn delete-btn-modern delete-user-btn" data-user-id="${user.id}" title="Excluir Usuário">
                                <i class="ph-fill ph-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        const usersTableHTML = `
            <div class="list-container-modern" style="padding: 0; border: none; background: transparent;">
                <h2 style="padding-bottom: 12px; border-bottom: 1px solid var(--border-color); font-size: 1.3rem;">Lista de Usuários</h2>
                <div class="table-wrapper" style="overflow-x: auto;">
                    <table class="data-table-modern" style="min-width: 800px;">
                        <thead>
                            <tr>
                                <th>Nome Completo</th>
                                <th>Usuário</th>
                                <th>Tipo</th>
                                <th>Status</th>
                                <th style="width: 150px; text-align: center;">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${userRowsHTML.length > 0 ? userRowsHTML : '<tr><td colspan="5">Nenhum usuário cadastrado.</td></tr>'}
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
                    <p class="form-help">Para Inativar/Ativar ou alterar a senha, use os botões de ação na tabela ou o menu 'Meu Perfil'.</p>
                </div>
                <button type="submit" class="btn-primary">Salvar Alterações</button>
            </form>
        `;
        openModal(`Editar Perfil: ${user.nome_completo}`, modalContent);
        const form = document.getElementById('edit-user-form');
        if(form) {
            form.addEventListener('submit', (e) => this.handleUserEdit(e));
        }
    }

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
            await this.loadTabContent();
        } catch (error) {
            showToast(`Erro ao editar usuário: ${error.message || 'Erro desconhecido'}`, 'error');
        } finally {
            hideLoading();
        }
    }
    
    showToggleActiveModal(user) {
        const newStatus = !user.ativo;
        const actionText = newStatus ? 'ATIVAR' : 'INATIVAR';
        const statusText = newStatus ? 'Permitir Acesso' : 'Bloquear Acesso';
        const color = newStatus ? 'var(--accent-primary)' : 'var(--accent-danger)';
        const warning = newStatus ? 
            `O usuário <strong>${user.nome_completo}</strong> voltará a ter acesso ao sistema.` : 
            `O acesso do usuário <strong>${user.nome_completo}</strong> será imediatamente BLOQUEADO.`;
        const modalContent = `
            <p style="text-align: center; font-size: 1.1rem; margin-bottom: 20px;">Deseja realmente <strong>${actionText}</strong> este usuário?</p>
            <p style="color: ${color}; font-size: 1rem; text-align: center;">${statusText}</p>
            <p class="form-help" style="margin-top: 10px; text-align: center;">${warning}</p>
            <div class="modal-actions" style="margin-top: 30px;">
                <button id="cancel-toggle-btn" class="btn-secondary">Cancelar</button>
                <button id="confirm-toggle-btn" class="btn-primary" style="background-color: ${color};">Confirmar ${actionText}</button>
            </div>
        `;
        openModal(`Confirmar Ação: ${actionText}`, modalContent);
        document.getElementById('confirm-toggle-btn').onclick = () => this.handleToggleActive(user.id, newStatus, user.nome_completo);
        document.getElementById('cancel-toggle-btn').onclick = closeModal;
    }
    
    async handleToggleActive(userId, newStatus, userName) {
        closeModal();
        showLoading();
        try {
            await updateAppUser(userId, { ativo: newStatus });
            const action = newStatus ? 'Ativado' : 'Inativado';
            showToast(`Usuário ${userName} ${action} com sucesso!`, 'success');
            await this.loadTabContent();
        } catch (error) {
            showToast(`Erro ao alterar status: ${error.message || 'Erro desconhecido'}`, 'error');
        } finally {
            hideLoading();
        }
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
        const form = document.getElementById('register-user-form');
        if(form) {
            form.addEventListener('submit', this.handleUserRegistration.bind(this));
        }
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
            await this.loadTabContent();
        } catch (error) {
            showToast(`Erro ao registrar usuário: ${error.message || 'Erro desconhecido'}`, 'error');
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
            await this.loadTabContent();
        } catch (error) {
            showToast(`Erro ao excluir usuário: ${error.message || 'Erro desconhecido'}`, 'error');
        } finally {
            hideLoading();
        }
    }
    
    // --- NOVOS MÉTODOS DA ABA DE METAS ---
    
    async loadMetasData() {
        try {
            // Busca frentes com suas metas associadas
            const masterData = await dataCache.fetchMasterDataOnly(true); // Força refresh
            // Filtra apenas frentes "reais" (remove "Nenhuma", "Disponível", etc.)
            this.frentes = (masterData.frentes_servico || [])
                .filter(f => f.nome.toLowerCase() !== 'nenhuma' && f.nome.toLowerCase() !== 'disponível')
                .sort((a, b) => a.nome.localeCompare(b.nome));
        } catch (error) {
            handleOperation(error);
            this.frentes = [];
        }
    }
    
    renderMetasTab() {
        if (this.frentes.length === 0) {
            return `<div class="empty-state"><i class="ph-fill ph-list-checks"></i><p>Nenhuma frente de serviço cadastrada para definir metas.</p></div>`;
        }

        const rowsHTML = this.frentes.map(frente => {
            // A meta vem de frentes_metas(meta_toneladas)
            // O Supabase retorna isso como um array, pegamos o primeiro (ou único)
            const metaInfo = Array.isArray(frente.frentes_metas) ? frente.frentes_metas[0] : frente.frentes_metas; 
            const metaValue = metaInfo ? metaInfo.meta_toneladas : 0;
            
            return `
                <tr>
                    <td class="funcionario-info">
                        <span class="funcionario-nome">${frente.nome}</span>
                        <span class="funcionario-funcao">${frente.cod_equipamento || 'Sem Cód.'}</span>
                    </td>
                    <td>
                        <div class="form-group" style="margin: 0;">
                            <input 
                                type="number" 
                                class="form-input" 
                                id="meta-input-${frente.id}" 
                                value="${metaValue}" 
                                placeholder="0"
                                step="1"
                                style="max-width: 200px;"
                            >
                        </div>
                    </td>
                    <td style="text-align: center;">
                        <button class="btn-primary btn-save-meta" data-frente-id="${frente.id}">
                            <i class="ph-fill ph-floppy-disk"></i> Salvar
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <div class="gerenciar-metas-container">
                <h2 style="font-size: 1.5rem; margin-bottom: 20px;">Gerenciamento de Metas de Produção (Cotas)</h2>
                <p class="form-help" style="margin-bottom: 20px;">
                    Defina a meta de produção (Cota) em toneladas para o ciclo de 24 horas de cada frente.
                </p>
                <div class="escala-table-wrapper">
                    <table class="escala-table">
                        <thead>
                            <tr>
                                <th class="funcionario-header">Frente de Serviço</th>
                                <th>Meta (Toneladas)</th>
                                <th style="width: 150px; text-align: center;">Ação</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHTML}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    async handleSaveMeta(frenteId, metaValue, buttonElement) {
        const meta = parseFloat(metaValue);
        if (isNaN(meta) || meta < 0) {
            showToast('Por favor, insira um valor de meta válido (número positivo).', 'error');
            return;
        }

        // Feedback visual no botão
        const originalText = buttonElement.innerHTML;
        buttonElement.innerHTML = `<i class="ph-fill ph-circle-notch ph-spin"></i> Salvando...`;
        buttonElement.disabled = true;

        try {
            await saveFrenteMeta(frenteId, meta);
            dataCache.invalidateAllData(); // Invalida o cache
            
            // Atualiza this.frentes localmente para refletir a mudança
            const frente = this.frentes.find(f => f.id === frenteId);
            if (frente) {
                // Lógica ajustada para lidar com array ou objeto
                if (Array.isArray(frente.frentes_metas) && frente.frentes_metas.length > 0) {
                    frente.frentes_metas[0].meta_toneladas = meta;
                } else if (frente.frentes_metas && !Array.isArray(frente.frentes_metas)) {
                     frente.frentes_metas.meta_toneladas = meta;
                } else {
                    frente.frentes_metas = [{ meta_toneladas: meta }];
                }
            }
            
            showToast(`Meta para "${frente?.nome || 'Frente'}" salva com sucesso!`, 'success');
            
        } catch (error) {
            handleOperation(error);
        } finally {
            // Restaura o botão
            buttonElement.innerHTML = originalText;
            buttonElement.disabled = false;
        }
    }
}