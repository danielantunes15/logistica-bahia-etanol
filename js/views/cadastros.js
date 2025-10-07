// js/views/cadastros.js
import { showToast, handleOperation } from '../helpers.js';
import { mapManager } from '../maps.js';
import { fetchAllData, insertItem, deleteItem } from '../api.js';

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
    }

    async hide() {
        // Limpar recursos se necessário
    }

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
                            <div id="form-container">
                                <!-- Formulário será injetado aqui -->
                            </div>
                        </div>

                        ${showMap ? `
                        <div class="cadastro-map-container">
                            <h3>Localização no Mapa</h3>
                            <div class="map-instructions">
                                <p>
                                    <i class="ph-fill ph-info"></i>
                                    Clique no mapa para selecionar a localização da fazenda
                                </p>
                            </div>
                            <div id="map-cadastro-medio"></div>
                        </div>
                        ` : `
                        <div class="list-container-modern">
                            <h2>${title} Cadastrados</h2>
                            <div id="table-container">
                                <!-- Tabela será injetada aqui -->
                            </div>
                        </div>
                        `}
                    </div>

                    ${showMap ? `
                    <div class="list-container-modern">
                        <h2>Fazendas Cadastradas</h2>
                        <div id="table-container">
                            <!-- Tabela será injetada aqui -->
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    async loadData() {
        try {
            this.data = await fetchAllData();
            this.renderTable();
        } catch (error) {
            console.error(`Erro ao carregar dados de ${this.tipo}:`, error);
            showToast('Erro ao carregar dados', 'error');
        }
    }

    initializeMap() {
        if (this.tipo === 'fazendas') {
            setTimeout(() => {
                const map = mapManager.initCadastroMap((lat, lng) => {
                    console.log('Localização selecionada:', lat, lng);
                });
                
                if (map) {
                    console.log('Mapa de cadastro inicializado com sucesso');
                }
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
                { name: 'cod_equipamento', label: 'Código do Caminhão', type: 'text', required: true },
                { name: 'descricao', label: 'Descrição do Caminhão', type: 'text', required: true },
                { name: 'motoristas', label: 'Motoristas', type: 'select-multiple', source: 'terceiros', displayField: 'nome', required: false },
                { name: 'proprietario_id', label: 'Proprietário do Caminhão', type: 'select', source: 'proprietarios', displayField: 'nome', required: true }
            ],
            equipamentos: [
                { name: 'cod_equipamento', label: 'Código do Equipamento', type: 'text', required: true },
                { name: 'descricao', label: 'Descrição do Equipamento', type: 'text', required: true },
                { name: 'operadores', label: 'Operadores do Equipamento', type: 'select-multiple', source: 'terceiros', displayField: 'nome', required: false },
                { name: 'proprietario_id', label: 'Proprietário do Equipamento', type: 'select', source: 'proprietarios', displayField: 'nome', required: true },
                { name: 'finalidade', label: 'Finalidade do Equipamento', type: 'select', options: ['Carregadeira', 'Trator Reboque', 'Colhedora', 'Trator Transbordo'], required: true },
                { name: 'frente_id', label: 'Frente de Serviço', type: 'select', source: 'frentes_servico', displayField: 'nome', required: true }
            ],
            frentes_servico: [
                { name: 'cod_equipamento', label: 'Código da Frente', type: 'text', required: true },
                { name: 'nome', label: 'Nome da Frente', type: 'text', required: true }
            ],
            fornecedores: [
                { name: 'cod_equipamento', label: 'Código do Fornecedor', type: 'text', required: true },
                { name: 'nome', label: 'Nome do Fornecedor', type: 'text', required: true },
                { name: 'cpf_cnpj', label: 'CPF/CNPJ', type: 'text', required: true },
                { name: 'telefone', label: 'Telefone', type: 'text', required: false }
            ],
            proprietarios: [
                { name: 'cod_equipamento', label: 'Código do Proprietário', type: 'text', required: true },
                { name: 'nome', label: 'Nome do Proprietário', type: 'text', required: true },
                { name: 'cpf_cnpj', label: 'CPF/CNPJ', type: 'text', required: true },
                { name: 'telefone', label: 'Telefone', type: 'text', required: false }
            ],
            terceiros: [
                { name: 'nome', label: 'Nome', type: 'text', required: true },
                { name: 'cpf_cnpj', label: 'CPF/CNPJ', type: 'text', required: true },
                { name: 'descricao_atividade', label: 'Atividade', type: 'text', required: true },
                { name: 'empresa_id', label: 'Empresa (Proprietário)', type: 'select', source: 'proprietarios', displayField: 'nome', required: true }
            ]
        };

        return baseFields[this.tipo] || [
            { name: 'nome', label: 'Nome', type: 'text', required: true },
            { name: 'status', label: 'Status', type: 'select', options: ['ativo', 'inativo'], required: true }
        ];
    }

    getTipoDisplayName() {
        const names = {
            'fazendas': 'Fazendas',
            'caminhoes': 'Caminhões',
            'equipamentos': 'Equipamentos',
            'frentes_servico': 'Frentes de Serviço',
            'fornecedores': 'Fornecedores',
            'proprietarios': 'Proprietários',
            'terceiros': 'Terceiros'
        };
        return names[this.tipo] || this.tipo;
    }

    renderForm() {
        const formContainer = document.getElementById('form-container');
        if (!formContainer) return;

        formContainer.innerHTML = this.generateFormHTML();
    }

    generateFormHTML() {
        const inputsHTML = this.formFields.map(field => {
            const requiredAttr = field.required ? 'required' : '';
            let inputHTML = `
                <div class="form-group">
                    <label for="${field.name}">${field.label}</label>
            `;

            if (field.type === 'select' || field.type === 'select-multiple') {
                const multipleAttr = field.type === 'select-multiple' ? 'multiple' : '';
                const sizeAttr = field.type === 'select-multiple' ? 'size="4"' : '';
                
                inputHTML += `<select name="${field.name}" id="${field.name}" class="form-select" ${multipleAttr} ${sizeAttr} ${requiredAttr}>`;
                
                if (!multipleAttr) {
                    inputHTML += `<option value="">Selecione...</option>`;
                }
                
                if (field.source && this.data[field.source]) {
                    this.data[field.source].forEach(item => {
                        inputHTML += `<option value="${item.id}">${item[field.displayField]}</option>`;
                    });
                } else if (field.options) {
                    field.options.forEach(option => {
                        inputHTML += `<option value="${option}">${this.formatOption(option)}</option>`;
                    });
                }
                inputHTML += `</select>`;
                
                // Adicionar hint para select múltiplo
                if (field.type === 'select-multiple') {
                    inputHTML += `<div class="select-multiple-hint"><i class="ph-fill ph-info"></i> Mantenha Ctrl pressionado para selecionar múltiplos</div>`;
                }
            } else {
                const value = field.name === 'latitude' || field.name === 'longitude' ? '' : '';
                inputHTML += `<input type="${field.name === 'telefone' ? 'tel' : field.type}" name="${field.name}" id="${field.name}" class="form-input" value="${value}" ${requiredAttr}>`;
            }

            inputHTML += `</div>`;
            return inputHTML;
        }).join('');

        return `
            <form id="form-${this.tipo}" class="form-modern">
                ${inputsHTML}
                <button type="submit" class="form-submit">
                    <i class="ph-fill ph-floppy-disk"></i>
                    Cadastrar ${this.getTipoDisplayName().slice(0, -1)}
                </button>
            </form>
        `;
    }

    formatOption(option) {
        return option.charAt(0).toUpperCase() + option.slice(1).replace('_', ' ');
    }

    renderTable() {
        const tableContainer = document.getElementById('table-container');
        if (!tableContainer) return;

        const items = this.data[this.tipo] || [];
        
        if (items.length === 0) {
            tableContainer.innerHTML = `
                <div class="empty-state">
                    <i class="ph-fill ph-table"></i>
                    <p>Nenhum ${this.getTipoDisplayName().toLowerCase()} cadastrado</p>
                </div>
            `;
            return;
        }

        const headers = this.getTableHeaders();
        const rows = items.map(item => this.generateTableRow(item)).join('');

        tableContainer.innerHTML = `
            <table class="data-table-modern">
                <thead>
                    <tr>${headers}</tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        `;
    }

    getTableHeaders() {
        const headersConfig = {
            'fazendas': ['Código', 'Nome', 'Fornecedor', 'Coordenadas', 'Ações'],
            'caminhoes': ['Código', 'Descrição', 'Motoristas', 'Proprietário', 'Ações'],
            'equipamentos': ['Código', 'Descrição', 'Operadores', 'Proprietário', 'Finalidade', 'Frente', 'Ações'],
            'frentes_servico': ['Código', 'Nome', 'Ações'],
            'fornecedores': ['Código', 'Nome', 'CPF/CNPJ', 'Telefone', 'Ações'],
            'proprietarios': ['Código', 'Nome', 'CPF/CNPJ', 'Telefone', 'Ações'],
            'terceiros': ['Nome', 'CPF/CNPJ', 'Atividade', 'Empresa', 'Ações']
        };

        const headers = headersConfig[this.tipo] || ['Nome', 'Status', 'Ações'];
        return headers.map(header => `<th>${header}</th>`).join('');
    }

    generateTableRow(item) {
        const cells = this.getTableCells(item);
        return `
            <tr>
                ${cells}
                <td>
                    <div class="action-buttons-modern">
                        <button class="action-btn edit-btn-modern" data-id="${item.id}">
                            <i class="ph-fill ph-pencil-simple"></i>
                        </button>
                        <button class="action-btn delete-btn-modern" data-id="${item.id}">
                            <i class="ph-fill ph-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    getTableCells(item) {
        const cellsConfig = {
            'fazendas': [
                item.cod_equipamento,
                item.nome,
                item.fornecedores?.nome || 'N/A',
                item.latitude && item.longitude ? 
                    `${parseFloat(item.latitude).toFixed(4)}, ${parseFloat(item.longitude).toFixed(4)}` : 
                    'Não definida'
            ],
            'caminhoes': [
                item.cod_equipamento,
                item.descricao || 'N/A',
                item.caminhao_terceiros?.length > 0 ? 
                    item.caminhao_terceiros.map(ct => ct.terceiros?.nome).filter(Boolean).join(', ') : 
                    'Nenhum',
                item.proprietarios?.nome || 'N/A'
            ],
            'equipamentos': [
                item.cod_equipamento,
                item.descricao || 'N/A',
                item.equipamento_terceiros?.length > 0 ? 
                    item.equipamento_terceiros.map(et => et.terceiros?.nome).filter(Boolean).join(', ') : 
                    'Nenhum',
                item.proprietarios?.nome || 'N/A',
                item.finalidade || 'N/A',
                item.frentes_servico?.nome || 'N/A'
            ],
            'frentes_servico': [
                item.cod_equipamento,
                item.nome
            ],
            'fornecedores': [
                item.cod_equipamento,
                item.nome,
                item.cpf_cnpj || 'N/A',
                item.telefone || 'N/A'
            ],
            'proprietarios': [
                item.cod_equipamento,
                item.nome,
                item.cpf_cnpj || 'N/A',
                item.telefone || 'N/A'
            ],
            'terceiros': [
                item.nome,
                item.cpf_cnpj || 'N/A',
                item.descricao_atividade || 'N/A',
                item.empresa_id?.nome || 'N/A'
            ]
        };

        const cells = cellsConfig[this.tipo] || [item.nome, this.formatOption(item.status || '')];
        return cells.map(cell => `<td>${cell}</td>`).join('');
    }

    addEventListeners() {
        // Form submit
        const form = document.getElementById(`form-${this.tipo}`);
        if (form) {
            form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }

        // Action buttons
        this.container.addEventListener('click', (e) => {
            if (e.target.closest('.edit-btn-modern')) {
                this.handleEdit(e.target.closest('.edit-btn-modern').dataset.id);
            } else if (e.target.closest('.delete-btn-modern')) {
                this.handleDelete(e.target.closest('.delete-btn-modern').dataset.id);
            }
        });
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());

        // Processar selects múltiplos
        if (this.tipo === 'caminhoes' || this.tipo === 'equipamentos') {
            const motoristasSelect = document.querySelector('select[name="motoristas"]');
            const operadoresSelect = document.querySelector('select[name="operadores"]');
            
            if (motoristasSelect && motoristasSelect.multiple) {
                data.motoristas = Array.from(motoristasSelect.selectedOptions).map(option => option.value);
            }
            if (operadoresSelect && operadoresSelect.multiple) {
                data.operadores = Array.from(operadoresSelect.selectedOptions).map(option => option.value);
            }
        }

        try {
            const { error } = await insertItem(this.tipo, data);
            handleOperation(error, `${this.getTipoDisplayName().slice(0, -1)} cadastrado com sucesso!`);
            
            if (!error) {
                e.target.reset();
                await this.loadData();
            }
        } catch (error) {
            handleOperation(error, '');
        }
    }

    async handleEdit(id) {
        showToast(`Editando ${this.getTipoDisplayName().slice(0, -1)} ID: ${id}`, 'success');
        // Implementar edição completa posteriormente
    }

    async handleDelete(id) {
        const confirmDelete = confirm(`Deseja realmente excluir este ${this.getTipoDisplayName().slice(0, -1).toLowerCase()}?`);
        if (!confirmDelete) return;

        try {
            const { error } = await deleteItem(this.tipo, id);
            handleOperation(error, `${this.getTipoDisplayName().slice(0, -1)} excluído com sucesso!`);
            
            if (!error) {
                await this.loadData();
            }
        } catch (error) {
            handleOperation(error, '');
        }
    }
}