// js/views/filaEstacionamento.js
import { fetchAllData } from '../api.js';
import { showToast, handleOperation, showLoading, hideLoading, formatDateTime } from '../helpers.js';

// Status que indicam que o caminhão está no estacionamento
const ESTACIONAMENTO_STATUS = ['disponivel', 'patio_vazio'];

export class FilaEstacionamentoView {
    constructor() {
        this.container = null;
        this.data = {};
        this.availableTrucks = []; 
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
        // CORREÇÃO: data-queue-type="mecanizada" (minúsculo e sem acento)
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
                        <div id="disponiveis-list" class="truck-list drag-source-list drop-target" data-queue-type="disponivel">
                            </div>
                    </div>
                    
                    <div class="fila-queues-grid">
                        <div class="fila-queue-panel">
                            <h2>Cana Manual - Fila de Carregamento</h2>
                            <div id="queue-manual-list" class="truck-list queue-list drop-target" data-queue-type="manual">
                                </div>
                            <p class="queue-status-hint">Arraste os caminhões para ordenar a fila de carregamento manual.</p>
                        </div>
                        
                        <div class="fila-queue-panel">
                            <h2>Cana Mecanizada - Fila de Carregamento</h2>
                            <div id="queue-mechanized-list" class="truck-list queue-list drop-target" data-queue-type="mecanizada">
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

        caminhao_historico.sort((a, b) => new Date(b.timestamp_mudanca) - new Date(a.timestamp_mudanca));
        
        for (const log of caminhao_historico) {
            if (ESTACIONAMENTO_STATUS.includes(log.status_novo) && !historyMap.has(log.caminhao_id)) {
                historyMap.set(log.caminhao_id, log.timestamp_mudanca);
            }
        }

        this.availableTrucks = caminhoes
            .filter(c => ESTACIONAMENTO_STATUS.includes(c.status) && c.status !== 'quebrado')
            .map(c => ({
                id: c.id,
                cod: c.cod_equipamento,
                status: c.status,
                entryTime: historyMap.get(c.id) || c.created_at,
            }))
            .sort((a, b) => new Date(a.entryTime) - new Date(b.entryTime));
            
        this.renderAllPanels();
    }

    renderAllPanels() {
        // CORREÇÃO: Remove a filtragem redundante. A lista this.availableTrucks é renderizada diretamente.
        this.renderList('disponiveis-list', this.availableTrucks, true, false); 
        this.renderList('queue-manual-list', this.manualQueue, true, true);
        this.renderList('queue-mechanized-list', this.mechanizedQueue, true, true);
    }
    
