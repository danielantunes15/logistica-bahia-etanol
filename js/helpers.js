// js/helpers.js

/**
 * Exibe uma notificação "toast" no canto da tela.
 * @param {string} message - A mensagem a ser exibida.
 * @param {string} type - O tipo de toast ('success' ou 'error').
 */
export function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

/**
 * Lida com o resultado de uma operação no banco de dados, exibindo um toast.
 * @param {object|null} error - O objeto de erro retornado pelo Supabase.
 * @param {string} successMessage - A mensagem a ser exibida em caso de sucesso.
 */
export function handleOperation(error, successMessage) {
    if (error) {
        showToast(`Erro: ${error.message}`, 'error');
        console.error(error);
    } else if (successMessage) {
        showToast(successMessage, 'success');
    }
}

/**
 * Preenche um elemento <select> (dropdown) com dados.
 * @param {string} selectId - O ID do elemento <select>.
 * @param {Array} data - O array de objetos para popular o select.
 * @param {string} valueField - O nome da propriedade a ser usada como 'value' da option.
 * @param {string} textField - O nome da propriedade a ser usada como texto visível da option.
 */
export function populateSelect(selectId, data, valueField, textField) {
    const select = document.getElementById(selectId);
    if (!select) return;

    // Guarda a opção atualmente selecionada para tentar mantê-la
    const currentlySelected = select.value;

    select.innerHTML = `<option value="">Selecione...</option>`;
    if (data) {
        data.forEach(item => {
            select.innerHTML += `<option value="${item[valueField]}">${item[textField]}</option>`;
        });
    }

    // Tenta restaurar a seleção anterior
    select.value = currentlySelected;
}