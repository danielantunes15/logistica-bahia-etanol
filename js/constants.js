// js/constants.js

export const CAMINHAO_STATUS_LABELS = {
    disponivel: 'Disponível',
    indo_carregar: 'Sentido Carreg.',
    carregando: 'Carregando',
    retornando: 'Sentido Usina',
    patio_carregado: 'Pátio Carregado',
    descarregando: 'Descarregando',
    patio_vazio: 'Pátio Vazio',
    quebrado: 'Quebrado',
    parado: 'Parado (Obs.)' // Status de parada com observação
};

export const CAMINHAO_STATUS_CYCLE = [
    'indo_carregar', 
    'carregando', 
    'retornando', 
    'patio_carregado',
    'descarregando',
    'patio_vazio' 
];

export const FRENTE_STATUS_LABELS = {
    ativa: 'Ativa (Colheita)',
    inativa: 'Inativa',
    fazendo_cata: 'Fazendo Cata',
};

export const EQUIPAMENTO_STATUS_LABELS = {
    ativo: 'Em Operação',
    parado: 'Parado',
    quebrado: 'Quebrado',
};

// Status de caminhões que indicam que ele está em uma rota de colheita/descarga.
export const CAMINHAO_ROUTE_STATUS = [
    'indo_carregar', 
    'carregando', 
    'retornando', 
    'patio_carregado',
    'descarregando'
];