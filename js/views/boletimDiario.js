// js/views/boletimDiario.js

export class BoletimDiarioView {
    constructor() {
        this.container = null;
    }

    async show() {
        await this.loadHTML();
    }

    async hide() {
        // Nada a fazer ao esconder, pois é apenas um iframe estático
    }

    async loadHTML() {
        const container = document.getElementById('views-container');
        container.innerHTML = this.getHTML();
        this.container = container.querySelector('#boletim-diario-view');
    }

    getHTML() {
        // Otimização: Garantir que a view e o contêiner do iframe utilizem 100% da altura flexível.
        // Removemos o 'min-height: 600px;' do iframe para permitir expansão total.
        return `
            <div id="boletim-diario-view" class="view active-view controle-view" style="padding: 24px; display: flex; flex-direction: column; height: 100%;">
                <div class="controle-header" style="margin-bottom: 24px;">
                    <h1>Boletim Diário de Operações</h1>
                </div>
                
                <div class="boletim-content" style="flex-grow: 1; display: flex; min-height: 0; overflow: hidden;">
                    <iframe 
                        title="BOLETIM DIARIO" 
                        width="100%" 
                        height="100%" 
                        src="https://app.powerbi.com/view?r=eyJrIjoiOTdlMmNlODItMjAyMC00MmRjLTk3NDItZDU0MjQxMjA1NTcwIiwidCI6ImIxNzcyMTIxLWU1MmEtNDE5MS04YWQ2LWIxNDkxNDFhYmRkOSJ9" 
                        frameborder="0" 
                        allowFullScreen="true"
                        style="border: 1px solid var(--border-color); border-radius: 8px;"
                    ></iframe>
                </div>
                <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 15px;">Dashboard fornecido via Power BI Embed.</p>
            </div>
        `;
    }
}