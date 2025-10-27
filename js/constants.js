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

// NOVO: Motivos pré-definidos para Parada/Quebra (Centralizados)
export const PREDEFINED_MOTIVES = [
    'Manutenção Preventiva',
    'Manutenção Corretiva (Motor/Câmbio)',
    'Pneu Furado/Estourado',
    'Aguardando Peça/Componente',
    'Caminhão Bloqueado (Administrativo)',
    'Problema Elétrico/Eletrônico',
    'Outros' 
];