// js/views/dashboard.js
import { mapManager } from '../maps.js';
import { dataCache } from '../dataCache.js';
import { showToast, showLoading, hideLoading, calculateDistance } from '../helpers.js';
import { CAMINHAO_ROUTE_STATUS } from '../constants.js';
import { getCurrentShift } from '../timeUtils.js';
import { fetchEscalaFuncionarios, fetchEscalaTurnos } from '../api.js';

// Coordenadas da usina (Definidas aqui para o cálculo Haversine)
const USINA_COORDS = [-17.642301, -40.181525];
const INITIAL_ZOOM = 14;

export class DashboardView {
    constructor() {
        this.container = null;
        this.data = {};
        this.autoRefreshInterval = null; // MANTIDO: Mas não mais usado para polling
        // MUDANÇA: Estado de filtragem da legenda (inicia tudo ativo)
        this.activeFilters = {
            usina: true,
            ativa: true,
            fazendo_cata: true,
            inativa: true,
            ocorrencia: true // NOVO: Filtro para ocorrências
        };
        this._boundStatusUpdateHandler = this.handleStatusUpdate.bind(this); // Para o listener
    }

    async show() {
        await this.loadHTML();
        await this.initializeMap();
        await this.loadData();
        // REMOVIDO: this.startAutoRefresh();
        this.addEventListeners();

        // NOVO: Adiciona o listener de Real-Time
        window.addEventListener('statusUpdated', this._boundStatusUpdateHandler);
    }

    async hide() {
        // REMOVIDO: this.stopAutoRefresh();
        // NOVO: Remove o listener ao sair da view
        window.removeEventListener('statusUpdated', this._boundStatusUpdateHandler);
    }

    // NOVO: Handler para o evento global
    handleStatusUpdate(e) {
        // Verifica se a atualização é relevante para o Dashboard antes de recarregar
        const tables = ['caminhoes', 'frentes_servico', 'ocorrencias'];
        if (tables.includes(e.detail.table)) {
             // Força o refresh para buscar a nova versão que invalidou o cache
             this.loadData(true);
        }
    }

    async loadHTML() {
        const container = document.getElementById('views-container');
        container.innerHTML = this.getHTML();
        this.container = container;
    }

    mockFrenteCycleTime(frenteId) {
        // Mock data: 3h 45m, 4h 10m, or 5h 05m based on frenteId
        if (frenteId % 3 === 0) return '03h 45m';
        if (frenteId % 3 === 1) return '04h 10m';
        return '05h 05m';
    }

