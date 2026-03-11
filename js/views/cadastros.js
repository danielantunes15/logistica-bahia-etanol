// js/views/cadastros.js
import { showToast, handleOperation, showLoading, hideLoading, validateCPFCNPJ, validatePhone } from '../helpers.js';
import { mapManager } from '../maps.js';
import { openModal, closeModal } from '../components/modal.js';
import { fetchAllData, insertItem, deleteItem, fetchItemById, updateItem } from '../api.js';
import { dataCache } from '../dataCache.js';
import { supabase } from '../supabase.js';

export class CadastrosView {
    constructor(tipo) {
        this.tipo = tipo;
        this.container = null;
        this.data = {};
        this.formFields = this.getFormFields();
    }

    async show() {
        await this.loadHTML();
        await this.loadData();
        this.renderForm();
        if (this.tipo === 'fazendas') {
            this.initializeMap();
        }
        this.addEventListeners();
        this.setupValidationListeners(document.getElementById(`form-${this.tipo}`));
    }

    async hide() {}

    async loadHTML() {
        const container = document.getElementById('views-container');
        container.innerHTML = this.getHTML();
        this.container = container;
    }

    getHTML() {
        const title = this.getTipoDisplayName();
        const showMap = this.tipo === 'fazendas';

        return `
            <div id="cadastros-view" class="view active-view">
                <div class="cadastro-container">
                    <div class="cadastro-header">
                        <h1>Cadastro de ${title}</h1>
                        <p>Gerencie os ${title.toLowerCase()} do sistema</p>
                    </div>

                    <div class="cadastro-content">
                        <div class="form-section-modern">
                            <h3>Adicionar Novo</h3>
                            <div id="form-container"></div>
                        </div>

                        ${showMap ? `
                        <div class="cadastro-map-container">
                            <h3>Localização no Mapa</h3>
                            <div class="map-instructions">
                                <p><i class="ph-fill ph-info"></i> Clique no mapa para selecionar a localização da fazenda</p>
                            </div>
                            <div id="map-cadastro-medio"></div>
                        </div>
                        ` : `
                        <div class="list-container-modern">
                            <h2>${title} Cadastrados</h2>
                            <div id="table-container"></div>
                        </div>
                        `}
                    </div>

                    ${showMap ? `
                    <div class="list-container-modern">
                        <h2>Fazendas Cadastradas</h2>
                        <div id="table-container"></div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    async loadData(forceRefresh = false) {
        showLoading();
        try {
            this.data = await dataCache.fetchMasterDataOnly(forceRefresh); 
            this.renderTable();
        } catch (error) {
            console.error(`Erro ao carregar dados de ${this.tipo}:`, error);
            showToast('Erro ao carregar dados', 'error');
        } finally {
            hideLoading();
        }
    }

    initializeMap() {
        if (this.tipo === 'fazendas') {
            setTimeout(() => {
                const map = mapManager.initCadastroMap((lat, lng) => {});
                if (map) console.log('Mapa de cadastro inicializado com sucesso');
            }, 200);
        }
    }

    getFormFields() {
        const baseFields = {
            fazendas: [
                { name: 'cod_equipamento', label: 'Código da Fazenda', type: 'text', required: true },
                { name: 'nome', label: 'Nome da Fazenda', type: 'text', required: true },
                { name: 'fornecedor_id', label: 'Fornecedor', type: 'select', source: 'fornecedores', displayField: 'nome', required: true },
                { name: 'latitude', label: 'Latitude', type: 'text', required: false },
                { name: 'longitude', label: 'Longitude', type: 'text', required: false }
            ],
            caminhoes: [
                // SEPARADO O CÓDIGO DA PLACA
                { name: 'cod_equipamento', label: 'Código (Ex: CAM-01)', type: 'text', required: true },
                { name: 'placa', label: 'Placa (Ex: ABC-1234)', type: 'text', required: true },
                { name: 'descricao', label: 'Descrição/Modelo', type: 'text', required: true },
                { name: 'proprietario_id', label: 'Empresa Parceira', type: 'select', source: 'proprietarios', displayField: 'nome', required: true },
                { name: 'motoristas', label: 'Motoristas', type: 'select-multiple', source: 'terceiros', displayField: 'nome', required: false },
                { name: 'situacao', label: 'Situação Operacional', type: 'select', options: ['ativo', 'inativo', 'excluído pelo parceiro'], required: true },
                { name: 'status_homologacao', label: 'Status de Homologação', type: 'select', options: ['Apto para Safra', 'Pendente Vistoria', 'Bloqueado'], required: true },
                { name: 'documento', label: 'Upload de CRLV (Opcional)', type: 'file', required: false }
            ],
            equipamentos: [
                { name: 'cod_equipamento', label: 'Código do Equipamento', type: 'text', required: true },
                { name: 'descricao', label: 'Descrição do Equipamento', type: 'text', required: true },
                { name: 'proprietario_id', label: 'Empresa Parceira', type: 'select', source: 'proprietarios', displayField: 'nome', required: true },
                { name: 'operadores', label: 'Operadores', type: 'select-multiple', source: 'terceiros', displayField: 'nome', required: false },
                { name: 'finalidade', label: 'Finalidade', type: 'select', options: ['Carregadeira', 'Trator Reboque', 'Colhedora', 'Trator Transbordo'], required: true },
                { name: 'frente_id', label: 'Frente de Serviço', type: 'select', source: 'frentes_servico', displayField: 'nome', required: true },
                { name: 'situacao', label: 'Situação Operacional', type: 'select', options: ['ativo', 'inativo', 'excluído pelo parceiro'], required: true },
                { name: 'status_homologacao', label: 'Status de Homologação', type: 'select', options: ['Apto para Safra', 'Pendente Vistoria', 'Bloqueado'], required: true },
                { name: 'documento', label: 'Upload de Documento (Opcional)', type: 'file', required: false }
            ],
            frentes_servico: [
                { name: 'cod_equipamento', label: 'Código da Frente', type: 'text', required: true },
                { name: 'nome', label: 'Nome da Frente', type: 'text', required: true },
                { name: 'tipo_producao', label: 'Grupo de Produção (Boletim)', type: 'select', options: ['NA', 'MANUAL', 'MECANIZADA'], required: false }
            ],
            fornecedores: [
                { name: 'cod_equipamento', label: 'Código do Fornecedor', type: 'text', required: true },
                { name: 'nome', label: 'Nome do Fornecedor', type: 'text', required: true },
                { name: 'cpf_cnpj', label: 'CPF/CNPJ', type: 'text', required: true, validation: 'cpfcnpj' }, 
                { name: 'telefone', label: 'Telefone', type: 'text', required: false, validation: 'phone' } 
            ],
            proprietarios: [
                { name: 'cod_equipamento', label: 'Código da Empresa', type: 'text', required: true },
                { name: 'nome', label: 'Nome da Empresa/Proprietário', type: 'text', required: true },
                { name: 'cpf_cnpj', label: 'CPF/CNPJ', type: 'text', required: true, validation: 'cpfcnpj' }, 
                { name: 'telefone', label: 'Telefone', type: 'text', required: false, validation: 'phone' } 
            ],
            terceiros: [
                { name: 'nome', label: 'Nome do Colaborador', type: 'text', required: true },
                { name: 'cpf_cnpj', label: 'CPF/CNPJ', type: 'text', required: true, validation: 'cpfcnpj' }, 
                { name: 'descricao_atividade', label: 'Cargo / Atividade', type: 'select', options: ['Motorista canavieiro', 'Operador de trator reboque', 'Operador de carregadeira', 'Operador de trator transbordo', 'Operador de colhedora', 'Fiscal de equipe', 'Motorista pipa'], required: true },
                { name: 'empresa_id', label: 'Empresa Parceira', type: 'select', source: 'proprietarios', displayField: 'nome', required: true },
                { name: 'situacao', label: 'Situação Operacional', type: 'select', options: ['ativo', 'inativo', 'excluído pelo parceiro'], required: true },
                { name: 'status_homologacao', label: 'Status de Integração', type: 'select', options: ['Integrado (Apto)', 'Falta Integração', 'Bloqueado'], required: true },
                { name: 'documento', label: 'Upload de CNH/Certificado (Opcional)', type: 'file', required: false }
            ]
        };
        return baseFields[this.tipo];
    }

    getTipoDisplayName() {
        const names = {
            'fazendas': 'Fazendas', 'caminhoes': 'Caminhões', 'equipamentos': 'Equipamentos',
            'frentes_servico': 'Frentes de Serviço', 'fornecedores': 'Fornecedores',
            'proprietarios': 'Proprietários (Empresas)', 'terceiros': 'Terceiros (Funcionários)'
        };
        return names[this.tipo] || this.tipo;
    }

    renderForm() {
        const formContainer = document.getElementById('form-container');
        if (formContainer) formContainer.innerHTML = this.generateFormHTML();
    }

    generateFormHTML(item = null) {
        const isEdit = item !== null;
        const inputsHTML = this.formFields.map(field => {
            const requiredAttr = field.required ? 'required' : '';
            let value = '';
            
            if (isEdit) {
                if (field.name === 'tipo_producao') {
                    value = item[field.name] || 'NA'; 
                } else if (field.name !== 'documento') { 
                    value = item[field.name] || (field.type === 'select-multiple' ? [] : '');
                }
            } else {
                if(field.name === 'situacao') value = 'ativo';
                if(field.name === 'status_homologacao' && this.tipo === 'terceiros') value = 'Integrado (Apto)';
                if(field.name === 'status_homologacao' && this.tipo !== 'terceiros') value = 'Apto para Safra';
            }
            
            const id = isEdit ? `edit-${field.name}` : field.name;
            let inputHTML = `<div class="form-group"><label for="${id}">${field.label}</label>`;
    
            if (field.type === 'select' || field.type === 'select-multiple') {
                const multipleAttr = field.type === 'select-multiple' ? 'multiple' : '';
                inputHTML += `<select name="${field.name}" id="${id}" class="form-select" ${multipleAttr} ${requiredAttr}>`;
                if (!multipleAttr) inputHTML += `<option value="">Selecione...</option>`;
                
                if (field.source && this.data[field.source]) {
                    this.data[field.source].forEach(optionItem => {
                        const isSelected = (isEdit && (value == optionItem.id || (Array.isArray(item[field.name]) && item[field.name].includes(optionItem.id))));
                        inputHTML += `<option value="${optionItem.id}" ${isSelected ? 'selected' : ''}>${optionItem[field.displayField]}</option>`;
                    });
                } else if (field.options) {
                    field.options.forEach(option => {
                        const isSelected = value === option;
                        inputHTML += `<option value="${option}" ${isSelected ? 'selected' : ''}>${this.formatOption(option)}</option>`;
                    });
                }
                inputHTML += `</select>`;
            } else if (field.type === 'file') {
                inputHTML += `<input type="file" name="${field.name}" id="${id}" class="form-input" accept=".pdf,image/*" ${requiredAttr}>`;
                if (isEdit && item.documento_url) {
                    inputHTML += `
                        <div style="margin-top: 10px; padding: 12px; background: rgba(0,0,0,0.02); border-radius: 6px; border: 1px dashed var(--border-color);">
                            <small style="display:block; margin-bottom: 8px;">
                                <a href="${item.documento_url}" target="_blank" style="color: var(--primary-color); text-decoration: none; font-weight: 500;">
                                    <i class="ph-fill ph-file-pdf"></i> Ver Documento Anexado
                                </a>
                            </small>
                            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--accent-danger); cursor: pointer; margin-top: 8px;">
                                <input type="checkbox" name="remover_documento" value="true" style="accent-color: var(--accent-danger); width: 16px; height: 16px;">
                                <strong>Excluir este anexo</strong>
                            </label>
                        </div>
                    `;
                }
            } else {
                const textValue = isEdit ? (item[field.name] || '') : '';
                inputHTML += `<input type="${field.type}" name="${field.name}" id="${id}" class="form-input" value="${textValue}" ${requiredAttr} data-validation="${field.validation || ''}">`; 
            }
            if (field.validation) {
                 inputHTML += `<div class="validation-message" id="error-${id}" style="display: none;"></div>`;
            }
            inputHTML += `</div>`;
            return inputHTML;
        }).join('');
    
        const submitText = isEdit ? 'Salvar Alterações' : `Cadastrar ${this.getTipoDisplayName().slice(0, -1)}`;
        return `<form id="${isEdit ? 'form-edit-' + this.tipo : 'form-' + this.tipo}" class="form-modern" enctype="multipart/form-data">${inputsHTML}<button type="submit" class="form-submit"><i class="ph-fill ph-floppy-disk"></i> ${submitText}</button></form>`;
    }

    formatOption(option) {
        if (option === 'NA') return 'Não Atribuído';
        if (option === 'MANUAL') return 'CANA MANUAL';
        if (option === 'MECANIZADA') return 'CANA MECANIZADA';

        if (!option || typeof option !== 'string') return 'N/A';
        return option.charAt(0).toUpperCase() + option.slice(1).replace('_', ' ');
    }
    
    setupValidationListeners(form) {
        if (!form) return;
        form.querySelectorAll('[data-validation]').forEach(input => {
            const validationType = input.dataset.validation;
            if (validationType) {
                ['input', 'blur'].forEach(eventType => {
                    input.addEventListener(eventType, () => this.validateField(input, validationType));
                });
            }
        });
    }
    
    validateField(input, validationType) {
        const value = input.value;
        const errorMessageElement = document.getElementById(`error-${input.id}`);
        let isValid = true;
        let errorMessage = '';

        if (!input.hasAttribute('required') && !value) {
            input.classList.remove('is-invalid');
            if (errorMessageElement) errorMessageElement.style.display = 'none';
            return true;
        }

        if (value) {
            if (validationType === 'cpfcnpj') {
                isValid = validateCPFCNPJ(value);
                errorMessage = 'CPF/CNPJ inválido.';
            } else if (validationType === 'phone') {
                isValid = validatePhone(value);
                errorMessage = 'Telefone inválido.';
            }
        }
        
        if (isValid) {
            input.classList.remove('is-invalid');
            if (errorMessageElement) errorMessageElement.style.display = 'none';
        } else {
            input.classList.add('is-invalid');
            if (errorMessageElement) {
                errorMessageElement.textContent = errorMessage;
                errorMessageElement.style.display = 'block';
            }
        }
        return isValid;
    }

    renderTable() {
        const tableContainer = document.getElementById('table-container');
        if (!tableContainer) return;

        const items = this.data[this.tipo] || [];
        if (items.length === 0) {
            tableContainer.innerHTML = `<div class="empty-state"><i class="ph-fill ph-table"></i><p>Nenhum ${this.getTipoDisplayName().toLowerCase()} cadastrado</p></div>`;
            return;
        }

        const headers = this.getTableHeaders();
        const rows = items.map(item => this.generateTableRow(item)).join('');
        tableContainer.innerHTML = `<table class="data-table-modern"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    }

    getTableHeaders() {
        const headersConfig = {
            'fazendas': ['Código', 'Nome', 'Fornecedor', 'Coordenadas', 'Ações'],
            // ADICIONADO COLUNA PLACA AQUI PARA CAMINHÕES
            'caminhoes': ['Código', 'Placa', 'Modelo', 'Empresa', 'Situação', 'Homologação', 'Ações'],
            'equipamentos': ['Código', 'Modelo', 'Empresa', 'Situação', 'Homologação', 'Ações'],
            'frentes_servico': ['Código', 'Nome', 'Grupo de Produção', 'Ações'],
            'fornecedores': ['Código', 'Nome', 'CPF/CNPJ', 'Telefone', 'Ações'],
            'proprietarios': ['Código', 'Nome', 'CPF/CNPJ', 'Telefone', 'Ações'],
            'terceiros': ['Nome', 'Atividade', 'Empresa', 'Situação', 'Homologação', 'Ações']
        };
        return (headersConfig[this.tipo] || ['Nome', 'Ações']).map(h => `<th>${h}</th>`).join('');
    }

    generateTableRow(item) {
        const cells = this.getTableCells(item);
        
        let docButton = '';
        if (item.documento_url) {
            docButton = `
                <a href="${item.documento_url}" target="_blank" class="action-btn" title="Ver Documento" style="color: #3182CE; background: rgba(49, 130, 206, 0.1); margin-right: 5px; display: inline-flex; align-items: center; justify-content: center; text-decoration: none;">
                    <i class="ph-fill ph-file-text"></i>
                </a>
            `;
        }

        return `<tr>${cells}<td><div class="action-buttons-modern" style="display: flex;">${docButton}<button class="action-btn edit-btn-modern" data-id="${item.id}" title="Editar"><i class="ph-fill ph-pencil-simple"></i></button><button class="action-btn delete-btn-modern" data-id="${item.id}" title="Excluir"><i class="ph-fill ph-trash"></i></button></div></td></tr>`;
    }

    getTableCells(item) {
        const renderBadge = (valor, tipo) => {
            const v = valor || '';
            let color = '#ED8936', bg = 'rgba(237, 137, 54, 0.2)'; 
            
            if (v.includes('Apto') || v === 'ativo') { color = 'var(--accent-primary)'; bg = 'rgba(56, 161, 105, 0.2)'; }
            else if (v.includes('Bloqueado') || v.includes('inativo')) { color = 'var(--accent-danger)'; bg = 'rgba(229, 62, 62, 0.2)'; }
            else if (v.includes('excluído')) { color = '#718096'; bg = '#E2E8F0'; } 
            
            return `<span style="background: ${bg}; color: ${color}; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; text-transform: uppercase;">${v}</span>`;
        };

        const propNome = (item.proprietarios || item.empresa_id)?.nome || 'N/A'; 

        const cellsConfig = {
            'fazendas': [item.cod_equipamento, item.nome, item.fornecedores?.nome || 'N/A', item.latitude && item.longitude ? `${parseFloat(item.latitude).toFixed(4)}, ${parseFloat(item.longitude).toFixed(4)}` : 'N/A'],
            // EXIBE A PLACA NA TABELA DE CAMINHÕES
            'caminhoes': [item.cod_equipamento, item.placa || '-', item.descricao || 'N/A', propNome, renderBadge(item.situacao, 'sit'), renderBadge(item.status_homologacao, 'hom')],
            'equipamentos': [item.cod_equipamento, item.descricao || 'N/A', propNome, renderBadge(item.situacao, 'sit'), renderBadge(item.status_homologacao, 'hom')],
            'frentes_servico': [item.cod_equipamento, item.nome, this.formatOption(item.tipo_producao)], 
            'fornecedores': [item.cod_equipamento, item.nome, item.cpf_cnpj || 'N/A', item.telefone || 'N/A'],
            'proprietarios': [item.cod_equipamento, item.nome, item.cpf_cnpj || 'N/A', item.telefone || 'N/A'],
            'terceiros': [item.nome, item.descricao_atividade || 'N/A', propNome, renderBadge(item.situacao, 'sit'), renderBadge(item.status_homologacao, 'hom')]
        };
        return (cellsConfig[this.tipo] || [item.nome]).map(c => `<td>${c}</td>`).join('');
    }

    addEventListeners() {
        const form = document.getElementById(`form-${this.tipo}`);
        if (form) form.addEventListener('submit', (e) => this.handleFormSubmit(e, false));

        this.container.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-btn-modern');
            const deleteBtn = e.target.closest('.delete-btn-modern');
            if (editBtn) this.handleEdit(editBtn.dataset.id);
            if (deleteBtn) this.handleDelete(deleteBtn.dataset.id);
        });
    }

    async handleFormSubmit(e, isEdit = false, id = null) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        let formIsValid = true;
        form.querySelectorAll('[data-validation]').forEach(input => {
            if (input.hasAttribute('required') && !input.value) formIsValid = false;
            if (!this.validateField(input, input.dataset.validation)) formIsValid = false;
        });
        
        if (!formIsValid) {
             showToast('Corrija os campos em vermelho.', 'error'); return;
        }

        for (const key in data) {
            if (data[key] === '') data[key] = null;
        }

        if (this.tipo === 'frentes_servico' && data.tipo_producao === 'NA') data.tipo_producao = null;

        if (data.remover_documento === 'true') data.documento_url = null; 
        delete data.remover_documento; 

        const fileData = data.documento;
        delete data.documento; 

        if (fileData && fileData.size > 0) {
            try {
                showLoading();
                const fileExt = fileData.name.split('.').pop();
                const fileName = `${this.tipo}_${Date.now()}.${fileExt}`; 
                
                const { error: uploadError } = await supabase.storage.from('documentos_terceiros').upload(fileName, fileData);
                if (uploadError) throw uploadError;

                const { data: urlData } = supabase.storage.from('documentos_terceiros').getPublicUrl(fileName);
                data.documento_url = urlData.publicUrl; 
            } catch (err) {
                console.error("Erro no upload do documento:", err);
                showToast('Erro ao fazer upload. O item será salvo sem anexo.', 'error');
            }
        }

        if (this.tipo === 'caminhoes') {
            data.motoristas = formData.getAll('motoristas');
            if (isEdit) data.motoristas = data.motoristas.map(id => parseInt(id)); 
        }
        if (this.tipo === 'equipamentos') {
            data.operadores = formData.getAll('operadores');
            if (isEdit) data.operadores = data.operadores.map(id => parseInt(id));
        }
        
        showLoading();
        try {
            let error;
            if (isEdit && id) {
                ({ error } = await updateItem(this.tipo, id, data));
                handleOperation(error, 'Item atualizado!');
                if (!error) closeModal();
            } else {
                ({ error } = await insertItem(this.tipo, data));
                handleOperation(error, `${this.getTipoDisplayName().slice(0, -1)} cadastrado!`);
                if (!error) form.reset();
            }
            
            dataCache.invalidateAllData();
            if (!error) await this.loadData(true); 
        } catch (err) { handleOperation(err); } 
        finally { hideLoading(); }
    }

    async handleEdit(id) {
        showLoading();
        const selectQuery = this.tipo === 'caminhoes' ? '*, caminhao_terceiros(terceiro_id)' : this.tipo === 'equipamentos' ? '*, equipamento_terceiros(terceiro_id)' : '*';
        const { data: item, error } = await fetchItemById(this.tipo, id, selectQuery);
        hideLoading();
    
        if (error) return handleOperation(error);
        
        if (this.tipo === 'caminhoes' && item.caminhao_terceiros) item.motoristas = item.caminhao_terceiros.map(ct => ct.terceiro_id);
        if (this.tipo === 'equipamentos' && item.equipamento_terceiros) item.operadores = item.equipamento_terceiros.map(et => et.terceiro_id);
    
        const formHTML = this.generateFormHTML(item);
        openModal(`Editar ${this.getTipoDisplayName().slice(0, -1)}`, formHTML);
        
        const editForm = document.getElementById(`form-edit-${this.tipo}`);
        this.setupValidationListeners(editForm);
        if (editForm) editForm.addEventListener('submit', (e) => this.handleFormSubmit(e, true, id)); 
    }

    async handleDelete(id) {
        const content = `<p>Deseja realmente excluir este item do banco de dados?</p><div class="modal-actions"><button id="cancel-delete-btn" class="btn-secondary">Cancelar</button><button id="confirm-delete-btn" class="btn-primary">Confirmar</button></div>`;
        openModal('Confirmar Exclusão', content);
        document.getElementById('confirm-delete-btn').onclick = () => this.handleRealDelete(id);
        document.getElementById('cancel-delete-btn').onclick = closeModal;
    }
    
    async handleRealDelete(id) {
        showLoading();
        try {
            const { error } = await deleteItem(this.tipo, id);
            if (error && error.message.includes('foreign key constraint')) {
                showToast('Não é possível excluir. Este item está em uso.', 'error');
            } else {
                dataCache.invalidateAllData();
                handleOperation(error, `${this.getTipoDisplayName().slice(0, -1)} excluído!`);
                if (!error) await this.loadData(true);
            }
        } catch (err) { handleOperation(err); } 
        finally { hideLoading(); closeModal(); }
    }
}