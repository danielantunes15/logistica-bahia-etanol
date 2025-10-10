// js/views/dashboard.js
import { mapManager } from '../maps.js';
// CORRIGIDO: Usa fetchMetadata em vez de fetchAllData
// Adicionado: Importa dataCache
import { dataCache } from '../dataCache.js';
import { showToast, showLoading, hideLoading } from '../helpers.js';
// NOVO: Importa constantes
import { CAMINHAO_ROUTE_STATUS } from '../constants.js';

export class DashboardView {
    constructor() {
        this.container = null;
        this.data = {};
        this.autoRefreshInterval = null;
    }

    async show() {
        await this.loadHTML();
        await this.initializeMap();
        await this.loadData();
        this.startAutoRefresh();
        this.addEventListeners();
    }

    async hide() {
        this.stopAutoRefresh();
    }

    async loadHTML() {
        const container = document.getElementById('views-container');
        container.innerHTML = this.getHTML();
        this.container = container;
    }

    getHTML() {
        return `
            <div id="dashboard-view" class="view active-view">
                <div class="dashboard-header">
                    <h1>Dashboard de Operações Agrícolas</h1>
                    <div class="dashboard-actions">
                        <button class="btn-primary" id="refresh-operations">
                            <i class="ph-fill ph-arrows-clockwise"></i>
                            Atualizar
                        </button>
                    </div>
                </div>

                <div class="map-fullscreen">
                    <div id="dashboard-map"></div>
                    
                    <div class="modern-dashboard-overlay">
                        <div class="stats-panel">
                            <div class="panel-header">
                                <h3>Status das Operações</h3>
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
                                    <div class="stat-content">
                                        <div class="stat-main">
                                            <span class="stat-value" id="caminhoes-ativos">0</span>
                                            <span class="stat-label">Em Operação</span>
                                        </div>
                                        <div class="stat-secondary">
                                            <span class="stat-badge danger" id="caminhoes-parados">0</span>
                                            <span class="stat-label">Parados</span>
                                        </div>
                                    </div>
                                    <div class="stat-total">
                                        Total: <span id="caminhoes-total">0</span>
                                    </div>
                                </div>

                                <div class="stat-card">
                                    <div class="stat-header">
                                        <div class="stat-icon">
                                            <i class="ph-fill ph-users-three"></i>
                                        </div>
                                        <div class="stat-title">Frentes</div>
                                    </div>
                                    <div class="stat-content">
                                        <div class="stat-main">
                                            <span class="stat-value" id="frentes-ativas">0</span>
                                            <span class="stat-label">Ativas</span>
                                        </div>
                                        <div class="stat-secondary">
                                            <span class="stat-badge danger" id="frentes-inativas">0</span>
                                            <span class="stat-label">Inativas</span>
                                        </div>
                                    </div>
                                    <div class="stat-total">
                                        Total: <span id="frentes-total">0</span>
                                    </div>
                                </div>

                                <div class="stat-card">
                                    <div class="stat-header">
                                        <div class="stat-icon">
                                            <i class="ph-fill ph-tractor"></i>
                                        </div>
                                        <div class="stat-title">Equipamentos</div>
                                    </div>
                                    <div class="stat-content">
                                        <div class="stat-main">
                                            <span class="stat-value" id="equipamentos-ativos">0</span>
                                            <span class="stat-label">Em Operação</span>
                                        </div>
                                        <div class="stat-secondary">
                                            <span class="stat-badge danger" id="equipamentos-parados">0</span>
                                            <span class="stat-label">Parados</span>
                                        </div>
                                    </div>
                                    <div class="stat-total">
                                        Total: <span id="equipamentos-total">0</span>
                                    </div>
                                </div>

                                <div class="stat-card">
                                    <div class="stat-header">
                                        <div class="stat-icon">
                                            <i class="ph-fill ph-tree-evergreen"></i>
                                        </div>
                                        <div class="stat-title">Fazendas</div>
                                    </div>
                                    <div class="stat-content">
                                        <div class="stat-main">
                                            <span class="stat-value" id="fazendas-colhendo">0</span>
                                            <span class="stat-label">Colhendo/Cata</span>
                                        </div>
                                        <div class="stat-secondary">
                                            <span class="stat-badge" id="fazendas-disponiveis">0</span>
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

                    <div class="map-legend">
                        <div class="legend-title">Legenda</div>
                        <div class="legend-items">
                            <div class="legend-item">
                                <div class="legend-color usina"></div>
                                <span>Usina</span>
                            </div>
                            <div class="legend-item">
                                <div class="legend-color colhendo"></div>
                                <span>Colhendo</span>
                            </div>
                            <div class="legend-item">
                                <div class="legend-color fazendo_cata"></div>
                                <span>Cata</span>
                            </div>
                            <div class="legend-item">
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
        setTimeout(() => {
            const map = mapManager.initDashboardMap();
            if (map) {
                console.log('Mapa principal inicializado com sucesso');
                mapManager.invalidateSize('dashboard-map');
            }
        }, 100);
    }

    async loadData() {
        showLoading();
        try {
            // CORRIGIDO: Usa a função otimizada com CACHE para o Dashboard
            this.data = await dataCache.fetchMetadata(); 
            this.updateDashboardStats();
            this.updateMap();
            this.updateLastUpdateTime();
        } catch (error) {
            console.error('Erro ao carregar dados do dashboard:', error);
            showToast('Erro ao carregar dados', 'error');
        } finally {
            hideLoading();
        }
    }

    startAutoRefresh() {
        // Atualizar a cada 30 segundos
        this.autoRefreshInterval = setInterval(() => {
            // Chama loadData que usará o cache se o tempo de 10s não tiver passado.
            this.loadData();
        }, 30000);
    }

    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }

    updateDashboardStats() {
        const { caminhoes, frentes_servico, equipamentos, fazendas } = this.data;

        // -------------------------------------------------------------
        // CORREÇÃO: Usa a constante importada
        const cycleStatuses = CAMINHAO_ROUTE_STATUS;
        // -------------------------------------------------------------

        // Estatísticas de Caminhões
        const totalCaminhoes = caminhoes ? caminhoes.length : 0;
        const caminhoesAtivos = caminhoes ? caminhoes.filter(c => 
            cycleStatuses.includes(c.status) // Filtra APENAS pelos status de movimentação/operação
        ).length : 0;
        
        // Caminhões Parados: todos que NÃO estão nos status Ativos (inclui 'disponivel', 'patio_vazio' e 'quebrado')
        const caminhoesParados = totalCaminhoes - caminhoesAtivos; 

        // Estatísticas de Frentes (MODIFICADO)
        const totalFrentes = frentes_servico ? frentes_servico.length : 0;
        const frentesAtivasColheita = frentes_servico ? frentes_servico.filter(f => f.status === 'ativa' || f.status === 'fazendo_cata').length : 0;
        const frentesInativas = totalFrentes - frentesAtivasColheita;

        // Estatísticas de Equipamentos
        const totalEquipamentos = equipamentos ? equipamentos.length : 0;
        const equipamentosAtivos = equipamentos ? equipamentos.filter(e => 
            e.status === 'ativo' || e.status === 'em_viagem'
        ).length : 0;
        const equipamentosParados = totalEquipamentos - equipamentosAtivos;

        // Estatísticas de Fazendas (MODIFICADO)
        // Fazendas Colhendo/Cata: Contar fazendas que TEM uma frente ativa/fazendo_cata associada
        const fazendasColhendoIds = new Set(
            frentes_servico.filter(f => f.fazenda_id && (f.status === 'ativa' || f.status === 'fazendo_cata'))
                            .map(f => f.fazenda_id)
        );
        const fazendasColhendo = fazendasColhendoIds.size;
        
        // Fazendas Disponíveis: Contar fazendas que não estão associadas a nenhuma frente ativa/cata
        const totalFazendas = fazendas ? fazendas.length : 0;
        const fazendasDisponiveis = totalFazendas - fazendasColhendo;


        // Atualizar elementos
        this.updateStatElement('caminhoes-ativos', caminhoesAtivos);
        this.updateStatElement('caminhoes-parados', caminhoesParados);
        this.updateStatElement('caminhoes-total', totalCaminhoes);

        this.updateStatElement('frentes-ativas', frentesAtivasColheita);
        this.updateStatElement('frentes-inativas', frentesInativas);
        this.updateStatElement('frentes-total', totalFrentes);

        this.updateStatElement('equipamentos-ativos', equipamentosAtivos);
        this.updateStatElement('equipamentos-parados', equipamentosParados);
        this.updateStatElement('equipamentos-total', totalEquipamentos);

        this.updateStatElement('fazendas-colhendo', fazendasColhendo);
        this.updateStatElement('fazendas-disponiveis', fazendasDisponiveis);
        this.updateStatElement('fazendas-total', totalFazendas);

        // Calcular eficiência geral
        const totalAtivos = caminhoesAtivos + equipamentosAtivos;
        const totalRecursos = totalCaminhoes + totalEquipamentos;
        const eficiencia = totalRecursos > 0 ? Math.round((totalAtivos / totalRecursos) * 100) : 0;
        
        this.updateStatElement('eficiencia-geral', `${eficiencia}%`);
        this.updateEfficiencyBar(eficiencia);

        // Operações ativas
        const operacoesAtivas = caminhoesAtivos + equipamentosAtivos + fazendasColhendo;
        this.updateStatElement('operacoes-ativas', operacoesAtivas);
    }

    updateStatElement(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            if (typeof value === 'number') {
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
            mapManager.clearMarkers('dashboard-fazendas');
            mapManager.maps.get('dashboard-map')?.setView(USINA_COORDS, 10); 
            return;
        }

        // --- NOVO: Agregação de Dados Dinâmicos por Fazenda ---
        const fazendaDataMap = new Map();
        const cycleStatuses = CAMINHAO_ROUTE_STATUS; // Caminhões que estão em rota

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
        
        // 4. Mapear Status Ativo da Frente para a Fazenda
        frentes_servico.filter(f => f.fazenda_id && (f.status === 'ativa' || f.status === 'fazendo_cata' || f.status === 'inativa'))
                       .forEach(frente => {
                           if (fazendaDataMap.has(frente.fazenda_id)) {
                               const data = fazendaDataMap.get(frente.fazenda_id);
                               data.frenteStatus = frente.status; // Ativa, Cata, Inativa
                               data.frenteNome = frente.nome;
                           }
                       });
                       
        // 5. Filtrar apenas as fazendas que DEVEM aparecer no mapa (com frente associada)
        const fazendasNoMapa = Array.from(fazendaDataMap.values()).filter(f => f.frenteStatus !== null);
        
        // --- FIM NOVO: Agregação de Dados Dinâmicos por Fazenda ---

        if (fazendasNoMapa.length > 0) {
            // CORRIGIDO: Passa a informação agregada para o maps.js
            mapManager.updateFazendaMarkersWithStatus(fazendasNoMapa); 
            // Passa apenas as ativas, mas calculateBounds inclui a Usina
            this.adjustMapToShowFazendas(fazendasNoMapa); 
        } else {
            // Se não há fazendas ativas, limpa os marcadores e centraliza na usina (zoom distante)
            mapManager.clearMarkers('dashboard-fazendas');
            mapManager.maps.get('dashboard-map')?.setView(USINA_COORDS, 10);
            this.updateLastUpdateTime(); 
        }
    }

    adjustMapToShowFazendas(fazendas) {
        const map = mapManager.maps.get('dashboard-map');
        if (!map) return;

        const bounds = this.calculateBounds(fazendas);
        if (bounds.isValid()) {
            // AJUSTADO: Adiciona padding na lateral esquerda e topo para desviar do painel de status
            map.fitBounds(bounds, { 
                paddingTopLeft: [50, 200], // 50px de cima, 200px da esquerda
                paddingBottomRight: [50, 50],
                maxZoom: 12 // MUDANÇA AQUI: Visão mais distante (mais zoom out)
            });
        }
    }

    calculateBounds(fazendas) {
        const bounds = L.latLngBounds();
        
        // 1. Incluir Coordenadas da Usina SEMPRE (MUDANÇA AQUI)
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
    }
}

// Coordenadas da usina (definir se não estiver definido)
const USINA_COORDS = [-17.642301, -40.181525];
const INITIAL_ZOOM = 14;