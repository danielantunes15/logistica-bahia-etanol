import { handleOperation } from './helpers.js';
import * as api from './api.js';
import { initCadastroFazendaMap, initEditFazendaMap } from './maps.js';
import { renderReports } from './reports.js';

let cachedData = {};

const tableConfig = {
    'fazendas': { name: 'Fazenda', columns: ['nome', 'cod_fazenda', 'status', 'fornecedores(nome)'] },
    'caminhoes': { name: 'Caminhão', columns: ['cod_equipamento', 'status', 'motorista_atual', 'proprietarios(nome)', 'terceiros'] },
    'equipamentos': { name: 'Equipamento', columns: ['cod_equipamento', 'status', 'operador_atual', 'proprietarios(nome)', 'frentes_servico(nome)', 'terceiros'] },
    'frentes_servico': { name: 'Frente', columns: ['nome', 'status'] },
    'fornecedores': { name: 'Fornecedor', columns: ['nome', 'cpf_cnpj'] },
    'proprietarios': { name: 'Proprietário', columns: ['nome', 'cpf_cnpj', 'telefone'] },
    'terceiros': { name: 'Terceiro', columns: ['cod_terceiro', 'nome', 'cpf', 'proprietarios(nome)', 'descricao_atividade'] }
};

const formFields = {
    fazendas: [
        { name: 'nome', label: 'Nome da Fazenda', type: 'text', required: true },
        { name: 'cod_fazenda', label: 'Cód. da Fazenda', type: 'text' },
        { name: 'latitude', label: 'Latitude', type: 'number', required: true },
        { name: 'longitude', label: 'Longitude', type: 'number', required: true },
        { name: 'fornecedor_id', label: 'Fornecedor', type: 'select', source: 'fornecedores', displayField: 'nome', required: true },
        { name: 'status', label: 'Status', type: 'select', options: ['inativa', 'ativa', 'colhendo'], required: true },
    ],
    caminhoes: [
        { name: 'cod_equipamento', label: 'Cód. Equipamento', type: 'text', required: true },
        { name: 'motorista_atual', label: 'Motorista Atual (Opcional)', type: 'text' },
        { name: 'proprietario_id', label: 'Proprietário', type: 'select', source: 'proprietarios', displayField: 'nome', required: true },
        { name: 'status', label: 'Status', type: 'select', options: ['inativo', 'ativo', 'em_viagem', 'manutencao'], required: true },
        { name: 'terceiros', label: 'Motoristas Qualificados (selecione um ou mais)', type: 'select-multiple', source: 'terceiros', displayField: 'nome' },
        { name: 'descricao', label: 'Descrição', type: 'text' },
    ],
    equipamentos: [
        { name: 'cod_equipamento', label: 'Cód. Equipamento', type: 'text', required: true },
        { name: 'operador_atual', label: 'Operador Atual (Opcional)', type: 'text' },
        { name: 'proprietario_id', label: 'Proprietário', type: 'select', source: 'proprietarios', displayField: 'nome', required: true },
        { name: 'finalidade', label: 'Finalidade', type: 'select', options: ['Carregadeira', 'Trator Reboque', 'Colhedora', 'Trator Transbordo', 'Trator Apoio', 'Caminhão'], required: true },
        { name: 'frente_servico_id', label: 'Frente de Serviço', type: 'select', source: 'frentes_servico', displayField: 'nome', required: true, filterActive: true },
        { name: 'status', label: 'Status', type: 'select', options: ['inativo', 'ativo', 'em_viagem', 'manutencao'], required: true },
        { name: 'terceiros', label: 'Operadores Qualificados (selecione um ou mais)', type: 'select-multiple', source: 'terceiros', displayField: 'nome' },
        { name: 'descricao', label: 'Descrição', type: 'text' },
    ],
    frentes_servico: [
        { name: 'nome', label: 'Nome da Frente', type: 'text', required: true },
        { name: 'status', label: 'Status', type: 'select', options: ['inativa', 'ativa'], required: true },
    ],
    fornecedores: [ { name: 'nome', label: 'Nome', type: 'text', required: true }, { name: 'cpf_cnpj', label: 'CPF/CNPJ', type: 'text' }, ],
    proprietarios: [ { name: 'nome', label: 'Nome', type: 'text', required: true }, { name: 'cpf_cnpj', label: 'CPF/CNPJ', type: 'text' }, { name: 'telefone', label: 'Telefone', type: 'text' }, ],
    terceiros: [
        { name: 'cod_terceiro', label: 'Cód. do Terceiro', type: 'text' },
        { name: 'nome', label: 'Nome', type: 'text', required: true },
        { name: 'cpf', label: 'CPF', type: 'text' },
        { name: 'empresa_id', label: 'Empresa (Vínculo)', type: 'select', source: 'proprietarios', displayField: 'nome', required: true },
        { name: 'descricao_atividade', label: 'Descrição da Atividade', type: 'select', options: ['Operador de Carregadeira', 'Operador de trator reboque', 'Operador de colhedora', 'Operador de transbordo'], required: true },
    ]
};

