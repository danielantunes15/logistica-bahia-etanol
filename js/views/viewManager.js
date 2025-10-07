// js/views/viewManager.js
import { DashboardView } from './dashboard.js';
import { ControleView } from './controle.js';
import { RelatoriosView } from './relatorios.js';
import { CadastrosView } from './cadastros.js';
import { FrotaView } from './frota.js'; // Importa a nova view

export class ViewManager {
    constructor() {
        this.views = new Map();
        this.currentView = null;
        this.init();
    }

    init() {
        this.registerViews();
        window.addEventListener('viewChanged', (e) => {
            this.showView(e.detail.view);
        });
        // Define a view inicial como o Painel de Controle
        this.showView('controle'); 
    }

    registerViews() {
        // Views principais
        this.views.set('dashboard', new DashboardView());
        this.views.set('controle', new ControleView());
        this.views.set('relatorios', new RelatoriosView());
        this.views.set('frota', new FrotaView()); // Registra a nova view
        
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
        if (this.currentView && this.currentView.hide) {
            await this.currentView.hide();
        }

        const view = this.views.get(viewName);
        if (view) {
            console.log('View encontrada, mostrando...');
            await view.show();
            this.currentView = view;
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