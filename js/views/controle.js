// js/views/controle.js
import { fetchAllData, updateCaminhaoStatus, updateFrenteComFazenda } from '../api.js';
import { showToast, handleOperation, showLoading, hideLoading } from '../helpers.js';
import { openModal, closeModal } from '../components/modal.js';

export class ControleView {
    constructor() {
        this.container = null;
        this.data = {};
        this.statusOrder = [
            'disponivel', 
            'indo_carregar', 
            'carregando', 
            'retornando', 
            'patio', 
            'descarregando'
        ];
        this.statusLabels = {
            disponivel: 'Disponível',
            indo_carregar: 'Indo Carregar',
            carregando: 'Carregando',
            retornando: 'Retornando p/ Usina',
            patio: 'Pátio Externo',
            descarregando: 'Descarregando'
        };
    }

    async show() {
        await this.loadHTML();
        await this.loadData();
        this.addEventListeners();
    }

    async hide() {
        // Limpar recursos
    }

    async loadHTML() {
        // O HTML base será renderizado dinamicamente, mantendo esta função simples
        const container = document.getElementById('views-container');
        container.innerHTML = `<div id="controle-view" class="view controle-view active-view"></div>`;
        this.container = container.querySelector('#controle-view');
    }

    async loadData() {
        showLoading();
        try {
            this.data = await fetchAllData();
            this.render(); // Chama uma função de renderização principal
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading();
        }
    }
    