export function injectHTMLContent() {
    document.getElementById('dashboard-view').innerHTML = `<div id="map"></div><div class="dashboard-overlay"><div class="kpi-card"><h2 id="kpi-caminhoes-ativos">0</h2><p>Caminhões Ativos</p></div><div class="kpi-card"><h2 id="kpi-equipamentos-ativos">0</h2><p>Equipamentos Ativos</p></div><div class="kpi-card"><h2 id="kpi-fazendas-colhendo">0</h2><p>Fazendas em Colheita</p></div><div class="kpi-card"><h2 id="kpi-frentes-ativas">0</h2><p>Frentes Ativas</p></div></div>`;
    document.getElementById('controle-view').innerHTML = `<div class="admin-container"><h1>Painel de Controle</h1></div>`;
    document.getElementById('relatorios-view').innerHTML = `<div class="report-container"><div class="report-header"><h2>Relatório de Produtividade</h2></div><div class="chart-wrapper"><canvas id="workHoursChart"></canvas></div></div>`;
    document.getElementById('cadastro-fazendas-view').innerHTML = `<div class="admin-container"><h1>Cadastro de Fazendas</h1><div class="form-section" id="form-section-fazendas"></div><div id="map-container-medio"><div id="map-cadastro-medio"></div></div><div class="list-container"><h2>Fazendas Cadastradas</h2><table id="table-fazendas"><thead></thead><tbody></tbody></table></div></div>`;
    
    document.getElementById('cadastro-equipamentos-view').innerHTML = `
        <div class="admin-container">
            <h1>Cadastro de Equipamentos</h1>
            <div class="form-section" id="form-section-equipamentos"></div>
            <div class="list-container" id="list-container-carregadeira">
                <h2>Carregadeiras</h2>
                <table id="table-equipamentos-carregadeira"><thead></thead><tbody></tbody></table>
            </div>
            <div class="list-container" id="list-container-trator-reboque">
                <h2>Tratores Reboque</h2>
                <table id="table-equipamentos-trator-reboque"><thead></thead><tbody></tbody></table>
            </div>
            <div class="list-container" id="list-container-colhedora">
                <h2>Colhedoras</h2>
                <table id="table-equipamentos-colhedora"><thead></thead><tbody></tbody></table>
            </div>
            <div class="list-container" id="list-container-trator-transbordo">
                <h2>Tratores Transbordo</h2>
                <table id="table-equipamentos-trator-transbordo"><thead></thead><tbody></tbody></table>
            </div>
        </div>
    `;

    for (const key in tableConfig) {
        if (key === 'fazendas' || key === 'equipamentos') continue;
        const viewId = `cadastro-${key.replace('_servico', '')}-view`;
        const viewElement = document.getElementById(viewId);
        if (viewElement) {
             let filterHTML = '';
            if (key === 'terceiros') {
                filterHTML = `
                    <div class="filter-container form-section">
                        <h3>Filtrar Terceiros</h3>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                            <div>
                                <label for="filter-terceiros-nome">Nome</label>
                                <input type="text" id="filter-terceiros-nome" placeholder="Filtrar por nome...">
                            </div>
                            <div>
                                <label for="filter-terceiros-atividade">Atividade</label>
                                <select id="filter-terceiros-atividade"></select>
                            </div>
                        </div>
                    </div>
                `;
            }
            viewElement.innerHTML = `<div class="admin-container"><h1>Cadastro de ${tableConfig[key].name}s</h1>${filterHTML}<div class="form-section" id="form-section-${key}"></div><div class="list-container"><h2>Lista de ${tableConfig[key].name}s Cadastrados</h2><table id="table-${key}"><thead></thead><tbody></tbody></table></div></div>`;
        }
    }
}

