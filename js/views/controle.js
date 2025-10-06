// js/views/controle.js
export class ControleView {
    constructor() {
        this.container = null;
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
        const container = document.getElementById('views-container');
        container.innerHTML = this.getHTML();
        this.container = container;
    }

    getHTML() {
        return `
            <div id="controle-view" class="view">
                <div class="controle-header">
                    <h1>Painel de Controle</h1>
                    <div class="controle-actions">
                        <button class="btn-primary" id="refresh-data">
                            <i class="ph-fill ph-arrows-clockwise"></i>
                            Atualizar Dados
                        </button>
                    </div>
                </div>

                <div class="controle-grid">
                    <div class="controle-card">
                        <h3>Status das Operações</h3>
                        <div class="status-list" id="status-operacoes">
                            <p>Carregando dados...</p>
                        </div>
                    </div>

                    <div class="controle-card">
                        <h3>Alertas e Notificações</h3>
                        <div class="alerts-list" id="alerts-container">
                            <p>Nenhum alerta no momento.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async loadData() {
        // Simular carregamento de dados
        setTimeout(() => {
            const statusContainer = document.getElementById('status-operacoes');
            if (statusContainer) {
                statusContainer.innerHTML = `
                    <div class="status-item">
                        <span class="status-indicator active"></span>
                        <span>Operação Normal</span>
                    </div>
                    <div class="status-item">
                        <span class="status-indicator warning"></span>
                        <span>2 Equipamentos em Manutenção</span>
                    </div>
                `;
            }
        }, 1000);
    }

    addEventListeners() {
        const refreshBtn = document.getElementById('refresh-data');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadData();
            });
        }
    }
}