    getHTML() {
        return `
            <div id="dashboard-view" class="view active-view">
                <div class="dashboard-header">
                    <h1>Dashboard de Operações Agrícolas</h1>
                    <button class="btn-primary" id="refresh-operations">
                        <i class="ph-fill ph-arrows-clockwise"></i>
                        Atualizar
                    </button>
                </div>

                <div class="map-fullscreen">
                    <div id="dashboard-map"></div>

                    <div class="modern-dashboard-overlay">
                        <div class="stats-panel">
                            <div class="panel-header">
                                <h3>Status das Operações</h3>
                                <div class="on-shift-info">
                                    <div id="on-shift-leaders"></div>
                                    <div id="on-shift-weighers"></div>
                                </div>
                                <div class="last-update" id="last-update">
                                    Atualizado agora
                                </div>
                            </div>

                            <div class="stats-grid">

                                <div class="stat-card">
                                    <div class="stat-header">
                                        <div class="stat-icon">
                                            <i class="ph-fill ph-truck"></i>
                                        </div>
                                        <div class="stat-title">Caminhões</div>
                                    </div>
                                    <div class="stat-content status-3-cols">
                                        <div class="stat-main">
                                            <span class="stat-value small-value" id="caminhoes-em-operacao">0</span>
                                            <span class="stat-label">Em Operação</span>
                                        </div>
                                        <div class="stat-secondary">
                                            <span class="stat-value ready small-value" id="caminhoes-prontos">0</span>
                                            <span class="stat-label">Prontos / Pátio</span>
                                        </div>
                                        <div class="stat-secondary">
                                            <span class="stat-badge danger small-value" id="caminhoes-criticos">0</span>
                                            <span class="stat-label">Inativos Críticos</span>
                                        </div>
                                    </div>
                                    <div class="stat-total">
                                        Total: <span id="caminhoes-total">0</span>
                                    </div>
                                </div>

                                <div class="stat-card">
                                    <div class="stat-header">
                                        <div class="stat-icon" style="background: linear-gradient(135deg, #2B6CB0, #4C77A5);">
                                            <i class="ph-fill ph-users-three"></i>
                                        </div>
                                        <div class="stat-title">Frentes</div>
                                    </div>
                                    <div class="stat-content status-3-cols">
                                        <div class="stat-main">
                                            <span class="stat-value small-value" id="frentes-ativas">0</span>
                                            <span class="stat-label">Ativas (Colheita)</span>
                                        </div>
                                        <div class="stat-secondary">
                                            <span class="stat-value warning small-value" id="frentes-cata">0</span>
                                            <span class="stat-label">Em Cata</span>
                                        </div>
                                        <div class="stat-secondary">
                                            <span class="stat-badge danger small-value" id="frentes-inativas">0</span>
                                            <span class="stat-label">Inativas</span>
                                        </div>
                                    </div>
                                    <div class="stat-total">
                                        Total: <span id="frentes-total">0</span>
                                    </div>
                                </div>

                                <div class="stat-card">
                                    <div class="stat-header">
                                        <div class="stat-icon" style="background: linear-gradient(135deg, #D69E2E, #B7791F);">
                                            <i class="ph-fill ph-tractor"></i>
                                        </div>
                                        <div class="stat-title">Equipamentos</div>
                                    </div>
                                    <div class="stat-content status-3-cols">
                                        <div class="stat-main">
                                            <span class="stat-value small-value" id="equipamentos-em-operacao">0</span>
                                            <span class="stat-label">Em Operação</span>
                                        </div>
                                        <div class="stat-secondary">
                                            <span class="stat-value ready small-value" id="equipamentos-disponiveis">0</span>
                                            <span class="stat-label">Disponíveis (Livre)</span>
                                        </div>
                                        <div class="stat-secondary">
                                            <span class="stat-badge danger small-value" id="equipamentos-criticos">0</span>
                                            <span class="stat-label">Inativos Críticos</span>
                                        </div>
                                    </div>
                                    <div class="stat-total">
                                        Total: <span id="equipamentos-total">0</span>
                                    </div>
                                </div>

                                <div class="stat-card">
                                    <div class="stat-header">
                                        <div class="stat-icon" style="background: linear-gradient(135deg, #805AD5, #6A49B8);">
                                            <i class="ph-fill ph-tree-evergreen"></i>
                                        </div>
                                        <div class="stat-title">Fazendas</div>
                                    </div>
                                    <div class="stat-content status-3-cols">
                                        <div class="stat-main">
                                            <span class="stat-value small-value" id="fazendas-colhendo">0</span>
                                            <span class="stat-label">Colhendo</span>
                                        </div>
                                        <div class="stat-secondary">
                                            <span class="stat-value info-metric small-value" id="raio-medio-km">--</span>
                                            <span class="stat-label">Raio Médio (Km)</span>
                                        </div>
                                        <div class="stat-secondary">
                                            <span class="stat-value small-value" id="fazendas-disponiveis">0</span>
                                            <span class="stat-label">Disponíveis</span>
                                        </div>
                                    </div>
                                    <div class="stat-total">
                                        Total: <span id="fazendas-total">0</span>
                                    </div>
                                </div>
                            </div>

                            <div class="panel-footer">
                                <div class="efficiency-metric">
                                    <div class="metric-label">Eficiência Geral</div>
                                    <div class="metric-value">
                                        <span id="eficiencia-geral">0%</span>
                                        <div class="metric-bar">
                                            <div class="metric-fill" id="eficiencia-bar"></div>
                                        </div>
                                    </div>
                                </div>
                                <div class="active-now">
                                    <i class="ph-fill ph-pulse"></i>
                                    <span id="operacoes-ativas">0</span> operações ativas
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="map-legend" id="map-legend"> <div class="legend-title">Legenda</div>
                        <div class="legend-items">
                            <div class="legend-item ${this.activeFilters.ocorrencia ? '' : 'disabled'}" data-filter-key="ocorrencia">
                                <i class="ph-fill ph-siren" style="font-size: 20px; color: #ED8936; width: 16px; text-align: center;"></i>
                                <span>Ocorrência</span>
                            </div>

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
                </div>
            </div>
        `;
    }

