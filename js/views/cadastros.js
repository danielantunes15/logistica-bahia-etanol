// js/views/cadastros.js - Específico para Fazendas
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
                            <h3>Adicionar Nova ${title.slice(0, -1)}</h3>
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
                    // Os campos já são atualizados automaticamente pelo MapManager
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
                { name: 'cod_equipamento', label: 'Código do Equipamento', type: 'text', required: true },
                { name: 'placa', label: 'Placa', type: 'text', required: true },
                { name: 'status', label: 'Status', type: 'select', options: ['ativo', 'em_viagem', 'manutenção', 'inativo'], required: true },
                { name: 'proprietario_id', label: 'Proprietário', type: 'select', source: 'proprietarios', displayField: 'nome', required: true }
            ],
            equipamentos: [
                { name: 'cod_equipamento', label: 'Código do Equipamento', type: 'text', required: true },
                { name: 'finalidade', label: 'Finalidade', type: 'select', options: ['Carregadeira', 'Trator Reboque', 'Colhedora', 'Trator Transbordo'], required: true },
                { name: 'status', label: 'Status', type: 'select', options: ['ativo', 'em_viagem', 'manutenção', 'inativo'], required: true }
            ],
            fornecedores: [
                { name: 'nome', label: 'Nome do Fornecedor', type: 'text', required: true },
                { name: 'tipo_fornecedor', label: 'Tipo', type: 'select', options: ['Cana Própria', 'Arrendado', 'Terceiros'], required: true }
            ],
            proprietarios: [
                { name: 'nome', label: 'Nome', type: 'text', required: true },
                { name: 'tipo', label: 'Tipo', type: 'select', options: ['Próprio', 'Terceiro'], required: true }
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
            'frentes': 'Frentes de Serviço',
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

            if (field.type === 'select') {
                inputHTML += `<select name="${field.name}" id="${field.name}" class="form-select" ${requiredAttr}>`;
                inputHTML += `<option value="">Selecione...</option>`;
                
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
            } else {
                const value = field.name === 'latitude' || field.name === 'longitude' ? '' : '';
                inputHTML += `<input type="${field.type}" name="${field.name}" id="${field.name}" class="form-input" value="${value}" ${requiredAttr}>`;
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
            'caminhoes': ['Código', 'Placa', 'Status', 'Proprietário', 'Ações'],
            'equipamentos': ['Código', 'Finalidade', 'Status', 'Ações'],
            'fornecedores': ['Nome', 'Tipo', 'Ações'],
            'proprietarios': ['Nome', 'Tipo', 'Ações']
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
                item.placa,
                this.formatOption(item.status),
                item.proprietarios?.nome || 'N/A'
            ],
            'equipamentos': [
                item.cod_equipamento,
                item.finalidade,
                this.formatOption(item.status)
            ],
            'fornecedores': [
                item.nome,
                this.formatOption(item.tipo_fornecedor)
            ],
            'proprietarios': [
                item.nome,
                this.formatOption(item.tipo)
            ]
        };

        const cells = cellsConfig[this.tipo] || [item.nome, this.formatOption(item.status)];
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

        try {
            const { error } = await insertItem(this.tipo, data);
            handleOperation(error, `${this.getTipoDisplayName().slice(0, -1)} cadastrado com sucesso!`);
            
            if (!error) {
                e.target.reset();
                await this.loadData(); // Recarregar dados para atualizar a tabela
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