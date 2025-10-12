// js/views/ocorrencias.js
import { showToast, handleOperation, showLoading, hideLoading } from '../helpers.js';
import { mapManager } from '../maps.js';
import { dataCache } from '../dataCache.js';
import { insertItem, fetchTable } from '../api.js';

export class OcorrenciasView {
    constructor() {
        this.container = null;
        this.data = {};
        this.currentLocation = { lat: null, lng: null };
        this.ocorrencias = [];
        this.frentes = []; // Armazenar a lista de frentes
    }

    async show() {
        await this.loadHTML();
        await this.loadData(true); // Força refresh para ver novas ocorrências
        this.initializeMap();
        this.addEventListeners();
    }

    async hide() {
        // Nada específico para esconder no momento
    }

    async loadHTML() {
        const container = document.getElementById('views-container');
        container.innerHTML = this.getHTML();
        this.container = container.querySelector('#ocorrencias-view');
        // Carrega as frentes após o HTML estar no DOM para popular o select
        this.populateFrentesSelect(); 
    }

    // NOVO: Função para carregar as frentes de serviço
    async populateFrentesSelect() {
        try {
            // Assume que 'frentes_servico' tem colunas 'id' (uuid) e 'nome'
            this.frentes = await fetchTable('frentes_servico', 'id, nome');
            const select = document.getElementById('frentes_impactadas');
            if (select) {
                select.innerHTML = this.frentes.map(frente => 
                    `<option value="${frente.id}">${frente.nome}</option>`
                ).join('');
            }
        } catch (error) {
            console.error('Erro ao carregar frentes de serviço:', error);
            // Continua, mas exibe um aviso se as frentes não carregarem
            showToast('Erro ao carregar Frentes. Verifique a API.', 'warning');
        }
    }

    getHTML() {
        return `
            <div id="ocorrencias-view" class="view active-view">
                <div class="cadastro-container">
                    <div class="cadastro-header">
                        <h1>Cadastro de Ocorrências</h1>
                        <p>Registre interdições, acidentes ou eventos não planejados no mapa.</p>
                    </div>

                    <div class="cadastro-content" style="grid-template-columns: 400px 1fr;">
                        <div class="form-section-modern">
                            <h3>Registrar Nova Ocorrência</h3>
                            <form id="form-ocorrencia" class="form-modern">
                                <div class="form-group">
                                    <label for="tipo">Tipo de Ocorrência</label>
                                    <select name="tipo" id="tipo" class="form-select" required>
                                        <option value="">Selecione...</option>
                                        <option value="acidente">Acidente (Tombamento, etc.)</option>
                                        <option value="interdicao">Trajeto/Estrada Interditada</option>
                                        <option value="morador">Morador Fechando Via</option>
                                        <option value="clima">Condições Climáticas Severas</option>
                                        <option value="outros">Outros</option>
                                    </select>
                                </div>
                                
                                <div class="form-group">
                                    <label for="frentes_impactadas">Frentes Impactadas (Opcional)</label>
                                    <select name="frentes_impactadas_dummy" id="frentes_impactadas" class="form-select" multiple size="5">
                                        </select>
                                    <small>Segure CTRL/CMD para selecionar múltiplos.</small>
                                </div>
                                
                                <div class="form-group">
                                    <label for="descricao">Descrição Detalhada</label>
                                    <input type="text" name="descricao" id="descricao" class="form-input" required placeholder="Ex: Caminhão 101 tombou no Km 5, Interdição por lamaçal.">
                                </div>
                                <div class="form-group">
                                    <label for="status">Status</label>
                                    <select name="status" id="status" class="form-select" required>
                                        <option value="aberto">Em Aberto</option>
                                        <option value="resolvido">Resolvido</option>
                                    </select>
                                </div>
                                <div class="form-group" style="display: flex; gap: 10px;">
                                    <input type="text" name="latitude" id="latitude" class="form-input" required placeholder="Latitude" readonly>
                                    <input type="text" name="longitude" id="longitude" class="form-input" required placeholder="Longitude" readonly>
                                </div>
                                <button type="submit" class="form-submit"><i class="ph-fill ph-map-pin"></i> Cadastrar Ocorrência</button>
                            </form>
                        </div>

                        <div class="cadastro-map-container">
                            <h3>Marcar Localização da Ocorrência</h3>
                            <div class="map-instructions">
                                <p><i class="ph-fill ph-info"></i> Clique no mapa para marcar o local da ocorrência.</p>
                            </div>
                            <div id="map-cadastro-medio"></div>
                        </div>
                    </div>
                    
                    <div class="list-container-modern" style="margin-top: 24px;">
                        <h2>Ocorrências Ativas e Recentes</h2>
                        <div id="ocorrencias-table-container">
                            ${this.renderTable()}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async loadData(forceRefresh = false) {
        showLoading();
        try {
            // 1. Busca as frentes para mapeamento na tabela (se não tiver no cache)
            if (this.frentes.length === 0 || forceRefresh) {
                 this.frentes = await fetchTable('frentes_servico', 'id, nome');
            }
            // 2. Busca as ocorrências
            this.ocorrencias = await fetchTable('ocorrencias', '*');
            
            this.renderTable(this.ocorrencias);
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            // Simula dados (Fallback)
            this.ocorrencias = [
                 { id: '1', tipo: 'interdicao', descricao: 'Trecho X com muito lamaçal.', status: 'aberto', latitude: -17.65, longitude: -40.19, created_at: new Date().toISOString(), frentes_impactadas: [] },
            ];
            this.renderTable(this.ocorrencias);
        } finally {
            hideLoading();
        }
    }

    initializeMap() {
        setTimeout(() => {
            const onLocationSelect = (lat, lng) => {
                this.currentLocation = { lat, lng };
                document.getElementById('latitude').value = lat.toFixed(6);
                document.getElementById('longitude').value = lng.toFixed(6);
            };

            mapManager.initCadastroMap('map-cadastro-medio', onLocationSelect);
        }, 200);
    }
    
    renderTable(ocorrencias = this.ocorrencias) {
        if (!ocorrencias || ocorrencias.length === 0) {
            return `<div class="empty-state"><i class="ph-fill ph-table"></i><p>Nenhuma ocorrência registrada.</p></div>`;
        }
        
        // NOVO: Cria um mapa de frentes para busca rápida
        const frenteMap = new Map(this.frentes.map(f => [f.id, f.nome]));

        const rows = ocorrencias.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .map(item => {
            const statusClass = item.status === 'aberto' ? 'danger' : 'disponivel';
            const statusLabel = item.status === 'aberto' ? 'Em Aberto' : 'Resolvido';
            
            // NOVO: Mapeia IDs para nomes de frentes
            const frentesNomes = (item.frentes_impactadas || [])
                                    .map(fId => frenteMap.get(fId))
                                    .filter(name => name) // Remove nulos/undefined
                                    .join(', ');
            const frentesDisplay = frentesNomes || 'Nenhuma';
            
            return `
                <tr>
                    <td>${new Date(item.created_at).toLocaleDateString('pt-BR')}</td>
                    <td>${this.formatOption(item.tipo)}</td>
                    <td>${item.descricao}</td>
                    <td>${frentesDisplay}</td>
                    <td><span class="caminhao-status-badge status-${statusClass}">${statusLabel}</span></td>
                    <td>${item.latitude}, ${item.longitude}</td>
                </tr>
            `;
        }).join('');
        
        const tableHTML = `
            <div class="table-wrapper" style="overflow-x: auto;">
                <table class="data-table-modern">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Tipo</th>
                            <th>Descrição</th>
                            <th>Frentes Impactadas</th>
                            <th>Status</th>
                            <th>Localização</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
        
        const tableContainer = document.getElementById('ocorrencias-table-container');
        if (tableContainer) {
            tableContainer.innerHTML = tableHTML;
        } else {
            return tableHTML;
        }
    }
    
