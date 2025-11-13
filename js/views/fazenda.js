// js/views/fazenda.js (MODIFICADO PARA ISOLAMENTO)

// 1. REMOVE o mapManager
// import { mapManager } from '../maps.js'; 
// 2. ADICIONA o novo inicializador de mapa dedicado
import { initFazendaMap } from '../fazendaMap.js'; 

import { dataCache } from '../dataCache.js';
import { showLoading, hideLoading, handleOperation } from '../helpers.js';
import { formatDateTime } from '../timeUtils.js';

// Coordenadas da usina (importadas localmente para cálculo de bounds)
const USINA_COORDS = [-17.642301, -40.181525];

export class FazendasView {
    constructor() {
        this.container = null;
        this.map = null; // Mapa agora é local da view
        this.data = {};
        this.allFazendasData = []; 
        this.markersLayer = null; 
        
        // REMOVIDO: Filtros da legenda não são mais necessários
        
        this._boundSearchHandler = this.handleSearch.bind(this);
        // REMOVIDO: Handler da legenda
    }

    async show() {
        await this.loadHTML();
        await this.initializeMap(); // Chama o novo inicializador
        await this.loadData();
        this.addEventListeners();
    }

    async hide() {
        if (this.container) {
            this.container.querySelector('#fazenda-search')?.removeEventListener('keyup', this._boundSearchHandler);
            this.container.querySelector('#fornecedor-search')?.removeEventListener('keyup', this._boundSearchHandler);
            // REMOVIDO: Listener da legenda
        }
        
        // Limpa o mapa local
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
        this.markersLayer = null;
        this.allFazendasData = [];
    }

    async loadHTML() {
        const container = document.getElementById('views-container');
        container.innerHTML = this.getHTML();
        this.container = container.querySelector('#fazendas-view');
    }

    getHTML() {
        // HTML com o painel lateral de pesquisa
        return `
            <div id="fazendas-view" class="view active-view">
                <div class="dashboard-header" style="flex-wrap: wrap; gap: 15px;">
                    <h1>Mapa de Fazendas e Frentes</h1>
                </div>
                <div class="map-fullscreen">
                    
                    <div class="fazenda-view-controls">
                        <div class="fazenda-search-header">
                            <i class="ph-fill ph-magnifying-glass"></i>
                            <span>Filtrar Locais</span>
                        </div>
                        <div class="fazenda-filters-body">
                            <input type="text" id="fazenda-search" class="form-input" placeholder="Buscar Fazenda ou Frente...">
                            <input type="text" id="fornecedor-search" class="form-input" placeholder="Buscar por Fornecedor...">
                        </div>
                    </div>

                    <div id="fazendas-map-container"></div>
                    
                    </div>
            </div>
        `;
    }
    
    // FUNÇÃO renderLegend() REMOVIDA

    async initializeMap() {
        // CHAMA A FUNÇÃO DE INICIALIZAÇÃO ISOLADA
        this.map = initFazendaMap('fazendas-map-container');
        
        if (this.map) {
            // A Usina já é adicionada pelo initFazendaMap
            
            // Inicializa a camada de marcadores local
            this.markersLayer = L.layerGroup().addTo(this.map);
        }
    }

    async loadData(forceRefresh = false) {
        showLoading();
        try {
            this.data = await dataCache.fetchAllData(forceRefresh);
            this.aggregateFazendaData();
            this.renderMarkers();
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading();
        }
    }
    
    aggregateFazendaData() {
        const { fazendas = [], frentes_servico = [] } = this.data;
        const fazendaDataMap = new Map();
        
        fazendas.forEach(f => {
             fazendaDataMap.set(f.id, {
                ...f,
                frenteStatus: null,
                frenteNome: 'N/A',
                fornecedorNome: f.fornecedores?.nome || '' 
             });
        });

        frentes_servico.filter(f => f.fazenda_id && (f.status === 'ativa' || f.status === 'fazendo_cata' || f.status === 'inativa'))
                       .forEach(frente => {
                           if (fazendaDataMap.has(frente.fazenda_id)) {
                               const data = fazendaDataMap.get(frente.fazenda_id);
                               data.frenteStatus = frente.status;
                               data.frenteNome = frente.nome || 'N/A';
                           }
                       });
        
        this.allFazendasData = Array.from(fazendaDataMap.values());
    }
    
