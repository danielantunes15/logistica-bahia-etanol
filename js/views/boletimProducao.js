// js/views/boletimProducao.js
import { showToast } from '../helpers.js';
import { formatDateTime } from '../timeUtils.js';

// DADOS ESTÁTICOS (HARD-CODED) - AGORA DIVIDIDOS EM GRUPOS
const GRUPOS_DE_PRODUCAO = [
    {
        titulo: "CANA MANUAL",
        frentes: [
            { nome: 'Agrounione Manual', cota: 1700 },
            { nome: 'GM/Castro', cota: 800 },
            { nome: 'RG Transporte', cota: 700 }
        ]
    },
    {
        titulo: "CANA MECANIZADA",
        frentes: [
            { nome: 'Agrounione Mecanizada', cota: 800 },
            { nome: 'E dos Santos', cota: 400 },
            { nome: 'Pedro Epson', cota: 400 },
            { nome: 'AGROTERRA', cota: 1800 },
            { nome: 'Vale do Araguaia', cota: 400 }
        ]
    }
];

export class BoletimProducaoView {
    constructor() {
        this.container = null;
        this.cycleInfo = null;      // Informações do ciclo (início, fim, horas passadas)
        this.processedData = [];  // Dados processados (agora contém os grupos)
    }

    async show() {
        // Recalcula o ciclo e os dados toda vez que a view é mostrada
        this.calculateCycleData(); 
        await this.loadHTML();
        this.renderDashboard(); // Renderiza com os dados calculados
        this.addEventListeners();
    }

    async hide() {}

    async loadHTML() {
        const container = document.getElementById('views-container');
        container.innerHTML = this.getHTML();
        this.container = container.querySelector('#boletim-producao-view');
    }

    /**
     * Calcula o ciclo de 24h (07:00 às 06:59) e
     * processa os dados estáticos com base no tempo passado.
     */
    calculateCycleData() {
        const now = new Date(); // Hora atual
        const cycleStart = new Date();

        // Se for antes das 7h, o ciclo começou ontem
        if (now.getHours() < 7) {
            cycleStart.setDate(now.getDate() - 1);
        }
        cycleStart.setHours(7, 0, 0, 0); // Define início do ciclo para 07:00

        // O ciclo termina 24h depois (às 06:59:59 do dia seguinte)
        const cycleEnd = new Date(cycleStart);
        cycleEnd.setDate(cycleStart.getDate() + 1);
        cycleEnd.setHours(6, 59, 59, 999);

        // Calcula quantas horas (decimais) se passaram desde o início do ciclo
        const msPassed = now.getTime() - cycleStart.getTime();
        let hoursPassed = msPassed / (1000 * 60 * 60); // ex: 2.5 (para 09:30)

        // Trava o cálculo em 24h (fim do ciclo) ou 0h (início do ciclo)
        if (hoursPassed > 24) hoursPassed = 24; 
        if (hoursPassed < 0) hoursPassed = 0; // Segurança para o início do ciclo

        this.cycleInfo = {
            start: cycleStart,
            end: cycleEnd,
            hoursPassed: hoursPassed
        };

        // Processa os dados estáticos DENTRO DOS GRUPOS
        this.processedData = GRUPOS_DE_PRODUCAO.map(grupo => {
            
            const frentesProcessadas = grupo.frentes.map(frente => {
                const meta24h = frente.cota;
                const metaHora = meta24h / 24;
                const metaMomento = metaHora * hoursPassed;
                const cumprimento = meta24h > 0 ? (metaMomento / meta24h) * 100 : 0;

                return {
                    nome: frente.nome,
                    meta24h: meta24h,
                    metaHora: metaHora,
                    metaMomento: metaMomento,
                    cumprimento: cumprimento
                };
            }).sort((a, b) => a.nome.localeCompare(b.nome)); // Ordena frentes dentro do grupo

            return {
                titulo: grupo.titulo,
                frentes: frentesProcessadas
            };
        });
    }

    getHTML() {
        const cycleStartStr = this.cycleInfo.start.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const cycleEndStr = this.cycleInfo.end.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const hoursPassedStr = this.cycleInfo.hoursPassed.toFixed(2).replace('.', ',');

        return `
            <div id="boletim-producao-view" class="view active-view producao-view">
                <div class="controle-header">
                    <h1>Boletim de Metas (Projeção Horária)</h1>
                    <button class="btn-primary" id="refresh-boletim">
                        <i class="ph-fill ph-arrows-clockwise"></i>
                        Recalcular
                    </button>
                </div>
                
                <div class="producao-cycle-info">
                    <i class="ph-fill ph-calendar-check"></i>
                    Ciclo: <strong>${cycleStartStr}</strong> até <strong>${cycleEndStr}</strong>
                </div>
                
                <div class="producao-cycle-info" style="border-left-color: var(--accent-primary);">
                    <i class="ph-fill ph-clock" style="color: var(--accent-primary);"></i>
                    Horas decorridas no ciclo: <strong>${hoursPassedStr} horas</strong>
                </div>

                <div id="producao-dashboard-container">
                    </div>
            </div>
        `;
    }

    renderDashboard() {
        const container = document.getElementById('producao-dashboard-container');
        if (!container) return;

        // Limpa o container antes de renderizar
        container.innerHTML = '';

        // Itera sobre os GRUPOS processados (Ex: "CANA MANUAL", "CANA MECANIZADA")
        this.processedData.forEach(grupo => {
            
            // 1. Gera os CARDS para as frentes DENTRO deste grupo
            const cardsHTML = grupo.frentes.map(frente => {
                let cumprimentoClass = 'low';
                if (frente.cumprimento >= 90) cumprimentoClass = 'high';
                else if (frente.cumprimento >= 60) cumprimentoClass = 'medium';

                return `
                    <div class="producao-card">
                        <h3 class="producao-frente-nome">${frente.nome}</h3>
                        
                        <div class="producao-progress-bar-container">
                            <div class="producao-progress-bar-fill ${cumprimentoClass}" style="width: ${frente.cumprimento.toFixed(2)}%;"></div>
                            <span class="producao-progress-label">Projeção: ${frente.cumprimento.toFixed(1)}%</span>
                        </div>
                        
                        <div class="producao-stats-grid">
                            <div class="stat-item">
                                <span class="stat-label">Cota 24h (Meta)</span>
                                <span class="stat-value cota">${frente.meta24h.toLocaleString('pt-BR')} t</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Meta / Hora</span>
                                <span class="stat-value hora">${frente.metaHora.toFixed(2)} t</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Meta p/ Momento</span>
                                <span class="stat-value momento">${frente.metaMomento.toFixed(2)} t</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            // 2. Adiciona o TÍTULO do grupo + o GRID de cards ao container
            container.innerHTML += `
                <h2 class="producao-group-title">${grupo.titulo}</h2>
                <div class="producao-grid">
                    ${cardsHTML}
                </div>
            `;
        });
    }

    addEventListeners() {
        // Listener para o botão de recalcular
        this.container.addEventListener('click', (e) => {
            if (e.target.closest('#refresh-boletim')) {
                // Simplesmente chama o 'show' de novo para recalcular tudo
                this.show(); 
                showToast('Metas recalculadas para a hora atual!', 'success');
            }
        });
    }
}