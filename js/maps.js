// js/maps.js
const USINA_COORDS = [-17.642301, -40.181525];
const INITIAL_ZOOM = 10; // AJUSTADO: Zoom inicial mais distante

export class MapManager {
    constructor() {
        this.maps = new Map();
        this.markers = new Map();
    }

    initMap(containerId, center = USINA_COORDS, zoom = INITIAL_ZOOM) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container ${containerId} não encontrado`);
            return null;
        }

        // Remover mapa existente se houver
        if (this.maps.has(containerId)) {
            this.maps.get(containerId).remove();
        }

        try {
            const map = L.map(containerId).setView(center, zoom);
            
            // Camada do Google Satellite
            L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
                maxZoom: 20,
                subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                attribution: '&copy; Google'
            }).addTo(map);

            this.maps.set(containerId, map);
            return map;
        } catch (error) {
            console.error(`Erro ao inicializar mapa ${containerId}:`, error);
            return null;
        }
    }

    initDashboardMap() {
        const map = this.initMap('dashboard-map');
        if (map) {
            // AUMENTADO o iconSize para o marcador da usina
            const usinaIcon = L.divIcon({
                className: 'usina-marker',
                html: `
                    <div class="marker-pin usina">
                        <i class="ph-fill ph-factory"></i>
                    </div>
                    <div class="marker-pulse usina"></div>
                `,
                iconSize: [45, 45], // AUMENTADO
                iconAnchor: [22, 22] // Ajuste da âncora
            });
            
            L.marker(USINA_COORDS, { icon: usinaIcon }).addTo(map)
                .bindPopup('<b>Usina LOGISTICA BEL</b><br>Localização principal');
        }
        return map;
    }

    initCadastroMap(onLocationSelect) {
        const map = this.initMap('map-cadastro-medio');
        
        if (map && onLocationSelect) {
            let marker = null;
            
            map.on('click', function(e) {
                const { lat, lng } = e.latlng;
                
                // Atualizar campos do formulário
                const latInput = document.getElementById('latitude');
                const lngInput = document.getElementById('longitude');
                
                if (latInput) latInput.value = lat.toFixed(6);
                if (lngInput) lngInput.value = lng.toFixed(6);
                
                // Atualizar ou criar marcador
                if (marker) {
                    marker.setLatLng(e.latlng);
                } else {
                    marker = L.marker(e.latlng).addTo(map);
                }
                
                marker.bindPopup(`<b>Localização Selecionada:</b><br>${lat.toFixed(4)}, ${lng.toFixed(4)}`)
                      .openPopup();
                
                // Chamar callback se fornecida
                onLocationSelect(lat, lng);
            });
        }
        
        return map;
    }

    initEditMap(containerId, initialLat, initialLng, onLocationSelect) {
        const initialCoords = initialLat && initialLng ? [initialLat, initialLng] : USINA_COORDS;
        const map = this.initMap(containerId, initialCoords);
        
        if (map) {
            // Adicionar marcador inicial se coordenadas existirem
            if (initialLat && initialLng) {
                const marker = L.marker(initialCoords).addTo(map)
                    .bindPopup(`<b>Localização Atual:</b><br>${initialLat}, ${initialLng}`)
                    .openPopup();
                
                this.markers.set(containerId, marker);
            }
            
            if (onLocationSelect) {
                map.on('click', function(e) {
                    const { lat, lng } = e.latlng;
                    
                    // Atualizar campos do formulário de edição
                    const latInput = document.getElementById('edit-latitude');
                    const lngInput = document.getElementById('edit-longitude');
                    
                    if (latInput) latInput.value = lat.toFixed(6);
                    if (lngInput) lngInput.value = lng.toFixed(6);
                    
                    // Atualizar marcador
                    let marker = this.markers.get(containerId);
                    if (marker) {
                        marker.setLatLng(e.latlng);
                    } else {
                        marker = L.marker(e.latlng).addTo(map);
                        this.markers.set(containerId, marker);
                    }
                    
                    marker.bindPopup(`<b>Nova Localização:</b><br>${lat.toFixed(4)}, ${lng.toFixed(4)}`)
                          .openPopup();
                    
                    onLocationSelect(lat, lng);
                }.bind(this));
            }
        }
        
        return map;
    }

    addMarker(mapId, coords, popupText = '') {
        const map = this.maps.get(mapId);
        if (!map) return null;
        
        const marker = L.marker(coords).addTo(map);
        if (popupText) {
            marker.bindPopup(popupText);
        }
        
        return marker;
    }

    updateFazendaMarkers(fazendas) {
        const map = this.maps.get('dashboard-map');
        if (!map) return;
        
        // Limpar marcadores existentes de fazendas
        this.clearMarkers('dashboard-fazendas');
        
        // Adicionar marcadores para cada fazenda
        fazendas.forEach(fazenda => {
            if (fazenda.latitude && fazenda.longitude) {
                const coords = [parseFloat(fazenda.latitude), parseFloat(fazenda.longitude)];
                const popupText = `
                    <b>${fazenda.nome}</b><br>
                    Status: ${fazenda.status}<br>
                    Hectares: ${fazenda.hectares || 'N/A'}<br>
                    Fornecedor: ${fazenda.fornecedores?.nome || 'N/A'}
                `;
                
                const marker = this.addMarker('dashboard-map', coords, popupText);
                if (marker) {
                    if (!this.markers.has('dashboard-fazendas')) {
                        this.markers.set('dashboard-fazendas', []);
                    }
                    this.markers.get('dashboard-fazendas').push(marker);
                }
            }
        });
    }

    /**
     * CORRIGIDO: Recebe fazendas com dados agregados (frenteStatus, trucksInRoute, activeEquipment, frenteNome)
     * MUDANÇA: Recebe activeFilters e exibe cycleTime no popup
     */
    updateFazendaMarkersWithStatus(fazendas, activeFilters = {}) {
        const map = this.maps.get('dashboard-map');
        if (!map) return;
        
        // Limpar marcadores existentes de fazendas
        this.clearMarkers('dashboard-fazendas');
        
        // Adicionar marcadores para cada fazenda com cores diferentes
        fazendas.forEach(fazenda => {
            if (fazenda.latitude && fazenda.longitude) {
                
                // MUDANÇA: Lógica de filtragem
                const filterKey = fazenda.frenteStatus || 'inativa'; 
                if (activeFilters[filterKey] === false) {
                     return; // Pula este marcador se o filtro estiver desativado
                }
                
                const coords = [parseFloat(fazenda.latitude), parseFloat(fazenda.longitude)];
                
                // Definir cor baseada no status da FRENTE (ativa/fazendo_cata/inativa)
                let color;
                let statusLabel;
                let iconClass = fazenda.frenteStatus;
                
                switch(fazenda.frenteStatus) {
                    case 'ativa':
                        color = '#38A169'; // Verde (Colhendo)
                        statusLabel = 'Colhendo';
                        break;
                    case 'fazendo_cata':
                        color = '#ED8936'; // Laranja para Cata
                        statusLabel = 'Fazendo Cata';
                        break;
                    case 'inativa':
                        // MUDANÇA DE COR: Vermelho (cor da variável CSS --accent-danger)
                        color = '#C53030'; // Vermelho para Frentes com Atenção
                        statusLabel = 'Com Atenção';
                        break;
                    default:
                        // Se houver status inesperado, usa cinza como fallback
                        color = '#718096'; 
                        statusLabel = 'N/A';
                }
                
                // Criar ícone personalizado
                const customIcon = L.divIcon({
                    className: `fazenda-marker status-${iconClass}`, 
                    html: `
                        <div class="marker-pin" style="background-color: ${color}">
                            <i class="ph-fill ph-tree-evergreen"></i>
                        </div>
                        <div class="marker-pulse" style="background-color: ${color}"></div>
                    `,
                    iconSize: [40, 40], // AUMENTADO
                    iconAnchor: [20, 20]
                });
                
                const marker = L.marker(coords, { icon: customIcon }).addTo(map);
                
                // MUDANÇA: CONTEÚDO DO POPUP MELHORADO (Adiciona Tempo de Ciclo)
                const popupContent = `
                    <div class="fazenda-popup">
                        <h4>${fazenda.nome}</h4>
                        <div class="popup-status ${iconClass}">
                            <i class="ph-fill ph-circle"></i>
                            ${statusLabel}
                        </div>
                        <div class="popup-details">
                            <p><strong>Frente Ativa:</strong> <span class="value">${fazenda.frenteNome}</span></p>
                            <p><strong>Tempo Médio de Ciclo:</strong> <span class="value" style="color: var(--accent-edit);">${fazenda.cycleTime || 'N/A'}</span></p>
                            <p><strong>Caminhões em Rota:</strong> <span class="value" style="color: ${fazenda.trucksInRoute > 0 ? color : 'var(--text-secondary)'};">${fazenda.trucksInRoute}</span></p>
                            <p><strong>Equipamentos Ativos:</strong> <span class="value" style="color: ${fazenda.activeEquipment > 0 ? color : 'var(--text-secondary)'};">${fazenda.activeEquipment}</span></p>
                        </div>
                        
