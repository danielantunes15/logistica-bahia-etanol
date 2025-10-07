// js/components/sidebar.js
export async function loadSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    sidebar.innerHTML = `
        <div class="sidebar-header">
            <i class="ph-fill ph-tractor"></i>
            <h2>LOGISTICA BEL</h2>
        </div>
        <nav>
            <button class="nav-button" data-view="dashboard">
                <i class="ph-fill ph-map-trifold"></i>
                <span>Mapa Principal</span>
            </button>
            <button class="nav-button active" data-view="controle">
                <i class="ph-fill ph-arrows-clockwise"></i>
                <span>Painel de Controle</span>
            </button>
            <button class="nav-button" data-view="frota">
                <i class="ph-fill ph-truck"></i>
                <span>Gerenciamento de Frota</span>
            </button>
            <button class="nav-button" data-view="relatorios">
                <i class="ph-fill ph-chart-bar"></i>
                <span>Relatórios</span>
            </button>
            <div class="nav-group">
                <button class="nav-button-group">
                    <i class="ph-fill ph-database"></i>
                    <span>Cadastros</span>
                    <i class="ph ph-caret-down caret"></i>
                </button>
                <div class="submenu">
                    <button class="nav-button" data-view="cadastro-fazendas">
                        <i class="ph-fill ph-tree-evergreen"></i>
                        <span>Fazendas</span>
                    </button>
                    <button class="nav-button" data-view="cadastro-caminhoes">
                        <i class="ph-fill ph-truck"></i>
                        <span>Caminhões</span>
                    </button>
                    <button class="nav-button" data-view="cadastro-equipamentos">
                        <i class="ph-fill ph-tractor"></i>
                        <span>Equipamentos</span>
                    </button>
                    <button class="nav-button" data-view="cadastro-frentes">
                        <i class="ph-fill ph-users-three"></i>
                        <span>Frentes</span>
                    </button>
                    <button class="nav-button" data-view="cadastro-fornecedores">
                        <i class="ph-fill ph-user-list"></i>
                        <span>Fornecedores</span>
                    </button>
                    <button class="nav-button" data-view="cadastro-proprietarios">
                        <i class="ph-fill ph-user-circle"></i>
                        <span>Proprietários</span>
                    </button>
                    <button class="nav-button" data-view="cadastro-terceiros">
                        <i class="ph-fill ph-user"></i>
                        <span>Terceiros</span>
                    </button>
                </div>
            </div>
        </nav>
    `;

    addSidebarEventListeners();
}

function addSidebarEventListeners() {
    document.querySelectorAll('.nav-button').forEach(button => {
        button.addEventListener('click', (e) => {
            if (e.target.closest('.nav-button-group')) return;
            
            const view = button.dataset.view;
            if (view) {
                switchView(view);
            }
        });
    });

    const navGroup = document.querySelector('.nav-group');
    const navButtonGroup = document.querySelector('.nav-button-group');
    
    if (navButtonGroup) {
        navButtonGroup.addEventListener('click', () => {
            navGroup.classList.toggle('open');
        });
    }
}

function switchView(viewName) {
    document.querySelectorAll('.nav-button').forEach(btn => {
        btn.classList.remove('active');
    });

    const clickedButton = document.querySelector(`[data-view="${viewName}"]`);
    if (clickedButton) {
        clickedButton.classList.add('active');
        
        // Se o botão estiver dentro de um submenu, abre o submenu
        const parentGroup = clickedButton.closest('.nav-group');
        if (parentGroup) {
            parentGroup.classList.add('open');
        }
    }

    window.dispatchEvent(new CustomEvent('viewChanged', { 
        detail: { view: viewName } 
    }));
}