    async initializeMap() {
        return new Promise(resolve => {
            // Usa um pequeno delay para garantir que o DOM esteja renderizado antes de inicializar o Leaflet
            setTimeout(() => {
                const map = mapManager.initDashboardMap();
                if (map) {
                    console.log('Mapa principal inicializado com sucesso');
                    mapManager.invalidateSize('dashboard-map');
                }
                resolve(); // Resolve a Promise para que loadData() possa ser chamada
            }, 100);
        });
    }

    async loadData(forceRefresh = false) {
        try {
            // CORRIGIDO: Usa a função otimizada com CACHE para o Dashboard
            this.data = await dataCache.fetchMetadata(forceRefresh);
            this.updateDashboardStats();
            this.updateMap();
            await this.updateOnShiftStaff();
            this.updateLastUpdateTime();
        } catch (error) {
            console.error('Erro ao carregar dados do dashboard:', error);
            showToast('Erro ao carregar dados', 'error');
        }
    }

    // MUDANÇA: Lógica de contagem e cálculo do Raio Médio
    updateDashboardStats() {
        const { caminhoes, frentes_servico, equipamentos, fazendas } = this.data;

        const operationalStatuses = CAMINHAO_ROUTE_STATUS;
        const readyStatuses = ['disponivel', 'patio_vazio'];
        const criticalStatuses = ['quebrado', 'parado'];

        // 1. Estatísticas de Caminhões
        const totalCaminhoes = caminhoes ? caminhoes.length : 0;
        const caminhoesEmOperacao = caminhoes ? caminhoes.filter(c =>
            operationalStatuses.includes(c.status)
        ).length : 0;
        const caminhoesProntos = caminhoes ? caminhoes.filter(c =>
            readyStatuses.includes(c.status)
        ).length : 0;
        const caminhoesCriticos = caminhoes ? caminhoes.filter(c =>
            criticalStatuses.includes(c.status)
        ).length : 0;

        // 2. Estatísticas de Frentes
        const totalFrentes = frentes_servico ? frentes_servico.length : 0;
        const frentesAtivas = frentes_servico ? frentes_servico.filter(f => f.status === 'ativa').length : 0;
        const frentesCata = frentes_servico ? frentes_servico.filter(f => f.status === 'fazendo_cata').length : 0;
        const frentesInativas = frentes_servico ? frentes_servico.filter(f => f.status === 'inativa' || !f.status).length : 0;

        // 3. Estatísticas de Equipamentos
        const totalEquipamentos = equipamentos ? equipamentos.length : 0;
        const equipamentosEmOperacao = equipamentos ? equipamentos.filter(e =>
            e.status === 'ativo' && e.frente_id // Ativo E associado a uma frente
        ).length : 0;
        const equipamentosDisponiveis = equipamentos ? equipamentos.filter(e =>
            e.status === 'ativo' && !e.frente_id // Ativo E sem frente (livre)
        ).length : 0;
        const equipamentosCriticos = equipamentos ? equipamentos.filter(e =>
            criticalStatuses.includes(e.status) // Parado ou Quebrado
        ).length : 0;

        // 4. Estatísticas de Fazendas (Raio Médio)
        const totalFazendas = fazendas ? fazendas.length : 0;

        const fazendasAtivasIds = new Set(
            frentes_servico.filter(f => f.fazenda_id && f.status === 'ativa')
                            .map(f => f.fazenda_id)
        );

        const fazendasColhendo = fazendasAtivasIds.size;

        // --- ALTERAÇÃO PRINCIPAL ---
        // Uma fazenda é considerada "disponível" se estiver associada a uma frente INATIVA.
        const fazendasDisponiveis = frentes_servico ? frentes_servico.filter(f =>
            f.fazenda_id && f.status === 'inativa'
        ).length : 0;
        // --- FIM DA ALTERAÇÃO ---


        // --- CÁLCULO DO RAIO MÉDIO (NOVO) ---
        let totalDistance = 0;
        let countHarvestingFazendas = 0;

        fazendas.forEach(f => {
            // Verifica se a fazenda está ativamente colhendo (status 'ativa')
            if (fazendasAtivasIds.has(f.id) && f.latitude && f.longitude) {
                const lat = parseFloat(f.latitude);
                const lon = parseFloat(f.longitude);

                // Garante que as coordenadas sejam válidas
                if (!isNaN(lat) && !isNaN(lon)) {
                    const distance = calculateDistance(
                        USINA_COORDS[0], USINA_COORDS[1],
                        lat, lon
                    );
                    totalDistance += distance;
                    countHarvestingFazendas++;
                }
            }
        });

        const averageRadius = countHarvestingFazendas > 0 ? (totalDistance / countHarvestingFazendas).toFixed(1) : '--';
        // ------------------------------------

        // --- ATUALIZAÇÃO DOS ELEMENTOS ---

        // Caminhões
        this.updateStatElement('caminhoes-em-operacao', caminhoesEmOperacao);
        this.updateStatElement('caminhoes-prontos', caminhoesProntos);
        this.updateStatElement('caminhoes-criticos', caminhoesCriticos);
        this.updateStatElement('caminhoes-total', totalCaminhoes);

        // Frentes
        this.updateStatElement('frentes-ativas', frentesAtivas);
        this.updateStatElement('frentes-cata', frentesCata);
        this.updateStatElement('frentes-inativas', frentesInativas);
        this.updateStatElement('frentes-total', totalFrentes);

        // Equipamentos
        this.updateStatElement('equipamentos-em-operacao', equipamentosEmOperacao);
        this.updateStatElement('equipamentos-disponiveis', equipamentosDisponiveis);
        this.updateStatElement('equipamentos-criticos', equipamentosCriticos);
        this.updateStatElement('equipamentos-total', totalEquipamentos);

        // Fazendas
        this.updateStatElement('fazendas-colhendo', fazendasColhendo);
        // MUDANÇA: Atualiza o KPI de Raio Médio
        this.updateStatElement('raio-medio-km', averageRadius);
        this.updateStatElement('fazendas-disponiveis', fazendasDisponiveis);
        this.updateStatElement('fazendas-total', totalFazendas);

        // --- CÁLCULOS GERAIS (Eficiência Geral) ---

        // Numerador: Soma dos recursos e frentes que estão em atividade/operação
        const totalActive = caminhoesEmOperacao + equipamentosEmOperacao + frentesAtivas + frentesCata;

        // Denominador: Soma dos recursos totais (Caminhões e Equipamentos) mais o total de Frentes de Serviço
        const totalOverallResources = totalCaminhoes + totalEquipamentos + totalFrentes;

        // NOVO CÁLCULO DE EFICIÊNCIA GERAL
        const eficiencia = totalOverallResources > 0 ? Math.round((totalActive / totalOverallResources) * 100) : 0;

        this.updateStatElement('eficiencia-geral', `${eficiencia}%`);
        this.updateEfficiencyBar(eficiencia);

        const operacoesAtivas = totalActive;
        this.updateStatElement('operacoes-ativas', operacoesAtivas);
    }

