// js/helpers.js

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

export function showLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'flex';
}

export function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
}

export function formatDate(date) {
    return new Date(date).toLocaleDateString('pt-BR');
}

export function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

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
    const cleaned = value.replace(/\D/g, '');
    return cleaned.length === 11 || cleaned.length === 14;
}