export function addEventListeners() {
    const mainContent = document.querySelector('.main-content');
    document.querySelectorAll('.nav-button').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelector('.nav-button.active')?.classList.remove('active');
            button.classList.add('active');
            document.querySelector('.nav-button-group').parentElement.classList.remove('open');
            const viewId = button.getAttribute('data-view');
            document.querySelector('.view.active-view')?.classList.remove('active-view');
            document.getElementById(`${viewId}-view`).classList.add('active-view');
            if (viewId === 'relatorios') renderReports();
            else if (viewId === 'cadastro-fazendas') initCadastroFazendaMap();
        });
    });
    document.querySelector('.nav-button-group').addEventListener('click', e => e.currentTarget.parentElement.classList.toggle('open'));
    document.getElementById('modal-close-btn').addEventListener('click', closeEditModal);
    document.getElementById('edit-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeEditModal(); });
    mainContent.addEventListener('submit', async e => {
        if (e.target.tagName === 'FORM' && e.target.id.startsWith('form-add-')) {
            e.preventDefault();
            await handleAddFormSubmit(e.target);
        }
    });
    mainContent.addEventListener('click', async e => {
        const editButton = e.target.closest('.edit-btn');
        const deleteButton = e.target.closest('.delete-btn');
        if (editButton) {
            const table = editButton.dataset.table;
            const id = editButton.dataset.id;
            await openEditModal(table, id);
        }
        if (deleteButton) {
            const table = deleteButton.dataset.table;
            const id = deleteButton.dataset.id;
            if (confirm(`Tem certeza que deseja excluir este item?`)) {
                const { error } = await api.deleteItem(table, id);
                handleOperation(error, 'Item excluído com sucesso!');
            }
        }
    });
    mainContent.addEventListener('input', e => {
        if (e.target.id === 'filter-terceiros-nome') filterTerceirosList();
    });
    mainContent.addEventListener('change', e => {
        if (e.target.id === 'filter-terceiros-atividade') filterTerceirosList();
    });
}

async function handleAddFormSubmit(form) {
    const table = form.dataset.table;
    const formData = new FormData(form);
    const terceiros = formData.getAll('terceiros');
    const dataToInsert = Object.fromEntries(formData.entries());
    dataToInsert.terceiros = terceiros;
    (formFields[table] || []).forEach(field => {
        if (field.type === 'number' && dataToInsert[field.name]) {
            dataToInsert[field.name] = parseFloat(dataToInsert[field.name]);
        }
    });
    let error;
    if (table === 'equipamentos') ({ error } = await api.insertEquipment(dataToInsert));
    else if (table === 'caminhoes') ({ error } = await api.insertCaminhao(dataToInsert));
    else ({ error } = await api.insertItem(table, dataToInsert));
    handleOperation(error, `${tableConfig[table].name} cadastrado com sucesso!`);
    if (!error) form.reset();
}

function filterTerceirosList() {
    const nomeFilter = document.getElementById('filter-terceiros-nome').value.toLowerCase();
    const atividadeFilter = document.getElementById('filter-terceiros-atividade').value;
    const filteredData = cachedData.terceiros.filter(terceiro => {
        const nomeMatch = terceiro.nome.toLowerCase().includes(nomeFilter);
        const atividadeMatch = !atividadeFilter || terceiro.descricao_atividade === atividadeFilter;
        return nomeMatch && atividadeMatch;
    });
    renderTable('table-terceiros', tableConfig.terceiros.columns, filteredData, 'terceiros');
}

function renderTable(tableId, columns, data, tableKey) {
    const table = document.getElementById(tableId);
    if (!table) return;
    table.querySelector('thead').innerHTML = `<tr>${columns.map(col => `<th>${col.split('(')[0].replace(/_/g, ' ').toUpperCase()}</th>`).join('')}<th>AÇÕES</th></tr>`;
    table.querySelector('tbody').innerHTML = (data || []).map(item => `
        <tr>
            ${columns.map(col => `<td>${getNestedProperty(item, col) ?? ''}</td>`).join('')}
            <td class="action-buttons">
                <button class="edit-btn" data-table="${tableKey}" data-id="${item.id}"><i class="ph-fill ph-pencil-simple"></i></button>
                <button class="delete-btn" data-table="${tableKey}" data-id="${item.id}"><i class="ph-fill ph-trash"></i></button>
            </td>
        </tr>`).join('');
}

