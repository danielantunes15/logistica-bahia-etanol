// js/views/fazenda.js (MODIFICADO PARA NOVOS FILTROS NO HEADER)

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
        // HTML com os filtros movidos para o header
        return `
            <div id="fazendas-view" class="view active-view">
                <div class="dashboard-header" style="flex-direction: column; align-items: flex-start; gap: 15px;">
                    <h1 style="margin: 0;">Mapa de Fazendas e Frentes</h1>
                    
                    <div class="fazenda-filters-header">
                        <div class="filter-group">
                            <label for="fazenda-search-nome"><i class="ph-fill ph-magnifying-glass"></i> Nome (Fazenda/Frente)</label>
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
                <div class="map-fullscreen">
                    <div id="fazendas-map-container"></div>
                    </div>
            </div>
        `;
    }

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
    
    aggregateFazendaData() {
        const { fazendas = [], frentes_servico = [] } = this.data;
        const fazendaDataMap = new Map();
        
        fazendas.forEach(f => {
             fazendaDataMap.set(f.id, {
                ...f, // Inclui f.id, f.cod_equipamento, f.fornecedor_id
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
        
        // Lê os 4 filtros
        const nomeFilter = this.container.querySelector('#fazenda-search-nome')?.value.toLowerCase() || '';
        const codigoFilter = this.container.querySelector('#fazenda-search-codigo')?.value.toLowerCase() || '';
        const fornecedorFilter = this.container.querySelector('#fazenda-select-fornecedor')?.value || '';
        const fazendaFilter = this.container.querySelector('#fazenda-select-fazenda')?.value || '';

        const filteredFazendas = this.allFazendasData.filter(f => {
            // Aplica os 4 filtros
            const matchesNome = nomeFilter === '' ||
                f.nome.toLowerCase().includes(nomeFilter) ||
                f.frenteNome.toLowerCase().includes(nomeFilter);
            
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
                let color, statusLabel, iconClass = fazenda.frenteStatus;
                
                switch(fazenda.frenteStatus) {
                    case 'ativa': color = '#38A169'; statusLabel = 'Colhendo'; break;
                    case 'fazendo_cata': color = '#ED8936'; statusLabel = 'Fazendo Cata'; break;
                    case 'inativa': color = '#C53030'; statusLabel = 'Com Atenção'; break;
                    default: color = '#718096'; statusLabel = 'Sem Frente Ativa'; iconClass = 'inativa'; break;
                }

                // Ícone de Alfinete (sem pisca-pisca)
                const customIcon = L.divIcon({
                    className: `fazenda-view-marker status-${iconClass}`,
                    html: `<i class="ph-fill ph-map-pin fazenda-pin-icon" style="color: ${color};"></i>`,
                    iconSize: [48, 48],
                    iconAnchor: [24, 48] 
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