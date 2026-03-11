// js/views/gerenciamentoTerceiros.js
import { showToast, showLoading, hideLoading } from '../helpers.js';
import { supabase } from '../supabase.js';

export class GerenciamentoTerceirosView {
    constructor() {
        this.container = document.getElementById('views-container');
        this.funcionarios = []; 
        this.caminhoes = []; 
        this.maquinas = [];  
    }

    async show() {
        this.render();
        this.addEventListeners();
        await this.loadDashboardData();
        await this.loadEmpresasAcesso();
    }

    async hide() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }

    render() {
        const html = `
            <div id="view-gerenciamento-terceiros" class="view active-view gerencial-view fade-in">
                <div class="gerencial-header" style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h1>Portal de Parceiros</h1>
                        <p style="color: var(--text-secondary); margin-top: 5px;">Gestão unificada de frota, máquinas, equipes e controle de acessos.</p>
                    </div>
                    <button class="btn-primary" id="btn-refresh-terceiros">
                        <i class="ph-fill ph-arrows-clockwise"></i> Atualizar Dados
                    </button>
                </div>

                <div class="report-internal-menu gerencial-internal-menu" style="margin-top: 24px;">
                    <button class="btn-secondary internal-menu-btn active" data-tab="dashboard-terceiros">
                        <i class="ph-fill ph-chart-pie-slice"></i> Dashboard
                    </button>
                    <button class="btn-secondary internal-menu-btn" data-tab="empresas-terceiros">
                        <i class="ph-fill ph-buildings"></i> Acessos (Empresas)
                    </button>
                    <button class="btn-secondary internal-menu-btn" data-tab="frota-terceiros">
                        <i class="ph-fill ph-truck"></i> Frota (Caminhões)
                    </button>
                    <button class="btn-secondary internal-menu-btn" data-tab="equipamentos-terceiros">
                        <i class="ph-fill ph-tractor"></i> Máquinas Agrícolas
                    </button>
                    <button class="btn-secondary internal-menu-btn" data-tab="equipe-terceiros">
                        <i class="ph-fill ph-users"></i> Equipe (Funcionários)
                    </button>
                    <button class="btn-secondary internal-menu-btn" data-tab="workflow-terceiros">
                        <i class="ph-fill ph-check-circle"></i> Triagem e Vistoria
                    </button>
                </div>

                <div id="gerencial-content" class="gerencial-content" style="padding: 24px; background-color: var(--bg-light); border-radius: 12px; margin-top: 24px; border: 1px solid var(--border-color);">
                    
                    <div class="tab-content active" id="tab-dashboard-terceiros" style="display: block;">
                        <div class="dashboard-cards" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 24px;">
                            <div class="card stat-card" style="padding: 24px;">
                                <div class="stat-header">
                                    <div class="stat-icon" style="background: linear-gradient(135deg, #2B6CB0, #4C77A5);"><i class="ph-fill ph-truck"></i></div>
                                    <div class="stat-title">Frota Ativa (OK)</div>
                                </div>
                                <p class="huge-number success-text" id="count-frota-ativa" style="font-size: 2.5rem; font-weight: bold; margin-top: 15px; color: var(--accent-primary);">0</p>
                            </div>
                            <div class="card stat-card" style="padding: 24px;">
                                <div class="stat-header">
                                    <div class="stat-icon" style="background: linear-gradient(135deg, #D69E2E, #B7791F);"><i class="ph-fill ph-magnifying-glass"></i></div>
                                    <div class="stat-title">Pendentes Triagem</div>
                                </div>
                                <p class="huge-number warning-text" id="count-pendentes-total" style="font-size: 2.5rem; font-weight: bold; margin-top: 15px; color: #D69E2E;">0</p>
                            </div>
                            <div class="card stat-card" style="padding: 24px;">
                                <div class="stat-header">
                                    <div class="stat-icon" style="background: linear-gradient(135deg, #718096, #4A5568);"><i class="ph-fill ph-trash"></i></div>
                                    <div class="stat-title">Removidos pelo Parceiro</div>
                                </div>
                                <p class="huge-number" id="count-excluidos" style="font-size: 2.5rem; font-weight: bold; margin-top: 15px; color: #718096;">0</p>
                            </div>
                        </div>
                    </div>

                    <div class="tab-content" id="tab-empresas-terceiros" style="display: none;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
                            <h3>Controle de Acesso das Empresas</h3>
                            <button class="btn-danger" id="btn-desativar-todas"><i class="ph-fill ph-warning-octagon"></i> Desativar Todos os Tokens</button>
                        </div>
                        <table class="data-table-modern">
                            <thead>
                                <tr><th>Nome da Empresa</th><th>Status Portal</th><th>Token de Acesso</th><th style="text-align: center;">Ações</th></tr>
                            </thead>
                            <tbody id="lista-todas-empresas"></tbody>
                        </table>
                    </div>

                    <div class="tab-content" id="tab-frota-terceiros" style="display: none;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
                            <h3>Lista Geral de Caminhões (Parceiros)</h3>
                            <button class="btn-danger" id="btn-desativar-frota"><i class="ph-fill ph-truck"></i> Desativar Toda a Frota</button>
                        </div>
                        <table class="data-table-modern">
                            <thead>
                                <tr><th>Empresa</th><th>Código</th><th>Placa</th><th>Descrição</th><th>Situação</th><th>Homologação</th></tr>
                            </thead>
                            <tbody id="lista-frota-caminhoes"></tbody>
                        </table>
                    </div>

                    <div class="tab-content" id="tab-equipamentos-terceiros" style="display: none;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
                            <h3>Histórico de Máquinas e Equipamentos</h3>
                            <button class="btn-danger" id="btn-desativar-maquinas"><i class="ph-fill ph-tractor"></i> Desativar Todas as Máquinas</button>
                        </div>
                        <table class="data-table-modern">
                            <thead>
                                <tr><th>Empresa</th><th>Código Interno</th><th>Descrição</th><th>Finalidade</th><th>Situação</th><th>Homologação</th></tr>
                            </thead>
                            <tbody id="lista-todos-equipamentos"></tbody>
                        </table>
                    </div>

                    <div class="tab-content" id="tab-equipe-terceiros" style="display: none;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
                            <div style="display: flex; gap: 15px; align-items: center;">
                                <h3>Quadro de Colaboradores Terceirizados</h3>
                                <input type="text" id="search-funcionario" class="form-input" placeholder="Buscar por nome ou empresa..." style="width: 250px; border-radius: 20px;">
                            </div>
                            <button class="btn-danger" id="btn-desativar-equipe"><i class="ph-fill ph-users-three"></i> Desativar Toda a Equipe</button>
                        </div>
                        <table class="data-table-modern">
                            <thead>
                                <tr><th>Nome do Colaborador</th><th>Empresa Parceira</th><th>Atividade</th><th>Situação</th><th>Status Integração</th><th style="text-align: center;">Ações</th></tr>
                            </thead>
                            <tbody id="lista-todos-funcionarios"></tbody>
                        </table>
                    </div>

                    <div class="tab-content" id="tab-workflow-terceiros" style="display: none;">
                        <div style="margin-bottom: 30px;">
                            <h4 style="color: var(--primary-color); display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
                                <i class="ph-fill ph-clipboard-text"></i> Veículos e Máquinas para Vistoria
                            </h4>
                            <table class="data-table-modern">
                                <thead><tr><th>Empresa</th><th>Tipo</th><th>Código / Placa</th><th>Modelo</th><th>Ações</th></tr></thead>
                                <tbody id="lista-workflow-equipamentos"></tbody>
                            </table>
                        </div>

                        <div>
                            <h4 style="color: var(--primary-color); display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
                                <i class="ph-fill ph-users"></i> Colaboradores para Integração
                            </h4>
                            <table class="data-table-modern">
                                <thead><tr><th>Empresa</th><th>Nome Completo</th><th>Cargo</th><th>Ações</th></tr></thead>
                                <tbody id="lista-workflow-funcionarios"></tbody>
                            </table>
                        </div>
                    </div>

                </div>
            </div>
        `;
        this.container.innerHTML = html;
    }

    renderBadge(valor) {
        const v = valor || '';
        let color = '#ED8936', bg = 'rgba(237, 137, 54, 0.2)'; 
        if (v.includes('Apto') || v === 'ativo') { color = '#38A169'; bg = 'rgba(56, 161, 105, 0.2)'; }
        else if (v.includes('Bloqueado') || v === 'inativo') { color = '#E53E3E'; bg = 'rgba(229, 62, 62, 0.2)'; }
        else if (v.includes('excluído')) { color = '#718096'; bg = '#E2E8F0'; } 
        return `<span style="background: ${bg}; color: ${color}; padding: 4px 10px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; text-transform: uppercase; text-align: center; display: inline-block;">${v}</span>`;
    }

    addEventListeners() {
        const tabs = document.querySelectorAll('.internal-menu-btn');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.internal-menu-btn').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
                e.currentTarget.classList.add('active');
                document.getElementById(`tab-${e.currentTarget.getAttribute('data-tab')}`).style.display = 'block';
            });
        });

        document.getElementById('btn-refresh-terceiros')?.addEventListener('click', () => this.loadDashboardData());

        document.getElementById('gerencial-content').addEventListener('click', async (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;

            // Workflow: Aprovar Veículo/Máquina
            if (btn.classList.contains('btn-aprovar-equipamento')) {
                this.atualizarStatusUnico(btn.dataset.id, btn.dataset.origem, 'status_homologacao', 'Apto para Safra');
            }
            // Workflow: Confirmar Integração Funcionário
            if (btn.classList.contains('btn-integrar-funcionario')) {
                this.atualizarStatusUnico(btn.dataset.id, 'terceiros', 'status_homologacao', 'Integrado (Apto)');
            }
            // Acessos: Ativar Empresa
            if (btn.classList.contains('btn-ativar-acesso')) {
                this.gerarToken(btn.dataset.id);
            }
            // Acessos: Bloquear Empresa
            if (btn.classList.contains('btn-remover-acesso')) {
                this.removerToken(btn.dataset.id);
            }
            // Equipe: Inativar Colaborador
            if (btn.classList.contains('btn-inativar-funcionario')) {
                this.atualizarDuploStatus(btn.dataset.id, 'terceiros', 'inativo', 'Bloqueado');
            }
            // Equipe: Remover Colaborador
            if (btn.classList.contains('btn-remover-funcionario')) {
                this.atualizarDuploStatus(btn.dataset.id, 'terceiros', 'excluído pelo parceiro', 'Bloqueado');
            }
        });

        document.getElementById('btn-desativar-todas')?.addEventListener('click', async () => {
            if (confirm('FIM DE SAFRA: Deseja remover o acesso de todas as empresas do portal?')) {
                showLoading();
                try {
                    await supabase.from('proprietarios').update({ token_acesso: null }).not('token_acesso', 'is', null);
                    showToast('Todos os acessos revogados!', 'success');
                    await this.loadEmpresasAcesso();
                } catch (err) { console.error(err); } finally { hideLoading(); }
            }
        });

        // MASSA: Desativar e bloquear TUDO
        document.getElementById('btn-desativar-frota')?.addEventListener('click', async () => {
            if (confirm('Atenção: Deseja marcar TODOS os caminhões como INATIVOS e BLOQUEADOS?')) {
                showLoading();
                try {
                    await supabase.from('caminhoes').update({ situacao: 'inativo', status_homologacao: 'Bloqueado' }).not('id', 'is', null);
                    showToast('Frota desativada e bloqueada com sucesso.', 'success');
                    await this.loadDashboardData();
                } catch (err) { console.error(err); } finally { hideLoading(); }
            }
        });

        document.getElementById('btn-desativar-maquinas')?.addEventListener('click', async () => {
            if (confirm('Atenção: Deseja marcar TODAS as máquinas agrícolas como INATIVAS e BLOQUEADAS?')) {
                showLoading();
                try {
                    await supabase.from('equipamentos').update({ situacao: 'inativo', status_homologacao: 'Bloqueado' }).not('id', 'is', null);
                    showToast('Máquinas desativadas e bloqueadas com sucesso.', 'success');
                    await this.loadDashboardData();
                } catch (err) { console.error(err); } finally { hideLoading(); }
            }
        });

        document.getElementById('btn-desativar-equipe')?.addEventListener('click', async () => {
            if (confirm('Atenção: Deseja marcar TODOS os colaboradores como INATIVOS e com integração BLOQUEADA?')) {
                showLoading();
                try {
                    await supabase.from('terceiros').update({ situacao: 'inativo', status_homologacao: 'Bloqueado' }).not('id', 'is', null);
                    showToast('Equipe desativada e bloqueada com sucesso.', 'success');
                    await this.loadDashboardData();
                } catch (err) { console.error(err); } finally { hideLoading(); }
            }
        });

        document.getElementById('search-funcionario')?.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('#lista-todos-funcionarios tr').forEach(row => {
                row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
            });
        });
    }

    async loadDashboardData() {
        showLoading();
        try {
            const [f, c, m] = await Promise.all([
                supabase.from('terceiros').select('*, proprietarios:empresa_id(nome)').order('nome'),
                supabase.from('caminhoes').select('*, proprietarios(nome)').order('cod_equipamento'),
                supabase.from('equipamentos').select('*, proprietarios(nome)').order('cod_equipamento')
            ]);
            this.funcionarios = f.data || [];
            this.caminhoes = c.data || [];
            this.maquinas = m.data || [];

            this.renderTables();
            this.updateCounters();
        } catch (err) { 
            console.error(err); 
            showToast('Erro ao carregar dados do Supabase', 'error');
        } finally { hideLoading(); }
    }

    updateCounters() {
        const ativos = this.caminhoes.filter(c=>c.situacao==='ativo').length + this.maquinas.filter(m=>m.situacao==='ativo').length;
        const excluidos = this.caminhoes.filter(c=>c.situacao.includes('excluído')).length + 
                          this.maquinas.filter(m=>m.situacao.includes('excluído')).length +
                          this.funcionarios.filter(f=>f.situacao.includes('excluído')).length;
        
        const pendentes = this.caminhoes.filter(c=>c.status_homologacao==='Pendente Vistoria' && c.situacao==='ativo').length + 
                          this.maquinas.filter(m=>m.status_homologacao==='Pendente Vistoria' && m.situacao==='ativo').length +
                          this.funcionarios.filter(f=>f.status_homologacao==='Falta Integração' && f.situacao==='ativo').length;
        
        document.getElementById('count-frota-ativa').textContent = ativos;
        document.getElementById('count-pendentes-total').textContent = pendentes;
        document.getElementById('count-excluidos').textContent = excluidos;
    }

    renderTables() {
        // Frota de Caminhões
        document.getElementById('lista-frota-caminhoes').innerHTML = this.caminhoes.map(cam => `
            <tr style="${cam.situacao.includes('excluído') ? 'opacity: 0.5; background: #f9f9f9;' : ''}">
                <td>${cam.proprietarios?.nome || '-'}</td>
                <td>${cam.cod_equipamento}</td>
                <td><strong>${cam.placa || '-'}</strong></td>
                <td>${cam.descricao || '-'}</td>
                <td>${this.renderBadge(cam.situacao)}</td>
                <td>${this.renderBadge(cam.status_homologacao)}</td>
            </tr>
        `).join('') || '<tr><td colspan="6" style="text-align:center;">Nenhum caminhão registrado.</td></tr>';

        // Máquinas Agrícolas
        document.getElementById('lista-todos-equipamentos').innerHTML = this.maquinas.map(m => `
            <tr style="${m.situacao.includes('excluído') ? 'opacity: 0.5; background: #f9f9f9;' : ''}">
                <td>${m.proprietarios?.nome || '-'}</td>
                <td><strong>${m.cod_equipamento}</strong></td>
                <td>${m.descricao || '-'}</td>
                <td>${m.finalidade || '-'}</td>
                <td>${this.renderBadge(m.situacao)}</td>
                <td>${this.renderBadge(m.status_homologacao)}</td>
            </tr>
        `).join('') || '<tr><td colspan="6" style="text-align:center;">Nenhuma máquina registrada.</td></tr>';

        // Equipe de Terceiros com Botões de Ação
        document.getElementById('lista-todos-funcionarios').innerHTML = this.funcionarios.map(func => `
            <tr style="${func.situacao.includes('excluído') ? 'opacity: 0.5; background: #f9f9f9;' : ''}">
                <td><strong>${func.nome}</strong></td>
                <td>${func.proprietarios?.nome || '-'}</td>
                <td>${func.descricao_atividade || '-'}</td>
                <td>${this.renderBadge(func.situacao)}</td>
                <td>${this.renderBadge(func.status_homologacao)}</td>
                <td style="text-align: center;">
                    ${func.situacao === 'ativo' ? `
                    <div class="action-buttons-modern" style="justify-content: center;">
                        <button class="action-btn btn-inativar-funcionario" data-id="${func.id}" title="Desativar Colaborador" style="color: #D69E2E; background: rgba(214, 158, 46, 0.1);">
                            <i class="ph-fill ph-user-minus"></i>
                        </button>
                        <button class="action-btn delete-btn-modern btn-remover-funcionario" data-id="${func.id}" title="Remover (Excluir)">
                            <i class="ph-fill ph-trash"></i>
                        </button>
                    </div>
                    ` : '<span style="color: var(--text-secondary); font-size: 0.8rem;">Sem ações</span>'}
                </td>
            </tr>
        `).join('') || '<tr><td colspan="6" style="text-align:center;">Nenhum funcionário registrado.</td></tr>';

        // WORKFLOW TRIAGEM COM BOTÃO "VER DOC"
        const pendEq = [];
        this.caminhoes.filter(c => c.status_homologacao === 'Pendente Vistoria' && c.situacao === 'ativo').forEach(c => pendEq.push({id: c.id, origem: 'caminhoes', empresa: c.proprietarios?.nome, placa: `${c.cod_equipamento} / ${c.placa}`, modelo: c.descricao, tipo: 'Caminhão', doc: c.documento_url}));
        this.maquinas.filter(m => m.status_homologacao === 'Pendente Vistoria' && m.situacao === 'ativo').forEach(m => pendEq.push({id: m.id, origem: 'equipamentos', empresa: m.proprietarios?.nome, placa: m.cod_equipamento, modelo: m.descricao, tipo: 'Máquina', doc: m.documento_url}));

        document.getElementById('lista-workflow-equipamentos').innerHTML = pendEq.map(i => `
            <tr>
                <td>${i.empresa}</td>
                <td>${i.tipo}</td>
                <td><strong>${i.placa}</strong></td>
                <td>${i.modelo}</td>
                <td style="display: flex; gap: 8px;">
                    ${i.doc ? `<a href="${i.doc}" target="_blank" class="btn-secondary" title="Ver Arquivo"><i class="ph-fill ph-file-text"></i> Ver Doc</a>` : ''}
                    <button class="btn-primary btn-aprovar-equipamento" data-id="${i.id}" data-origem="${i.origem}"><i class="ph-fill ph-check"></i> Aprovar</button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="5" style="text-align:center;">Nenhuma vistoria pendente.</td></tr>';

        const pendFunc = this.funcionarios.filter(f => f.status_homologacao === 'Falta Integração' && f.situacao === 'ativo');
        document.getElementById('lista-workflow-funcionarios').innerHTML = pendFunc.map(f => `
            <tr>
                <td>${f.proprietarios?.nome}</td>
                <td><strong>${f.nome}</strong></td>
                <td>${f.descricao_atividade}</td>
                <td style="display: flex; gap: 8px;">
                    ${f.documento_url ? `<a href="${f.documento_url}" target="_blank" class="btn-secondary" title="Ver CNH/ASO"><i class="ph-fill ph-address-book"></i> Ver CNH</a>` : ''}
                    <button class="btn-primary btn-integrar-funcionario" data-id="${f.id}"><i class="ph-fill ph-graduation-cap"></i> Integrar</button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="4" style="text-align:center;">Nenhuma integração pendente.</td></tr>';
    }

    async atualizarStatusUnico(id, tabela, coluna, novoValor) {
        if (!confirm('Deseja confirmar esta ação?')) return;
        showLoading();
        try {
            await supabase.from(tabela).update({ [coluna]: novoValor }).eq('id', id);
            showToast('Ação concluída com sucesso!', 'success');
            await this.loadDashboardData();
        } catch (err) { 
            console.error(err);
            showToast('Erro ao atualizar.', 'error'); 
        } finally { hideLoading(); }
    }

    async atualizarDuploStatus(id, tabela, situacao, homologacao) {
        if (!confirm(`Deseja alterar a situação deste registro para "${situacao.toUpperCase()}" e bloquear seu acesso?`)) return;
        showLoading();
        try {
            await supabase.from(tabela).update({ situacao: situacao, status_homologacao: homologacao }).eq('id', id);
            showToast('Registro desativado com sucesso!', 'success');
            await this.loadDashboardData();
        } catch (err) { 
            console.error(err);
            showToast('Erro ao processar alteração.', 'error'); 
        } finally { hideLoading(); }
    }

    async loadEmpresasAcesso() {
        const { data } = await supabase.from('proprietarios').select('*').order('nome');
        const tbody = document.getElementById('lista-todas-empresas');
        if (!tbody) return;

        tbody.innerHTML = data.map(p => {
            const temAcesso = !!p.token_acesso;
            return `
                <tr>
                    <td><strong>${p.nome}</strong></td>
                    <td>${temAcesso ? '<span class="status-badge status-ativa">PORTAL ATIVO</span>' : '<span class="status-badge status-manutencao">SEM ACESSO</span>'}</td>
                    <td><span style="font-family: monospace; font-size: 1.1rem; letter-spacing: 2px;">${p.token_acesso || '------'}</span></td>
                    <td style="text-align: center;">
                        ${temAcesso 
                            ? `<button class="btn-danger btn-remover-acesso" data-id="${p.id}"><i class="ph-fill ph-prohibit"></i> Bloquear</button>` 
                            : `<button class="btn-primary btn-ativar-acesso" data-id="${p.id}"><i class="ph-fill ph-key"></i> Liberar Acesso</button>`
                        }
                    </td>
                </tr>
            `;
        }).join('');
    }

    async gerarToken(id) {
        const token = Math.random().toString(36).substring(2, 8).toUpperCase();
        showLoading();
        try {
            await supabase.from('proprietarios').update({ token_acesso: token }).eq('id', id);
            showToast('Acesso liberado!', 'success');
            await this.loadEmpresasAcesso();
        } catch (err) { console.error(err); } finally { hideLoading(); }
    }

    async removerToken(id) {
        if(!confirm('Tem certeza que deseja bloquear o acesso desta empresa?')) return;
        showLoading();
        try {
            await supabase.from('proprietarios').update({ token_acesso: null }).eq('id', id);
            showToast('Acesso revogado.', 'success');
            await this.loadEmpresasAcesso();
        } catch (err) { console.error(err); } finally { hideLoading(); }
    }
}