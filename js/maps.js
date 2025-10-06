// Este arquivo contém toda a lógica relacionada aos mapas Leaflet.
const USINA_COORDS = [-17.642301, -40.181525];
const INITIAL_ZOOM = 14;
const activeLayer = { url: 'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', options: { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: '&copy; Google' } };

// Ícones
// ...

export function initDashboardMap() {
    if (window.map) return;
    try {
        window.map = L.map('map').setView(USINA_COORDS, INITIAL_ZOOM);
        L.tileLayer(activeLayer.url, activeLayer.options).addTo(window.map);
        // ... marcador da usina
    } catch (e) { console.error("ERRO ao inicializar o mapa do dashboard:", e); }
}

export function initCadastroFazendaMap() {
    if (window.isCadastroFazendaMapInitialized) return;
    try {
        window.mapCadastroGrande = L.map('map-cadastro-grande').setView(USINA_COORDS, INITIAL_ZOOM);
        L.tileLayer(activeLayer.url, activeLayer.options).addTo(window.mapCadastroGrande);
        // ... lógica de clique para pegar coordenadas
        window.isCadastroFazendaMapInitialized = true;
    } catch (e) { console.error("ERRO ao inicializar o mapa de cadastro:", e); }
}

export function updateFazendaMarkers(fazendas) { /* ... */ }
export function updateCaminhaoMarkers(caminhoes) { /* ... */ }
export function updateEquipamentoMarkers(equipamentos) { /* ... */ }