    // Função principal que renderiza toda a view
    render() {
        this.container.innerHTML = `
            <div class="controle-header">
                <h1>Painel de Controle de Frota</h1>
                <button class="btn-primary" id="refresh-controle">
                    <i class="ph-fill ph-arrows-clockwise"></i>
                    Atualizar
                </button>
            </div>

            <div class="controle-grid" id="frentes-grid">
                ${this.renderFrentes()}
            </div>

            <div class="historico-container">
                <div class="historico-header">
                    <h2>Histórico de Movimentação da Frota</h2>
                </div>
                <div class="table-wrapper">
                    <table class="data-table-modern" id="historico-table">
                        <thead>
                            <tr>
                                <th>Horário</th>
                                <th>Caminhão</th>
                                <th>Status Anterior</th>
                                <th>Status Novo</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.renderHistorico()}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    renderFrentes() {
        const { frentes_servico = [], caminhoes = [] } = this.data;

        return frentes_servico.map(frente => {
            const caminhoesDisponiveis = caminhoes.filter(c => c.status === 'disponivel');
            const caminhoesEmOperacao = caminhoes.filter(c => c.frente_id === frente.id && c.status !== 'disponivel');
            const fazendaAtual = frente.fazendas; // A API agora aninha a fazenda aqui

            return `
                <div class="frente-card">
                    <div class="frente-header">
                        <div class="frente-header-main">
                            <i class="ph-fill ph-users-three"></i>
                            <h3>${frente.nome}</h3>
                        </div>
                        <div class="frente-fazenda-info">
                            <div class="fazenda-display">
                                <i class="ph-fill ph-tree-evergreen"></i>
                                <div>
                                    <span class="fazenda-nome">${fazendaAtual?.nome || 'Nenhuma Fazenda Designada'}</span>
                                    ${fazendaAtual ? `<span class="fazenda-codigo">${fazendaAtual.cod_equipamento}</span>` : ''}
                                </div>
                            </div>
                            <button class="btn-secondary btn-alterar-fazenda" data-frente-id="${frente.id}">Alterar</button>
                        </div>
                    </div>
                    <div class="frente-body">
                        <div class="caminhoes-coluna">
                            <h4>Disponíveis p/ Envio</h4>
                            <div class="caminhoes-disponiveis-list">
                                ${caminhoesDisponiveis.map(c => `
                                    <div class="caminhao-item">
                                        <span class="caminhao-item-info">${c.cod_equipamento}</span>
                                        <button class="btn-primary btn-enviar" data-caminhao-id="${c.id}" data-frente-id="${frente.id}" ${!fazendaAtual ? 'disabled' : ''}>
                                            <i class="ph-fill ph-arrow-circle-right"></i> Enviar
                                        </button>
                                    </div>
                                `).join('') || '<p>Nenhum</p>'}
                            </div>
                        </div>
                        <div class="caminhoes-coluna">
                            <h4>Em Operação na Frente</h4>
                            <div class="caminhoes-em-operacao-list">
                                ${caminhoesEmOperacao.map(c => this.renderCaminhaoEmOperacao(c)).join('') || '<p>Nenhum</p>'}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    renderCaminhaoEmOperacao(caminhao) {
        const currentStatus = caminhao.status || 'disponivel';
        const currentIndex = this.statusOrder.indexOf(currentStatus);
        const nextStatus = this.statusOrder[currentIndex + 1];
        const prevStatus = currentIndex > 1 ? this.statusOrder[currentIndex - 1] : null;

        return `
            <div class="caminhao-operacao-item">
                <div class="caminhao-operacao-header">
                    <strong>${caminhao.cod_equipamento}</strong>
                    <span class="caminhao-status-badge status-${currentStatus}">${this.statusLabels[currentStatus]}</span>
                </div>
                <div class="status-actions">
                    ${prevStatus ? `<button class="btn-status-change" data-caminhao-id="${caminhao.id}" data-frente-id="${caminhao.frente_id}" data-novo-status="${prevStatus}">&lt; Voltar</button>` : `<div></div>`}
                    ${nextStatus ? `<button class="btn-status-change" data-caminhao-id="${caminhao.id}" data-frente-id="${caminhao.frente_id}" data-novo-status="${nextStatus}">Avançar &gt;</button>` : `<div></div>`}
                    <button class="btn-status-change full-width" data-caminhao-id="${caminhao.id}" data-novo-status="disponivel">Finalizar Ciclo</button>
                </div>
            </div>
        `;
    }

    renderHistorico() {
        const { caminhao_historico = [] } = this.data;
        // Limita o histórico aos últimos 15 registros para não sobrecarregar a tela
        return caminhao_historico.slice(0, 15).map(log => `
            <tr>
                <td>${new Date(log.timestamp_mudanca).toLocaleString('pt-BR')}</td>
                <td>${log.caminhoes?.cod_equipamento || 'N/A'}</td>
                <td><span class="caminhao-status-badge status-${log.status_anterior}">${this.statusLabels[log.status_anterior] || log.status_anterior}</span></td>
                <td><span class="caminhao-status-badge status-${log.status_novo}">${this.statusLabels[log.status_novo] || log.status_novo}</span></td>
            </tr>
        `).join('');
    }

    addEventListeners() {
        this.container.addEventListener('click', async (e) => {
            const enviarBtn = e.target.closest('.btn-enviar');
            const statusChangeBtn = e.target.closest('.btn-status-change');
            const alterarFazendaBtn = e.target.closest('.btn-alterar-fazenda');
            const refreshBtn = e.target.closest('#refresh-controle');

            if (refreshBtn) {
                this.loadData();
            }
            
            if (enviarBtn) {
                const caminhaoId = enviarBtn.dataset.caminhaoId;
                const frenteId = enviarBtn.dataset.frenteId;
                this.handleStatusUpdate(caminhaoId, 'indo_carregar', frenteId, 'Caminhão enviado com sucesso!');
            }

            if (statusChangeBtn) {
                const caminhaoId = statusChangeBtn.dataset.caminhaoId;
                const novoStatus = statusChangeBtn.dataset.novoStatus;
                const frenteId = novoStatus === 'disponivel' ? null : statusChangeBtn.dataset.frenteId;
                this.handleStatusUpdate(caminhaoId, novoStatus, frenteId, 'Status atualizado!');
            }
            
            if (alterarFazendaBtn) {
                const frenteId = alterarFazendaBtn.dataset.frenteId;
                this.showFazendaSelector(frenteId);
            }
        });
    }

    async handleStatusUpdate(caminhaoId, novoStatus, frenteId, successMessage) {
        showLoading();
        try {
            await updateCaminhaoStatus(caminhaoId, novoStatus, frenteId);
            showToast(successMessage, 'success');
            await this.loadData();
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading();
        }
    }
    
    showFazendaSelector(frenteId) {
        const { fazendas = [] } = this.data;
        const optionsHTML = fazendas.map(f => `<option value="${f.id}">${f.cod_equipamento} - ${f.nome}</option>`).join('');

        const modalContent = `
            <form id="fazenda-select-form" class="fazenda-select-form">
                <p>Selecione a nova fazenda para esta frente de serviço.</p>
                <select name="fazenda" class="form-select">
                    <option value="">Nenhuma / Limpar</option>
                    ${optionsHTML}
                </select>
                <button type="submit" class="btn-primary">Salvar Alteração</button>
            </form>
        `;
        
        openModal('Alterar Fazenda da Frente', modalContent);

        document.getElementById('fazenda-select-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const selectedFazendaId = e.target.fazenda.value;
            
            showLoading();
            try {
                await updateFrenteComFazenda(frenteId, selectedFazendaId || null);
                showToast('Fazenda atualizada com sucesso!', 'success');
                closeModal();
                await this.loadData();
            } catch (error) {
                handleOperation(error);
            } finally {
                hideLoading();
            }
        });
    }
}