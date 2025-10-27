// js/views/ocorrencias.js
import { showToast, handleOperation, showLoading, hideLoading } from '../helpers.js';
import { formatDateTime, calculateDowntimeDuration, getBrtNowString, getBrtIsoString } from '../timeUtils.js'; // IMPORTAÇÕES CORRIGIDAS
import { mapManager } from '../maps.js';
import { dataCache } from '../dataCache.js';
// ADICIONADO fetchItemById
import { insertItem, fetchTable, updateItem, fetchItemById } from '../api.js';
import { openModal, closeModal } from '../components/modal.js'; // Importação correta

export class OcorrenciasView {
    constructor() {
        this.container = null;
        this.data = {};
        this.currentLocation = { lat: null, lng: null };
        this.ocorrencias = [];
        this.frentes = []; 
    }

    async show() {
        await this.loadHTML();
        await this.loadData(true);
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
        this.populateFrentesSelect(); 
    }

    async populateFrentesSelect() {
        try {
            this.frentes = await fetchTable('frentes_servico', 'id, nome');
            const select = document.getElementById('frentes_impactadas');
            if (select) {
                this.frentes.forEach(frente => {
                    const option = document.createElement('option');
                    option.value = frente.id;
                    option.textContent = frente.nome;
                    select.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Erro ao carregar frentes de serviço:', error);
            showToast('Erro ao carregar Frentes. Verifique a API.', 'warning');
        }
    }

    getHTML() {
        // CORREÇÃO: Usa a função getBrtNowString para preencher o campo datetime-local
        const nowString = getBrtNowString();

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
                                    <label for="hora_inicio">Data e Hora de Início</label>
                                    <input type="datetime-local" name="hora_inicio" id="hora_inicio" class="form-input" value="${nowString}" required>
                                </div>
                                
                                <div class="form-group" style="display: flex; gap: 10px;">
                                    <input type="text" name="latitude" id="latitude" class="form-input" required placeholder="Latitude" readonly>
                                    <input type="text" name="longitude" id="longitude" class="form-input" required placeholder="Longitude" readonly>
                                </div>
                                
                                <button type="submit" class="form-submit"><i class="ph-fill ph-map-pin"></i> Cadastrar Ocorrência (Ativa)</button>
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
            if (this.frentes.length === 0 || forceRefresh) {
                 this.frentes = await fetchTable('frentes_servico', 'id, nome');
            }
            this.ocorrencias = await fetchTable('ocorrencias', '*');
            
            this.renderTable(this.ocorrencias);
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            // Simula dados (Fallback)
            this.ocorrencias = [
                 { id: '1', tipo: 'interdicao', descricao: 'Trecho X com muito lamaçal.', status: 'aberto', latitude: -17.65, longitude: -40.19, hora_inicio: new Date(Date.now() - 3600000).toISOString(), hora_fim: null, frentes_impactadas: [] },
                 { id: '2', tipo: 'acidente', descricao: 'Caminhão 102 com pneu estourado.', status: 'resolvido', latitude: -17.63, longitude: -40.21, hora_inicio: new Date(Date.now() - 7200000).toISOString(), hora_fim: new Date(Date.now() - 3600000).toISOString(), frentes_impactadas: [] }
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

            const customIcon = L.divIcon({
                className: 'ocorrencia-marker-cadastro',
                html: '<div class="marker-pin" style="background-color: #ED8936; border-radius: 50%; width: 40px; height: 40px; margin: 0; display: flex; align-items: center; justify-content: center;"><i class="ph-fill ph-siren" style="font-size: 22px; color: black;"></i></div>',
                iconSize: [40, 40],
                iconAnchor: [20, 40]
            });


            const map = mapManager.initMap('map-cadastro-medio');
            if (map && onLocationSelect) {
                let marker = null;
                map.on('click', function(e) {
                    const { lat, lng } = e.latlng;
                    
                    onLocationSelect(lat, lng);
                    
                    if (marker) {
                        marker.setLatLng(e.latlng);
                    } else {
                        marker = L.marker(e.latlng, { icon: customIcon }).addTo(map);
                    }
                    
                    marker.bindPopup(`<b>Localização Selecionada:</b><br>${lat.toFixed(4)}, ${lng.toFixed(4)}`)
                          .openPopup();
                });
            }
        }, 200);
    }
    
    renderTable(ocorrencias = this.ocorrencias) {
        if (!ocorrencias || ocorrencias.length === 0) {
            return `<div class="empty-state"><i class="ph-fill ph-table"></i><p>Nenhuma ocorrência registrada.</p></div>`;
        }
        
        const frenteMap = new Map(this.frentes.map(f => [f.id, f.nome]));

        const sortedOcorrencias = ocorrencias.sort((a, b) => {
            if (a.status === 'aberto' && b.status !== 'aberto') return -1;
            if (a.status !== 'aberto' && b.status === 'aberto') return 1;
            return new Date(b.hora_inicio || b.created_at) - new Date(a.hora_inicio || a.created_at);
        });


        const rows = sortedOcorrencias.map(item => {
            const isFinished = item.status === 'resolvido';
            const startTime = item.hora_inicio || item.created_at; 
            const duration = calculateDowntimeDuration(startTime, item.hora_fim);
            
            const statusClass = isFinished ? 'disponivel' : 'danger';
            const statusLabel = isFinished ? 'Resolvido' : 'Em Aberto';
            const horaFimDisplay = isFinished ? formatDateTime(item.hora_fim) : '---';
            const durationDisplay = isFinished ? duration : `<strong style="color: var(--accent-danger);">${duration}</strong>`;

            
            const frentesNomes = (item.frentes_impactadas || [])
                                    .map(fId => frenteMap.get(fId))
                                    .filter(name => name)
                                    .join(', ');
            const frentesDisplay = frentesNomes || 'Nenhuma';
            
            return `
                <tr>
                    <td>${this.formatOption(item.tipo)}</td>
                    <td>${frentesDisplay}</td>
                    
                    <td>${formatDateTime(startTime)}</td>
                    <td>${horaFimDisplay}</td>
                    <td>${durationDisplay}</td>
                    
                    <td><span class="caminhao-status-badge status-${statusClass}">${statusLabel}</span></td>
                    <td style="display: flex; gap: 8px;">
                        ${!isFinished ? 
                            `<button class="action-btn edit-btn-modern btn-close-ocorrencia" data-id="${item.id}" data-start-time="${startTime}" title="Encerrar Ocorrência"><i class="ph-fill ph-check-circle"></i></button>` 
                            : '---'}
                        <button class="action-btn edit-btn-modern btn-edit-ocorrencia" data-id="${item.id}" title="Editar Ocorrência">
                            <i class="ph-fill ph-pencil-simple"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        
        const tableHTML = `
            <div class="table-wrapper" style="overflow-x: auto;">
                <table class="data-table-modern">
                    <thead>
                        <tr>
                            <th>Tipo</th>
                            <th>Frentes Impactadas</th>
                            <th>Início</th>
                            <th>Fim</th>
                            <th>Duração</th>
                            <th>Status</th>
                            <th style="width: 1%;">Ações</th>
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
    
    showCloseOcorrenciaModal(ocorrenciaId, startTime) {
        // CORREÇÃO: Usa a função getBrtNowString para preencher o campo datetime-local
        const nowString = getBrtNowString();
        
        const modalContent = `
            <p>Encerrando Ocorrência iniciada em: <strong>${formatDateTime(startTime)}</strong></p>
            
            <form id="close-ocorrencia-form" class="action-modal-form">
                <input type="hidden" name="ocorrencia_id" value="${ocorrenciaId}">
                
                <div class="form-group">
                    <label>Data e Hora de Resolução</label>
                    <input type="datetime-local" name="hora_fim" class="form-input" value="${nowString}" required>
                    <p class="form-help">A duração será calculada a partir da hora de início (${formatDateTime(startTime)}).</p>
                </div>
                
                <button type="submit" class="btn-primary" style="background-color: var(--accent-primary);">
                    <i class="ph-fill ph-check-circle"></i> Confirmar Encerramento
                </button>
            </form>
        `;
        openModal('Encerrar Ocorrência', modalContent); // Utiliza a função importada

        document.getElementById('close-ocorrencia-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const horaFim = e.target.hora_fim.value;
            this.handleCloseOcorrencia(ocorrenciaId, horaFim); // Passa a string do input
        });
    }

    async handleCloseOcorrencia(ocorrenciaId, horaFim) {
        showLoading();
        
        // CORREÇÃO: Usa o getBrtIsoString para garantir que o salvamento seja o instante BRT correto
        try {
            const finalHoraFim = getBrtIsoString(horaFim); // Usando a nova função para salvar BRT->UTC
            
            const updateData = {
                status: 'resolvido',
                hora_fim: finalHoraFim // Usa o valor corrigido
            };
            
            await updateItem('ocorrencias', ocorrenciaId, updateData);
            
            dataCache.invalidateAllData();

            showToast('Ocorrência encerrada e duração calculada!', 'success');
            closeModal(); // Utiliza a função importada
            
            await this.loadData(true); 

        } catch (err) {
            handleOperation(err);
            showToast('Erro ao encerrar ocorrência.', 'error');
        } finally {
            hideLoading();
        }
    }
    
    async showEditOcorrenciaModal(id) {
        showLoading();
        // 1. Garante que a lista de frentes está carregada
        if (this.frentes.length === 0) {
             await this.populateFrentesSelect(); // Reusa para garantir que this.frentes está populado
        }
        
        // 2. Busca os dados da ocorrência
        const { data: ocorrencia, error } = await fetchItemById('ocorrencias', id);
        hideLoading();
        
        if (error) {
            showToast('Erro ao buscar ocorrência para edição.', 'error');
            return;
        }
        
        // 3. Monta o formulário (reutilizando a estrutura do HTML de cadastro)
        const frentesOptions = this.frentes.map(frente => {
            // Verifica se o ID da frente está no array frentes_impactadas
            const isSelected = (ocorrencia.frentes_impactadas || []).includes(frente.id);
            return `<option value="${frente.id}" ${isSelected ? 'selected' : ''}>${frente.nome}</option>`;
        }).join('');
        
        const tipoOptions = [
            'acidente', 'interdicao', 'morador', 'clima', 'outros'
        ].map(tipo => {
            const isSelected = tipo === ocorrencia.tipo;
            return `<option value="${tipo}" ${isSelected ? 'selected' : ''}>${this.formatOption(tipo)}</option>`;
        }).join('');
        
        // CORREÇÃO: Converte a hora_inicio ISO (UTC) de volta para o formato datetime-local (BRT)
        // Isso é necessário porque o input datetime-local espera um formato local (YYYY-MM-DDTHH:MM)
        const horaInicioLocal = ocorrencia.hora_inicio ? new Date(ocorrencia.hora_inicio).toLocaleString('sv-SE').replace(' ', 'T').slice(0, 16) : getBrtNowString();
        
        const modalContent = `
            <p>Editando Ocorrência: <strong>${this.formatOption(ocorrencia.tipo)}</strong></p>
            
            <form id="edit-ocorrencia-form" class="action-modal-form">
                <input type="hidden" name="ocorrencia_id" value="${ocorrencia.id}">
                <div class="form-group">
                    <label for="tipo-edit">Tipo de Ocorrência</label>
                    <select name="tipo" id="tipo-edit" class="form-select" required>
                        <option value="">Selecione...</option>
                        ${tipoOptions}
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="frentes_impactadas_edit">Frentes Impactadas (Opcional)</label>
                    <select name="frentes_impactadas" id="frentes_impactadas_edit" class="form-select" multiple size="5">
                        ${frentesOptions}
                    </select>
                    <small>Segure CTRL/CMD para selecionar múltiplos.</small>
                </div>
                
                <div class="form-group">
                    <label for="descricao-edit">Descrição Detalhada</label>
                    <input type="text" name="descricao" id="descricao-edit" class="form-input" required placeholder="Ex: Caminhão 101 tombou no Km 5" value="${ocorrencia.descricao}">
                </div>
                
                <div class="form-group">
                    <label for="hora_inicio_edit">Data e Hora de Início</label>
                    <input type="datetime-local" name="hora_inicio" id="hora_inicio_edit" class="form-input" value="${horaInicioLocal}" required>
                </div>
                
                <div class="form-group" style="display: flex; gap: 10px;">
                    <input type="text" name="latitude" id="latitude-edit" class="form-input" required placeholder="Latitude" value="${ocorrencia.latitude.toFixed(6)}" readonly>
                    <input type="text" name="longitude" id="longitude-edit" class="form-input" required placeholder="Longitude" value="${ocorrencia.longitude.toFixed(6)}" readonly>
                </div>
                <small class="form-help">Para alterar a localização, feche o modal e utilize o mapa de cadastro na página.</small>
                
                <button type="submit" class="btn-primary" style="background-color: var(--accent-edit);">
                    <i class="ph-fill ph-floppy-disk"></i> Salvar Alterações
                </button>
            </form>
        `;
        openModal('Editar Ocorrência', modalContent);

        document.getElementById('edit-ocorrencia-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const formData = new FormData(form);
            
            const data = {
                tipo: formData.get('tipo'),
                descricao: formData.get('descricao'),
                latitude: parseFloat(formData.get('latitude')),
                longitude: parseFloat(formData.get('longitude')),
                // CORREÇÃO: Converte o BRT datetime-local de volta para ISO UTC para salvar
                hora_inicio: getBrtIsoString(formData.get('hora_inicio')),
            };
            
            // Trata o multi-select de frentes
            const frentesSelect = document.getElementById('frentes_impactadas_edit');
            // Garante que os IDs das frentes sejam strings (UUIDs)
            data.frentes_impactadas = Array.from(frentesSelect.selectedOptions).map(option => option.value);

            this.handleEditOcorrencia(ocorrencia.id, data);
        });
    }

    async handleEditOcorrencia(ocorrenciaId, updateData) {
        showLoading();
        try {
            // A função updateItem já está importada (api.js)
            await updateItem('ocorrencias', ocorrenciaId, updateData); 
            
            dataCache.invalidateAllData();

            showToast('Ocorrência atualizada com sucesso!', 'success');
            closeModal();
            
            await this.loadData(true); 

        } catch (err) {
            handleOperation(err);
            showToast('Erro ao atualizar ocorrência.', 'error');
        } finally {
            hideLoading();
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
        
        // Listener delegado para o botão de Encerrar e Editar na tabela
        this.container.addEventListener('click', (e) => {
            const closeBtn = e.target.closest('.btn-close-ocorrencia');
            const editBtn = e.target.closest('.btn-edit-ocorrencia'); // NOVO: Botão de Editar
            
            if (closeBtn) {
                const id = closeBtn.dataset.id;
                const startTime = closeBtn.dataset.startTime;
                this.showCloseOcorrenciaModal(id, startTime);
            }
            
            if (editBtn) { // NOVO: Chama o modal de edição
                 this.showEditOcorrenciaModal(editBtn.dataset.id);
            }
        });
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        
        const data = {
            tipo: formData.get('tipo'),
            descricao: formData.get('descricao'),
            // Pega a string de hora do input datetime-local
            hora_inicio: formData.get('hora_inicio'), 
            status: 'aberto'
        };

        // Tenta parsear os valores do FormData
        const latValue = parseFloat(formData.get('latitude'));
        const lngValue = parseFloat(formData.get('longitude'));
        
        // Verifica se são números VÁLIDOS (não é NaN)
        if (isNaN(latValue) || isNaN(lngValue)) {
            showToast('Marque a localização no mapa antes de cadastrar.', 'error');
            return;
        }
        
        // CORREÇÃO: Usa o getBrtIsoString para salvar o instante BRT correto
        try {
            data.hora_inicio = getBrtIsoString(data.hora_inicio);
            
        } catch (error) {
            console.error("Erro ao processar data/hora:", error);
            showToast('Erro ao processar a data/hora. Verifique o formato.', 'error');
            return;
        }
        
        
        // Atribui as coordenadas numéricas para o objeto 'data'
        data.latitude = latValue;
        data.longitude = lngValue;
        
        const frentesSelect = document.getElementById('frentes_impactadas');
        // Garante que os IDs das frentes sejam strings (UUIDs)
        const selectedFrentes = Array.from(frentesSelect.selectedOptions).map(option => option.value);
        data.frentes_impactadas = selectedFrentes; 
        
        showLoading();
        try {
            const { error } = await insertItem('ocorrencias', data);
            
            if (error) {
                 throw new Error(error.message);
            }
            
            dataCache.invalidateAllData();

            showToast('Ocorrência registrada e Ativa!', 'success');
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