    formatOption(option) {
        if (!option || typeof option !== 'string') return 'N/A';
        return option.charAt(0).toUpperCase() + option.slice(1).replace('_', ' ');
    }


    addEventListeners() {
        const form = document.getElementById('form-ocorrencia');
        if (form) {
            form.addEventListener('submit', this.handleFormSubmit.bind(this));
        }
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        
        // NOVO: Usa um objeto simples para garantir a estrutura correta (sem valores de array como string)
        const data = {
            tipo: formData.get('tipo'),
            descricao: formData.get('descricao'),
            status: formData.get('status'),
            latitude: formData.get('latitude'),
            longitude: formData.get('longitude')
        };


        if (!data.latitude || !data.longitude || data.latitude === 'null' || data.longitude === 'null') {
            showToast('Marque a localização no mapa antes de cadastrar.', 'error');
            return;
        }
        
        // CORRIGIDO: Lida com o multi-select de frentes separadamente para obter um array de UUIDs
        const frentesSelect = document.getElementById('frentes_impactadas');
        const selectedFrentes = Array.from(frentesSelect.selectedOptions).map(option => option.value);
        data.frentes_impactadas = selectedFrentes; 
        
        // Converte coordenadas para números
        data.latitude = parseFloat(data.latitude);
        data.longitude = parseFloat(data.longitude);
        
        showLoading();
        try {
            const { error } = await insertItem('ocorrencias', data);
            
            if (error) {
                 throw new Error(error.message);
            }
            
            dataCache.invalidateAllData();

            showToast('Ocorrência registrada com sucesso!', 'success');
            form.reset();
            
            await this.loadData(true); 

        } catch (err) {
            handleOperation(err);
            showToast('Erro ao registrar ocorrência.', 'error');
        } finally {
            hideLoading();
        }
    }
}