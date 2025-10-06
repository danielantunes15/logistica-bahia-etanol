const USINA_COORDS = [-17.642301, -40.181525];
const INITIAL_ZOOM = 14;
const TILE_LAYER = { 
    url: 'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', 
    options: { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: '&copy; Google' } 
};

let map = null;
let mapCadastroForm = null; 
let cadastroMarker = null;
let mapEditForm = null;
let editMarker = null;

export function initDashboardMap() {
    if (map) return;
    setTimeout(() => {
        const mapContainer = document.getElementById('map');
        if (mapContainer && !map) {
            try {
                map = L.map('map').setView(USINA_COORDS, INITIAL_ZOOM);
                L.tileLayer(TILE_LAYER.url, TILE_LAYER.options).addTo(map);
                L.marker(USINA_COORDS).addTo(map).bindPopup('Usina');
            } catch (e) { console.error("ERRO ao inicializar o mapa do dashboard:", e); }
        }
    }, 150);
}

export function initCadastroFazendaMap() {
    if (mapCadastroForm) {
        setTimeout(() => mapCadastroForm.invalidateSize(), 150);
        return;
    }
    setTimeout(() => {
        const mapContainer = document.getElementById('map-cadastro-medio');
        if (mapContainer && !mapCadastroForm) { 
            try {
                mapCadastroForm = L.map(mapContainer).setView(USINA_COORDS, INITIAL_ZOOM);
                L.tileLayer(TILE_LAYER.url, TILE_LAYER.options).addTo(mapCadastroForm);
                mapCadastroForm.on('click', function(e) {
                    const { lat, lng } = e.latlng;
                    document.getElementById('latitude').value = lat.toFixed(6);
                    document.getElementById('longitude').value = lng.toFixed(6);
                    if (cadastroMarker) {
                        cadastroMarker.setLatLng(e.latlng);
                    } else {
                        cadastroMarker = L.marker(e.latlng).addTo(mapCadastroForm);
                    }
                    cadastroMarker.bindPopup(`<b>Coordenadas:</b><br>${lat.toFixed(4)}, ${lng.toFixed(4)}`).openPopup();
                });
            } catch (e) { console.error("ERRO ao inicializar o mapa de cadastro:", e); }
        }
    }, 200);
}

export function initEditFazendaMap(latitude, longitude) {
    if (mapEditForm) {
        mapEditForm.remove();
        mapEditForm = null;
    }
    const mapContainer = document.getElementById('map-edit-medio');
    if (!mapContainer) return;
    setTimeout(() => {
        try {
            const initialCoords = [latitude, longitude];
            mapEditForm = L.map(mapContainer).setView(initialCoords, INITIAL_ZOOM);
            L.tileLayer(TILE_LAYER.url, TILE_LAYER.options).addTo(mapEditForm);
            editMarker = L.marker(initialCoords).addTo(mapEditForm);
            mapEditForm.on('click', function(e) {
                const { lat, lng } = e.latlng;
                document.getElementById('edit-latitude').value = lat.toFixed(6);
                document.getElementById('edit-longitude').value = lng.toFixed(6);
                if (editMarker) editMarker.setLatLng(e.latlng);
            });
        } catch (e) { console.error("ERRO ao inicializar o mapa de edição:", e); }
    }, 200);
}

export function updateFazendaMarkers(fazendas) {}
export function updateCaminhaoMarkers(caminhoes) {}
export function updateEquipamentoMarkers(equipamentos) {}