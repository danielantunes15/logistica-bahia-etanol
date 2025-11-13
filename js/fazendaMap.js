// js/fazendaMap.js
// Configuração dedicada para o mapa da página de Fazendas.

// Coordenadas da Usina (ponto central)
const USINA_COORDS = [-17.642301, -40.181525];
const INITIAL_ZOOM = 10;

/**
 * Inicializa um mapa Leaflet simples, isolado do MapManager principal.
 * Usa o tile layer do Google Satellite.
 * @param {string} containerId - O ID do elemento HTML onde o mapa será renderizado.
 * @returns {L.Map|null} A instância do mapa Leaflet ou null se falhar.
 */
export function initFazendaMap(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container ${containerId} não encontrado para o mapa da Fazenda.`);
        return null;
    }

    try {
        const map = L.map(containerId).setView(USINA_COORDS, INITIAL_ZOOM);

        // Camada do Google Satellite (mesma do mapa principal)
        L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
            attribution: '&copy; Google'
        }).addTo(map);

        // Adiciona o marcador da Usina (ícone de pino roxo)
        const usinaIcon = L.divIcon({
            className: 'usina-marker', // Reutiliza o CSS da usina (pino roxo)
            html: `<div class="marker-pin usina"><i class="ph-fill ph-factory"></i></div><div class="marker-pulse usina"></div>`,
            iconSize: [45, 45],
            iconAnchor: [22, 45]
        });

        L.marker(USINA_COORDS, { icon: usinaIcon }).addTo(map)
            .bindPopup('<b>Usina LOGISTICA BEL</b><br>Localização principal');

        return map;
    } catch (error) {
        console.error(`Erro ao inicializar mapa da Fazenda ${containerId}:`, error);
        return null;
    }
}