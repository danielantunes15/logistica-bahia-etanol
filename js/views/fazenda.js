// js/views/fazenda.js (MODIFICADO PARA CORRIGIR MAPA E REMOVER FRENTES)

import { initFazendaMap } from '../fazendaMap.js'; 
import { dataCache } from '../dataCache.js';
import { showLoading, hideLoading, handleOperation } from '../helpers.js';
import { formatDateTime } from '../timeUtils.js';

// Coordenadas da usina
const USINA_COORDS = [-17.642301, -40.181525];

export class FazendasView {
    constructor() {
        this.container = null;
        this.map = null; 
        this.data = {};
        this.allFazendasData = []; 
        this.markersLayer = null; 
        
        // Mantém a lógica de busca (keyup) e seleção (change)
        this._boundSearchHandler = this.handleSearch.bind(this);
    }

    async show() {
        await this.loadHTML();
        // O initializeMap agora também popula os filtros
        await this.initializeMap(); 
        await this.loadData();
        this.addEventListeners();
    }

    async hide() {
        if (this.container) {
            // Remove todos os listeners de filtro
            this.container.querySelector('#fazenda-search-nome')?.removeEventListener('keyup', this._boundSearchHandler);
            this.container.querySelector('#fazenda-search-codigo')?.removeEventListener('keyup', this._boundSearchHandler);
            this.container.querySelector('#fazenda-select-fornecedor')?.removeEventListener('change', this._boundSearchHandler);
            this.container.querySelector('#fazenda-select-fazenda')?.removeEventListener('change', this._boundSearchHandler);
        }
        
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
        // --- CORREÇÃO 1 (Layout) e CORREÇÃO 2 (Textos) ---
        // 1. Adicionado style flex-direction: column e height: 100% na view
        // 2. Título h1 e label de busca por nome alterados.
        // 3. Adicionado flex-shrink: 0 ao header.
        // 4. Adicionado flex-grow: 1 ao map-fullscreen e style 100% ao map-container.
        return `
            <div id="fazendas-view" class="view active-view" style="display: flex; flex-direction: column; height: 100%;">
                <div class="dashboard-header" style="flex-direction: column; align-items: flex-start; gap: 15px; flex-shrink: 0;">
                    <h1 style="margin: 0;">Mapa de Fazendas (Fornecedores)</h1>
                    
                    <div class="fazenda-filters-header">
                        <div class="filter-group">
                            <label for="fazenda-search-nome"><i class="ph-fill ph-magnifying-glass"></i> Nome da Fazenda</label>
                            <input type="text" id="fazenda-search-nome" class="form-input" placeholder="Buscar por nome...">
                        </div>
                        <div class="filter-group">
                            <label for="fazenda-search-codigo"><i class="ph-fill ph-hash"></i> Código (Fazenda)</label>
                            <input type="text" id="fazenda-search-codigo" class="form-input" placeholder="Buscar por código...">
                        </div>
                        <div class="filter-group">
                            <label for="fazenda-select-fornecedor"><i class="ph-fill ph-user-list"></i> Fornecedor</label>
                            <select id="fazenda-select-fornecedor" class="form-select">
                                <option value="">Todos os Fornecedores</option>
                                </select>
                        </div>
                        <div class="filter-group">
                            <label for="fazenda-select-fazenda"><i class="ph-fill ph-tree-evergreen"></i> Fazenda</label>
                            <select id="fazenda-select-fazenda" class="form-select">
                                <option value="">Todas as Fazendas</option>
                                </select>
                        </div>
                    </div>
                    </div>
                <div class="map-fullscreen" style="flex-grow: 1; position: relative; height: auto;">
                    <div id="fazendas-map-container" style="height: 100%; width: 100%;"></div>
                    </div>
            </div>
        `;
    }
    // --- FIM DAS CORREÇÕES DE HTML ---

    async initializeMap() {
        this.map = initFazendaMap('fazendas-map-container');
        
        if (this.map) {
            this.markersLayer = L.layerGroup().addTo(this.map);
            // Chama o populateFilters aqui para garantir que os elementos do HTML existam
            await this.populateFilters();
        }
    }

    async populateFilters() {
        // Busca os dados (do cache, se disponível)
        const data = await dataCache.fetchMasterDataOnly();
        
        const fornecedorSelect = this.container.querySelector('#fazenda-select-fornecedor');
        const fazendaSelect = this.container.querySelector('#fazenda-select-fazenda');

        if (data.fornecedores && fornecedorSelect) {
            data.fornecedores.forEach(f => {
                fornecedorSelect.innerHTML += `<option value="${f.id}">${f.nome}</option>`;
            });
        }

        if (data.fazendas && fazendaSelect) {
            data.fazendas.forEach(f => {
                fazendaSelect.innerHTML += `<option value="${f.id}">${f.nome} (${f.cod_equipamento})</option>`;
            });
        }
    }

    async loadData(forceRefresh = false) {
        showLoading();
        try {
            // fetchAllData é necessário para os links (frentes, fornecedores)
            this.data = await dataCache.fetchAllData(forceRefresh);
            this.aggregateFazendaData();
            this.renderMarkers();
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading();
        }
    }
    
