// js/views/filaEstacionamento.js

import { fetchAllData, fetchFila, updateFilaCarregamento } from '../api.js';
import { showToast, handleOperation, showLoading, hideLoading } from '../helpers.js'; // Funções gerais
import { formatDateTime } from '../timeUtils.js'; // IMPORTAÇÃO CORRIGIDA
import { dataCache } from '../dataCache.js';

// Status que indicam que o caminhão está no estacionamento
const ESTACIONAMENTO_STATUS = ['disponivel', 'patio_vazio'];

export class FilaEstacionamentoView {
    constructor() {
        this.container = null;
        this.data = {};
        this.availableTrucks = []; 
        this.manualQueue = [];
        this.mechanizedQueue = [];
        this.agroUnioneQueue = []; // NOVO: Fila Agro Unione
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

                        <div class="fila-queue-panel">
                            <h2>Agro Unione - Fila de Carregamento</h2>
                            <div id="queue-agro-unione-list" class="truck-list queue-list drop-target" data-queue-type="agro_unione">
                                </div>
                            <p class="queue-status-hint">Arraste os caminhões para ordenar a fila de carregamento Agro Unione.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async loadData(forceRefresh = false) {
        showLoading();
        try {
            this.data = await dataCache.fetchAllData(forceRefresh); // USANDO CACHE AQUI
            // 1. Busca os dados de persistência da fila
            const filaPersistida = await fetchFila();
            this.prepareAvailableTrucks(filaPersistida);
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading();
        }
    }

    prepareAvailableTrucks(filaPersistida = []) {
        const { caminhoes = [], caminhao_historico = [] } = this.data;
        const historyMap = new Map();
        const caminhaoMap = new Map(caminhoes.map(c => [c.id, c]));
        
        caminhao_historico.sort((a, b) => new Date(b.timestamp_mudanca) - new Date(a.timestamp_mudanca));
        
        for (const log of caminhao_historico) {
            if (ESTACIONAMENTO_STATUS.includes(log.status_novo) && !historyMap.has(log.caminhao_id)) {
                historyMap.set(log.caminhao_id, log.timestamp_mudanca);
            }
        }
        
        // Mapeia a fila persistida para fácil lookup
        const filaMap = new Map(filaPersistida.map(item => [item.caminhao_id, item]));
        // A ordem já está correta, pois é ordenada na função fetchFila
        const filaOrdenada = filaPersistida; 

        // Inicializa as filas
        this.manualQueue = [];
        this.mechanizedQueue = [];
        this.agroUnioneQueue = []; // NOVO
        this.availableTrucks = [];

        // 1. Preenche as filas com base na persistência
        filaOrdenada.forEach(item => {
            const caminhao = caminhaoMap.get(item.caminhao_id);
            // Só adiciona se o caminhão existir e não estiver quebrado
            if (caminhao && caminhao.status !== 'quebrado') {
                 const truckObject = {
                    id: caminhao.id,
                    cod: caminhao.cod_equipamento,
                    status: caminhao.status,
                    entryTime: historyMap.get(caminhao.id) || caminhao.created_at,
                };

                if (item.tipo_fila === 'manual') {
                    this.manualQueue.push(truckObject);
                } else if (item.tipo_fila === 'mecanizada') {
                    this.mechanizedQueue.push(truckObject);
                } else if (item.tipo_fila === 'agro_unione') { // NOVO
                    this.agroUnioneQueue.push(truckObject);
                } else if (item.tipo_fila === 'disponivel_ordenado') {
                    this.availableTrucks.push(truckObject);
                }
            }
        });
        
        // 2. Adiciona caminhões recém-disponíveis (que não estão em nenhuma fila persistida)
        const recemDisponiveis = caminhoes
            .filter(c => ESTACIONAMENTO_STATUS.includes(c.status) && c.status !== 'quebrado' && !filaMap.has(c.id))
            .map(c => ({
                id: c.id,
                cod: c.cod_equipamento,
                status: c.status,
                entryTime: historyMap.get(c.id) || c.created_at,
            }))
            .sort((a, b) => new Date(a.entryTime) - new Date(b.entryTime)); // Ordena por tempo de entrada
            
        // Adiciona ao final da lista de disponíveis (mantendo a ordem salva primeiro)
        this.availableTrucks.push(...recemDisponiveis);
            
        this.renderAllPanels();
    }

    renderAllPanels() {
        // CORREÇÃO: Remove a filtragem redundante. A lista this.availableTrucks é renderizada diretamente.
        this.renderList('disponiveis-list', this.availableTrucks, true, false); 
        this.renderList('queue-manual-list', this.manualQueue, true, true);
        this.renderList('queue-mechanized-list', this.mechanizedQueue, true, true);
        this.renderList('queue-agro-unione-list', this.agroUnioneQueue, true, true); // NOVO
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

        document.getElementById('refresh-fila').addEventListener('click', () => this.loadData(true)); // Força refresh
        
        let draggedItem = null;

        // --- DRAG START: Captura o item sendo arrastado ---
        container.addEventListener('dragstart', (e) => {
            const card = e.target.closest('.truck-card');
            if (card && card.getAttribute('draggable') === 'true') {
                draggedItem = card;
                e.dataTransfer.setData('text/plain', card.dataset.truckId);
                e.dataTransfer.setData('source-queue', card.closest('.drop-target').dataset.queueType);
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
                
                const afterElement = this.getDragAfterElement(list, e.clientY);
                let placeholder = document.getElementById('drag-placeholder');
                
                if (!placeholder) {
                    placeholder = document.createElement('div');
                    placeholder.id = 'drag-placeholder';
                    placeholder.className = 'truck-card drag-placeholder';
                    placeholder.innerHTML = 'Solte para inserir/reordenar';
                    placeholder.style.height = `${draggable.offsetHeight}px`;
                }

                if (!list.contains(placeholder)) {
                    // Remove placeholder de qualquer outro lugar antes de inserir
                    document.getElementById('drag-placeholder')?.remove();
                    
                    // Adiciona o placeholder na posição correta
                    if (afterElement == null) {
                        list.appendChild(placeholder);
                    } else {
                        list.insertBefore(placeholder, afterElement);
                    }
                }
            });
            
            target.addEventListener('dragleave', (e) => {
                 // Remove o placeholder se o mouse sair da área do target (e não estiver entrando em um filho)
                 if (!e.currentTarget.contains(e.relatedTarget)) {
                    const placeholder = document.getElementById('drag-placeholder');
                    if (placeholder) placeholder.remove();
                }
            });

            target.addEventListener('drop', (e) => {
                e.preventDefault();
                const truckId = e.dataTransfer.getData('text/plain');
                const targetQueue = target.closest('.drop-target').dataset.queueType;
                
                const placeholder = document.getElementById('drag-placeholder');
                // Calcula o índice de inserção *antes* de remover o placeholder
                let insertIndex = -1;
                if (placeholder) {
                    insertIndex = Array.from(target.children).indexOf(placeholder);
                    placeholder.remove();
                }
                
                if (truckId) {
                    // Passa truckId como string (UUID)
                    this.handleDrop(truckId, targetQueue, insertIndex); 
                } else {
                    console.error('ERRO DROP: truckId não encontrado no dataTransfer.');
                }
            });
        });
    }

