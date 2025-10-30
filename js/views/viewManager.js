// js/views/viewManager.js
import { DashboardView } from './dashboard.js';
import { ControleView } from './controle.js';
import { RelatoriosView } from './relatorios.js';
import { CadastrosView } from './cadastros.js';
import { FrotaView } from './frota.js';
import { EquipamentosView } from './equipamentos.js'; 
import { FilaEstacionamentoView } from './filaEstacionamento.js'; 
import { DescargaView } from './descarga.js'; 
import { LoginView } from './login.js'; // NOVO: Tela de Login
import { GerencialView } from './gerencial.js'; // NOVO: Tela Gerencial
// NOVO: Importa BoletimDiarioView
import { BoletimDiarioView } from './boletimDiario.js'; 
// NOVO: Importa OcorrenciasView
import { OcorrenciasView } from './ocorrencias.js'; 
// NOVO: Importa TempoView
import { TempoView } from './tempo.js'; 
// NOVO: Importa BoletimProducaoView (ADICIONADO)
import { BoletimProducaoView } from './boletimProducao.js';
// NOVO: Importa PatioCarregadoView
import { PatioCarregadoView } from './patioCarregado.js'; // <<-- LINHA ADICIONADA

export class ViewManager {
    constructor(appManager) { // Recebe o App Manager
        this.views = new Map();
        this.currentView = null;
        this.appManager = appManager; // Armazena a referência
        this.init();
    }

    init() {
        this.registerViews();
        window.addEventListener('viewChanged', (e) => {
            this.showView(e.detail.view);
        });
        // Removido showView('dashboard'), o AppManager agora controla a view inicial (Login)
    }

    registerViews() {
        this.views.set('login', new LoginView(this.appManager)); 
        this.views.set('dashboard', new DashboardView());
        // NOVO: Registra Boletim Diário
        this.views.set('boletim-diario', new BoletimDiarioView()); 
        this.views.set('controle', new ControleView());
        this.views.set('frota', new FrotaView());
        this.views.set('equipamentos', new EquipamentosView()); 
        this.views.set('fila-estacionamento', new FilaEstacionamentoView()); 
        this.views.set('fila-descarga', new DescargaView()); 
        // NOVO: Registra a view Pátio Carregado
        this.views.set('fila-patio-carregado', new PatioCarregadoView()); // <<-- LINHA ADICIONADA
        this.views.set('relatorios', new RelatoriosView());
        this.views.set('gerencial', new GerencialView()); // NOVO: Registra Gerencial
        
        // NOVO: Registra a view de Ocorrências
        this.views.set('ocorrencias', new OcorrenciasView());
        
        // NOVO: Registra a view de Tempo
        this.views.set('tempo', new TempoView());
        
        // NOVO: Registra a view de Boletim de Produção (ADICIONADO)
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