// ATENÇÃO: SUBSTITUA ESTA CHAVE PELA SUA CHAVE REAL DO OPENROUTESERVICE!
const apiKey = '5b3ce3597851110001cf62483696e0fcc1fc4afca08cce34650de536'; 

const usina = L.latLng(-17.641420744167522, -40.1809160094857); 

const farms = [{ name: 'Usina Principal', code: 'USI', latlng: usina }];
const trucks = [];
let isPaused = false;
let nextTruckId = 1; 
let nextFarmId = 1; 

// Estado para o cadastro interativo
const interactiveCadastroState = {
    marker: null,
    polyline: null,
    farmLatlng: null,
    routeCoords: null, 
    active: false,
    alternativeRoutes: [], 
    selectedRouteIndex: -1,
};

// --- Configuração Central de Status ---
const STATUS_CONFIG = {
    'sentidoCarregamento': { label: 'Indo p/ Carregamento', color: '#00a8ff', icon: 'fa-truck-moving', routeColor: '#00a8ff', dashboardKey: 'sentidoCarregamento' },
    'carregando': { label: 'Em Carregamento', color: '#f9ca24', icon: 'fa-tractor', routeColor: '#f9ca24', dashboardKey: 'carregando' },
    'sentidoUsina': { label: 'Retornando p/ Usina', color: '#2ecc71', icon: 'fa-truck-ramp-box', routeColor: '#2ecc71', dashboardKey: 'sentidoUsina' },
    'quebrado': { label: 'QUEBRADO', color: '#e74c3c', icon: 'fa-truck-medical', routeColor: '#e74c3c', dashboardKey: 'quebrado' },
    'descarregandoUsina': { label: 'Descarregando na Usina', color: '#b2bec3', icon: 'fa-dumpster', routeColor: '#b2bec3', dashboardKey: 'descarregandoUsina' }, 
    'parado': { label: 'Parado', color: '#7f8fa6', icon: 'fa-truck-front', routeColor: '#7f8fa6', dashboardKey: 'parado' },
    'chegouUsina': { label: 'Chegou (Usina)', color: '#b2bec3', icon: 'fa-dumpster', routeColor: '#b2bec3', dashboardKey: 'descarregandoUsina' },
    'chegouFazenda': { label: 'Chegou (Fazenda)', color: '#f9ca24', icon: 'fa-tractor', routeColor: '#f9ca24', dashboardKey: 'carregando' }
};

function getStatusConfig(status) {
    return STATUS_CONFIG[status] || STATUS_CONFIG['parado'];
}

// --- Configuração do Mapa e Camadas ---
const map = L.map('map', { editable: true }).setView([usina.lat, usina.lng], 12);

// Layers de Mapa
const MAP_LAYERS = {
    esriSat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri',
        maxZoom: 18,
        pane: 'tilePane',
    }),
    // Novo Layer Sentinel-2 (Banda Natural Color)
    sentinel: L.tileLayer('https://tiles.maps.eox.at/wms?service=wmts&request=GetTile&tilematrixset=googlemaps&tilematrix={z}&tilerow={y}&tilecol={x}&layer=s2cloudless&format=image%2Fjpeg', {
        attribution: 'Sentinel-2 cloudless (EUMETSAT/ESA)',
        maxZoom: 18,
        pane: 'tilePane',
    }),
    osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
        pane: 'tilePane',
    }),
    wikimedia: L.tileLayer('https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png', {
        attribution: 'Wikimedia Maps',
        maxZoom: 19,
        pane: 'tilePane',
    }),
};

let currentBaseLayer = MAP_LAYERS.esriSat; 

// Função para trocar a camada base do mapa
function changeMapLayer(layerKey) {
    if (currentBaseLayer) {
        map.removeLayer(currentBaseLayer);
    }
    
    currentBaseLayer = MAP_LAYERS[layerKey];
    if (currentBaseLayer) {
        currentBaseLayer.addTo(map);
        
        // Camada de contexto de rua deve ser opaca se for um mapa de satélite
        if (layerKey === 'esriSat' || layerKey === 'sentinel') {
            streetContextLayer.setOpacity(0.3);
        } else {
            streetContextLayer.setOpacity(0); 
        }
    }
}

// Layer Groups para melhor organização
const truckLayerGroup = L.layerGroup().addTo(map);
const farmLayerGroup = L.layerGroup().addTo(map);
const routeLayerGroup = L.layerGroup().addTo(map);

// Camada de ruas semi-transparente para contexto (sobre o satélite)
const streetContextLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    opacity: 0.3 
}).addTo(map);


