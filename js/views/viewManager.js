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
        // Registrar views
        this.views.set('dashboard', new DashboardView());
        this.views.set('controle', new ControleView());
        this.views.set('relatorios', new RelatoriosView());
        this.views.set('cadastro-fazendas', new CadastrosView('fazendas'));
        this.views.set('cadastro-caminhoes', new CadastrosView('caminhoes'));
        this.views.set('cadastro-equipamentos', new CadastrosView('equipamentos'));

        // Ouvir mudanças de view
        window.addEventListener('viewChanged', (e) => {
            this.showView(e.detail.view);
        });

        // Mostrar view inicial
        this.showView('dashboard');
    }

    async showView(viewName) {
        console.log('Mudando para view:', viewName);
        
        // Esconder view atual
        if (this.currentView && this.currentView.hide) {
            await this.currentView.hide();
        }

        // Mostrar nova view
        const view = this.views.get(viewName);
        if (view) {
            await view.show();
            this.currentView = view;
        } else {
            console.error('View não encontrada:', viewName);
        }
    }
}

export async function initializeViews() {
    window.viewManager = new ViewManager();
}