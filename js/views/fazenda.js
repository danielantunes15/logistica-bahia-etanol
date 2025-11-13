// js/views/descarga.js (MODIFICADO PARA FAZENDAS VIEW)
import { mapManager } from '../maps.js';
import { dataCache } from '../dataCache.js';
import { showLoading, hideLoading, handleOperation } from '../helpers.js';
import { formatDateTime } from '../timeUtils.js';

// Importa coordenadas da usina (do maps.js, mas definido aqui para clareza se maps.js não exportar)
const USINA_COORDS = [-17.642301, -40.181525];

export class FazendasView {
    constructor() {
        this.container = null;
        this.map = null;
        this.data = {};
        this.allFazendasData = []; // Armazena todas as fazendas para filtrar
        this.markersLayer = null; // Camada para os marcadores
        
        // Filtros da legenda (copiado do dashboard)
        this.activeFilters = { 
            usina: true, 
            ativa: true, 
            fazendo_cata: true, 
            inativa: true 
        };
        
        // Armazena referências dos listeners para remoção
        this._boundSearchHandler = this.handleSearch.bind(this);
        this._boundLegendClickHandler = this.handleLegendClick.bind(this);
    }

    async show() {
        await this.loadHTML();
        await this.initializeMap();
        await this.loadData();
        this.addEventListeners();
    }