                        <div class="popup-actions">
                            <button class="btn-primary btn-action-map" data-action="goToControle" data-frente-id="${fazenda.frente_id}" title="Gerenciar Frente no Painel de Controle">
                                <i class="ph-fill ph-arrows-clockwise"></i> Gerenciar Frente
                            </button>
                        </div>
                    </div>
                `;
                
                marker.bindPopup(popupContent);
                
                // Adicionar um listener para o botão de Ação no POPUP
                marker.on('popupopen', () => {
                    const btn = document.querySelector(`.fazenda-marker.status-${iconClass} .btn-action-map`);
                    if (btn) {
                        btn.addEventListener('click', (e) => {
                            // Disparar evento para o ViewManager
                            window.dispatchEvent(new CustomEvent('viewChanged', { 
                                detail: { 
                                    view: 'controle', 
                                    frenteId: e.target.dataset.frenteId 
                                } 
                            }));
                        });
                    }
                });
                
                if (!this.markers.has('dashboard-fazendas')) {
                    this.markers.set('dashboard-fazendas', []);
                }
                this.markers.get('dashboard-fazendas').push(marker);
            }
        });
    }

    clearMarkers(key) {
        const markers = this.markers.get(key);
        if (markers) {
            markers.forEach(marker => marker.remove());
            this.markers.set(key, []);
        }
    }

    invalidateSize(mapId) {
        const map = this.maps.get(mapId);
        if (map) {
            setTimeout(() => {
                map.invalidateSize();
            }, 100);
        }
    }
}

// Instância global do gerenciador de mapas
export const mapManager = new MapManager();