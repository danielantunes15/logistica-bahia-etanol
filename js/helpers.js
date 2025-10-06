export function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

export function handleOperation(error, successMessage) {
    if (error) {
        showToast(`Erro: ${error.message}`, 'error');
        console.error(error);
    } else if (successMessage) {
        showToast(successMessage, 'success');
    }
}

export function populateSelect(selectId, data, valueField, textField) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const currentlySelected = select.value;
    select.innerHTML = `<option value="">Selecione...</option>`;
    if (data) {
        data.forEach(item => {
            select.innerHTML += `<option value="${item[valueField]}">${item[textField]}</option>`;
        });
    }
    select.value = currentlySelected;
}