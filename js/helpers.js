// js/helpers.js
// FUNÇÕES DE HORA/DURAÇÃO/CICLO FORAM MOVIDAS PARA timeUtils.js

/**
 * Exibe uma notificação toast moderna com ícone e cores.
 * @param {string} message - A mensagem a ser exibida.
 * @param {string} type - O tipo de toast ('success', 'error', ou 'info').
 */
export function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const icons = {
        success: 'ph-fill ph-check-circle',
        error: 'ph-fill ph-x-circle',
        info: 'ph-fill ph-info'
    };
    
    const icon = icons[type] || icons['info'];

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Nova estrutura HTML do toast
    toast.innerHTML = `
        <i class="${icon}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Remove o toast do DOM após a animação de fadeOut terminar (4 segundos)
    setTimeout(() => {
        if (toast.parentNode === container) {
            container.removeChild(toast);
        }
    }, 4000);
}

/**
 * Lida com o resultado de uma operação, mostrando um toast de sucesso ou erro.
 * @param {Error|null} error - O objeto de erro, se houver.
 * @param {string} successMessage - A mensagem a ser exibida em caso de sucesso.
 */
export function handleOperation(error, successMessage) {
    if (error) {
        // Usa o showToast para exibir a mensagem de erro.
        showToast(`Erro: ${error.message}`, 'error');
        console.error(error);
    } else if (successMessage) {
        // Usa o showToast para exibir a mensagem de sucesso.
        showToast(successMessage, 'success');
    }
}

// MODIFICADO: Esta função agora está ATIVA.
export function showLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'flex';
}

// MODIFICADO: Esta função agora está ATIVA.
export function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
}

export function formatDate(date) {
    return new Date(date).toLocaleDateString('pt-BR');
}

// FUNÇÕES DE HORA/DURAÇÃO FORAM MOVIDAS PARA timeUtils.js

export function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

// --- Função para calcular distância usando a fórmula de Haversine ---
/**
 * Calcula a distância em quilômetros entre dois pontos geográficos (lat/lon).
 * @param {number} lat1 Latitude do ponto 1.
 * @param {number} lon1 Longitude do ponto 1.
 * @param {number} lat2 Latitude do ponto 2.
 * @param {number} lon2 Longitude do ponto 2.
 * @returns {number} Distância em km.
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Raio da Terra em km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distância em km
    return distance;
}
// -------------------------------------------------------------------

// FUNÇÕES DE DEBOUNCE, VALIDAÇÃO DE EMAIL, CPF/CNPJ E TELEFONE PERMANECEM AQUI

export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

export function validateCPFCNPJ(value) {
    const cleaned = value.replace(/\D/g, '/');
    return cleaned.length === 11 || cleaned.length === 14;
}

// --- Função de validação de telefone ---
export function validatePhone(value) {
    const cleaned = value.replace(/\D/g, '');
    // Aceita 10 (DD + 8 dígitos) ou 11 (DD + 9 dígitos)
    return cleaned.length >= 10 && cleaned.length <= 11; 
}
// ---------------------------------------------