    async hide() {
        // Remove listeners para evitar memory leaks
        if (this.container) {
            this.container.querySelector('#fazenda-search')?.removeEventListener('keyup', this._boundSearchHandler);
            this.container.querySelector('#fornecedor-search')?.removeEventListener('keyup', this._boundSearchHandler);
            this.container.querySelector('#map-legend')?.removeEventListener('click', this._boundLegendClickHandler);
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
        // Re-usando classes de dashboard.css para consistência
        return `
            <div id="fazendas-view" class="view active-view">
                <div class="dashboard-header" style="flex-wrap: wrap; gap: 15px;">
                    <h1>Mapa de Fazendas e Frentes</h1>
                    <div class="fazendas-filters">
                        <input type="text" id="fazenda-search" class="form-input" placeholder="Buscar Fazenda ou Frente..." style="width: 250px;">
                        <input type="text" id="fornecedor-search" class="form-input" placeholder="Buscar por Fornecedor..." style="width: 250px;">
                    </div>
                </div>
                <div class="map-fullscreen">
                    <div id="fazendas-map-container"></div>
                    ${this.renderLegend()}
                </div>
            </div>
        `;
    }
    
    // Copiado do dashboard.js para manter consistência
    renderLegend() {
         return `
            <div class="map-legend" id="map-legend"> <div class="legend-title">Legenda</div>
                <div class="legend-items">
                    <div class="legend-item ${this.activeFilters.usina ? '' : 'disabled'}" data-filter-key="usina"> <div class="legend-color usina"></div>
                        <span>Usina</span>
                    </div>
                    <div class="legend-item ${this.activeFilters.ativa ? '' : 'disabled'}" data-filter-key="ativa">
                        <div class="legend-color colhendo"></div>
                        <span>Colhendo</span>
                    </div>
                    <div class="legend-item ${this.activeFilters.fazendo_cata ? '' : 'disabled'}" data-filter-key="fazendo_cata">
                        <div class="legend-color fazendo_cata"></div>
                        <span>Cata</span>
                    </div>
                    <div class="legend-item ${this.activeFilters.inativa ? '' : 'disabled'}" data-filter-key="inativa">
                        <div class="legend-color atencao"></div>
                        <span>Frentes com Atenção</span>
                    </div>
                </div>
            </div>
        `;
    }

    async initializeMap() {
        this.map = mapManager.initMap('fazendas-map-container');
        if (this.map) {
            // Adiciona o marcador da Usina (lógica do maps.js/dashboard.js)
            const usinaIcon = L.divIcon({
                className: 'usina-marker',
                html: `<div class="marker-pin usina"><i class="ph-fill ph-factory"></i></div><div class="marker-pulse usina"></div>`,
                iconSize: [45, 45],
                iconAnchor: [22, 45]
            });
            L.marker(USINA_COORDS, { icon: usinaIcon }).addTo(this.map)
                .bindPopup('<b>Usina LOGISTICA BEL</b><br>Localização principal');
            
            // Inicializa a camada de marcadores
            this.markersLayer = L.layerGroup().addTo(this.map);
        }
    }

    async loadData(forceRefresh = false) {
        showLoading();
        try {
            // Usamos fetchAllData para ter todos os links (fazendas, frentes, fornecedores)
            this.data = await dataCache.fetchAllData(forceRefresh);
            // Prepara os dados agregados uma vez
            this.aggregateFazendaData();
            // Renderiza os marcadores
            this.renderMarkers();
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading();
        }
    }
    
    // Prepara o array `allFazendasData` com todas as informações linkadas
    aggregateFazendaData() {
        const { fazendas = [], frentes_servico = [] } = this.data;
        const fazendaDataMap = new Map();
        
        fazendas.forEach(f => {
             fazendaDataMap.set(f.id, {
                ...f,
                frenteStatus: null,
                frenteNome: 'N/A',
                // O 'fornecedores' já vem linkado de fetchAllData
                fornecedorNome: f.fornecedores?.nome || '' 
             });
        });

        // Linka o status da frente à fazenda
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
    
    // Renderiza marcadores baseado nos filtros atuais
    renderMarkers() {
        if (!this.map || !this.markersLayer) return;
        
        this.markersLayer.clearLayers(); // Limpa marcadores antigos
        
        const fazendaFilter = this.container.querySelector('#fazenda-search')?.value.toLowerCase() || '';
        const fornecedorFilter = this.container.querySelector('#fornecedor-search')?.value.toLowerCase() || '';

        // Filtra os dados agregados
        const filteredFazendas = this.allFazendasData.filter(f => {
            // 1. Filtro de Texto (Fazenda ou Frente)
            const matchesFazenda = fazendaFilter === '' ||
                f.nome.toLowerCase().includes(fazendaFilter) ||
                f.frenteNome.toLowerCase().includes(fazendaFilter);
            
            // 2. Filtro de Texto (Fornecedor)
            const matchesFornecedor = fornecedorFilter === '' ||
                f.fornecedorNome.toLowerCase().includes(fornecedorFilter);
            
            // 3. Filtro de Legenda (Status)
            const filterKey = f.frenteStatus || 'inativa';
            const matchesLegend = this.activeFilters[filterKey] !== false; // Inclui null/inativa

            return matchesFazenda && matchesFornecedor && matchesLegend;
        });

        // Renderiza os marcadores (lógica copiada/adaptada do dashboard.js)
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

                const customIcon = L.divIcon({
                    className: `fazenda-marker status-${iconClass}`,
                    html: `<div class="marker-pin" style="background-color: ${color}"><i class="ph-fill ph-tree-evergreen"></i></div><div class="marker-pulse" style="background-color: ${color}"></div>`,
                    iconSize: [40, 40],
                    iconAnchor: [20, 40]
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
            bounds.extend(USINA_COORDS); // Garante que a usina esteja visível
            this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
        } else if (fazendaFilter === '' && fornecedorFilter === '') {
            // Se nenhum filtro e nenhum marcador, apenas centraliza na usina
            this.map.setView(USINA_COORDS, 10);
        }
        // Se houver filtros, mas nenhum resultado, o mapa não mexe (mostra a última visão)
    }
    
    addEventListeners() {
        const fazendaSearch = this.container.querySelector('#fazenda-search');
        const fornecedorSearch = this.container.querySelector('#fornecedor-search');
        const legend = this.container.querySelector('#map-legend');

        if (fazendaSearch) {
            fazendaSearch.addEventListener('keyup', this._boundSearchHandler);
        }
        if (fornecedorSearch) {
            fornecedorSearch.addEventListener('keyup', this._boundSearchHandler);
        }
        if (legend) {
            legend.addEventListener('click', this._boundLegendClickHandler);
        }
    }
    
    // Handler para os inputs de pesquisa
    handleSearch() {
        this.renderMarkers();
    }
    
    // Handler para a legenda
    handleLegendClick(e) {
        const item = e.target.closest('.legend-item');
        const filterKey = item?.dataset.filterKey;
        if (filterKey && filterKey !== 'usina') {
            this.activeFilters[filterKey] = !this.activeFilters[filterKey];
            item.classList.toggle('disabled');
            this.renderMarkers(); // Re-renderiza marcadores com filtros
        }
    }
}