export function renderDashboard(fazendas, caminhoes, equipamentos) {
    const activeTrucks = (caminhoes || []).filter(c => c.status === 'ativo' || c.status === 'em_viagem').length;
    const activeEquip = (equipamentos || []).filter(e => e.status === 'ativo' || e.status === 'em_viagem').length;
    const harvestingFarms = (fazendas || []).filter(f => f.status === 'colhendo').length;
    document.getElementById('kpi-caminhoes-ativos').textContent = activeTrucks;
    document.getElementById('kpi-equipamentos-ativos').textContent = activeEquip;
    document.getElementById('kpi-fazendas-colhendo').textContent = harvestingFarms;
}

export function renderControle(fazendas, caminhoes, equipamentos, frentes) {}

export function renderCadastros(allData) {
    cachedData = allData;
    const atividadeSelect = document.getElementById('filter-terceiros-atividade');
    if (atividadeSelect && atividadeSelect.options.length <= 1) {
        const atividades = [...new Set((allData.terceiros || []).map(t => t.descricao_atividade))];
        atividadeSelect.innerHTML = `<option value="">Todas as Atividades</option>`;
        atividades.forEach(atividade => { if(atividade) atividadeSelect.innerHTML += `<option value="${atividade}">${atividade}</option>`; });
    }
    for (const key in tableConfig) {
        const config = tableConfig[key];
        const data = allData[key.replace('_servico', '')] || [];
        if (key === 'equipamentos') {
            const formContainer = document.getElementById(`form-section-${key}`);
            if (formContainer) formContainer.innerHTML = generateAddFormHTML(key, allData);
            renderTable('table-equipamentos-carregadeira', config.columns, data.filter(e => e.finalidade === 'Carregadeira'), key);
            renderTable('table-equipamentos-trator-reboque', config.columns, data.filter(e => e.finalidade === 'Trator Reboque'), key);
            renderTable('table-equipamentos-colhedora', config.columns, data.filter(e => e.finalidade === 'Colhedora'), key);
            renderTable('table-equipamentos-trator-transbordo', config.columns, data.filter(e => e.finalidade === 'Trator Transbordo'), key);
            continue;
        }
        const formContainer = document.getElementById(`form-section-${key}`);
        if(formContainer) formContainer.innerHTML = generateAddFormHTML(key, allData);
        renderTable(`table-${key}`, config.columns, data, key);
    }
}

function getNestedProperty(obj, path) {
    if (path === 'terceiros' && Array.isArray(obj.terceiros)) {
        return obj.terceiros.map(t => t.nome).join(', ') || 'Nenhum';
    }
    if (path.includes('(')) {
        const parts = path.replace(')', '').split('(');
        return obj[parts[0]] ? obj[parts[0]][parts[1]] : 'N/A';
    }
    return obj[path];
}

function generateAddFormHTML(tableKey, allData) {
    const fields = formFields[tableKey];
    if (!fields) return '';
    const formTitle = `<h3>Adicionar Novo ${tableConfig[tableKey].name}</h3>`;
    const formInputs = fields.map(field => {
        const requiredAttr = field.required ? 'required' : '';
        let inputHtml = `<label for="${field.name}">${field.label}</label>`;
        if (field.type === 'select' || field.type === 'select-multiple') {
            const multipleAttr = field.type === 'select-multiple' ? 'multiple' : '';
            inputHtml += `<select name="${field.name}" id="${field.name}" ${multipleAttr} ${requiredAttr}>`;
            if (!multipleAttr) inputHtml += `<option value="">Selecione...</option>`;
            if (field.source) {
                let sourceData = allData[field.source.replace('_servico', '')];
                if (field.filterActive && sourceData) {
                    sourceData = sourceData.filter(item => item.status === 'ativa');
                }
                if (sourceData) sourceData.forEach(item => { inputHtml += `<option value="${item.id}">${item[field.displayField]}</option>`; });
            } else if (field.options) {
                field.options.forEach(option => { inputHtml += `<option value="${option}">${option.charAt(0).toUpperCase() + option.slice(1).replace('_', ' ')}</option>`; });
            }
            inputHtml += `</select>`;
        } else {
            inputHtml += `<input type="${field.type}" name="${field.name}" id="${field.name}" ${requiredAttr}>`;
        }
        return inputHtml;
    }).join('');
    return `<form id="form-add-${tableKey}" data-table="${tableKey}" class="add-form">${formTitle}${formInputs}<button type="submit">Salvar</button></form>`;
}

