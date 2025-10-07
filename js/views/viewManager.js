// js/views/viewManager.js
import { DashboardView } from './dashboard.js';
import { ControleView } from './controle.js';
import { RelatoriosView } from './relatorios.js';
import { CadastrosView } from './cadastros.js';

export class ViewManager {
    constructor() {
        this.views = new Map();
        this.currentView = null;
        this.init();
    }

    init() {
        // Registrar todas as views
        this.registerViews();
        
        // Ouvir mudanças de view
        window.addEventListener('viewChanged', (e) => {
            this.showView(e.detail.view);
        });

        // Mostrar view inicial
        this.showView('dashboard');
    }

    registerViews() {
        // Views principais
        this.views.set('dashboard', new DashboardView());
        this.views.set('controle', new ControleView());
        this.views.set('relatorios', new RelatoriosView());
        
        // Views de cadastro
        this.views.set('cadastro-fazendas', new CadastrosView('fazendas'));
        this.views.set('cadastro-caminhoes', new CadastrosView('caminhoes'));
        this.views.set('cadastro-equipamentos', new CadastrosView('equipamentos'));
        this.views.set('cadastro-frentes', new CadastrosView('frentes_servico'));
        this.views.set('cadastro-fornecedores', new CadastrosView('fornecedores'));
        this.views.set('cadastro-proprietarios', new CadastrosView('proprietarios'));
        this.views.set('cadastro-terceiros', new CadastrosView('terceiros'));

        console.log('Views registradas:', Array.from(this.views.keys()));
    }

    async showView(viewName) {
        console.log('Tentando mostrar view:', viewName);
        
        // Esconder view atual
        if (this.currentView && this.currentView.hide) {
            await this.currentView.hide();
        }

        // Mostrar nova view
        const view = this.views.get(viewName);
        if (view) {
            console.log('View encontrada, mostrando...');
            await view.show();
            this.currentView = view;
            
            // Atualizar o estado da aplicação
            if (window.app) {
                window.app.currentView = viewName;
            }
        } else {
            console.error('View não encontrada:', viewName);
        }
    }
}

export async function initializeViews() {
    window.viewManager = new ViewManager();
}