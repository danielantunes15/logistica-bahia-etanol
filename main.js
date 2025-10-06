document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURAÇÃO E VARIÁVEIS GLOBAIS ---
    const SUPABASE_URL = 'https://uogorpanshybcuhdekhg.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvZ29ycGFuc2h5YmN1aGRla2hnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2MTcxNzYsImV4cCI6MjA3NTE5MzE3Nn0.LSGlAeeLZsPnEw3GtEXzY4D9f3UZhk7SXyBgrGYaKMg';
    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    const USINA_COORDS = [-17.642301, -40.181525];
    const INITIAL_ZOOM = 14;
    const tableNames = { fazendas: 'Fazenda', caminhoes: 'Caminhão', frentes_servico: 'Frente', fornecedores: 'Fornecedor', proprietarios: 'Proprietário' };
    const activeLayer = { url: 'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', options: { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: '&copy; Google' } };
    window.map = null; window.mapCadastroGrande = null; window.isCadastroFazendaMapInitialized = false; window.fazendaMarkers = {}; window.caminhaoMarkers = {};
    const usinaIcon = L.icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/9748/9748625.png', iconSize: [40, 40], iconAnchor: [20, 40], popupAnchor: [0, -40] });
    const fazendaIcon = L.icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/10000/10000305.png', iconSize: [32, 32] });
    const caminhaoIcon = L.icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/3448/3448628.png', iconSize: [32, 32] });
    
    // --- INICIALIZAÇÃO ---
    function initializeApp() {
        addEventListeners();
        initDashboardMap();
        refreshAllData();
        setupRealtime();
        console.log('Aplicação inicializada.');
    }

    // --- LÓGICA DE NAVEGAÇÃO ---
    const navButtons = document.querySelectorAll('.nav-button');
    const navGroup = document.querySelector('.nav-button-group');
    navGroup.addEventListener('click', () => navGroup.parentElement.classList.toggle('open'));
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetViewId = button.dataset.view;
            document.querySelectorAll('.view').forEach(v => v.classList.toggle('active-view', v.id === `${targetViewId}-view`));
            document.querySelectorAll('.nav-button').forEach(b => b.classList.remove('active'));
            button.classList.add('active');
            if (!button.parentElement.classList.contains('submenu')) {
                navGroup.parentElement.classList.remove('open');
            }
            if (targetViewId === 'dashboard' && window.map) setTimeout(() => window.map.invalidateSize(), 1);
            if (targetViewId === 'cadastro-fazendas') {
                initCadastroFazendaMap();
                if (window.mapCadastroGrande) setTimeout(() => window.mapCadastroGrande.invalidateSize(), 1);
            }
        });
    });

    // --- LÓGICA DE DADOS PRINCIPAL ---
    async function refreshAllData() {
        try {
            const [fazendas, caminhoes, frentes, fornecedores, proprietarios] = await Promise.all([
                fetchTable('fazendas', '*, fornecedores(id, nome)'),
                fetchTable('caminhoes', '*, proprietarios(id, nome)'),
                fetchTable('frentes_servico'), fetchTable('fornecedores'), fetchTable('proprietarios')
            ]);
            renderDashboard(fazendas, caminhoes, frentes);
            renderControle(fazendas, caminhoes, frentes);
            renderCadastros(fazendas, caminhoes, frentes, fornecedores, proprietarios);
        } catch (error) { console.error("Erro ao buscar dados:", error); showToast('Erro ao carregar dados.', 'error'); }
    }
    async function fetchTable(tableName, select = '*') { const { data, error } = await supabaseClient.from(tableName).select(select).order('created_at', { ascending: false }); if (error) throw error; return data; }
    function setupRealtime() { supabaseClient.channel('public:tables').on('postgres_changes', { event: '*', schema: 'public' }, refreshAllData).subscribe(); }

    // --- LÓGICA DE EDIÇÃO (MODAL) ---
    async function openEditModal(table, id) {
        const { data, error } = await supabaseClient.from(table).select('*').eq('id', id).single();
        if (error) return showToast('Erro ao buscar dados para edição.', 'error');
        document.getElementById('modal-title').innerText = `Editar ${tableNames[table] || 'Item'}`;
        const modalBody = document.getElementById('modal-body');
        modalBody.innerHTML = await generateEditFormHTML(table, data);
        const form = modalBody.querySelector('form');
        form.addEventListener('submit', (e) => { e.preventDefault(); saveModalChanges(table, id, form); });
        document.getElementById('edit-modal').classList.add('active');
    }
    async function saveModalChanges(table, id, form) {
        const formData = new FormData(form);
        const updateData = Object.fromEntries(formData.entries());
        for (const key in updateData) { if (updateData[key] === '' || updateData[key] === 'null') { updateData[key] = null; } }
        const { error } = await supabaseClient.from(table).update(updateData).eq('id', id);
        handleOperation(error, 'Item atualizado com sucesso!');
        closeEditModal();
    }
    function closeEditModal() { document.getElementById('edit-modal').classList.remove('active'); }

    // --- RENDERIZAÇÃO DE CONTEÚDO ---
    function renderDashboard(fazendas, caminhoes, frentes) {
        if (!document.getElementById('kpi-caminhoes-ativos')) return;
        document.getElementById('kpi-caminhoes-ativos').textContent = caminhoes.filter(c => c.status === 'ativo' || c.status === 'em_viagem').length;
        document.getElementById('kpi-caminhoes-inativos').textContent = caminhoes.filter(c => c.status === 'inativo').length;
        document.getElementById('kpi-fazendas-colhendo').textContent = fazendas.filter(f => f.status === 'colhendo').length;
        document.getElementById('kpi-frentes-ativas').textContent = frentes.filter(fr => fr.status === 'ativa').length;
        updateFazendaMarkers(fazendas);
        updateCaminhaoMarkers(caminhoes);
    }
    function renderControle(fazendas, caminhoes, frentes) {
        if (!document.getElementById('select-fazenda-status')) return;
        populateSelect('select-fazenda-status', fazendas, 'id', 'nome');
        populateSelect('select-caminhao-status', caminhoes, 'id', 'cod_equipamento');
        populateSelect('select-frente-designar', frentes, 'id', 'nome');
        populateSelect('select-fazenda-designar', fazendas, 'id', 'nome');
        populateSelect('select-caminhao-posicionar', caminhoes, 'id', 'cod_equipamento');
        populateSelect('select-fazenda-posicionar', fazendas, 'id', 'nome');
    }
    function renderCadastros(fazendas, caminhoes, frentes, fornecedores, proprietarios) {
        populateSelect('fazenda-fornecedor-select', fornecedores, 'id', 'nome');
        populateSelect('caminhao-proprietario-select', proprietarios, 'id', 'nome');
        renderTable('lista-fazendas', ['Cód.', 'Nome', 'Fornecedor'], fazendas, (item) => `<td>${item.cod_fazenda || ''}</td><td>${item.nome}</td><td>${item.fornecedores?.nome || ''}</td>`, 'fazendas');
        renderTable('lista-caminhoes', ['Cód.', 'Descrição', 'Proprietário'], caminhoes, (item) => `<td>${item.cod_equipamento || ''}</td><td>${item.descricao}</td><td>${item.proprietarios?.nome || ''}</td>`, 'caminhoes');
        renderTable('lista-frentes', ['Cód.', 'Nome'], frentes, (item) => `<td>${item.cod_frente || ''}</td><td>${item.nome}</td>`, 'frentes_servico');
        renderTable('lista-fornecedores', ['Cód.', 'Nome', 'CPF/CNPJ'], fornecedores, (item) => `<td>${item.cod_fornecedor || ''}</td><td>${item.nome}</td><td>${item.cpf_cnpj || ''}</td>`, 'fornecedores');
        renderTable('lista-proprietarios', ['Nome', 'Empresa', 'CPF/CNPJ'], proprietarios, (item) => `<td>${item.nome}</td><td>${item.nome_empresa || ''}</td><td>${item.cpf_cnpj || ''}</td>`, 'proprietarios');
    }
    function renderTable(containerId, headers, data, rowTemplate, tableName) {
        const container = document.getElementById(containerId);
        if(!container) return;
        let tableHTML = '<table><thead><tr>';
        headers.forEach(h => tableHTML += `<th>${h}</th>`);
        tableHTML += '<th>Ações</th></tr></thead><tbody>';
        data.forEach(item => {
            tableHTML += `<tr>`;
            tableHTML += rowTemplate(item);
            tableHTML += `<td><div class="action-buttons"><button class="edit-btn" data-table="${tableName}" data-id="${item.id}"><i class="ph-fill ph-pencil-simple"></i></button><button class="delete-btn" data-table="${tableName}" data-id="${item.id}"><i class="ph-fill ph-trash"></i></button></div></td></tr>`;
        });
        tableHTML += '</tbody></table>';
        container.innerHTML = tableHTML;
    }
    
    // --- EVENT LISTENERS E HANDLERS ---
    function addEventListeners() {
        document.addEventListener('submit', handleFormSubmit);
        document.addEventListener('click', (e) => {
            handleDeleteClick(e);
            handleEditClick(e);
            handleOperationClick(e);
        });
        document.getElementById('modal-close-btn').addEventListener('click', closeEditModal);
        document.getElementById('edit-modal').addEventListener('click', (e) => { if(e.target === e.currentTarget) closeEditModal(); });
    }
    async function handleFormSubmit(e) {
        if (!e.target.matches('form')) return;
        e.preventDefault();
        const form = e.target;
        const tableName = form.dataset.table;
        const formData = new FormData(form);
        const dataToInsert = Object.fromEntries(formData.entries());
        for (const key in dataToInsert) { if (dataToInsert[key] === 'null' || dataToInsert[key] === '') dataToInsert[key] = null; }
        const { error } = await supabaseClient.from(tableName).insert(dataToInsert);
        handleOperation(error, 'Item salvo com sucesso!');
        if (!error) {
            form.reset();
            if (tableName === 'fazendas') form.dispatchEvent(new Event('form-submitted', {bubbles: true}));
        }
    }
    async function handleDeleteClick(e) {
        const deleteBtn = e.target.closest('.delete-btn');
        if (deleteBtn) {
            const { table, id } = deleteBtn.dataset;
            if (confirm(`Tem certeza que deseja excluir este item?`)) {
                const { error } = await supabaseClient.from(table).delete().eq('id', id);
                handleOperation(error, 'Item excluído com sucesso!');
            }
        }
    }
    async function handleEditClick(e) {
        const editBtn = e.target.closest('.edit-btn');
        if (editBtn) {
            const { table, id } = editBtn.dataset;
            openEditModal(table, id);
        }
    }
    async function handleOperationClick(e) {
        if(!e.target.matches('.control-group button')) return;
        const button = e.target;
        // Lógica para todos os botões do painel de controle aqui...
    }

    // --- FUNÇÕES AUXILIARES ---
    function showToast(message, type = 'success') { const container = document.getElementById('toast-container'); if(!container) return; const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.textContent = message; container.appendChild(toast); setTimeout(() => toast.remove(), 3000); }
    function handleOperation(error, successMessage) { if (error) showToast(`Erro: ${error.message}`, 'error'); else if(successMessage) showToast(successMessage, 'success'); }
    function populateSelect(selectId, data, valueField, textField) {
        const select = document.getElementById(selectId);
        if (!select) return;
        const currentVal = select.value;
        select.innerHTML = `<option value="">Nenhum</option>`;
        data.forEach(item => {
            select.innerHTML += `<option value="${item[valueField]}">${item[textField]}</option>`;
        });
        select.value = currentVal;
    }
    function updateFazendaMarkers(fazendas) { if (!window.map) return; Object.keys(window.fazendaMarkers).forEach(id => { if (!fazendas.some(f => f.id === id)) { window.map.removeLayer(window.fazendaMarkers[id]); delete window.fazendaMarkers[id]; }}); fazendas.forEach(fazenda => { if (window.fazendaMarkers[fazenda.id]) { window.fazendaMarkers[fazenda.id].setLatLng([fazenda.latitude, fazenda.longitude]); } else { window.fazendaMarkers[fazenda.id] = L.marker([fazenda.latitude, fazenda.longitude], { icon: fazendaIcon }).addTo(window.map); } window.fazendaMarkers[fazenda.id].bindPopup(`<b>${fazenda.nome}</b><br>Status: ${fazenda.status}`); const iconElement = window.fazendaMarkers[fazenda.id].getElement(); iconElement.classList.toggle('icon-fazenda-colhendo', fazenda.status === 'colhendo'); iconElement.classList.toggle('icon-fazenda-inativa', fazenda.status !== 'colhendo'); }); }
    function updateCaminhaoMarkers(caminhoes) { if (!window.map) return; Object.keys(window.caminhaoMarkers).forEach(id => { if (!caminhoes.some(c => c.id === id)) { window.map.removeLayer(window.caminhaoMarkers[id]); delete window.caminhaoMarkers[id]; } }); caminhoes.forEach(caminhao => { if (!caminhao.latitude || !caminhao.longitude) { if (window.caminhaoMarkers[caminhao.id]) { window.map.removeLayer(window.caminhaoMarkers[caminhao.id]); delete window.caminhaoMarkers[caminhao.id]; } return; } if (window.caminhaoMarkers[caminhao.id]) { window.caminhaoMarkers[caminhao.id].setLatLng([caminhao.latitude, caminhao.longitude]); } else { window.caminhaoMarkers[caminhao.id] = L.marker([caminhao.latitude, caminhao.longitude], { icon: caminhaoIcon }).addTo(window.map); } window.caminhaoMarkers[caminhao.id].bindPopup(`<b>Cód: ${caminhao.cod_equipamento}</b><br>${caminhao.descricao}<br>Status: ${caminhao.status}`); const iconElement = window.caminhaoMarkers[caminhao.id].getElement(); iconElement.className = 'leaflet-marker-icon leaflet-zoom-animated leaflet-interactive'; if (caminhao.status === 'inativo') iconElement.classList.add('icon-caminhao-inativo'); else if (caminhao.status === 'ativo') iconElement.classList.add('icon-caminhao-ativo'); else if (caminhao.status === 'em_viagem') iconElement.classList.add('icon-caminhao-viagem'); }); }
    function initDashboardMap() { if (window.map) return; try { window.map = L.map('map').setView(USINA_COORDS, INITIAL_ZOOM); L.tileLayer(activeLayer.url, activeLayer.options).addTo(window.map); L.marker(USINA_COORDS, { icon: usinaIcon }).addTo(window.map).bindPopup('<b>Usina Central</b>'); } catch (e) { console.error("ERRO ao inicializar o mapa do dashboard:", e); } }
    function initCadastroFazendaMap() { if (window.isCadastroFazendaMapInitialized) return; try { window.mapCadastroGrande = L.map('map-cadastro-grande').setView(USINA_COORDS, INITIAL_ZOOM); L.tileLayer(activeLayer.url, activeLayer.options).addTo(window.mapCadastroGrande); window.isCadastroFazendaMapInitialized = true; let markerCadastro; window.mapCadastroGrande.on('click', e => { const lat = e.latlng.lat.toFixed(6); const lng = e.latlng.lng.toFixed(6); document.getElementById('fazenda-lat').value = lat; document.getElementById('fazenda-lon').value = lng; if (markerCadastro) { markerCadastro.setLatLng(e.latlng); } else { markerCadastro = L.marker(e.latlng).addTo(window.mapCadastroGrande); } }); document.getElementById('form-fazendas').addEventListener('form-submitted', () => { if(markerCadastro) { window.mapCadastroGrande.removeLayer(markerCadastro); markerCadastro = null; } }); } catch (e) { console.error("ERRO ao inicializar o mapa de cadastro:", e); } }
    async function generateEditFormHTML(table, data) {
        let formHTML = `<form id="modal-form" autocomplete="off">`;
        switch(table) {
            case 'fazendas':
                const fornecedores = await fetchTable('fornecedores');
                let f_options = fornecedores.map(f => `<option value="${f.id}" ${data.fornecedor_id === f.id ? 'selected' : ''}>${f.nome}</option>`).join('');
                formHTML += `<label>Cód. Fazenda</label><input type="text" name="cod_fazenda" value="${data.cod_fazenda || ''}">`;
                formHTML += `<label>Nome</label><input type="text" name="nome" value="${data.nome || ''}" required>`;
                formHTML += `<label>Fornecedor</label><select name="fornecedor_id"><option value="null">Nenhum</option>${f_options}</select>`;
                break;
            case 'caminhoes':
                const proprietarios = await fetchTable('proprietarios');
                let p_options = proprietarios.map(p => `<option value="${p.id}" ${data.proprietario_id === p.id ? 'selected' : ''}>${p.nome}</option>`).join('');
                formHTML += `<label>Cód. Equipamento</label><input type="text" name="cod_equipamento" value="${data.cod_equipamento || ''}" required>`;
                formHTML += `<label>Descrição</label><input type="text" name="descricao" value="${data.descricao || ''}" required>`;
                formHTML += `<label>Motorista Atual</label><input type="text" name="motorista_atual" value="${data.motorista_atual || ''}">`;
                formHTML += `<label>Proprietário</label><select name="proprietario_id"><option value="null">Nenhum</option>${p_options}</select>`;
                break;
            case 'frentes_servico':
                formHTML += `<label>Cód. Frente</label><input type="text" name="cod_frente" value="${data.cod_frente || ''}">`;
                formHTML += `<label>Nome</label><input type="text" name="nome" value="${data.nome || ''}" required>`;
                break;
            case 'fornecedores':
                formHTML += `<label>Cód. Fornecedor</label><input type="text" name="cod_fornecedor" value="${data.cod_fornecedor || ''}">`;
                formHTML += `<label>Nome</label><input type="text" name="nome" value="${data.nome || ''}" required>`;
                formHTML += `<label>CPF/CNPJ</label><input type="text" name="cpf_cnpj" value="${data.cpf_cnpj || ''}">`;
                break;
            case 'proprietarios':
                formHTML += `<label>Nome</label><input type="text" name="nome" value="${data.nome || ''}" required>`;
                formHTML += `<label>Nome da Empresa</label><input type="text" name="nome_empresa" value="${data.nome_empresa || ''}">`;
                formHTML += `<label>CPF/CNPJ</label><input type="text" name="cpf_cnpj" value="${data.cpf_cnpj || ''}">`;
                formHTML += `<label>Telefone</label><input type="text" name="telefone" value="${data.telefone || ''}">`;
                break;
        }
        formHTML += `<button type="submit">Salvar Alterações</button></form>`;
        return formHTML;
    }

    initializeApp();
});