export async function openEditModal(table, id) {
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalOverlay = document.getElementById('edit-modal');
    modalTitle.textContent = `Editando ${tableConfig[table].name}...`;
    modalBody.innerHTML = '<p>Carregando dados...</p>';
    modalOverlay.classList.add('active');
    try {
        const { data: itemData, error: itemError } = await api.fetchItemById(table, id);
        if (itemError) throw itemError;
        const allDataForDropdowns = await api.fetchAllData();
        modalBody.innerHTML = generateEditFormHTML(table, itemData, allDataForDropdowns);
        if (table === 'fazendas') {
            initEditFazendaMap(itemData.latitude, itemData.longitude);
        }
        const modalForm = document.getElementById(`form-edit-${table}`);
        modalForm.addEventListener('submit', async e => {
            e.preventDefault();
            await saveModalChanges(table, id, modalForm);
        });
    } catch (error) {
        handleOperation(error, '');
        modalBody.innerHTML = `<p style="color: red;">Erro ao carregar os dados para edição.</p>`;
    }
}

export async function saveModalChanges(table, id, form) {
    const formData = new FormData(form);
    const terceiros = formData.getAll('terceiros');
    const dataToUpdate = Object.fromEntries(formData.entries());
    dataToUpdate.terceiros = terceiros;
    (formFields[table] || []).forEach(field => {
        if (field.type === 'number' && dataToUpdate[field.name]) {
            dataToUpdate[field.name] = parseFloat(dataToUpdate[field.name]);
        }
    });
    let error;
    if (table === 'equipamentos') ({ error } = await api.updateEquipment(id, dataToUpdate));
    else if (table === 'caminhoes') ({ error } = await api.updateCaminhao(id, dataToUpdate));
    else ({ error } = await api.updateItem(table, id, dataToUpdate));
    handleOperation(error, 'Item atualizado com sucesso!');
    if (!error) closeEditModal();
}

export function closeEditModal() {
    const modal = document.getElementById('edit-modal');
    modal.classList.remove('active');
    modal.querySelector('.modal-body').innerHTML = '';
}

export function generateEditFormHTML(tableKey, data, allData) {
    const fields = formFields[tableKey];
    if (!fields) return '<p>Formulário de edição não configurado.</p>';
    const formInputs = fields.map(field => {
        const requiredAttr = field.required ? 'required' : '';
        let value = data[field.name] ?? '';
        let inputHtml = `<label for="edit-${field.name}">${field.label}</label>`;
        if (field.type === 'select' || field.type === 'select-multiple') {
            const multipleAttr = field.type === 'select-multiple' ? 'multiple' : '';
            inputHtml += `<select name="${field.name}" id="edit-${field.name}" ${multipleAttr} ${requiredAttr}>`;
            if (!multipleAttr) inputHtml += `<option value="">Selecione...</option>`;
            const selectedValues = field.type === 'select-multiple' ? (data.terceiros || []).map(t => t.id) : [value];
            if (field.source) {
                let sourceData = allData[field.source.replace('_servico','')];
                if (field.filterActive && sourceData) {
                     sourceData = sourceData.filter(item => item.status === 'ativa' || selectedValues.includes(item.id));
                }
                if (sourceData) {
                    sourceData.forEach(item => {
                        const selected = selectedValues.includes(item.id) ? 'selected' : '';
                        inputHtml += `<option value="${item.id}" ${selected}>${item[field.displayField]}</option>`;
                    });
                }
            } else if (field.options) {
                field.options.forEach(option => {
                    const selected = selectedValues.includes(option) ? 'selected' : '';
                    inputHtml += `<option value="${option}" ${selected}>${option.charAt(0).toUpperCase() + option.slice(1)}</option>`;
                });
            }
            inputHtml += `</select>`;
        } else {
            inputHtml += `<input type="${field.type}" name="${field.name}" id="edit-${field.name}" value="${value}" ${requiredAttr}>`;
        }
        return inputHtml;
    }).join('');
    const farmMapHTML = tableKey === 'fazendas' ? '<div id="map-edit-medio"></div>' : '';
    return `<form id="form-edit-${tableKey}" data-table="${tableKey}">${formInputs}${farmMapHTML}<button type="submit">Salvar Alterações</button></form>`;
}