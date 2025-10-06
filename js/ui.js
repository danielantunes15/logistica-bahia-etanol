import { handleOperation } from './helpers.js';
import { deleteItem, insertItem, fetchItemById, updateItem, fetchAllData } from './api.js';
import { initCadastroFazendaMap, initEditFazendaMap } from './maps.js';
import { renderReports } from './reports.js';

const tableConfig = {
    'fazendas': { name: 'Fazenda', columns: ['nome', 'cod_fazenda', 'status', 'fornecedores(nome)'] },
    'caminhoes': { name: 'Caminhão', columns: ['cod_equipamento', 'status', 'motorista_atual', 'proprietarios(nome)'] },
    'equipamentos': { name: 'Equipamento', columns: ['cod_equipamento', 'status', 'operador_atual', 'proprietarios(nome)'] },
    'frentes_servico': { name: 'Frente', columns: ['nome_frente', 'cod_frente', 'status'] },
    'fornecedores': { name: 'Fornecedor', columns: ['nome', 'cod_fornecedor', 'cpf_cnpj'] },
    'proprietarios': { name: 'Proprietário', columns: ['nome', 'cpf_cnpj', 'telefone', 'nome_empresa'] }
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
        { name: 'motorista_atual', label: 'Motorista Atual', type: 'text' },
        { name: 'proprietario_id', label: 'Proprietário', type: 'select', source: 'proprietarios', displayField: 'nome', required: true },
        { name: 'status', label: 'Status', type: 'select', options: ['inativo', 'ativo', 'em_viagem', 'manutencao'], required: true },
        { name: 'descricao', label: 'Descrição', type: 'text' },
    ],
    equipamentos: [
        { name: 'cod_equipamento', label: 'Cód. Equipamento', type: 'text', required: true },
        { name: 'operador_atual', label: 'Operador Atual', type: 'text' },
        { name: 'proprietario_id', label: 'Proprietário', type: 'select', source: 'proprietarios', displayField: 'nome', required: true },
        { name: 'status', label: 'Status', type: 'select', options: ['inativo', 'ativo', 'em_viagem', 'manutencao'], required: true },
        { name: 'descricao', label: 'Descrição', type: 'text' },
    ],
    frentes_servico: [
        { name: 'nome_frente', label: 'Nome da Frente', type: 'text', required: true },
        { name: 'cod_frente', label: 'Cód. da Frente', type: 'text' },
        { name: 'fazenda_id', label: 'Fazenda Associada', type: 'select', source: 'fazendas', displayField: 'nome', required: true },
        { name: 'status', label: 'Status', type: 'select', options: ['inativa', 'ativa'], required: true },
    ],
    fornecedores: [
        { name: 'nome', label: 'Nome', type: 'text', required: true },
        { name: 'cod_fornecedor', label: 'Cód. do Fornecedor', type: 'text' },
        { name: 'cpf_cnpj', label: 'CPF/CNPJ', type: 'text' },
    ],
    proprietarios: [
        { name: 'nome', label: 'Nome', type: 'text', required: true },
        { name: 'cpf_cnpj', label: 'CPF/CNPJ', type: 'text' },
        { name: 'telefone', label: 'Telefone', type: 'text' },
        { name: 'nome_empresa', label: 'Nome da Empresa', type: 'text' },
    ]
};

export function injectHTMLContent() {
    document.getElementById('dashboard-view').innerHTML = `<div id="map"></div><div class="dashboard-overlay"><div class="kpi-card"><h2 id="kpi-caminhoes-ativos">0</h2><p>Caminhões Ativos</p></div><div class="kpi-card"><h2 id="kpi-equipamentos-ativos">0</h2><p>Equipamentos Ativos</p></div><div class="kpi-card"><h2 id="kpi-fazendas-colhendo">0</h2><p>Fazendas em Colheita</p></div><div class="kpi-card"><h2 id="kpi-frentes-ativas">0</h2><p>Frentes Ativas</p></div></div>`;
    document.getElementById('controle-view').innerHTML = `<div class="admin-container"><h1>Painel de Controle</h1></div>`;
    document.getElementById('relatorios-view').innerHTML = `<div class="report-container"><div class="report-header"><h2>Relatório de Produtividade</h2></div><div class="chart-wrapper"><canvas id="workHoursChart"></canvas></div></div>`;
    document.getElementById('cadastro-fazendas-view').innerHTML = `<div class="admin-container"><h1>Cadastro de Fazendas</h1><div class="form-section" id="form-section-fazendas"></div><div id="map-container-medio"><div id="map-cadastro-medio"></div></div><div class="list-container"><h2>Fazendas Cadastradas</h2><table id="table-fazendas"><thead></thead><tbody></tbody></table></div></div>`;
    for (const key in tableConfig) {
        if (key === 'fazendas') continue;
        const viewId = `cadastro-${key.replace('_servico', '')}-view`;
        const viewElement = document.getElementById(viewId);
        if (viewElement) {
            viewElement.innerHTML = `<div class="admin-container"><h1>Cadastro de ${tableConfig[key].name}s</h1><div class="form-section" id="form-section-${key}"></div><div class="list-container"><h2>Lista de ${tableConfig[key].name}s Cadastrados</h2><table id="table-${key}"><thead></thead><tbody></tbody></table></div></div>`;
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
                const { error } = await deleteItem(table, id);
                handleOperation(error, 'Item excluído com sucesso!');
            }
        }
    });
}

