// js/app.js - Adicione estas funções

class AppManager {
    constructor() {
        this.sessionTimer = null;
        this.inactivityTimer = null;
        this.INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutos
        
        this.setupSessionManagement();
    }
    
    setupSessionManagement() {
        // Monitora inatividade
        this.resetInactivityTimer();
        
        // Eventos que resetam o timer de inatividade
        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
        events.forEach(event => {
            document.addEventListener(event, this.resetInactivityTimer.bind(this), true);
        });
        
        // Verifica sessão a cada minuto
        this.sessionTimer = setInterval(() => this.checkSession(), 60000);
    }
    
    resetInactivityTimer() {
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
        }
        
        this.inactivityTimer = setTimeout(() => {
            this.handleInactivity();
        }, this.INACTIVITY_TIMEOUT);
    }
    
    async handleInactivity() {
        const session = await getLocalSession();
        if (session) {
            await forceLogout();
        }
    }
    
    async checkSession() {
        const session = await getLocalSession();
        if (!session) {
            this.handleLogout();
        }
    }
    
    handleLogout() {
        if (this.sessionTimer) {
            clearInterval(this.sessionTimer);
        }
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
        }
        
        // Redireciona para login
        window.dispatchEvent(new CustomEvent('viewChanged', { detail: { view: 'login' } }));
    }
}

// Inicializa o gerenciador de sessão
window.appManager = new AppManager();