// Marcador Fixo da Usina
const usinaIconHtml = `<div class="map-icon usina-icon"><i class="fas fa-industry"></i></div>`;
const usinaCustomIcon = L.divIcon({
    className: 'usina-marker',
    html: usinaIconHtml,
    iconSize: [40, 40], 
    iconAnchor: [20, 40],
    popupAnchor: [0, -35]
});
L.marker(usina, { title: 'Usina Principal', icon: usinaCustomIcon }).addTo(farmLayerGroup).bindPopup("<b>Usina Principal</b><br>Ponto de Descarga Fixo");


/* --- Funções de Ícones e Rótulos --- */
function createTruckIcon(status) {
    const config = getStatusConfig(status);
    const iconClass = `truck-icon status-${status}`; 
    const iconHtml = `<div class="map-icon ${iconClass}"><i class="fas ${config.icon}"></i></div>`;
    
    return L.divIcon({
        className: 'truck-marker',
        html: iconHtml,
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -35]
    });
}

function createFarmIcon() {
    return L.divIcon({
        className: 'farm-marker',
        html: '<div class="map-icon usina-icon" style="background-color: #f9ca24; border-color: white; width: 40px; height: 40px; line-height: 40px;"><i class="fas fa-tractor"></i></div>',
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -35]
    });
}

function getStatusLabel(status) {
    return getStatusConfig(status).label;
}

/* --- PAINEL DO MAPA (Implementando Métricas) --- */
function updateMapDashboard() {
    const dashboardElement = document.getElementById('map-dashboard');
    
    const totalTrucks = trucks.length;
    let trucksInMovement = 0;
    
    const statusCounts = trucks.reduce((acc, t) => {
        const statusKey = getStatusConfig(t.status).dashboardKey;
        acc[statusKey] = (acc[statusKey] || 0) + 1;
        if (t.isRunning) {
            trucksInMovement++;
        }
        return acc;
    }, {
        'sentidoCarregamento': 0,
        'carregando': 0,
        'sentidoUsina': 0,
        'descarregandoUsina': 0,
        'quebrado': 0,
        'parado': 0
    });

    const trucksPaused = totalTrucks - trucksInMovement;

    const utilization = totalTrucks > 0 ? ((trucksInMovement / totalTrucks) * 100).toFixed(1) : 0;

    const dashboardStatuses = [
        { key: 'total', label: 'Frota Total', count: totalTrucks, isMetric: true },
        { key: 'moving', label: 'Em Movimento', count: trucksInMovement, isMetric: true },
        { key: 'paused', label: 'Parados/Ação', count: trucksPaused, isMetric: true },
        { key: 'utilization', label: 'Utilização', count: `${utilization}%`, isMetric: true },
        { key: 'sentidoCarregamento', label: 'Indo p/ Carga', count: statusCounts['sentidoCarregamento'] },
        { key: 'carregando', label: 'Carregando', count: statusCounts['carregando'] },
        { key: 'sentidoUsina', label: 'Retornando', count: statusCounts['sentidoUsina'] },
        { key: 'descarregandoUsina', label: 'Descarregando', count: statusCounts['descarregandoUsina'] },
        { key: 'quebrado', label: 'Quebrado', count: statusCounts['quebrado'] },
    ];

    const html = dashboardStatuses.map(s => {
        return `
            <div class="status-box-map" data-status="${s.key}">
                ${s.label}
                <div class="count">${s.count}</div>
            </div>
        `;
    }).join('');
    
    if (dashboardElement.innerHTML !== html) {
        dashboardElement.innerHTML = html;
    }
}

/* --- Funções de Atualização da UI --- */
function updateUI() {
    updateFarms();
    updateTrucks();
    updateFarmSelect();
    updateTruckSelect();
    updateRoutesPanel();
    updateMapDashboard(); 
}

function updateFarms() {
  document.getElementById('farms').innerHTML = farms.filter(f => f.code !== 'USI')
    .map(f => `<div class='item'><i class="fas fa-tractor"></i> ${f.name} (Cód: ${f.code})</div>`).join('');
}

