// js/views/cadastros.js
import { showToast, handleOperation, showLoading, hideLoading, validateCPFCNPJ, validatePhone } from '../helpers.js';
import { mapManager } from '../maps.js';
import { openModal, closeModal } from '../components/modal.js';
import { fetchAllData, insertItem, deleteItem, fetchItemById, updateItem } from '../api.js';
// NOVO: Importa dataCache
import { dataCache } from '../dataCache.js';

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
        // NOVO: Adicionar listeners de validação após a renderização do formulário
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
            this.data = await dataCache.fetchMasterDataOnly(forceRefresh); // USANDO CACHE AQUI
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
            // --- CORREÇÃO AQUI ---
            caminhoes: [
                { name: 'cod_equipamento', label: 'Código do Caminhão', type: 'text', required: true },
                { name: 'descricao', label: 'Descrição do Caminhão', type: 'text', required: true },
                { name: 'proprietario_id', label: 'Proprietário', type: 'select', source: 'proprietarios', displayField: 'nome', required: true },
                { name: 'motoristas', label: 'Motoristas', type: 'select-multiple', source: 'terceiros', displayField: 'nome', required: false },
                { name: 'situacao', label: 'Situação', type: 'select', options: ['ativo', 'parado', 'inativo'], required: true }
            ],
            equipamentos: [
                { name: 'cod_equipamento', label: 'Código do Equipamento', type: 'text', required: true },
                { name: 'descricao', label: 'Descrição do Equipamento', type: 'text', required: true },
                { name: 'proprietario_id', label: 'Proprietário', type: 'select', source: 'proprietarios', displayField: 'nome', required: true },
                { name: 'operadores', label: 'Operadores', type: 'select-multiple', source: 'terceiros', displayField: 'nome', required: false },
                { name: 'finalidade', label: 'Finalidade', type: 'select', options: ['Carregadeira', 'Trator Reboque', 'Colhedora', 'Trator Transbordo'], required: true },
                { name: 'frente_id', label: 'Frente de Serviço', type: 'select', source: 'frentes_servico', displayField: 'nome', required: true }
            ],
            frentes_servico: [
                { name: 'cod_equipamento', label: 'Código da Frente', type: 'text', required: true },
                { name: 'nome', label: 'Nome da Frente', type: 'text', required: true }
            ],
            fornecedores: [
                { name: 'cod_equipamento', label: 'Código do Fornecedor', type: 'text', required: true },
                { name: 'nome', label: 'Nome do Fornecedor', type: 'text', required: true },
                { name: 'cpf_cnpj', label: 'CPF/CNPJ', type: 'text', required: true, validation: 'cpfcnpj' }, // ADD VALIDAÇÃO
                { name: 'telefone', label: 'Telefone', type: 'text', required: false, validation: 'phone' } // ADD VALIDAÇÃO
            ],
            proprietarios: [
                { name: 'cod_equipamento', label: 'Código do Proprietário', type: 'text', required: true },
                { name: 'nome', label: 'Nome do Proprietário', type: 'text', required: true },
                { name: 'cpf_cnpj', label: 'CPF/CNPJ', type: 'text', required: true, validation: 'cpfcnpj' }, // ADD VALIDAÇÃO
                { name: 'telefone', label: 'Telefone', type: 'text', required: false, validation: 'phone' } // ADD VALIDAÇÃO
            ],
            terceiros: [
                { name: 'nome', label: 'Nome', type: 'text', required: true },
                { name: 'cpf_cnpj', label: 'CPF/CNPJ', type: 'text', required: true, validation: 'cpfcnpj' }, // ADD VALIDAÇÃO
                // NOVO: Campo Atividade como Select com opções fixas
                { 
                    name: 'descricao_atividade', 
                    label: 'Atividade', 
                    type: 'select', 
                    options: [
                        'Motorista', 
                        'Operador de Colhedora', 
                        'Operador de Trator Reboque', 
                        'Operador de Trator Transbordo', 
                        'Operador de Carregadeira'
                    ], 
                    required: true 
                },
                { name: 'empresa_id', label: 'Empresa (Proprietário)', type: 'select', source: 'proprietarios', displayField: 'nome', required: true }
            ]
        };
        return baseFields[this.tipo];
    }

    getTipoDisplayName() {
        const names = {
            'fazendas': 'Fazendas', 'caminhoes': 'Caminhões', 'equipamentos': 'Equipamentos',
            'frentes_servico': 'Frentes de Serviço', 'fornecedores': 'Fornecedores',
            'proprietarios': 'Proprietários', 'terceiros': 'Terceiros'
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
            const value = isEdit ? (item[field.name] || (field.type === 'select-multiple' ? [] : '')) : '';
            const id = isEdit ? `edit-${field.name}` : field.name;
    
            let inputHTML = `<div class="form-group"><label for="${id}">${field.label}</label>`;
    
            if (field.type === 'select' || field.type === 'select-multiple') {
                const multipleAttr = field.type === 'select-multiple' ? 'multiple' : '';
                inputHTML += `<select name="${field.name}" id="${id}" class="form-select" ${multipleAttr} ${requiredAttr}>`;
                if (!multipleAttr) inputHTML += `<option value="">Selecione...</option>`;
                
                if (field.source && this.data[field.source]) {
                    this.data[field.source].forEach(optionItem => {
                        // Correção para lidar com arrays de IDs no modo de edição (caminhao_terceiros/equipamento_terceiros)
                        const isSelected = isEdit && (
                            value == optionItem.id || 
                            (Array.isArray(item[field.name]) && item[field.name].includes(optionItem.id)) // Verifica o array de IDs
                        );
                        inputHTML += `<option value="${optionItem.id}" ${isSelected ? 'selected' : ''}>${optionItem[field.displayField]}</option>`;
                    });
                } else if (field.options) {
                    field.options.forEach(option => {
                        const isSelected = isEdit && value === option;
                        inputHTML += `<option value="${option}" ${isSelected ? 'selected' : ''}>${this.formatOption(option)}</option>`;
                    });
                }
                inputHTML += `</select>`;
                // REMOVIDO: A dica de CTRL/CMD para simular a preparação para um componente customizado
                // if (field.type === 'select-multiple') inputHTML += `<div class="select-multiple-hint"><i class="ph-fill ph-info"></i> Mantenha Ctrl pressionado</div>`;
            } else {
                inputHTML += `<input type="${field.type}" name="${field.name}" id="${id}" class="form-input" value="${value}" ${requiredAttr} data-validation="${field.validation || ''}">`; // ADD data-validation
            }
            // NOVO: Placeholder para mensagem de erro de validação
            if (field.validation) {
                 inputHTML += `<div class="validation-message" id="error-${id}" style="display: none;"></div>`;
            }
            inputHTML += `</div>`;
            return inputHTML;
        }).join('');
    
        const submitText = isEdit ? 'Salvar Alterações' : `Cadastrar ${this.getTipoDisplayName().slice(0, -1)}`;
        return `<form id="${isEdit ? 'form-edit-' + this.tipo : 'form-' + this.tipo}" class="form-modern">${inputsHTML}<button type="submit" class="form-submit"><i class="ph-fill ph-floppy-disk"></i> ${submitText}</button></form>`;
    }

    // --- CORREÇÃO APLICADA AQUI ---
    formatOption(option) {
        if (!option || typeof option !== 'string') {
            return 'N/A';
        }
        return option.charAt(0).toUpperCase() + option.slice(1).replace('_', ' ');
    }
    // -----------------------------
    
    // NOVO: Função para configurar listeners de validação
    setupValidationListeners(form) {
        if (!form) return;

        form.querySelectorAll('[data-validation]').forEach(input => {
            const validationType = input.dataset.validation;
            if (validationType) {
                // Adiciona listener para input e blur para validação em tempo real
                ['input', 'blur'].forEach(eventType => {
                    input.addEventListener(eventType, () => this.validateField(input, validationType));
                });
            }
        });
    }
    
    // NOVO: Função para validar um campo e exibir o feedback
    validateField(input, validationType) {
        const value = input.value;
        const errorMessageElement = document.getElementById(`error-${input.id}`);
        let isValid = true;
        let errorMessage = '';

        // Se o campo não é obrigatório e está vazio, considera válido para validação on-input/blur
        if (!input.hasAttribute('required') && !value) {
            input.classList.remove('is-invalid');
            if (errorMessageElement) errorMessageElement.style.display = 'none';
            return true;
        }

        if (value) {
            if (validationType === 'cpfcnpj') {
                isValid = validateCPFCNPJ(value);
                errorMessage = 'CPF/CNPJ inválido (deve ter 11 ou 14 dígitos).';
            } else if (validationType === 'phone') {
                isValid = validatePhone(value);
                errorMessage = 'Telefone inválido (deve ter 10 ou 11 dígitos).';
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
            'caminhoes': ['Código', 'Descrição', 'Proprietário', 'Situação', 'Ações'], // Situação adicionada
            'equipamentos': ['Código', 'Descrição', 'Proprietário', 'Finalidade', 'Frente', 'Ações'],
            'frentes_servico': ['Código', 'Nome', 'Ações'],
            'fornecedores': ['Código', 'Nome', 'CPF/CNPJ', 'Telefone', 'Ações'],
            'proprietarios': ['Código', 'Nome', 'CPF/CNPJ', 'Telefone', 'Ações'],
            'terceiros': ['Nome', 'CPF/CNPJ', 'Atividade', 'Empresa', 'Ações']
        };
        return (headersConfig[this.tipo] || ['Nome', 'Ações']).map(h => `<th>${h}</th>`).join('');
    }

    generateTableRow(item) {
        const cells = this.getTableCells(item);
        return `<tr>${cells}<td><div class="action-buttons-modern"><button class="action-btn edit-btn-modern" data-id="${item.id}"><i class="ph-fill ph-pencil-simple"></i></button><button class="action-btn delete-btn-modern" data-id="${item.id}"><i class="ph-fill ph-trash"></i></button></div></td></tr>`;
    }

    getTableCells(item) {
        const cellsConfig = {
            'fazendas': [item.cod_equipamento, item.nome, item.fornecedores?.nome || 'N/A', item.latitude && item.longitude ? `${parseFloat(item.latitude).toFixed(4)}, ${parseFloat(item.longitude).toFixed(4)}` : 'N/A'],
            'caminhoes': [item.cod_equipamento, item.descricao || 'N/A', item.proprietarios?.nome || 'N/A', this.formatOption(item.situacao)],
            'equipamentos': [item.cod_equipamento, item.descricao || 'N/A', item.proprietarios?.nome || 'N/A', item.finalidade || 'N/A', item.frentes_servico?.nome || 'N/A'],
            'frentes_servico': [item.cod_equipamento, item.nome],
            'fornecedores': [item.cod_equipamento, item.nome, item.cpf_cnpj || 'N/A', item.telefone || 'N/A'],
            'proprietarios': [item.cod_equipamento, item.nome, item.cpf_cnpj || 'N/A', item.telefone || 'N/A'],
            'terceiros': [item.nome, item.cpf_cnpj || 'N/A', item.descricao_atividade || 'N/A', item.empresa_id?.nome || 'N/A']
        };
        return (cellsConfig[this.tipo] || [item.nome]).map(c => `<td>${c}</td>`).join('');
    }

    addEventListeners() {
        const form = document.getElementById(`form-${this.tipo}`);
        if (form) form.addEventListener('submit', (e) => this.handleFormSubmit(e, false)); // ADD 'false' para isEdit

        this.container.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-btn-modern');
            const deleteBtn = e.target.closest('.delete-btn-modern');
            if (editBtn) this.handleEdit(editBtn.dataset.id);
            if (deleteBtn) this.handleDelete(deleteBtn.dataset.id);
        });
    }

    // --- NOVA FUNÇÃO GENÉRICA DE SAVE ---
    async handleFormSubmit(e, isEdit = false, id = null) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        // 1. Validação de campos específicos (CPF/CNPJ e Telefone) - AGORA USANDO A FUNÇÃO validateField
        let formIsValid = true;
        form.querySelectorAll('[data-validation]').forEach(input => {
            // A validação final também verifica se o campo obrigatório está vazio
            if (input.hasAttribute('required') && !input.value) {
                formIsValid = false;
            }
            if (!this.validateField(input, input.dataset.validation)) {
                formIsValid = false;
            }
        });
        
        if (!formIsValid) {
             showToast('Corrija os campos em vermelho antes de prosseguir.', 'error');
             return;
        }

        // 2. Tratamento de campos de múltiplas opções
        if (this.tipo === 'caminhoes') {
            data.motoristas = formData.getAll('motoristas');
            // Mapeia o array de IDs para o formato esperado pelo updateCaminhao (array de IDs)
            if (isEdit) {
                // A API espera o array de IDs
                data.motoristas = data.motoristas.map(id => parseInt(id)); 
            }
        }
        if (this.tipo === 'equipamentos') {
            data.operadores = formData.getAll('operadores');
            // Mapeia o array de IDs para o formato esperado pelo updateEquipment (array de IDs)
            if (isEdit) {
                 data.operadores = data.operadores.map(id => parseInt(id));
            }
        }
        
        showLoading();
        try {
            let error;
            if (isEdit && id) {
                // Modo Edição
                ({ error } = await updateItem(this.tipo, id, data));
                handleOperation(error, 'Item atualizado com sucesso!');
                if (!error) closeModal();
            } else {
                // Modo Cadastro
                ({ error } = await insertItem(this.tipo, data));
                handleOperation(error, `${this.getTipoDisplayName().slice(0, -1)} cadastrado!`);
                if (!error) form.reset();
            }
            
            // Invalida o Cache (NOVO)
            dataCache.invalidateAllData();

            if (!error) {
                await this.loadData(true); // Força refresh após escrita
            }
        } catch (err) {
            handleOperation(err);
        } finally {
            hideLoading();
        }
    }
    // --- FIM NOVA FUNÇÃO GENÉRICA DE SAVE ---

    async handleEdit(id) {
        showLoading();
        // Inclui as tabelas de junção para pré-seleção dos terceiros
        const selectQuery = this.tipo === 'caminhoes' ? '*, caminhao_terceiros(terceiro_id)' : this.tipo === 'equipamentos' ? '*, equipamento_terceiros(terceiro_id)' : '*';
        const { data: item, error } = await fetchItemById(this.tipo, id, selectQuery);
        hideLoading();
    
        if (error) return handleOperation(error);
        
        // Mapeia os dados da tabela de junção para o formato de array de IDs (para o select-multiple)
        if (this.tipo === 'caminhoes' && item.caminhao_terceiros) {
            item.motoristas = item.caminhao_terceiros.map(ct => ct.terceiro_id);
        }
        if (this.tipo === 'equipamentos' && item.equipamento_terceiros) {
            item.operadores = item.equipamento_terceiros.map(et => et.terceiro_id);
        }
    
        const formHTML = this.generateFormHTML(item);
        openModal(`Editar ${this.getTipoDisplayName().slice(0, -1)}`, formHTML);
        
        const editForm = document.getElementById(`form-edit-${this.tipo}`);
        // Configura listeners de validação para o formulário do modal
        this.setupValidationListeners(editForm);
        // USANDO NOVA FUNÇÃO: isEdit=true, id=id
        if (editForm) editForm.addEventListener('submit', (e) => this.handleFormSubmit(e, true, id)); 
    }

    async handleDelete(id) {
        const content = `<p>Deseja realmente excluir este item?</p><div class="modal-actions"><button id="cancel-delete-btn" class="btn-secondary">Cancelar</button><button id="confirm-delete-btn" class="btn-primary">Confirmar</button></div>`;
        openModal('Confirmar Exclusão', content);
        document.getElementById('confirm-delete-btn').onclick = () => this.handleRealDelete(id);
        document.getElementById('cancel-delete-btn').onclick = closeModal;
    }
    
    async handleRealDelete(id) {
        showLoading();
        try {
            const { error } = await deleteItem(this.tipo, id);
            if (error && error.message.includes('foreign key constraint')) {
                showToast('Não é possível excluir. Este item está em uso por outro registro.', 'error');
            } else {
                
                // Invalida o Cache (NOVO)
                dataCache.invalidateAllData();
                
                handleOperation(error, `${this.getTipoDisplayName().slice(0, -1)} excluído!`);
                if (!error) await this.loadData(true); // Força refresh após escrita
            }
        } catch (err) {
            handleOperation(err);
        } finally {
            hideLoading();
            closeModal();
        }
    }
}