// js/views/filaEstacionamento.js
import { fetchAllData } from '../api.js';
import { showToast, handleOperation, showLoading, hideLoading, formatDateTime } from '../helpers.js';

// Status que indicam que o caminhão está no estacionamento
const ESTACIONAMENTO_STATUS = ['disponivel', 'patio_vazio'];

export class FilaEstacionamentoView {
    constructor() {
        this.container = null;
        this.data = {};
        this.availableTrucks = []; // Caminhões na lista de disponíveis
        this.manualQueue = [];
        this.mechanizedQueue = [];
    }

    async show() {
        await this.loadHTML();
        await this.loadData();
        this.renderAllPanels();
        this.addEventListeners();
    }

    async hide() {}

    async loadHTML() {
        const container = document.getElementById('views-container');
        container.innerHTML = this.getHTML();
        this.container = container.querySelector('#fila-estacionamento-view');
    }

    getHTML() {
        return `
            <div id="fila-estacionamento-view" class="view active-view fila-estacionamento-view">
                <div class="controle-header">
                    <h1>Fila no Estacionamento</h1>
                    <button class="btn-primary" id="refresh-fila">
                        <i class="ph-fill ph-arrows-clockwise"></i>
                        Atualizar Dados
                    </button>
                </div>
                
                <div class="fila-main-grid">
                    <div class="fila-disponiveis-panel">
                        <h2>Caminhões Disponíveis no Pátio</h2>
                        <div id="disponiveis-list" class="truck-list drag-source-list">
                            </div>
                    </div>
                    
                    <div class="fila-queues-grid">
                        <div class="fila-queue-panel drop-target" data-queue-type="manual">
                            <h2>Cana Manual - Fila de Carregamento</h2>
                            <div id="queue-manual-list" class="truck-list queue-list" data-queue-type="manual">
                                </div>
                            <p class="queue-status-hint">Arraste os caminhões para ordenar a fila de carregamento manual.</p>
                        </div>
                        
                        <div class="fila-queue-panel drop-target" data-queue-type="mechanized">
                            <h2>Cana Mecanizada - Fila de Carregamento</h2>
                            <div id="queue-mechanized-list" class="truck-list queue-list" data-queue-type="mechanized">
                                </div>
                            <p class="queue-status-hint">Arraste os caminhões para ordenar a fila de carregamento mecanizado.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async loadData() {
        showLoading();
        try {
            this.data = await fetchAllData();
            this.prepareAvailableTrucks();
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading();
        }
    }

    prepareAvailableTrucks() {
        const { caminhoes = [], caminhao_historico = [] } = this.data;
        const historyMap = new Map();

        // 1. Mapear o último log de entrada no estacionamento (disponivel ou patio_vazio)
        caminhao_historico.sort((a, b) => new Date(b.timestamp_mudanca) - new Date(a.timestamp_mudanca));
        
        for (const log of caminhao_historico) {
            // Se o status NOVO for um status de estacionamento E ainda não mapeamos o caminhão
            if (ESTACIONAMENTO_STATUS.includes(log.status_novo) && !historyMap.has(log.caminhao_id)) {
                historyMap.set(log.caminhao_id, log.timestamp_mudanca);
            }
        }

        // 2. Filtrar caminhões e adicionar informações de tempo
        this.availableTrucks = caminhoes
            .filter(c => ESTACIONAMENTO_STATUS.includes(c.status) && c.status !== 'quebrado') // Apenas disponivel ou patio_vazio
            .map(c => ({
                id: c.id,
                cod: c.cod_equipamento,
                status: c.status,
                // Busca a hora do log ou usa created_at como fallback (caso o histórico esteja vazio)
                entryTime: historyMap.get(c.id) || c.created_at, 
            }))
            .sort((a, b) => new Date(a.entryTime) - new Date(b.entryTime)); // Ordena por tempo de entrada (mais antigo primeiro)
            
        this.renderAllPanels();
    }

    renderAllPanels() {
        // Filtra a lista de disponíveis para remover itens que já estão nas filas
        const queueIds = new Set([...this.manualQueue.map(c => c.id), ...this.mechanizedQueue.map(c => c.id)]);
        const currentAvailable = this.availableTrucks.filter(c => !queueIds.has(c.id));
        
        this.renderList('disponiveis-list', currentAvailable, true);
        this.renderList('queue-manual-list', this.manualQueue, false);
        this.renderList('queue-mechanized-list', this.mechanizedQueue, false);
    }
    
    renderList(elementId, list, isDragSource) {
        const listElement = document.getElementById(elementId);
        if (!listElement) return;

        listElement.innerHTML = list.map(c => `
            <div 
                class="truck-card ${isDragSource ? 'draggable' : 'queue-item'}" 
                draggable="true" 
                data-truck-id="${c.id}" 
                data-cod="${c.cod}"
                data-entry-time="${c.entryTime}"
            >
                <div class="truck-cod">#${c.cod}</div>
                <div class="truck-details">
                    <span class="truck-status-badge status-${c.status}">${c.status === 'disponivel' ? 'Disponível' : 'Pátio Vazio'}</span>
                    <span class="truck-entry-time">Entrada: ${formatDateTime(c.entryTime)}</span>
                </div>
                <i class="ph-fill ph-arrow-fat-lines-v drag-icon"></i>
            </div>
        `).join('');

        if (list.length === 0) {
            listElement.innerHTML = `<div class="empty-state-list"><i class="ph-fill ph-info"></i><p>${isDragSource ? 'Nenhum caminhão disponível no pátio.' : 'A fila está vazia.'}</p></div>`;
        }
    }


    addEventListeners() {
        const container = this.container;
        if (!container) return;

        document.getElementById('refresh-fila').addEventListener('click', () => this.loadData());
        
        let draggedItem = null;

        // --- DRAG START: Captura o item sendo arrastado ---
        container.addEventListener('dragstart', (e) => {
            const card = e.target.closest('.truck-card');
            if (card) {
                draggedItem = card;
                e.dataTransfer.setData('text/plain', card.dataset.truckId);
                // Adiciona a classe 'dragging' para fins visuais
                setTimeout(() => card.classList.add('dragging'), 0);
            }
        });

        // --- DRAG END: Limpa o estado de arrasto ---
        container.addEventListener('dragend', (e) => {
            if (draggedItem) {
                draggedItem.classList.remove('dragging');
                draggedItem = null;
            }
        });

        // --- DROP TARGETS: Gerencia o arrastar sobre e o soltar ---
        container.querySelectorAll('.fila-queue-panel').forEach(target => {
            
            target.addEventListener('dragover', (e) => {
                e.preventDefault(); 
                const list = target.querySelector('.truck-list');
                const draggable = document.querySelector('.dragging');
                if (!draggable || !list) return;

                // Remove placeholder se for reordenamento interno e já houver
                if (!draggable.closest('.drag-source-list')) {
                    const placeholder = document.getElementById('drag-placeholder');
                    if(placeholder) placeholder.remove();
                }
                
                // Cálcula a posição para reordenar (para itens que já estão na fila)
                const afterElement = this.getDragAfterElement(list, e.clientY);

                if (draggable.closest('.drag-source-list')) {
                    // Se vem da lista de disponíveis, mostra o placeholder
                    let placeholder = document.getElementById('drag-placeholder');
                    if (!placeholder) {
                        placeholder = document.createElement('div');
                        placeholder.id = 'drag-placeholder';
                        placeholder.className = 'truck-card drag-placeholder';
                        placeholder.innerHTML = 'Solte para adicionar na fila';
                        placeholder.style.height = `${draggable.offsetHeight}px`;
                        list.appendChild(placeholder);
                    }
                    if (afterElement == null) {
                        list.appendChild(placeholder);
                    } else {
                        list.insertBefore(placeholder, afterElement);
                    }
                } else {
                    // Se já está na fila, move o item (reordenamento)
                    if (afterElement == null) {
                        list.appendChild(draggable);
                    } else {
                        list.insertBefore(draggable, afterElement);
                    }
                }
            });
            
            target.addEventListener('dragleave', (e) => {
                 // Remove o placeholder se sair do alvo
                if (!e.currentTarget.contains(e.relatedTarget)) {
                    const placeholder = document.getElementById('drag-placeholder');
                    if (placeholder) placeholder.remove();
                }
            });

            target.addEventListener('drop', (e) => {
                e.preventDefault();
                const truckId = e.dataTransfer.getData('text/plain');
                const queueType = target.dataset.queueType;
                
                // Remove o placeholder
                const placeholder = document.getElementById('drag-placeholder');
                if (placeholder) placeholder.remove();

                if (truckId) {
                    this.handleDrop(parseInt(truckId), queueType, e.clientY);
                }
            });
        });
    }

    // Função auxiliar para encontrar o elemento após o qual o arrastado deve ser inserido
    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.truck-card:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
    
    // Lógica para manipular o drop e atualizar as filas (estrutura de dados)
    handleDrop(truckId, targetQueueType, dropY) {
        const targetListElement = document.getElementById(`queue-${targetQueueType}-list`);
        
        // 1. Encontra o caminhão
        let truck = this.availableTrucks.find(c => c.id == truckId);
        
        // Se o caminhão não estiver na lista de disponíveis, ele já está em alguma fila.
        if (!truck) {
             truck = this.manualQueue.find(c => c.id == truckId) || this.mechanizedQueue.find(c => c.id == truckId);
             if (!truck) return; // Erro, não encontrou o caminhão
        }

        // 2. Remove o caminhão de todas as listas onde ele pode estar (disponíveis, manual, mecanizada)
        this.availableTrucks = this.availableTrucks.filter(c => c.id != truckId);
        this.manualQueue = this.manualQueue.filter(c => c.id != truckId);
        this.mechanizedQueue = this.mechanizedQueue.filter(c => c.id != truckId);
        
        // 3. Simula a inserção na posição de drop na estrutura de dados
        const targetQueue = targetQueueType === 'manual' ? this.manualQueue : this.mechanizedQueue;
        
        // Recalcula o índice de drop com base no estado atual do DOM após o reordenamento visual
        const cardElements = [...targetListElement.querySelectorAll('.truck-card')];
        let newIndex = cardElements.length;
        
        const afterElement = this.getDragAfterElement(targetListElement, dropY);
        if (afterElement) {
             newIndex = cardElements.findIndex(child => child.dataset.truckId == afterElement.dataset.truckId);
        }

        targetQueue.splice(newIndex, 0, truck);
        
        // 4. Re-renderiza todos os painéis para refletir a mudança
        this.renderAllPanels();

        showToast(`Caminhão #${truck.cod} adicionado/movido para a Fila ${targetQueueType === 'manual' ? 'Manual' : 'Mecanizada'}!`, 'info');
    }
}