async function handleAddFormSubmit(form) {
    const table = form.dataset.table;
    const formData = new FormData(form);
    const dataToInsert = Object.fromEntries(formData.entries());
    formFields[table].forEach(field => {
        if (field.type === 'number' && dataToInsert[field.name]) {
            dataToInsert[field.name] = parseFloat(dataToInsert[field.name]);
        }
    });
    const { error } = await insertItem(table, dataToInsert);
    handleOperation(error, `${tableConfig[table].name} cadastrado com sucesso!`);
    if (!error) form.reset();
}

export function renderDashboard(fazendas, caminhoes, equipamentos) {
    const activeTrucks = caminhoes?.filter(c => c.status === 'ativo' || c.status === 'em_viagem').length || 0;
    const activeEquip = equipamentos?.filter(e => e.status === 'ativo' || e.status === 'em_viagem').length || 0;
    const harvestingFarms = fazendas?.filter(f => f.status === 'colhendo').length || 0;
    document.getElementById('kpi-caminhoes-ativos').textContent = activeTrucks;
    document.getElementById('kpi-equipamentos-ativos').textContent = activeEquip;
    document.getElementById('kpi-fazendas-colhendo').textContent = harvestingFarms;
}

export function renderControle(fazendas, caminhoes, equipamentos, frentes) {}

export function renderCadastros(allData) {
    for (const key in tableConfig) {
        const config = tableConfig[key];
        const data = allData[key.replace('_servico', '')] || [];
        const table = document.getElementById(`table-${key}`);
        const formContainer = document.getElementById(`form-section-${key}`);
        if(formContainer) formContainer.innerHTML = generateAddFormHTML(key, allData);
        if (!table) continue;
        table.querySelector('thead').innerHTML = `<tr>${config.columns.map(col => `<th>${col.split('(')[0].replace(/_/g, ' ').toUpperCase()}</th>`).join('')}<th>AÇÕES</th></tr>`;
        table.querySelector('tbody').innerHTML = data.map(item => {
            if (key === 'frentes_servico' && item.nome) {
                item.nome_frente = item.nome;
            }
            return `<tr>${config.columns.map(col => `<td>${getNestedProperty(item, col) ?? ''}</td>`).join('')}<td class="action-buttons"><button class="edit-btn" data-table="${key}" data-id="${item.id}"><i class="ph-fill ph-pencil-simple"></i></button><button class="delete-btn" data-table="${key}" data-id="${item.id}"><i class="ph-fill ph-trash"></i></button></td></tr>`
        }).join('');
    }
}

function getNestedProperty(obj, path) {
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
        if (field.type === 'select') {
            inputHtml += `<select name="${field.name}" id="${field.name}" ${requiredAttr}><option value="">Selecione...</option>`;
            if (field.source) {
                const sourceData = allData[field.source];
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
        const { data: itemData, error: itemError } = await fetchItemById(table, id);
        if (itemError) throw itemError;
        const allDataForDropdowns = await fetchAllData();
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
    const dataToUpdate = Object.fromEntries(formData.entries());
    formFields[table].forEach(field => {
        if (field.type === 'number' && dataToUpdate[field.name]) {
            dataToUpdate[field.name] = parseFloat(dataToUpdate[field.name]);
        }
    });
    const { error } = await updateItem(table, id, dataToUpdate);
    handleOperation(error, 'Item atualizado com sucesso!');
    if (!error) {
        closeEditModal();
    }
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
        const value = data[field.name] || '';
        let inputHtml = `<label for="edit-${field.name}">${field.label}</label>`;
        if (field.type === 'select') {
            inputHtml += `<select name="${field.name}" id="edit-${field.name}" ${requiredAttr}>`;
            inputHtml += `<option value="">Selecione...</option>`;
            if (field.source) {
                const sourceData = allData[field.source];
                if (sourceData) {
                    sourceData.forEach(item => {
                        const selected = item.id === value ? 'selected' : '';
                        inputHtml += `<option value="${item.id}" ${selected}>${item[field.displayField]}</option>`;
                    });
                }
            } else if (field.options) {
                field.options.forEach(option => {
                    const selected = option === value ? 'selected' : '';
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
    return `<form id="form-edit-${tableKey}">${formInputs}${farmMapHTML}<button type="submit">Salvar Alterações</button></form>`;
}