function updateTrucks() {
  document.getElementById('trucks').innerHTML = trucks.map((t, i) => {
      const statusText = getStatusLabel(t.status);
      const statusClass = `status-${t.status}`;
      const activeClass = t.isRunning || t.pauseEndTimestamp ? 'active-route' : '';
      
      let distanceDisplay = '';
      if (t.isRunning) {
        distanceDisplay = `Dist: ${t.distance} km | Tempo: ${t.time}`;
      } else if (t.pauseEndTimestamp) {
        distanceDisplay = `Ação em andamento... | Tempo: ${t.time}`;
      } else {
        distanceDisplay = 'Parado / Sem Rota';
      }
      
      const currentDestination = (t.destination && t.destination.name) ? t.destination.name : 'N/A';
      
      let actionButtons = `<button onclick="stopSimulation(${i})" class="btn-tertiary" style="margin: 4px 0 0;">Parar Rota/Ação</button>`;
      
      if (t.status === 'carregando' || t.status === 'descarregandoUsina') {
           actionButtons += `<button onclick="skipPauseStep(${i})" class="btn-secondary" style="background: #f9ca24; margin: 4px 0 0;">Avançar Etapa</button>`;
      }
      
      if (t.marker) {
          t.marker.bindPopup(`
              <b>${t.name} (${t.plate || 'N/A'})</b><br>
              Status: <span class="${statusClass}">${statusText}</span><br>
              Destino: ${currentDestination}<br>
              ${distanceDisplay}
          `);
      }
      
      return `<div class='item ${activeClass}'>
                <i class="fas fa-truck"></i> ${t.name} (${t.plate || 'N/A'}) - 
                <span class="${statusClass}">${statusText}</span>
                <div class='details'>
                    Destino: ${currentDestination} <br>
                    ${distanceDisplay}
                </div>
                ${actionButtons}
            </div>`;
  }).join('');
}

function updateFarmSelect() { 
    let options = '<option value="-1">N/A / Usina</option>'; 
    options += farms
        .filter(f => f.code !== 'USI')
        .map((f, i) => `<option value='${i}'>${f.name}</option>`)
        .join('');
    document.getElementById('selectFarm').innerHTML = options;
}
function updateTruckSelect() { 
    document.getElementById('selectTruck').innerHTML = trucks
        .map((t, i) => `<option value='${i}'>${t.name} (${t.plate || 'N/A'})</option>`)
        .join('');
    updatePanelStatus(); 
}

function updatePanelStatus() {
    const ti = +document.getElementById('selectTruck').value;
    if (ti < 0 || trucks.length === 0) return;

    const truck = trucks[ti];
    
    document.getElementById('statusSelect').value = truck.status;
    
    let targetFarmIndex = -1;
    if (truck.destination && truck.destination.code !== 'USI') {
        const farmIndex = farms.findIndex(f => f.code === truck.destination.code);
        if (farmIndex > 0) {
            targetFarmIndex = farmIndex - 1; 
        }
    }
    
    document.getElementById('selectFarm').value = targetFarmIndex.toString();
}


function updateRoutesPanel() {
    const activeTrucks = trucks.filter(t => t.isRunning);
    if (activeTrucks.length === 0) {
        document.getElementById('routes').innerHTML = '<p style="color: #b2bec3;">Nenhuma rota em andamento.</p>';
        return;
    }
    document.getElementById('routes').innerHTML = activeTrucks.map(t => {
        const progress = t.totalDistKm > 0 ? (t.index / t.coords.length * 100).toFixed(1) : 0;
        return `<div class='item active-route'>
                    <i class="fas fa-route"></i> ${t.name} -> ${t.destination.name}
                    <div class='details'>Progresso: ${progress}%</div>
                </div>`;
    }).join('');
}

function showTab(tabId) {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab-page').forEach(page => page.classList.remove('active'));
  const tabElement = document.querySelector(`.tab[onclick*="${tabId}"]`);
  if(tabElement) tabElement.classList.add('active');
  const pageElement = document.getElementById(tabId);
  if(pageElement) pageElement.classList.add('active');
}

// ----------------------------------------------------------------------
// --- FUNÇÕES DE CADASTRO INTERATIVO COM EDIÇÃO MANUAL DE ROTA ---
// ----------------------------------------------------------------------

function startFarmCadastroInteractive() {
    if (interactiveCadastroState.active) return;

    showTab('cadastro');
    interactiveCadastroState.active = true;
    interactiveCadastroState.selectedRouteIndex = -1; 
    document.getElementById('interactive-farm-cadastro').style.display = 'block';
    document.getElementById('route-alternatives').innerHTML = 
        '<p style="font-size: 0.8em; color: #f9ca24;">*Clique no mapa para posicionar a Fazenda e calcular as rotas alternativas.</p>';
    
    map.off('click', handleMapClickForFarmLocation);
    map.on('click', handleMapClickForFarmLocation);

    alert('Informe o Nome/Código, e então clique no mapa para posicionar a Fazenda e pré-visualizar a rota.');
}

