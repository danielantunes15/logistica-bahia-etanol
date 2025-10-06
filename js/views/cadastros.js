// js/views/cadastros.js
import { showToast, handleOperation } from '../helpers.js';
import { mapManager } from '../maps.js';
import { fetchAllData, insertItem } from '../api.js';

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
        this.initializeMap();
        this.addEventListeners();
    }

    async hide() {
        // Limpar recursos do mapa se necessário
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
                <div class="cadastro-header">
                    <h1 class="cadastro-title">Cadastro de ${title}</h1>
                </div>

                <div class="cadastro-content">
                    <div class="form-section">
                        <h3>Adicionar Novo</h3>
                        <div id="form-container">
                            <!-- Formulário será injetado aqui -->
                        </div>
                    </div>

                    ${showMap ? `
                    <div class="form-section">
                        <h3>Localização no Mapa</h3>
                        <p>Clique no mapa para selecionar a localização da fazenda</p>
                        <div id="map-container-medio">
                            <div id="map-cadastro-medio" style="height: 400px; width: 100%;"></div>
                        </div>
                    </div>
                    ` : ''}

                    <div class="list-container">
                        <h2>Itens Cadastrados</h2>
                        <div id="table-container">
                            <!-- Tabela será injetada aqui -->
                        </div>
                    </div>
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
            // Aguardar um pouco para o container ser renderizado
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
                { name: 'nome', label: 'Nome da Fazenda', type: 'text', required: true },
                { name: 'status', label: 'Status', type: 'select', options: ['colhendo', 'disponível', 'finalizada'], required: true },
                { name: 'hectares', label: 'Hectares (ha)', type: 'number', required: false },
                { name: 'fornecedor_id', label: 'Fornecedor de Cana', type: 'select', source: 'fornecedores', displayField: 'nome', required: true },
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
                <div class="form-field">
                    <label for="${field.name}">${field.label}</label>
            `;

            if (field.type === 'select') {
                inputHTML += `<select name="${field.name}" id="${field.name}" ${requiredAttr}>`;
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
                inputHTML += `<input type="${field.type}" name="${field.name}" id="${field.name}" value="${value}" ${requiredAttr}>`;
            }

            inputHTML += `</div>`;
            return inputHTML;
        }).join('');

        return `
            <form id="form-${this.tipo}" class="add-form">
                ${inputsHTML}
                <button type="submit" class="btn-primary">
                    <i class="ph-fill ph-floppy-disk"></i>
                    Salvar ${this.getTipoDisplayName()}
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
            tableContainer.innerHTML = '<p>Nenhum registro cadastrado.</p>';
            return;
        }

        const headers = this.getTableHeaders();
        const rows = items.map(item => this.generateTableRow(item)).join('');

        tableContainer.innerHTML = `
            <table class="data-table">
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
            'fazendas': ['Nome', 'Status', 'Hectares', 'Fornecedor', 'Coordenadas', 'Ações'],
            'caminhoes': ['Código', 'Placa', 'Status', 'Proprietário', 'Ações'],
            'equipamentos': ['Código', 'Finalidade', 'Status', 'Ações']
        };

        const headers = headersConfig[this.tipo] || ['Nome', 'Status', 'Ações'];
        return headers.map(header => `<th>${header}</th>`).join('');
    }

    generateTableRow(item) {
        const cells = this.getTableCells(item);
        return `
            <tr>
                ${cells}
                <td class="action-buttons">
                    <button class="edit-btn" data-id="${item.id}">
                        <i class="ph-fill ph-pencil-simple"></i>
                    </button>
                    <button class="delete-btn" data-id="${item.id}">
                        <i class="ph-fill ph-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }

    getTableCells(item) {
        const cellsConfig = {
            'fazendas': [
                item.nome,
                this.formatOption(item.status),
                item.hectares || 'N/A',
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
            if (e.target.closest('.edit-btn')) {
                this.handleEdit(e.target.closest('.edit-btn').dataset.id);
            } else if (e.target.closest('.delete-btn')) {
                this.handleDelete(e.target.closest('.delete-btn').dataset.id);
            }
        });
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());

        try {
            const { error } = await insertItem(this.tipo, data);
            handleOperation(error, `${this.getTipoDisplayName()} cadastrado com sucesso!`);
            
            if (!error) {
                e.target.reset();
                await this.loadData(); // Recarregar dados para atualizar a tabela
            }
        } catch (error) {
            handleOperation(error, '');
        }
    }

    async handleEdit(id) {
        showToast(`Editando ${this.getTipoDisplayName()} ID: ${id}`, 'success');
        // Implementar edição completa posteriormente
    }

    async handleDelete(id) {
        const confirmDelete = confirm('Deseja realmente excluir este item?');
        if (!confirmDelete) return;

        showToast(`${this.getTipoDisplayName()} excluído com sucesso!`, 'success');
        // Implementar exclusão completa posteriormente
    }
}