    async updateOnShiftStaff() {
        const leadersEl = document.getElementById('on-shift-leaders');
        const weighersEl = document.getElementById('on-shift-weighers');
        if (!leadersEl || !weighersEl) return;

        try {
            const todayStr = new Date().toISOString().split('T')[0];
            const currentShiftInfo = getCurrentShift();

            // Busca os dados da escala
            const funcionarios = await fetchEscalaFuncionarios();
            const turnosHoje = await fetchEscalaTurnos(todayStr, todayStr);

            // Mapeia os turnos de hoje para fácil acesso
            const turnosMap = new Map();
            turnosHoje.forEach(t => {
                turnosMap.set(t.funcionario_id, t.turno);
            });

            // Filtra os funcionários que estão no turno atual e separa por função
            const onShiftLeaders = funcionarios.filter(f =>
                f.funcao === 'Líder de Produção Agrícola' &&
                turnosMap.get(f.id) === currentShiftInfo.turno
            ).map(f => f.nome).join(', ');

            const onShiftWeighers = funcionarios.filter(f =>
                f.funcao === 'Balanceiro' &&
                turnosMap.get(f.id) === currentShiftInfo.turno
            ).map(f => f.nome).join(', ');

            // Atualiza o HTML
            leadersEl.innerHTML = `Líder(es) de Turno: <span>${onShiftLeaders || 'N/D'}</span>`;
            weighersEl.innerHTML = `Balanceiro(s): <span>${onShiftWeighers || 'N/D'}</span>`;

        } catch (error) {
            console.error('Erro ao buscar equipe do turno:', error);
            leadersEl.innerHTML = `Líder(es) de Turno: <span>Erro</span>`;
            weighersEl.innerHTML = `Balanceiro(s): <span>Erro</span>`;
        }
    }

