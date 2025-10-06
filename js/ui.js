// Este arquivo controla toda a manipulação da interface: menus, tabelas, modais, etc.
import { handleOperation, showToast, populateSelect } from './helpers.js';
import { deleteItem, updateItem, insertItem } from './api.js';
import { initCadastroFazendaMap } from './maps.js';
import { renderReports } from './reports.js';

const tableConfig = {
    'fazendas': { name: 'Fazenda', columns: ['nome', 'area_total_ha', 'status', 'fornecedores(nome)'] },
    'caminhoes': { name: 'Caminhão', columns: ['cod_equipamento', 'placa', 'status', 'motorista_atual', 'proprietarios(nome)'] },
    'equipamentos': { name: 'Equipamento', columns: ['cod_equipamento', 'tipo', 'status', 'proprietarios(nome)'] },
    'frentes_servico': { name: 'Frente', columns: ['nome_frente', 'lider', 'status'] },
    'fornecedores': { name: 'Fornecedor', columns: ['nome', 'cnpj_cpf', 'telefone'] },
    'proprietarios': { name: 'Proprietário', columns: ['nome', 'cpf_cnpj', 'telefone'] }
};

// --- INJEÇÃO DE HTML INICIAL ---
export function injectHTMLContent() {
    document.getElementById('dashboard-view').innerHTML = `
        <div id="map"></div>
        <div class="dashboard-overlay">
            <div class="kpi-card">
                <h2 id="kpi-caminhoes-ativos">0</h2>
                <p>Caminhões Ativos</p>
            </div>
            <div class="kpi-card">
                <h2 id="kpi-equipamentos-ativos">0</h2>
                <p>Equipamentos Ativos</p>
            </div>
            <div class="kpi-card">
                <h2 id="kpi-fazendas-colhendo">0</h2>
                <p>Fazendas em Colheita</p>
            </div>
            <div class="kpi-card">
                <h2 id="kpi-frentes-ativas">0</h2>
                <p>Frentes Ativas</p>
            </div>
        </div>
    `;

    document.getElementById('controle-view').innerHTML = `<div class="admin-container"><h1>Painel de Controle</h1><p>Esta área será implementada com os controles de status dos equipamentos.</p></div>`;

    document.getElementById('relatorios-view').innerHTML = `
        <div class="report-container">
            <div class="report-header">
                <h2>Relatório de Produtividade</h2>
            </div>
            <div class="chart-wrapper">
                <canvas id="workHoursChart"></canvas>
            </div>
        </div>
    `;

    for (const key in tableConfig) {
        const viewId = `cadastro-${key.replace('_servico', '')}-view`;
        const viewElement = document.getElementById(viewId);
        if (viewElement) {
            viewElement.innerHTML = `
                <div class="admin-container">
                    <h1>Cadastro de ${tableConfig[key].name}s</h1>
                    <div class="form-section" id="form-section-${key}">
                        </div>
                    <div class="list-container">
                        <table id="table-${key}">
                            <thead></thead>
                            <tbody></tbody>
                        </table>
                    </div>
                </div>
            `;
        }
    }
}

// --- EVENT LISTENERS ---
export function addEventListeners() {
    const navButtons = document.querySelectorAll('.nav-button');
    const navGroupButton = document.querySelector('.nav-button-group');

    const switchView = (viewId) => {
        document.querySelector('.view.active-view')?.classList.remove('active-view');
        const nextView = document.getElementById(`${viewId}-view`);
        if(nextView) {
            nextView.classList.add('active-view');
        }
        
        // Lógica específica ao abrir uma view
        if (viewId === 'relatorios') {
            renderReports();
        } else if (viewId === 'cadastro-fazendas') {
            initCadastroFazendaMap();
        }
    };
    
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            document.querySelector('.nav-button.active')?.classList.remove('active');
            button.classList.add('active');
            
            // Fecha o submenu se um item principal for clicado
            navGroupButton.parentElement.classList.remove('open');

            const viewId = button.getAttribute('data-view');
            switchView(viewId);
        });
    });

    navGroupButton.addEventListener('click', () => {
        navGroupButton.parentElement.classList.toggle('open');
    });

    document.getElementById('modal-close-btn').addEventListener('click', closeEditModal);
    document.getElementById('edit-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeEditModal();
    });
}

// --- LÓGICA DE RENDERIZAÇÃO ---
export function renderDashboard(fazendas, caminhoes, equipamentos) {
    const activeTrucks = caminhoes?.filter(c => c.status === 'ativo' || c.status === 'em_viagem').length || 0;
    const activeEquip = equipamentos?.filter(e => e.status === 'ativo' || e.status === 'em_viagem').length || 0;
    const harvestingFarms = fazendas?.filter(f => f.status === 'colhendo').length || 0;
    
    document.getElementById('kpi-caminhoes-ativos').textContent = activeTrucks;
    document.getElementById('kpi-equipamentos-ativos').textContent = activeEquip;
    document.getElementById('kpi-fazendas-colhendo').textContent = harvestingFarms;
}

export function renderControle(fazendas, caminhoes, equipamentos, frentes) {
    // A lógica para renderizar os controles do painel de controle entraria aqui
}

export function renderCadastros(allData) {
    for (const key in tableConfig) {
        const config = tableConfig[key];
        const data = allData[key.replace('_servico', '')];
        const table = document.getElementById(`table-${key}`);
        if (!table || !data) continue;

        table.querySelector('thead').innerHTML = `
            <tr>
                ${config.columns.map(col => `<th>${col.split('(')[0].replace(/_/g, ' ').toUpperCase()}</th>`).join('')}
                <th>AÇÕES</th>
            </tr>
        `;
        
        table.querySelector('tbody').innerHTML = data.map(item => `
            <tr>
                ${config.columns.map(col => `<td>${getNestedProperty(item, col) ?? ''}</td>`).join('')}
                <td class="action-buttons">
                    <button class="edit-btn" data-table="${key}" data-id="${item.id}"><i class="ph-fill ph-pencil-simple"></i></button>
                    <button class="delete-btn" data-table="${key}" data-id="${item.id}"><i class="ph-fill ph-trash"></i></button>
                </td>
            </tr>
        `).join('');
    }
}

function getNestedProperty(obj, path) {
    if (path.includes('(')) {
        const parts = path.replace(')', '').split('(');
        const parent = parts[0];
        const child = parts[1];
        return obj[parent] ? obj[parent][child] : 'N/A';
    }
    return obj[path];
}

// --- LÓGICA DO MODAL ---
export function openEditModal(table, id) { 
    console.log(`Abrir modal para editar ${table} com id ${id}`);
    document.getElementById('edit-modal').classList.add('active');
}

export function saveModalChanges(table, id, form) { /* ... */ }

export function closeEditModal() { 
    document.getElementById('edit-modal').classList.remove('active'); 
}

export function generateEditFormHTML(table, data) { /* ... */ }