function handleMapClickForFarmLocation(e) {
    if (!interactiveCadastroState.active) return;

    interactiveCadastroState.farmLatlng = e.latlng;
    
    if (interactiveCadastroState.marker) {
        interactiveCadastroState.marker.remove();
    }
    if (interactiveCadastroState.polyline) {
        routeLayerGroup.removeLayer(interactiveCadastroState.polyline);
        interactiveCadastroState.polyline = null; 
    }
    interactiveCadastroState.alternativeRoutes = [];
    interactiveCadastroState.selectedRouteIndex = -1;
    
    const tempIcon = createFarmIcon();
    interactiveCadastroState.marker = L.marker(e.latlng, { 
        icon: tempIcon, 
        draggable: true,
        title: 'Nova Fazenda (Clique e arraste para ajustar)'
    }).addTo(map);
    
    interactiveCadastroState.marker.on('dragend', (event) => {
        interactiveCadastroState.farmLatlng = event.target.getLatLng();
        previewMultipleRoutes(usina, interactiveCadastroState.farmLatlng); 
    });

    // Inicia o cálculo das múltiplas rotas
    previewMultipleRoutes(usina, e.latlng);
}

const ROUTE_PROFILES = [
    { profile: 'driving-hgv', name: 'Caminhão (HGV)', color: '#2ecc71' }, // Otimizado para caminhões
    { profile: 'driving-car', name: 'Carro (Padrão)', color: '#00a8ff' },
    { profile: 'foot-walking', name: 'A pé (Linha Reta)', color: '#e74c3c' } 
];

function previewMultipleRoutes(start, end) {
    const startCoord = `${start.lng},${start.lat}`;
    const endCoord = `${end.lng},${end.lat}`;
    
    document.getElementById('route-alternatives').innerHTML = '<p style="color: #f9ca24;">Calculando rotas alternativas...</p>';
    interactiveCadastroState.alternativeRoutes = [];

    const promises = ROUTE_PROFILES.map(p => 
        fetch(`https://api.openrouteservice.org/v2/directions/${p.profile}?api_key=${apiKey}&start=${startCoord}&end=${endCoord}`)
        .then(r => r.json())
        .then(data => {
            if (data.features && data.features.length > 0) {
                const route = data.features[0];
                const distance = (route.properties.summary.distance / 1000).toFixed(2);
                const timeSec = route.properties.summary.duration;
                const coords = route.geometry.coordinates.map(c => L.latLng(c[1], c[0]));
                
                return { 
                    name: p.name, 
                    color: p.color, 
                    distance: distance, 
                    time: Math.ceil(timeSec / 60), // minutos
                    coords: coords
                };
            }
            return null;
        }).catch(error => {
            console.error(`Erro ORS para perfil ${p.profile}:`, error);
            return null;
        })
    );

    Promise.all(promises).then(results => {
        const validRoutes = results.filter(r => r !== null);
        interactiveCadastroState.alternativeRoutes = validRoutes;
        
        if (validRoutes.length === 0) {
            document.getElementById('route-alternatives').innerHTML = 
                '<p style="color: #e74c3c; font-weight: bold;">Nenhuma rota calculada! Verifique as coordenadas ou a chave API.</p>';
            return;
        }

        displayRouteAlternatives(validRoutes);
        selectRoute(0); 
    });
}