    // --- CORREÇÃO 3 (Remoção da Lógica de Frentes) ---
    aggregateFazendaData() {
        const { fazendas = [] } = this.data; // Removido frentes_servico
        const fazendaDataMap = new Map();
        
        // Apenas mapeia as fazendas e seus fornecedores
        fazendas.forEach(f => {
             fazendaDataMap.set(f.id, {
                ...f, // Inclui f.id, f.cod_equipamento, f.fornecedor_id
                // Removeu frenteStatus e frenteNome
                fornecedorNome: f.fornecedores?.nome || '' 
             });
        });

        // O loop de frentes_servico foi removido.
        
        this.allFazendasData = Array.from(fazendaDataMap.values());
    }
    // --- FIM DA CORREÇÃO 3 ---
    
    // --- CORREÇÃO 4 (Atualização dos Marcadores) ---
    renderMarkers() {
        if (!this.map || !this.markersLayer) return;
        
        this.markersLayer.clearLayers(); 
        
        // Lê os 4 filtros
        const nomeFilter = this.container.querySelector('#fazenda-search-nome')?.value.toLowerCase() || '';
        const codigoFilter = this.container.querySelector('#fazenda-search-codigo')?.value.toLowerCase() || '';
        const fornecedorFilter = this.container.querySelector('#fazenda-select-fornecedor')?.value || '';
        const fazendaFilter = this.container.querySelector('#fazenda-select-fazenda')?.value || '';

        const filteredFazendas = this.allFazendasData.filter(f => {
            // Filtro de nome agora busca apenas no nome da fazenda
            const matchesNome = nomeFilter === '' ||
                f.nome.toLowerCase().includes(nomeFilter);
            
            const matchesCodigo = codigoFilter === '' ||
                (f.cod_equipamento && f.cod_equipamento.toLowerCase().includes(codigoFilter));

            const matchesFornecedor = fornecedorFilter === '' ||
                f.fornecedor_id == fornecedorFilter;
                
            const matchesFazenda = fazendaFilter === '' ||
                f.id == fazendaFilter;

            return matchesNome && matchesCodigo && matchesFornecedor && matchesFazenda;
        });

        const newMarkers = [];
        filteredFazendas.forEach(fazenda => {
            if (fazenda.latitude && fazenda.longitude) {
                const coords = [parseFloat(fazenda.latitude), parseFloat(fazenda.longitude)];
                
                // Lógica de cor removida. Cor estática para todas as fazendas.
                let color = '#2B6CB0'; // Azul (accent-edit)
                let iconClass = 'supplier-farm'; // Classe genérica

                // Ícone de Alfinete (sem pisca-pisca)
                const customIcon = L.divIcon({
                    className: `fazenda-view-marker status-${iconClass}`,
                    html: `<i class="ph-fill ph-map-pin fazenda-pin-icon" style="color: ${color};"></i>`,
                    iconSize: [48, 48],
                    iconAnchor: [24, 48] 
                });
                
                const marker = L.marker(coords, { icon: customIcon });
                
                // Popup simplificado, focado no fornecedor (como solicitado)
                const popupContent = `
                    <div class="fazenda-popup">
                        <h4>${fazenda.nome}</h4>
                        <div class="popup-details" style="margin-top: 10px;">
                            <p><strong>Fornecedor:</strong> <span class="value">${fazenda.fornecedores?.nome || 'N/A'}</span></p>
                            <p><strong>Código:</strong> <span class="value">${fazenda.cod_equipamento || 'N/A'}</span></p>
                            <p><strong>Coordenadas:</strong> <span class="value">${parseFloat(fazenda.latitude).toFixed(4)}, ${parseFloat(fazenda.longitude).toFixed(4)}</span></p>
                        </div>
                    </div>
                `;
                marker.bindPopup(popupContent);
                newMarkers.push(marker);
            }
        });
        
        if (newMarkers.length > 0) {
            newMarkers.forEach(m => this.markersLayer.addLayer(m));
            
            // Se um filtro específico de fazenda foi selecionado, centraliza nela
            if (fazendaFilter && newMarkers.length === 1) {
                 this.map.setView(newMarkers[0].getLatLng(), 14); // Zoom mais próximo
            } else {
                 const bounds = L.latLngBounds(newMarkers.map(m => m.getLatLng()));
                 bounds.extend(USINA_COORDS); 
                 this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
            }

        } else if (nomeFilter === '' && codigoFilter === '' && fornecedorFilter === '' && fazendaFilter === '') {
            // Se nenhum filtro e nenhum resultado, zoom na usina
            this.map.setView(USINA_COORDS, 10);
        }
        // Se houver filtros, mas nenhum resultado, não mexe no mapa
    }
    // --- FIM DA CORREÇÃO 4 ---
    
    addEventListeners() {
        const nomeInput = this.container.querySelector('#fazenda-search-nome');
        const codigoInput = this.container.querySelector('#fazenda-search-codigo');
        const fornecedorSelect = this.container.querySelector('#fazenda-select-fornecedor');
        const fazendaSelect = this.container.querySelector('#fazenda-select-fazenda');

        if (nomeInput) nomeInput.addEventListener('keyup', this._boundSearchHandler);
        if (codigoInput) codigoInput.addEventListener('keyup', this._boundSearchHandler);
        if (fornecedorSelect) fornecedorSelect.addEventListener('change', this._boundSearchHandler);
        if (fazendaSelect) fazendaSelect.addEventListener('change', this._boundSearchHandler);
    }
    
    handleSearch() {
        this.renderMarkers();
    }
}