    renderList(elementId, list, isDraggable, isReorderable) {
        const listElement = document.getElementById(elementId);
        if (!listElement) return;

        listElement.innerHTML = list.map(c => `
            <div 
                class="truck-card ${isReorderable ? 'queue-item' : 'draggable'}" 
                draggable="${isDraggable}" 
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
            listElement.innerHTML = `<div class="empty-state-list"><i class="ph-fill ph-info"></i><p>${elementId === 'disponiveis-list' ? 'Nenhum caminhão disponível no pátio.' : 'A fila está vazia.'}</p></div>`;
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
            if (card && card.getAttribute('draggable') === 'true') {
                draggedItem = card;
                e.dataTransfer.setData('text/plain', card.dataset.truckId);
                setTimeout(() => card.classList.add('dragging'), 0);
            }
        });

        // --- DRAG END: Limpa o estado de arrasto ---
        container.addEventListener('dragend', (e) => {
            if (draggedItem) {
                draggedItem.classList.remove('dragging');
                draggedItem = null;
            }
            const placeholder = document.getElementById('drag-placeholder');
            if (placeholder) placeholder.remove();
        });

        // --- DROP TARGETS: Gerencia o arrastar sobre e o soltar ---
        container.querySelectorAll('.drop-target').forEach(target => {
            
            target.addEventListener('dragover', (e) => {
                e.preventDefault(); 
                
                const list = target;
                const draggable = document.querySelector('.dragging');
                if (!draggable || !list) return;

                const isComingFromAvailable = draggable.closest('.drag-source-list');
                const isGoingToQueue = target.dataset.queueType !== 'disponivel';
                
                if (isComingFromAvailable && isGoingToQueue || draggable.closest('.queue-list') || target.dataset.queueType === 'disponivel') {
                    
                    const afterElement = this.getDragAfterElement(list, e.clientY);
                    let placeholder = document.getElementById('drag-placeholder');
                    
                    if (!placeholder) {
                        placeholder = document.createElement('div');
                        placeholder.id = 'drag-placeholder';
                        placeholder.className = 'truck-card drag-placeholder';
                        placeholder.innerHTML = 'Solte para inserir/reordenar';
                        placeholder.style.height = `${draggable.offsetHeight}px`;
                    }
                    
                    if (isComingFromAvailable && isGoingToQueue || target.dataset.queueType === 'disponivel') {
                        if (afterElement == null) {
                            list.appendChild(placeholder);
                        } else {
                            list.insertBefore(placeholder, afterElement);
                        }
                    } else if (draggable.closest('.queue-list')) {
                         if (afterElement == null) {
                            list.appendChild(draggable);
                        } else {
                            list.insertBefore(draggable, afterElement);
                        }
                    }

                }
            });
            
            target.addEventListener('dragleave', (e) => {
                 if (!e.currentTarget.contains(e.relatedTarget)) {
                    const placeholder = document.getElementById('drag-placeholder');
                    if (placeholder) placeholder.remove();
                }
            });

            target.addEventListener('drop', (e) => {
                e.preventDefault();
                const truckId = e.dataTransfer.getData('text/plain');
                const queueType = target.closest('.drop-target').dataset.queueType;
                
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
        const draggableElements = [...container.querySelectorAll('.truck-card:not(.dragging):not(.drag-placeholder)')];

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
        
        // 1. Encontra e remove o caminhão de todas as listas (available, manual, mechanized)
        let truck = this.availableTrucks.find(c => c.id == truckId) ||
                    this.manualQueue.find(c => c.id == truckId) || 
                    this.mechanizedQueue.find(c => c.id == truckId);
        
        if (!truck) return;

        // Remove de onde estiver
        this.availableTrucks = this.availableTrucks.filter(c => c.id != truckId);
        this.manualQueue = this.manualQueue.filter(c => c.id != truckId);
        this.mechanizedQueue = this.mechanizedQueue.filter(c => c.id != truckId);
        
        const normalizedTargetType = targetQueueType.toLowerCase().trim();
        
        let targetQueue = null;
        let successMessage = '';

        if (normalizedTargetType === 'manual') {
            targetQueue = this.manualQueue;
            successMessage = 'Manual';
        } else if (normalizedTargetType === 'mecanizada') {
            targetQueue = this.mechanizedQueue;
            successMessage = 'Mecanizada';
        } else if (normalizedTargetType === 'disponivel') {
             // Caso de retorno para o pool de disponíveis
             this.availableTrucks.push(truck);
             this.availableTrucks.sort((a, b) => new Date(a.entryTime) - new Date(b.entryTime));
             showToast(`Caminhão #${truck.cod} voltou para Disponíveis no Pátio!`, 'info');
             this.renderAllPanels(); 
             return;
        }
        
        // 3. Adiciona o caminhão na fila correta (manual ou mecanizada)
        if (targetQueue) { 
            const targetListElement = document.getElementById(`queue-${normalizedTargetType}-list`);
            
            // Reordenamento: encontra a posição de inserção
            const afterElement = this.getDragAfterElement(targetListElement, dropY);
            const cardElements = [...targetListElement.querySelectorAll('.truck-card')];
            
            let newIndex = cardElements.length;
            if (afterElement) {
                newIndex = cardElements.findIndex(child => child.dataset.truckId == afterElement.dataset.truckId);
            }
            
            // Insere na posição correta
            targetQueue.splice(newIndex, 0, truck);
            showToast(`Caminhão #${truck.cod} movido para a Fila ${successMessage}!`, 'info');
        } else {
             // Se o drop falhou em identificar o destino, o caminhão fica fora de todas as listas até a próxima atualização
             console.error(`Falha ao identificar o destino: ${targetQueueType}. Caminhão ${truckId} removido de todas as listas.`);
        }
        
        // 4. Re-renderiza para refletir o estado correto
        this.renderAllPanels(); 
    }
}