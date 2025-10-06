// js/helpers.js
export function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentNode === container) {
            container.removeChild(toast);
        }
    }, 4000);
}

export function handleOperation(error, successMessage) {
    if (error) {
        showToast(`Erro: ${error.message}`, 'error');
        console.error(error);
    } else if (successMessage) {
        showToast(successMessage, 'success');
    }
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