    updateStatElement(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            // MUDANÇA: Evita animação para Raio Médio (strings)
            if (typeof value === 'number' && !isNaN(value)) {
                this.animateCount(element, parseInt(element.textContent) || 0, value);
            } else {
                element.textContent = value;
            }
        }
    }

    animateCount(element, start, end) {
        const duration = 800;
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            const easeOut = 1 - Math.pow(1 - progress, 3);
            const currentValue = Math.floor(start + (end - start) * easeOut);

            element.textContent = currentValue;

            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                element.textContent = end;
            }
        }

        requestAnimationFrame(update);
    }

    updateEfficiencyBar(percentage) {
        const bar = document.getElementById('eficiencia-bar');
        if (bar) {
            bar.style.width = `${percentage}%`;

            if (percentage >= 80) {
                bar.style.background = 'linear-gradient(90deg, #38A169, #2F855A)';
            } else if (percentage >= 60) {
                bar.style.background = 'linear-gradient(90deg, #D69E2E, #B7791F)';
            } else {
                bar.style.background = 'linear-gradient(90deg, #E53E3E, #C53030)';
            }
        }
    }

    updateLastUpdateTime() {
        const element = document.getElementById('last-update');
        if (element) {
            const now = new Date();
            element.textContent = `Atualizado: ${now.toLocaleTimeString('pt-BR')}`;
        }
    }

    updateMap() {
        const { fazendas, frentes_servico, caminhoes, equipamentos } = this.data;
        if (!fazendas || fazendas.length === 0) {
             // Se não há fazendas no BD, centraliza na usina com zoom distante.
            mapManager.maps.get('dashboard-map')?.setView(USINA_COORDS, 10);
            // Garante que a camada vazia seja processada para remover quaisquer marcadores antigos.
            mapManager.updateFazendaMarkersWithStatus([], this.activeFilters);
            this.updateOcorrenciaMarkers(); // Limpa ocorrências
            return;
        }

        // --- Agregação de Dados Dinâmicos por Fazenda ---
        const fazendaDataMap = new Map();
        const cycleStatuses = CAMINHAO_ROUTE_STATUS;

        // 1. Mapear Frentes e seus status
        const frenteMap = new Map(frentes_servico.map(f => [f.id, f]));

        // 2. Agregação inicial
        fazendas.forEach(f => {
             fazendaDataMap.set(f.id, {
                ...f,
                frenteStatus: null,
                trucksInRoute: 0,
                activeEquipment: 0,
                frenteNome: 'N/A'
             });
        });

        // 3. Contar Caminhões e Equipamentos Ativos por Frente/Fazenda
        caminhoes.forEach(c => {
            if (c.frente_id && cycleStatuses.includes(c.status)) {
                const frente = frenteMap.get(c.frente_id);
                if (frente && frente.fazenda_id && fazendaDataMap.has(frente.fazenda_id)) {
                    fazendaDataMap.get(frente.fazenda_id).trucksInRoute++;
                }
            }
        });

        equipamentos.forEach(e => {
            if (e.frente_id && e.status === 'ativo') {
                 const frente = frenteMap.get(e.frente_id);
                if (frente && frente.fazenda_id && fazendaDataMap.has(frente.fazenda_id)) {
                    fazendaDataMap.get(frente.fazenda_id).activeEquipment++;
                }
            }
        });

        // 4. Mapear Status Ativo da Frente para a Fazenda e ADICIONAR TEMPO DE CICLO
        frentes_servico.filter(f => f.fazenda_id && (f.status === 'ativa' || f.status === 'fazendo_cata' || f.status === 'inativa'))
                       .forEach(frente => {
                           if (fazendaDataMap.has(frente.fazenda_id)) {
                               const data = fazendaDataMap.get(frente.fazenda_id);
                               data.frenteStatus = frente.status; // Ativa, Cata, Inativa
                               data.frenteNome = frente.nome || 'N/A'; // CORREÇÃO AQUI: Garante que não é undefined
                               data.frente_id = frente.id;
                               // MUDANÇA: Adiciona Tempo de Ciclo (Mock)
                               data.cycleTime = this.mockFrenteCycleTime(frente.id);
                           }
                       });

        // 5. Filtrar apenas as fazendas que DEVEM aparecer no mapa (com frente associada)
        const fazendasNoMapa = Array.from(fazendaDataMap.values()).filter(f => f.frenteStatus !== null);

        // --- FIM NOVO: Agregação de Dados Dinâmicos por Fazenda ---

        // 1. ATUALIZA OS MARCADORES DE FAZENDA
        mapManager.updateFazendaMarkersWithStatus(fazendasNoMapa, this.activeFilters);

        // NOVO: ATUALIZA OS MARCADORES DE OCORRÊNCIAS
        this.updateOcorrenciaMarkers();


        // 2. AJUSTA O MAPA
        // MUDANÇA: O ajuste do mapa deve considerar as ocorrências APENAS se o filtro estiver ativo.
        if (fazendasNoMapa.length > 0 || this.activeFilters.ocorrencia) {
            this.adjustMapToShowFazendas(fazendasNoMapa);
        } else {
            // Apenas centraliza se a lista estiver vazia. O passo 1 já limpou.
            mapManager.maps.get('dashboard-map')?.setView(USINA_COORDS, 10);
            this.updateLastUpdateTime();
        }
    }

    // NOVO: Função para desenhar marcadores de ocorrência
    async updateOcorrenciaMarkers() {
        // Usa o fetchAllData para garantir o histórico de logs e a tabela de ocorrências
        const fullData = await dataCache.fetchAllData();
        const ocorrencias = fullData.ocorrencias || [];
        const map = mapManager.maps.get('dashboard-map');

        if (!map) return;

        // Limpa marcadores de ocorrência antigos (se houver)
        mapManager.clearMarkers('dashboard-ocorrencias');

        // FILTRO: Se o filtro de ocorrência estiver desativado, não desenha nada
        if (!this.activeFilters.ocorrencia) {
            return;
        }


        ocorrencias.forEach(ocorrencia => {
            // Apenas mostra ocorrências em aberto (status 'aberto')
            if (ocorrencia.status === 'aberto' && ocorrencia.latitude && ocorrencia.longitude) {
                const coords = [parseFloat(ocorrencia.latitude), parseFloat(ocorrencia.longitude)];

                // Cria ícone de triângulo amarelo (reutilizando classes)
                const ocorrenciaIcon = L.divIcon({
                    className: 'ocorrencia-marker',
                    // REMOÇÃO DO TRIÂNGULO e ÍCONE SIRENE AJUSTADO
                    html: `
                        <div class="marker-pin" style="background-color: #ED8936; border-radius: 50%; width: 40px; height: 40px; margin: 0; display: flex; align-items: center; justify-content: center;">
                            <i class="ph-fill ph-siren" style="font-size: 24px; color: black; transform: rotate(0deg);"></i>
                        </div>
                        <div class="marker-pulse" style="background-color: #ED8936;"></div>
                    `,
                    iconSize: [40, 40],
                    iconAnchor: [20, 40]
                });

                const marker = L.marker(coords, { icon: ocorrenciaIcon });

                const popupContent = `
                    <div class="fazenda-popup" style="min-width: 200px;">
                        <h4>OCORRÊNCIA: ${this.formatOption(ocorrencia.tipo)}</h4>
                        <div class="popup-status fazendo_cata" style="background: rgba(237, 137, 54, 0.2); color: #ED8936;">
                            <i class="ph-fill ph-circle"></i>
                            ${ocorrencia.status === 'aberto' ? 'EM ABERTO' : 'RESOLVIDO'}
                        </div>
                        <div class="popup-details">
                            <p><strong>Detalhes:</strong> <span class="value">${ocorrencia.descricao}</span></p>
                            <p><strong>Frentes Impactadas:</strong> <span class="value">${(ocorrencia.frentes_impactadas || []).length}</span></p>
                            <p><strong>Registro:</strong> <span class="value">${new Date(ocorrencia.created_at).toLocaleDateString('pt-BR')}</span></p>
                        </div>

                        <div class="popup-actions">
                            <button class="btn-primary btn-action-map" data-action="goToOcorrencias" data-ocorrencia-id="${ocorrencia.id}" title="Gerenciar Ocorrência">
                                <i class="ph-fill ph-siren"></i> Gerenciar Ocorrência
                            </button>
                        </div>
                    </div>
                `;

                marker.bindPopup(popupContent);
                marker.addTo(map);

                // NOVO: Adiciona o listener de clique no pop-up para navegar
                marker.on('popupopen', () => {
                     // CORREÇÃO: Altera o seletor para buscar a o botão pelo atributo data-action,
                     // pois a classe '.ocorrencia-marker' não está no container do popup.
                     const btn = document.querySelector('[data-action="goToOcorrencias"]');

                     if (btn) {
                         btn.addEventListener('click', () => {
                             // Dispara o evento de troca de view
                             window.dispatchEvent(new CustomEvent('viewChanged', {
                                 detail: {
                                     view: 'ocorrencias'
                                 }
                             }));
                         });
                     }
                 });


                if (!mapManager.markers.has('dashboard-ocorrencias')) {
                    mapManager.markers.set('dashboard-ocorrencias', []);
                }
                mapManager.markers.get('dashboard-ocorrencias').push(marker);
            }
        });
    }

    // Função auxiliar para formatação (reutilizada de cadastros.js)
    formatOption(option) {
        if (!option || typeof option !== 'string') return 'N/A';
        return option.charAt(0).toUpperCase() + option.slice(1).replace('_', ' ');
    }


    adjustMapToShowFazendas(fazendas) {
        const map = mapManager.maps.get('dashboard-map');
        if (!map) return;

        const bounds = this.calculateBounds(fazendas);

        // MUDANÇA: Adiciona ocorrências ativas APENAS se o filtro estiver ativo
        if (this.activeFilters.ocorrencia) {
            const ocorrenciasMarkers = mapManager.markers.get('dashboard-ocorrencias') || [];
            ocorrenciasMarkers.forEach(marker => {
                 bounds.extend(marker.getLatLng());
            });
        }


        if (bounds.isValid()) {
            // MUDANÇA: Ajuste de Zoom para 14
            map.fitBounds(bounds, {
                paddingTopLeft: [50, 200], // 50px de cima, 200px da esquerda
                paddingBottomRight: [50, 50],
                maxZoom: 14 // MUDANÇA AQUI: Visão mais detalhada (Zoom mais próximo)
            });
        }
    }

    calculateBounds(fazendas) {
        const bounds = L.latLngBounds();

        // 1. Incluir Coordenadas da Usina SEMPRE
        bounds.extend(USINA_COORDS);

        // 2. Incluir todas as fazendas ativas
        fazendas.forEach(fazenda => {
            if (fazenda.latitude && fazenda.longitude) {
                bounds.extend([parseFloat(fazenda.latitude), parseFloat(fazenda.longitude)]);
            }
        });

        return bounds;
    }

    addEventListeners() {
        const refreshBtn = document.getElementById('refresh-operations');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                // Força o refresh para ignorar o cache de 10s.
                this.loadData(true);
                showToast('Operações atualizadas', 'success');
            });
        }

        // MUDANÇA: Lógica de Filtragem da Legenda
        const legend = document.getElementById('map-legend');
        if (legend) {
            legend.addEventListener('click', (e) => {
                const item = e.target.closest('.legend-item');
                const filterKey = item?.dataset.filterKey;

                if (filterKey) {
                    // A usina não é filtrada por esta lógica, mas as fazendas sim
                    if (filterKey === 'usina') return;

                    this.activeFilters[filterKey] = !this.activeFilters[filterKey];
                    item.classList.toggle('disabled');
                    this.updateMap(); // Redraw map with new filters
                }
            });
        }
    }
}