function displayRouteAlternatives(routes) {
    const container = document.getElementById('route-alternatives');
    let html = '<h4>Rotas Calculadas (Clique para selecionar e editar):</h4>';
    
    routes.forEach((r, index) => {
        html += `
            <div class="route-option" id="route-option-${index}" onclick="selectRoute(${index})">
                <i class="fas fa-route" style="color: ${r.color};"></i> 
                ${r.name} - ${r.distance} km
                <small>Tempo estimado: ${r.time} min</small>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function selectRoute(index) {
    const route = interactiveCadastroState.alternativeRoutes[index];
    
    if (interactiveCadastroState.polyline) {
        routeLayerGroup.removeLayer(interactiveCadastroState.polyline);
    }
    
    document.querySelectorAll('.route-option').forEach(el => el.classList.remove('selected'));
    
    document.getElementById(`route-option-${index}`).classList.add('selected');
    
    interactiveCadastroState.polyline = L.polyline(route.coords, { 
        color: route.color, 
        weight: 6, 
        opacity: 0.8,
        editable: true 
    }).addTo(routeLayerGroup);

    interactiveCadastroState.routeCoords = route.coords; 
    interactiveCadastroState.selectedRouteIndex = index;

    interactiveCadastroState.polyline.enableEdit();

    interactiveCadastroState.polyline.on('edit', () => {
        interactiveCadastroState.routeCoords = interactiveCadastroState.polyline.getLatLngs();
        document.querySelectorAll('.route-option').forEach(el => el.classList.remove('selected'));
    });
    
    interactiveCadastroState.marker.openPopup();
}

function saveNewFarm() {
    const name = document.getElementById('newFarmName').value.trim();
    const code = document.getElementById('newFarmCode').value.trim();
    
    if (!name || !code) {
        alert('Nome e Código da Fazenda são obrigatórios.');
        return;
    }

    if (!interactiveCadastroState.farmLatlng || !interactiveCadastroState.routeCoords) {
        alert('Selecione a localização da Fazenda e escolha/calcule uma rota.');
        return;
    }

    if (farms.some(f => f.code === code)) {
        alert(`O código de fazenda "${code}" já existe. Escolha outro.`);
        return;
    }

    const farm = { 
        name, 
        code, 
        latlng: interactiveCadastroState.farmLatlng,
        customRoute: interactiveCadastroState.routeCoords.map(c => [c.lat, c.lng]) 
    };
    farms.push(farm);
    
    L.marker(farm.latlng, { title: name }).addTo(farmLayerGroup).bindPopup(`<b>${f.name}</b> (Código: ${f.code})`).setIcon(createFarmIcon());
    
    cancelFarmCadastro(false);
    alert(`Fazenda ${name} (${code}) cadastrada com sucesso com rota customizada!`);
    updateUI();
}

function cancelFarmCadastro(showAlert = true) {
    if (interactiveCadastroState.polyline) {
        interactiveCadastroState.polyline.disableEdit();
        routeLayerGroup.removeLayer(interactiveCadastroState.polyline);
    }
    if (interactiveCadastroState.marker) {
        interactiveCadastroState.marker.remove();
    }
    
    interactiveCadastroState.active = false;
    interactiveCadastroState.farmLatlng = null;
    interactiveCadastroState.marker = null;
    interactiveCadastroState.polyline = null;
    interactiveCadastroState.routeCoords = null; 
    interactiveCadastroState.alternativeRoutes = [];
    interactiveCadastroState.selectedRouteIndex = -1;
    
    document.getElementById('interactive-farm-cadastro').style.display = 'none';
    document.getElementById('newFarmName').value = '';
    document.getElementById('newFarmCode').value = '';
    document.getElementById('route-alternatives').innerHTML = '';
    
    map.off('click', handleMapClickForFarmLocation);

    if (showAlert) {
        alert('Cadastro de Fazenda cancelado.');
    }
}

function addTruck(name, plate) {
    plate = plate || document.getElementById('newTruckPlate').value.trim();
    if (!plate) {
        alert('Informe a placa do caminhão!');
        return;
    }
    name = name || `Caminhão ${nextTruckId}`;

    const truck = { 
        name, 
        plate,
        status: 'parado', 
        marker: null, 
        distance: 0, 
        time: '0 min', 
        coords: [], 
        index: 0, 
        polyline: null, 
        isRunning: false,
        timeout: null,
        totalDistKm: 0,
        destination: farms[0], 
        pauseEndTimestamp: null,
        previousFarmDestination: null 
    };
    trucks.push(truck);
    nextTruckId++;
    if (document.getElementById('newTruckPlate')) {
        document.getElementById('newTruckPlate').value = '';
    }
    truck.marker = L.marker(usina, { icon: createTruckIcon(truck.status), title: truck.name }).addTo(truckLayerGroup);

    if (trucks.length < 5) { 
        alert(`Caminhão ${name} (${plate}) adicionado!`);
    }
    updateUI();
    return truck;
}

function startSimulation() {
    const ti = +document.getElementById('selectTruck').value;
    const fi = +document.getElementById('selectFarm').value;
    const status = document.getElementById('statusSelect').value;

    if (trucks.length === 0) {
        alert('Cadastre um caminhão primeiro.');
        return;
    }
    
    const targetFarm = (fi !== -1) ? farms[fi + 1] : farms[0]; 

    if ((status === 'sentidoCarregamento' || status === 'carregando') && targetFarm.code === 'USI') {
         alert('Selecione uma fazenda válida para esta ação.');
         return;
    }
    
    const truck = trucks[ti];

    if (truck.isRunning || truck.pauseEndTimestamp) {
        stopSimulation(ti, false); 
    }

    truck.status = status;
    truck.destination = targetFarm; 
    
    if (['carregando', 'quebrado', 'descarregandoUsina', 'parado'].includes(status)) {
        
        let newLatlng = truck.marker ? truck.marker.getLatLng() : usina; 
        let durationMinutes = 0;
        
        if (status === 'carregando') {
            newLatlng = targetFarm.latlng;
            durationMinutes = +document.getElementById('loadingTimeInput').value || 30; 
            truck.previousFarmDestination = targetFarm; 
        } else if (status === 'descarregandoUsina') {
            newLatlng = usina;
            durationMinutes = +document.getElementById('unloadingTimeInput').value || 15; 
        } else if (status === 'quebrado' || status === 'parado') {
            durationMinutes = 0; 
        }
        
        if (!truck.marker) {
            truck.marker = L.marker(newLatlng, { icon: createTruckIcon(truck.status), title: truck.name }).addTo(truckLayerGroup);
        } else {
            truck.marker.setLatLng(newLatlng).setIcon(createTruckIcon(truck.status));
        }
        
        map.setView(newLatlng, map.getZoom()); 

        if (durationMinutes > 0) {
            truck.pauseEndTimestamp = Date.now() + (durationMinutes * 60 * 1000);
            updatePauseTimer(truck);
        } else {
             truck.time = getStatusLabel(status); 
        }
        
        truck.isRunning = false;
        truck.distance = 0;
        updateUI();
        return;
    }

    let start, end;
    const config = getStatusConfig(status); 
    const color = config.routeColor;
    let customRoute = null;

    if (status === 'sentidoCarregamento') {
        start = truck.marker ? truck.marker.getLatLng() : usina; 
        end = targetFarm.latlng;
        customRoute = targetFarm.customRoute; 
        truck.previousFarmDestination = targetFarm;
        getRouteAndMove(truck, start, end, color, customRoute); 
    } else if (status === 'sentidoUsina') {
        start = truck.marker ? truck.marker.getLatLng() : truck.previousFarmDestination.latlng; 
        end = usina;
        getRouteAndMove(truck, start, end, color); 
    }
}

// Função de Timer de Pausa (Carregamento/Descarga)
function updatePauseTimer(truck) {
    if (isPaused || !truck.pauseEndTimestamp) {
        if (truck.pauseEndTimestamp) {
            truck.timeout = setTimeout(() => updatePauseTimer(truck), 1000);
        }
        return;
    }
    
    const remainingMs = truck.pauseEndTimestamp - Date.now();
    
    if (remainingMs <= 0) {
        truck.pauseEndTimestamp = null;
        
        const currentStatus = truck.status;
        const previousFarm = truck.previousFarmDestination;
        
        if (currentStatus === 'carregando') {
            truck.status = 'sentidoUsina';
            startAutoRoute(truck, 'sentidoUsina', farms[0]); 
            return;
        } 
        
        else if (currentStatus === 'descarregandoUsina') {
            if (!previousFarm || previousFarm.code === 'USI') {
                 truck.status = 'parado'; 
                 alert(`${truck.name} concluiu o ciclo, mas não há destino de fazenda conhecido. Parando.`);
            } else {
                 truck.status = 'sentidoCarregamento';
                 startAutoRoute(truck, 'sentidoCarregamento', previousFarm); 
                 return;
            }
        }
        
        truck.status = 'parado'; 
        truck.time = '0 min (Concluído)';
        truck.marker.setIcon(createTruckIcon(truck.status));
        alert(`${truck.name} concluiu a ação e está parado!`);
        
        updateUI();
        return;
    }
    
    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    truck.time = `${minutes} min e ${seconds} seg (restantes)`;
    
    updateUI();
    truck.timeout = setTimeout(() => updatePauseTimer(truck), 1000);
}

// Função para iniciar a rota automaticamente após o timer de pausa
function startAutoRoute(truck, newStatus, target) {
    truck.status = newStatus;
    
    let start = truck.marker.getLatLng();
    let end = target.latlng;
    let customRoute = null;

    truck.destination = target; 
    
    if (newStatus === 'sentidoCarregamento') {
        customRoute = target.customRoute; 
    }
    
    const config = getStatusConfig(newStatus);
    getRouteAndMove(truck, start, end, config.routeColor, customRoute);
}

/**
 * Função para avançar/pular a etapa de pausa (carregamento/descarga) imediatamente.
 */
function skipPauseStep(index) {
    const truck = trucks[index];
    if (truck.timeout) {
        clearTimeout(truck.timeout);
        truck.timeout = null;
    }
    
    truck.pauseEndTimestamp = Date.now(); 
    updatePauseTimer(truck); 
}


/**
 * Função principal para obter a rota, agora aceita uma rota customizada (coords)
 */
function getRouteAndMove(truck, start, end, color, customRouteCoords = null) {
    document.getElementById('startSimulationButton').disabled = true; 
    
    // --- PASSO 1: USAR ROTA CUSTOMIZADA SE DISPONÍVEL ---
    if (customRouteCoords) {
        const coords = customRouteCoords.map(c => L.latLng(c[0], c[1]));
        
        let totalDistKm = 0;
        for (let i = 0; i < coords.length - 1; i++) {
            totalDistKm += coords[i].distanceTo(coords[i+1]) / 1000;
        }
        
        setupMovement(truck, coords, totalDistKm, color);
        document.getElementById('startSimulationButton').disabled = false;
        return;
    }

    // --- PASSO 2: CALCULAR ROTA VIA OPENROUTESERVICE ---
    const startCoord = `${start.lng},${start.lat}`;
    const endCoord = `${end.lng},${end.lat}`;

    fetch(`https://api.openrouteservice.org/v2/directions/driving-hgv?api_key=${apiKey}&start=${startCoord}&end=${endCoord}`)
        .then(r => r.json())
        .then(data => {
            document.getElementById('startSimulationButton').disabled = false;
            
            if (!data.features || data.features.length === 0) {
                alert('Erro ao calcular a rota. Verifique sua chave de API ou as coordenadas.');
                truck.status = 'parado';
                updateUI();
                return;
            }

            const coords = data.features[0].geometry.coordinates.map(c => L.latLng(c[1], c[0]));
            const totalDistKm = (data.features[0].properties.summary.distance / 1000);

            setupMovement(truck, coords, totalDistKm, color);
        })
        .catch(error => {
            document.getElementById('startSimulationButton').disabled = false;
            console.error('Erro na requisição OpenRouteService:', error);
            alert('Erro de conexão ao calcular a rota. Verifique a chave de API e a internet.');
            truck.status = 'parado';
            updateUI();
        });
}

// Função auxiliar para configurar o caminhão e iniciar o movimento
function setupMovement(truck, coords, totalDistKm, color) {
    if (truck.polyline) routeLayerGroup.removeLayer(truck.polyline);
    truck.polyline = L.polyline(coords, { color: color, weight: 5, opacity: 0.7 }).addTo(routeLayerGroup);

    if (!truck.marker) {
        truck.marker = L.marker(coords[0], { icon: createTruckIcon(truck.status), title: truck.name }).addTo(truckLayerGroup);
    } else {
        truck.marker.setLatLng(coords[0]).setIcon(createTruckIcon(truck.status));
    }
    
    truck.coords = coords;
    truck.totalDistKm = totalDistKm;
    truck.index = 0;
    truck.isRunning = true;
    
    map.setView(coords[0], map.getZoom()); 
    moveTruck(truck);
}


function moveTruck(truck) {
    if (isPaused || !truck.isRunning) {
        return;
    }
    
    const speedKmH = +document.getElementById('speedInput').value || 45;
    const SIMULATION_FACTOR = +document.getElementById('simulationFactorInput').value || 500; 
    
    const MOVEMENT_STEPS = 20; 

    let distanceMovedKm = 0;
    let nextIndex = truck.index;

    for (let i = 0; i < MOVEMENT_STEPS; i++) {
        if (nextIndex >= truck.coords.length - 1) break;
        
        const currentCoord = truck.coords[nextIndex];
        const nextCoord = truck.coords[nextIndex + 1];
        distanceMovedKm += currentCoord.distanceTo(nextCoord) / 1000;
        nextIndex++;
    }

    truck.index = nextIndex;
    
    if (truck.index >= truck.coords.length - 1) { 
        truck.isRunning = false;
        
        truck.status = (truck.destination.code === 'USI') ? 'chegouUsina' : 'chegouFazenda';
        truck.distance = truck.totalDistKm.toFixed(2);
        truck.time = '0 min'; 
        
        truck.marker.setIcon(createTruckIcon(truck.status)); 
        truck.marker.setLatLng(truck.coords[truck.coords.length - 1]); 
        
        updateUI();
        
        if (truck.polyline) {
            routeLayerGroup.removeLayer(truck.polyline);
            truck.polyline = null;
        }
        
        
        if (truck.status === 'chegouFazenda') {
            const durationMinutes = +document.getElementById('loadingTimeInput').value || 30;
            truck.status = 'carregando';
            truck.pauseEndTimestamp = Date.now() + (durationMinutes * 60 * 1000);
            updatePauseTimer(truck);
        } else if (truck.status === 'chegouUsina') {
            const durationMinutes = +document.getElementById('unloadingTimeInput').value || 15;
            
            truck.status = 'descarregandoUsina';
            truck.pauseEndTimestamp = Date.now() + (durationMinutes * 60 * 1000);
            updatePauseTimer(truck);
        }
        
        return;
    }
    
    truck.marker.setLatLng(truck.coords[truck.index]);
    
    const distRatio = (truck.index) / truck.coords.length;
    truck.distance = (truck.totalDistKm * (1 - distRatio)).toFixed(2); 
    const totalTimeHours = truck.totalDistKm / speedKmH; 
    const remainingTimeMinutes = totalTimeHours * (1 - distRatio) * 60;
    
    truck.time = `${Math.ceil(remainingTimeMinutes)} min (restantes)`;
    
    const timeNeededHours = distanceMovedKm / speedKmH;
    const interval = Math.max(50, timeNeededHours * 3600 * 1000 / SIMULATION_FACTOR); 
    
    updateUI();
    
    truck.timeout = setTimeout(() => moveTruck(truck), interval);
}

function stopSimulation(index, resetMarker = true) {
    const truck = trucks[index];
    if (truck.timeout) {
        clearTimeout(truck.timeout);
        truck.timeout = null;
    }
    if (truck.polyline) {
        routeLayerGroup.removeLayer(truck.polyline); 
        truck.polyline = null;
    }
    
    truck.isRunning = false;
    truck.coords = [];
    truck.index = 0;
    truck.totalDistKm = 0;
    truck.status = 'parado';
    truck.distance = '0';
    truck.time = '0 min';
    truck.destination = farms[0];
    truck.pauseEndTimestamp = null;
    
    if(truck.marker) {
        truck.marker.setIcon(createTruckIcon(truck.status));
        if (resetMarker) {
            truck.marker.setLatLng(usina); 
        }
    }
    
    updateUI();
}

function toggleGlobalPause() {
    isPaused = !isPaused;
    document.getElementById('globalPauseButton').innerText = isPaused ? 'Retomar Todas as Rotas' : 'Pausar Todas as Rotas';
    
    if (!isPaused) {
        trucks.forEach(truck => {
            if (truck.isRunning && truck.timeout === null) {
                moveTruck(truck);
            } 
            else if (!truck.isRunning && truck.pauseEndTimestamp) {
                updatePauseTimer(truck);
            }
        });
    }
    updateUI();
}

/**
 * Função para criar uma frota de demo e iniciar o ciclo de rota
 */
function initializeDemoSimulation(numTrucks) {
    trucks.forEach(t => stopSimulation(trucks.indexOf(t)));
    trucks.length = 0; 
    truckLayerGroup.clearLayers();
    routeLayerGroup.clearLayers();
    nextTruckId = 1;
    
    const farmDestinations = farms.filter(f => f.code !== 'USI');
    if (farmDestinations.length === 0) {
        alert('Crie fazendas no mapa antes de iniciar a simulação com rota!');
        return;
    }
    
    const totalDestinations = farmDestinations.length;
    
    for (let i = 0; i < numTrucks; i++) {
        const truck = addTruck(`Caminhão ${i + 1}`, `P-${1000 + i}`);
        const targetFarm = farmDestinations[i % totalDestinations]; 

        truck.status = 'sentidoCarregamento';
        truck.destination = targetFarm;
        truck.previousFarmDestination = targetFarm; 
        
        const start = usina;
        const end = targetFarm.latlng;
        const customRoute = targetFarm.customRoute; 
        
        getRouteAndMove(truck, start, end, getStatusConfig(truck.status).routeColor, customRoute);
    }
    
    alert(`${numTrucks} caminhões criados e iniciando o ciclo de rota!`);
    showTab('painel');
    updateUI();
}


// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    // Adiciona a camada base ESRI (satélite) por padrão
    currentBaseLayer.addTo(map);

    // Adiciona fazendas de demonstração para o ciclo de 40 caminhões
    const farmPrata = { name: 'Fazenda Prata (Demo)', code: 'FP01', latlng: L.latLng(-17.6000, -40.1500), customRoute: null };
    const farmOeste = { name: 'Fazenda Oeste (Demo)', code: 'FO02', latlng: L.latLng(-17.6800, -40.2300), customRoute: null };
    const farmNorte = { name: 'Fazenda Norte (Demo)', code: 'FN03', latlng: L.latLng(-17.5800, -40.2000), customRoute: null };
    
    farms.push(farmPrata);
    farms.push(farmOeste);
    farms.push(farmNorte);

    // Cria marcadores estáticos para as fazendas de demonstração
    farms.filter(f => f.code !== 'USI').forEach(f => {
        L.marker(f.latlng, { title: f.name }).addTo(farmLayerGroup).bindPopup(`<b>${f.name}</b> (Código: ${f.code})`).setIcon(createFarmIcon());
    });
    
    updateUI();
    showTab('painel'); 
    
    // Cria 3 caminhões de demonstração parados
    addTruck('Caminhão 01 (Demo)', 'P-1001');
    addTruck('Caminhão 02 (Demo)', 'P-1002');
    addTruck('Caminhão 03 (Demo)', 'P-1003');
    
    updateUI();
});