    renderMarkers() {
        if (!this.map || !this.markersLayer) return;
        
        this.markersLayer.clearLayers(); 
        
        const fazendaFilter = this.container.querySelector('#fazenda-search')?.value.toLowerCase() || '';
        const fornecedorFilter = this.container.querySelector('#fornecedor-search')?.value.toLowerCase() || '';

        const filteredFazendas = this.allFazendasData.filter(f => {
            const matchesFazenda = fazendaFilter === '' ||
                f.nome.toLowerCase().includes(fazendaFilter) ||
                f.frenteNome.toLowerCase().includes(fazendaFilter);
            
            const matchesFornecedor = fornecedorFilter === '' ||
                f.fornecedorNome.toLowerCase().includes(fornecedorFilter);
            
            // FILTRO DE LEGENDA REMOVIDO
            return matchesFazenda && matchesFornecedor;
        });

        const newMarkers = [];
        filteredFazendas.forEach(fazenda => {
            if (fazenda.latitude && fazenda.longitude) {
                const coords = [parseFloat(fazenda.latitude), parseFloat(fazenda.longitude)];
                let color, statusLabel, iconClass = fazenda.frenteStatus;
                
                switch(fazenda.frenteStatus) {
                    case 'ativa': color = '#38A169'; statusLabel = 'Colhendo'; break;
                    case 'fazendo_cata': color = '#ED8936'; statusLabel = 'Fazendo Cata'; break;
                    case 'inativa': color = '#C53030'; statusLabel = 'Com Atenção'; break;
                    default: color = '#718096'; statusLabel = 'Sem Frente Ativa'; iconClass = 'inativa'; break;
                }

                // --- ÍCONE SEM O PISCA-PISCA (PULSE) ---
                const customIcon = L.divIcon({
                    className: `fazenda-view-marker status-${iconClass}`,
                    // HTML agora contém APENAS o ícone do pino
                    html: `<i class="ph-fill ph-map-pin fazenda-pin-icon" style="color: ${color};"></i>`,
                    iconSize: [48, 48],
                    iconAnchor: [24, 48] // Ponta inferior do pino
                });
                
                const marker = L.marker(coords, { icon: customIcon });
                
                const popupContent = `
                    <div class="fazenda-popup">
                        <h4>${fazenda.nome}</h4>
                        <div class="popup-status ${iconClass}">
                            <i class="ph-fill ph-circle"></i>
                            ${statusLabel}
                        </div>
                        <div class="popup-details">
                            <p><strong>Frente:</strong> <span class="value">${fazenda.frenteStatus ? fazenda.frenteNome : 'Nenhuma'}</span></p>
                            <p><strong>Fornecedor:</strong> <span class="value">${fazenda.fornecedores?.nome || 'N/A'}</span></p>
                            <p><strong>Código:</strong> <span class="value">${fazenda.cod_equipamento || 'N/A'}</span></p>
                        </div>
                    </div>
                `;
                marker.bindPopup(popupContent);
                newMarkers.push(marker);
            }
        });
        
        if (newMarkers.length > 0) {
            newMarkers.forEach(m => this.markersLayer.addLayer(m));
            const bounds = L.latLngBounds(newMarkers.map(m => m.getLatLng()));
            bounds.extend(USINA_COORDS); 
            this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
        } else if (fazendaFilter === '' && fornecedorFilter === '') {
            this.map.setView(USINA_COORDS, 10);
        }
    }
    
    addEventListeners() {
        const fazendaSearch = this.container.querySelector('#fazenda-search');
        const fornecedorSearch = this.container.querySelector('#fornecedor-search');
        // REMOVIDO: Listener da legenda

        if (fazendaSearch) {
            fazendaSearch.addEventListener('keyup', this._boundSearchHandler);
        }
        if (fornecedorSearch) {
            fornecedorSearch.addEventListener('keyup', this._boundSearchHandler);
        }
    }
    
    handleSearch() {
        this.renderMarkers();
    }
    
    // FUNÇÃO handleLegendClick() REMOVIDA
}