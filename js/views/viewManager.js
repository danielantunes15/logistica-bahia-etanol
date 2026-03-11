// js/views/viewManager.js
import { DashboardView } from './dashboard.js';
import { ControleView } from './controle.js';
import { RelatoriosView } from './relatorios.js';
import { CadastrosView } from './cadastros.js';
import { FrotaView } from './frota.js';
import { EquipamentosView } from './equipamentos.js'; 
import { FilaEstacionamentoView } from './filaEstacionamento.js'; 
import { FazendasView } from './fazenda.js'; 
import { LoginView } from './login.js'; 
import { GerencialView } from './gerencial.js'; 
import { BoletimDiarioView } from './boletimDiario.js'; 
import { OcorrenciasView } from './ocorrencias.js'; 
import { TempoView } from './tempo.js'; 
import { BoletimProducaoView } from './boletimProducao.js';
import { PatioCarregadoView } from './patioCarregado.js'; 
import { GerenciamentoTerceirosView } from './gerenciamentoTerceiros.js';

export class ViewManager {
    constructor(appManager) { 
        this.views = new Map();
        this.currentView = null;
        this.appManager = appManager; 
        this.init();
    }

    init() {
        this.registerViews();
        window.addEventListener('viewChanged', (e) => {
            this.showView(e.detail.view);
        });
    }

    registerViews() {
        this.views.set('login', new LoginView(this.appManager)); 
        this.views.set('dashboard', new DashboardView());
        this.views.set('boletim-diario', new BoletimDiarioView()); 
        this.views.set('controle', new ControleView());
        this.views.set('frota', new FrotaView());
        this.views.set('equipamentos', new EquipamentosView()); 
        this.views.set('fila-estacionamento', new FilaEstacionamentoView()); 
        
        this.views.set('fazendas', new FazendasView()); 
        this.views.set('fila-patio-carregado', new PatioCarregadoView()); 
        
        this.views.set('relatorios', new RelatoriosView());
        this.views.set('gerencial', new GerencialView()); 
        this.views.set('gerenciamento-terceiros', new GerenciamentoTerceirosView());
        
        this.views.set('ocorrencias', new OcorrenciasView());
        this.views.set('tempo', new TempoView());
        this.views.set('boletim-producao', new BoletimProducaoView());

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
        if (this.currentView && this.currentView.hide) {
            await this.currentView.hide();
        }
        const view = this.views.get(viewName);
        if (view) {
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

// Exporta o App Manager para ser usado na inicialização
export async function initializeViews(appManager) { 
    window.viewManager = new ViewManager(appManager);
}