// js/views/cadastros.js
import { showToast, handleOperation } from '../helpers.js';

export class CadastrosView {
    constructor(tipo) {
        this.tipo = tipo;
        this.container = null;
    }

    async show() {
        await this.loadHTML();
        this.addEventListeners();
    }

    async hide() {
        // Limpar recursos
    }

    async loadHTML() {
        const container = document.getElementById('views-container');
        container.innerHTML = this.getHTML();
        this.container = container;
    }

    getHTML() {
        const titles = {
            'fazendas': 'Fazendas',
            'caminhoes': 'Caminhões', 
            'equipamentos': 'Equipamentos'
        };

        const title = titles[this.tipo] || this.tipo;

        return `
            <div id="cadastros-view" class="view">
                <div class="cadastro-header">
                    <h1 class="cadastro-title">Cadastro de ${title}</h1>
                </div>

                <div class="cadastro-content">
                    <div class="form-section">
                        <h3>Adicionar Novo</h3>
                        <form id="form-${this.tipo}" class="add-form">
                            <div class="form-field">
                                <label for="nome">Nome</label>
                                <input type="text" id="nome" name="nome" required>
                            </div>
                            <div class="form-field">
                                <label for="status">Status</label>
                                <select id="status" name="status" required>
                                    <option value="">Selecione...</option>
                                    <option value="ativo">Ativo</option>
                                    <option value="inativo">Inativo</option>
                                </select>
                            </div>
                            <button type="submit" class="btn-primary">Salvar</button>
                        </form>
                    </div>

                    <div class="list-container">
                        <h2>Itens Cadastrados</h2>
                        <div class="data-table-placeholder">
                            <p>Lista de ${title} será carregada aqui...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    addEventListeners() {
        const form = document.getElementById(`form-${this.tipo}`);
        if (form) {
            form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        
        showToast(`${this.tipo} "${data.nome}" cadastrado com sucesso!`, 'success');
        e.target.reset();
    }
}