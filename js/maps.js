// Este arquivo contém toda a lógica relacionada aos mapas Leaflet.

const USINA_COORDS = [-17.642301, -40.181525];
const INITIAL_ZOOM = 14;
const TILE_LAYER = { 
    url: 'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', 
    options: { 
        maxZoom: 20, 
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], 
        attribution: '&copy; Google' 
    } 
};

let map = null; // Instância do mapa do Dashboard
let mapCadastroGrande = null; // Instância do mapa de Cadastro

export function initDashboardMap() {
    if (map || !document.getElementById('map')) return;
    try {
        map = L.map('map').setView(USINA_COORDS, INITIAL_ZOOM);
        L.tileLayer(TILE_LAYER.url, TILE_LAYER.options).addTo(map);
        // Adicionar marcador da usina se desejado
        L.marker(USINA_COORDS, { /* icon: usinaIcon */ }).addTo(map).bindPopup('Usina');
    } catch (e) { 
        console.error("ERRO ao inicializar o mapa do dashboard:", e); 
    }
}

export function initCadastroFazendaMap() {
    if (mapCadastroGrande || !document.getElementById('map-cadastro-grande')) return;
    try {
        mapCadastroGrande = L.map('map-cadastro-grande').setView(USINA_COORDS, INITIAL_ZOOM);
        L.tileLayer(TILE_LAYER.url, TILE_LAYER.options).addTo(mapCadastroGrande);
        // ... lógica de clique para pegar coordenadas
    } catch (e) { 
        console.error("ERRO ao inicializar o mapa de cadastro:", e); 
    }
}

// As funções de atualização de marcadores (exemplo)
// Elas precisam ser implementadas com a lógica de ícones e dados
export function updateFazendaMarkers(fazendas) {
    if (!map) return;
    // Lógica para limpar marcadores antigos e adicionar novos
    console.log("Atualizando marcadores de fazendas...", fazendas);
}
export function updateCaminhaoMarkers(caminhoes) { 
    if (!map) return;
    console.log("Atualizando marcadores de caminhões...", caminhoes);
}
export function updateEquipamentoMarkers(equipamentos) { 
    if (!map) return;
    console.log("Atualizando marcadores de equipamentos...", equipamentos);
}