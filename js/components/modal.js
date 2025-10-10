// js/components/modal.js

/**
 * Carrega a estrutura HTML base do modal no container principal.
 * Isso só precisa ser feito uma vez quando a aplicação inicia.
 */
export async function loadModal() {
    const modalContainer = document.getElementById('modal-container');
    if (!modalContainer) return;

    // Estrutura do modal centralizado
    modalContainer.innerHTML = `
        <div id="edit-modal" class="modal-overlay">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 id="modal-title"></h2>
                    <button id="modal-close-btn" class="close-btn">
                        <i class="ph-fill ph-x"></i>
                    </button>
                </div>
                <div id="modal-body" class="modal-body">
                    </div>
            </div>
        </div>
    `;

    // Adiciona os event listeners para fechar o modal
    addModalEventListeners();
}

/**
 * Adiciona os listeners para fechar o modal (no botão 'X' e clicando fora)
 */
function addModalEventListeners() {
    const modal = document.getElementById('edit-modal');
    const closeBtn = document.getElementById('modal-close-btn');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }
    
    // O listener de overlay é associado/desassociado no openModal
}

/**
 * Abre o modal, define seu título e conteúdo, e o torna visível.
 * @param {string} title - O título a ser exibido no cabeçalho do modal.
 * @param {string} content - O HTML a ser inserido no corpo do modal.
 * @param {boolean} [closeOnOverlayClick=true] - Se o modal deve fechar ao clicar fora.
 */
export function openModal(title, content, closeOnOverlayClick = true) {
    const modal = document.getElementById('edit-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalOverlay = modal; // O modal-overlay é o #edit-modal

    if (modal && modalTitle && modalBody) {
        modalTitle.textContent = title;
        modalBody.innerHTML = content;
        
        // Remove listener de overlay anterior, se houver
        if (modalOverlay.closeOverlayHandler) {
            modalOverlay.removeEventListener('click', modalOverlay.closeOverlayHandler);
            modalOverlay.closeOverlayHandler = null;
        }

        // Adiciona novo listener de overlay se permitido
        if (closeOnOverlayClick) {
            const handler = (e) => {
                if (e.target === modalOverlay) {
                    closeModal();
                }
            };
            modalOverlay.closeOverlayHandler = handler;
            modalOverlay.addEventListener('click', handler);
        }

        modal.classList.add('active'); // Adiciona a classe para mostrar o modal
    }
}

/**
 * Fecha o modal, removendo a classe que o torna visível.
 */
export function closeModal() {
    const modal = document.getElementById('edit-modal');
    if (modal) {
        modal.classList.remove('active'); // Remove a classe para esconder o modal
    }
}