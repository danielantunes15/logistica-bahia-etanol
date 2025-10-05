document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURAÇÃO SUPABASE E VARIÁVEIS GLOBAIS ---
    const SUPABASE_URL = 'https://uogorpanshybcuhdekhg.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvZ29ycGFuc2h5YmN1aGRla2hnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2MTcxNzYsImV4cCI6MjA3NTE5MzE3Nn0.LSGlAeeLZsPnEw3GtEXzY4D9f3UZhk7SXyBgrGYaKMg';
    let supabaseClient; 
    try {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (e) { console.error('ERRO CRÍTICO AO CRIAR CLIENTE SUPABASE:', e); showToast('Falha ao conectar com o banco de dados!', 'error'); return; }

    const USINA_COORDS = [-17.642301, -40.181525];
    const INITIAL_ZOOM = 14;
    const views = document.querySelectorAll('.view');
    const navButtons = document.querySelectorAll('.nav-button');
    let map, mapCadastro;
    let isCadastroMapInitialized = false;
    let fazendaMarkers = {}, caminhaoMarkers = {};
    const usinaIcon = L.icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/9748/9748625.png', iconSize: [40, 40], iconAnchor: [20, 40], popupAnchor: [0, -40] });
    const fazendaIcon = L.icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/10000/10000305.png', iconSize: [32, 32] });
    const caminhaoIcon = L.icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/3448/3448628.png', iconSize: [32, 32] });
    const activeLayer = { url: 'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', options: { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: '&copy; Google' } };

    // --- NAVEGAÇÃO ENTRE TELAS ---
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetViewId = button.dataset.view;
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            views.forEach(view => {
                view.classList.toggle('active-view', view.id === `${targetViewId}-view`);
            });

            // Lógica para inicializar ou redimensionar mapas
            if (targetViewId === 'dashboard' && map) {
                setTimeout(() => map.invalidateSize(), 100);
            } else if (targetViewId === 'cadastros') {
                initCadastroMap(); // Inicializa o mapa de cadastro se for a primeira vez
                if (mapCadastro) setTimeout(() => mapCadastro.invalidateSize(), 100);
            }
        });
    });

    // --- LÓGICA PRINCIPAL DE DADOS ---
    async function refreshAllData() {
        try {
            const [fazendasRes, caminhoesRes, frentesRes] = await Promise.all([
                supabaseClient.from('fazendas').select('*'),
                supabaseClient.from('caminhoes').select('*'),
                supabaseClient.from('frentes_servico').select('*')
            ]);
            const { data: fazendas, error: fError } = fazendasRes;
            const { data: caminhoes, error: cError } = caminhoesRes;
            const { data: frentes, error: frError } = frentesRes;
            if (fError || cError || frError) throw fError || cError || frError;
            
            updateKPIs(fazendas, caminhoes, frentes);
            updateFazendaMarkers(fazendas);
            updateCaminhaoMarkers(caminhoes);
            renderLists(fazendas, caminhoes, frentes);
            loadAdminSelects(fazendas, caminhoes, frentes);
        } catch (error) { console.error("Erro ao buscar dados:", error); showToast('Erro ao buscar dados.', 'error'); }
    }

    // --- ATUALIZAÇÕES DE UI (KPIs, MARCADORES, LISTAS) ---
    function updateKPIs(fazendas, caminhoes, frentes) { /* ...código anterior sem alterações... */ }
    function updateFazendaMarkers(fazendas) { /* ...código anterior sem alterações... */ }
    function updateCaminhaoMarkers(caminhoes) { /* ...código anterior sem alterações... */ }
    function renderLists(fazendas, caminhoes, frentes) {
        renderTable('lista-fazendas', ['Nome'], fazendas, (item) => `<td>${item.nome}</td>`, 'fazendas');
        renderTable('lista-caminhoes', ['Placa', 'Código', 'Motorista'], caminhoes, (item) => `<td>${item.placa}</td><td>${item.cod_equipamento || ''}</td><td>${item.motorista_atual || ''}</td>`, 'caminhoes');
        renderTable('lista-frentes', ['Nome'], frentes, (item) => `<td>${item.nome}</td>`, 'frentes_servico');
    }
    function renderTable(containerId, headers, data, rowTemplate, tableName) { /* ...código anterior sem alterações... */ }
    
    // --- EVENT LISTENERS (BOTÕES, FORMULÁRIOS) ---
    document.addEventListener('click', async (e) => { /* ...código anterior sem alterações... */ });
    document.getElementById('form-fazenda').addEventListener('submit', async e => { /* ...código anterior sem alterações... */ });
    document.getElementById('form-frente').addEventListener('submit', async e => { /* ...código anterior sem alterações... */ });
    
    document.getElementById('form-caminhao').addEventListener('submit', async e => {
        e.preventDefault();
        const { error } = await supabaseClient.from('caminhoes').insert({
            placa: document.getElementById('caminhao-placa').value,
            cod_equipamento: document.getElementById('caminhao-codigo').value,
            motorista_atual: document.getElementById('caminhao-motorista').value
        });
        handleFormSubmit(error, e.target, 'Caminhão salvo com sucesso!');
    });

    document.getElementById('btn-update-fazenda').addEventListener('click', async () => { /* ...código anterior sem alterações... */ });
    document.getElementById('btn-designar-frente').addEventListener('click', async () => { /* ...código anterior sem alterações... */ });
    document.getElementById('btn-posicionar-caminhao').addEventListener('click', async () => { /* ...código anterior sem alterações... */ });

    document.getElementById('btn-update-caminhao').addEventListener('click', async () => {
        const caminhaoId = document.getElementById('select-caminhao-status').value;
        const novoStatus = document.getElementById('caminhao-novo-status').value;
        if (!caminhaoId) return;

        // 1. Busca o estado atual do caminhão para o log
        const { data: caminhaoAtual, error: fetchError } = await supabaseClient.from('caminhoes').select('status, motorista_atual').eq('id', caminhaoId).single();
        if (fetchError) { return handleOperation(fetchError, ''); }

        // 2. Insere o registro histórico
        const { error: logError } = await supabaseClient.from('caminhao_historico').insert({
            caminhao_id: caminhaoId,
            status_anterior: caminhaoAtual.status,
            status_novo: novoStatus,
            motorista_no_momento: caminhaoAtual.motorista_atual
        });
        if (logError) { return handleOperation(logError, 'Falha ao registrar histórico!'); }
        
        // 3. Atualiza o status atual do caminhão
        const { error } = await supabaseClient.from('caminhoes').update({ status: novoStatus }).eq('id', caminhaoId);
        handleOperation(error, 'Status do caminhão atualizado e registrado!');
    });

    // --- FUNÇÕES AUXILIARES E INICIALIZAÇÃO ---
    function initDashboardMap() { if (map) return; try { map = L.map('map').setView(USINA_COORDS, INITIAL_ZOOM); L.tileLayer(activeLayer.url, activeLayer.options).addTo(map); L.marker(USINA_COORDS, { icon: usinaIcon }).addTo(map).bindPopup('<b>Usina Central</b>'); } catch (e) { console.error("ERRO ao inicializar o mapa do dashboard:", e); } }
    function initCadastroMap() { if (isCadastroMapInitialized) return; try { mapCadastro = L.map('map-cadastro').setView(USINA_COORDS, INITIAL_ZOOM); L.tileLayer(activeLayer.url, activeLayer.options).addTo(mapCadastro); isCadastroMapInitialized = true; let markerCadastro; mapCadastro.on('click', e => { const lat = e.latlng.lat.toFixed(6); const lng = e.latlng.lng.toFixed(6); document.getElementById('fazenda-lat').value = lat; document.getElementById('fazenda-lon').value = lng; if (markerCadastro) { markerCadastro.setLatLng(e.latlng); } else { markerCadastro = L.marker(e.latlng).addTo(mapCadastro); } }); document.getElementById('form-fazenda').addEventListener('form-submitted', () => { if(markerCadastro) { mapCadastro.removeLayer(markerCadastro); markerCadastro = null; } }); } catch (e) { console.error("ERRO ao inicializar o mapa de cadastro:", e); } }
    function loadAdminSelects(fazendas, caminhoes, frentes) { const populate = (data, selectIds, displayField) => { selectIds.forEach(id => { const select = document.getElementById(id); if (!select) return; const currentValue = select.value; select.innerHTML = '<option value="">Selecione...</option>'; data.forEach(item => { select.innerHTML += `<option value="${item.id}">${item[displayField]}</option>`; }); select.value = currentValue; }); }; populate(fazendas, ['select-fazenda-status', 'select-fazenda-designar', 'select-fazenda-posicionar'], 'nome'); populate(caminhoes, ['select-caminhao-status', 'select-caminhao-posicionar'], 'placa'); populate(frentes, ['select-frente-designar'], 'nome'); }
    function handleFormSubmit(error, form, successMessage) { if (error) { showToast(`Erro: ${error.message}`, 'error'); } else { showToast(successMessage, 'success'); form.reset(); } }
    function handleOperation(error, successMessage) { if (error) showToast(`Erro: ${error.message}`, 'error'); else showToast(successMessage, 'success'); }
    function showToast(message, type = 'success') { const container = document.getElementById('toast-container'); const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.textContent = message; container.appendChild(toast); setTimeout(() => toast.remove(), 3000); }
    function updateKPIs(fazendas, caminhoes, frentes) { document.getElementById('kpi-caminhoes-ativos').textContent = caminhoes.filter(c => c.status === 'ativo' || c.status === 'em_viagem').length; document.getElementById('kpi-caminhoes-inativos').textContent = caminhoes.filter(c => c.status === 'inativo').length; document.getElementById('kpi-fazendas-colhendo').textContent = fazendas.filter(f => f.status === 'colhendo').length; document.getElementById('kpi-frentes-ativas').textContent = frentes.filter(fr => fr.status === 'ativa').length; }
    function updateFazendaMarkers(fazendas) { if (!map) return; fazendas.forEach(fazenda => { if (fazendaMarkers[fazenda.id]) { fazendaMarkers[fazenda.id].setLatLng([fazenda.latitude, fazenda.longitude]); } else { fazendaMarkers[fazenda.id] = L.marker([fazenda.latitude, fazenda.longitude], { icon: fazendaIcon }).addTo(map); } fazendaMarkers[fazenda.id].bindPopup(`<b>${fazenda.nome}</b><br>Status: ${fazenda.status}`); const iconElement = fazendaMarkers[fazenda.id].getElement(); iconElement.classList.toggle('icon-fazenda-colhendo', fazenda.status === 'colhendo'); iconElement.classList.toggle('icon-fazenda-inativa', fazenda.status !== 'colhendo'); }); }
    function updateCaminhaoMarkers(caminhoes) { if (!map) return; Object.keys(caminhaoMarkers).forEach(id => { if (!caminhoes.some(c => c.id === id)) { map.removeLayer(caminhaoMarkers[id]); delete caminhaoMarkers[id]; } }); caminhoes.forEach(caminhao => { if (!caminhao.latitude || !caminhao.longitude) { if (caminhaoMarkers[caminhao.id]) { map.removeLayer(caminhaoMarkers[caminhao.id]); delete caminhaoMarkers[caminhao.id]; } return; } if (caminhaoMarkers[caminhao.id]) { caminhaoMarkers[caminhao.id].setLatLng([caminhao.latitude, caminhao.longitude]); } else { caminhaoMarkers[caminhao.id] = L.marker([caminhao.latitude, caminhao.longitude], { icon: caminhaoIcon }).addTo(map); } caminhaoMarkers[caminhao.id].bindPopup(`<b>Placa: ${caminhao.placa}</b><br>Motorista: ${caminhao.motorista_atual || 'N/A'}<br>Status: ${caminhao.status}`); const iconElement = caminhaoMarkers[caminhao.id].getElement(); iconElement.className = 'leaflet-marker-icon leaflet-zoom-animated leaflet-interactive'; if (caminhao.status === 'inativo') iconElement.classList.add('icon-caminhao-inativo'); else if (caminhao.status === 'ativo') iconElement.classList.add('icon-caminhao-ativo'); else if (caminhao.status === 'em_viagem') iconElement.classList.add('icon-caminhao-viagem'); }); }
    function renderTable(containerId, headers, data, rowTemplate, tableName) { const container = document.getElementById(containerId); let tableHTML = '<table><thead><tr>'; headers.forEach(h => tableHTML += `<th>${h}</th>`); tableHTML += '<th>Ação</th></tr></thead><tbody>'; data.forEach(item => { tableHTML += `<tr data-id="${item.id}">`; tableHTML += rowTemplate(item); tableHTML += `<td><button class="delete-btn" data-table="${tableName}" data-id="${item.id}"><i class="ph-fill ph-trash"></i></button></td></tr>`; }); tableHTML += '</tbody></table>'; container.innerHTML = tableHTML; }
    document.addEventListener('click', async (e) => { const deleteBtn = e.target.closest('.delete-btn'); if (deleteBtn) { const { table, id } = deleteBtn.dataset; if (confirm(`Tem certeza que deseja excluir este item da tabela '${table}'?`)) { const { error } = await supabaseClient.from(table).delete().eq('id', id); handleOperation(error, 'Item excluído com sucesso!'); } } });
    document.getElementById('form-fazenda').addEventListener('submit', async e => { e.preventDefault(); const { error } = await supabaseClient.from('fazendas').insert({ nome: document.getElementById('fazenda-nome').value, latitude: parseFloat(document.getElementById('fazenda-lat').value), longitude: parseFloat(document.getElementById('fazenda-lon').value) }); handleFormSubmit(error, e.target, 'Fazenda salva com sucesso!'); if (!error) { e.target.dispatchEvent(new Event('form-submitted', {bubbles: true})); } });
    document.getElementById('btn-update-fazenda').addEventListener('click', async () => { const id = document.getElementById('select-fazenda-status').value; if (!id) return; const status = document.getElementById('fazenda-novo-status').value; const { error } = await supabaseClient.from('fazendas').update({ status }).eq('id', id); handleOperation(error, 'Status da fazenda atualizado!'); });
    document.getElementById('btn-designar-frente').addEventListener('click', async () => { const frenteId = document.getElementById('select-frente-designar').value; const fazendaId = document.getElementById('select-fazenda-designar').value; if (!frenteId || !fazendaId) return; const { error } = await supabaseClient.from('frentes_servico').update({ fazenda_id: fazendaId, status: 'ativa' }).eq('id', frenteId); handleOperation(error, 'Frente designada com sucesso!'); });
    document.getElementById('btn-posicionar-caminhao').addEventListener('click', async () => { const caminhaoId = document.getElementById('select-caminhao-posicionar').value; const fazendaId = document.getElementById('select-fazenda-posicionar').value; if (!caminhaoId || !fazendaId) return showToast('Selecione um caminhão e uma fazenda.', 'error'); const { data: fazenda, error: fError } = await supabaseClient.from('fazendas').select('latitude, longitude').eq('id', fazendaId).single(); if (fError || !fazenda) return showToast('Erro ao encontrar a fazenda selecionada.', 'error'); const { error } = await supabaseClient.from('caminhoes').update({ latitude: fazenda.latitude, longitude: fazenda.longitude, status: 'ativo' }).eq('id', caminhaoId); handleOperation(error, 'Caminhão posicionado na fazenda com sucesso!'); });
    
    function initializeApp() {
        initDashboardMap();
        refreshAllData();
        supabaseClient.channel('public:tables').on('postgres_changes', { event: '*', schema: 'public' }, () => refreshAllData()).subscribe();
        console.log('Aplicação inicializada e escutando mudanças em tempo real.');
    }

    initializeApp();
});