    // Função auxiliar para encontrar o elemento após o qual o arrastado deve ser inserido
    getDragAfterElement(container, y) {
        // Filtra o item sendo arrastado e o placeholder
        const draggableElements = [...container.querySelectorAll('.truck-card:not(.dragging):not(.drag-placeholder)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            // Calcula o ponto central vertical do elemento
            const offset = y - box.top - box.height / 2;
            // Se o offset for negativo e o mais próximo de zero, é o elemento "depois"
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
    
    // Lógica para manipular o drop e atualizar as filas (estrutura de dados)
    async handleDrop(truckId, targetQueueType, insertIndex) {
        
        // 1. Encontra e remove o caminhão de todas as listas (available, manual, mechanized, agro unione)
        let truck = this.availableTrucks.find(c => c.id == truckId) ||
                    this.manualQueue.find(c => c.id == truckId) || 
                    this.mechanizedQueue.find(c => c.id == truckId) ||
                    this.agroUnioneQueue.find(c => c.id == truckId); // NOVO
        
        if (!truck) {
             console.error(`ERRO HANDLE DROP: Caminhão com ID ${truckId} não encontrado em nenhuma lista.`);
             return;
        }
        
        showLoading();

        // Remove de onde estiver
        this.availableTrucks = this.availableTrucks.filter(c => c.id != truckId);
        this.manualQueue = this.manualQueue.filter(c => c.id != truckId);
        this.mechanizedQueue = this.mechanizedQueue.filter(c => c.id != truckId);
        this.agroUnioneQueue = this.agroUnioneQueue.filter(c => c.id != truckId); // NOVO
        
        const normalizedTargetType = targetQueueType.toLowerCase().trim();
        
        let targetQueue = null;
        let successMessage = '';

        if (normalizedTargetType === 'manual') {
            targetQueue = this.manualQueue;
            successMessage = 'Manual';
        } else if (normalizedTargetType === 'mecanizada') {
            targetQueue = this.mechanizedQueue;
            successMessage = 'Mecanizada';
        } else if (normalizedTargetType === 'agro_unione') { // NOVO
            targetQueue = this.agroUnioneQueue;
            successMessage = 'Agro Unione';
        } else if (normalizedTargetType === 'disponivel') {
             // Caso de retorno para o pool de disponíveis (agora ordenável)
             targetQueue = this.availableTrucks; 
             successMessage = 'Disponíveis no Pátio';
        }
        
        // 2. Adiciona o caminhão na fila correta (manual, mecanizada ou disponível)
        if (targetQueue) { 
            // O índice de inserção é baseado na posição do placeholder.
            const newIndex = insertIndex >= 0 ? insertIndex : targetQueue.length;
            
            // Insere na posição correta
            targetQueue.splice(newIndex, 0, truck);
            showToast(`Caminhão #${truck.cod} movido para a Fila ${successMessage}!`, 'success');
        } else {
             // Se o drop falhou em identificar o destino
             console.error(`ERRO HANDLE DROP: Falha ao identificar o destino: ${targetQueueType}. Caminhão ${truckId} removido de todas as listas.`);
             hideLoading();
             return;
        }
        
        // 3. Persiste o novo estado das filas
        await this.persistFila();
        
        // 4. Re-renderiza para refletir o estado correto e oculta o loading
        this.renderAllPanels(); 
        hideLoading();
    }
    
    /**
     * Mapeia todas as filas e envia o estado completo para o Supabase.
     */
    async persistFila() {
        const filasParaPersistir = [];
        
        // Mapeia fila manual
        this.manualQueue.forEach((truck, index) => {
            filasParaPersistir.push({
                caminhao_id: truck.id,
                tipo_fila: 'manual',
                ordem: index
            });
        });
        
        // Mapeia fila mecanizada
        this.mechanizedQueue.forEach((truck, index) => {
            filasParaPersistir.push({
                caminhao_id: truck.id,
                tipo_fila: 'mecanizada',
                ordem: index
            });
        });

        // Mapeia fila Agro Unione (NOVO)
        this.agroUnioneQueue.forEach((truck, index) => {
            filasParaPersistir.push({
                caminhao_id: truck.id,
                tipo_fila: 'agro_unione',
                ordem: index
            });
        });
        
        // Mapeia lista de disponíveis (para manter a ordem)
        this.availableTrucks.forEach((truck, index) => {
            filasParaPersistir.push({
                caminhao_id: truck.id,
                tipo_fila: 'disponivel_ordenado',
                ordem: index
            });
        });
        
        try {
            await updateFilaCarregamento(filasParaPersistir);
            
            // Invalida o Cache (NOVO)
            dataCache.invalidateAllData();
            
        } catch (error) {
            showToast('Erro ao salvar a ordem da fila: ' + error.message, 'error');
            console.error(error);
        }
    }
}