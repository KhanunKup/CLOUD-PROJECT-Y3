// public/js/confirm-modal.js
(function () {
    let confirmModal = null;
    let modalTitle = null;
    let modalMessage = null;
    let modalWarning = null;
    let cancelBtn = null;
    let confirmBtn = null;
    let activeConfirmHandler = null;

    function initElements() {
        confirmModal = document.getElementById('confirmModal');
        modalTitle = document.getElementById('confirmModalTitle');
        modalMessage = document.getElementById('confirmModalMessage');
        modalWarning = document.getElementById('confirmModalWarning');
        cancelBtn = document.getElementById('confirmModalCancelBtn');
        confirmBtn = document.getElementById('confirmModalConfirmBtn');
    }

    /**
     * Helper to close modal
     */
    function closeConfirmModal() {
        if (confirmModal) {
            confirmModal.style.display = 'none';
        }
        activeConfirmHandler = null;
    }

    /**
     * Helper function to show confirm modal programmatically
     * @param {Object} config
     * @param {string} config.title - Modal title (e.g., 'Move to Trash')
     * @param {string} config.messageHtml - HTML message
     * @param {string} [config.warning] - Optional warning text
     * @param {string} [config.confirmText='Confirm'] - Text on confirm button
     * @param {string} [config.confirmType='danger'] - 'danger' | 'success' | 'primary'
     * @param {Function} [config.onConfirm] - Callback on confirm
     */
    window.showConfirmModal = function (config) {
        if (!confirmModal) initElements();
        if (!confirmModal) return;

        if (modalTitle) modalTitle.textContent = config.title || 'Confirm';
        if (modalMessage) modalMessage.innerHTML = config.messageHtml || 'Are you sure?';

        if (modalWarning) {
            if (config.warning) {
                modalWarning.textContent = config.warning;
                modalWarning.style.display = 'block';
            } else {
                modalWarning.textContent = '';
                modalWarning.style.display = 'none';
            }
        }

        if (confirmBtn) {
            confirmBtn.textContent = config.confirmText || 'Confirm';
            const isSuccess = config.confirmType === 'success' || config.confirmType === 'primary';
            confirmBtn.className = 'confirm-btn-action ' + (isSuccess ? 'btn-success' : 'btn-danger');
        }

        activeConfirmHandler = typeof config.onConfirm === 'function' ? config.onConfirm : null;
        confirmModal.style.display = 'flex';
    };

    window.closeConfirmModal = closeConfirmModal;

    /**
     * Helper to animate smooth slide-up collapse and removal of a table row
     */
    window.animateRowRemoval = function (rowEl, emptyStateText, containerSelector) {
        if (!rowEl) return;

        rowEl.style.transition = 'all 0.3s ease';
        rowEl.style.opacity = '0';
        rowEl.style.transform = 'translateX(20px)';
        rowEl.style.height = '0px';
        rowEl.style.minHeight = '0px';
        rowEl.style.paddingTop = '0px';
        rowEl.style.paddingBottom = '0px';
        rowEl.style.borderBottom = 'none';
        rowEl.style.overflow = 'hidden';

        setTimeout(() => {
            if (rowEl && rowEl.parentNode) {
                rowEl.remove();
            }

            const container = document.querySelector(containerSelector || '.trash-table, .file-table-container, .file-container');
            if (container) {
                const remainingRows = container.querySelectorAll('.file-row');
                if (remainingRows.length === 0 && !container.querySelector('.empty-state')) {
                    const emptyEl = document.createElement('div');
                    emptyEl.className = 'empty-state';
                    emptyEl.textContent = emptyStateText || 'No files found.';
                    container.appendChild(emptyEl);

                    const emptyTrashBtn = document.querySelector('.btn-empty-trash');
                    if (emptyTrashBtn) {
                        emptyTrashBtn.closest('form')?.remove();
                    }
                }
            }
        }, 300);
    };

    /**
     * Helper to extract filename safely from trigger button / row
     */
    function getFilename(trigger, row) {
        let filename = trigger?.dataset?.filename;
        if (!filename && row) {
            const nameEl = row.querySelector('.file-name, .col-name');
            if (nameEl) {
                const clone = nameEl.cloneNode(true);
                clone.querySelectorAll('svg, i').forEach(icon => icon.remove());
                filename = clone.textContent.trim();
            }
        }
        return filename || 'this item';
    }

    /**
     * Close all active dropdowns
     */
    function closeAllDropdowns() {
        document.querySelectorAll('.options-dropdown, .new-options-dropdown').forEach(dropdown => {
            dropdown.classList.remove('show');
            dropdown.classList.remove('dropup');
        });
        document.querySelectorAll('.file-row').forEach(row => row.classList.remove('has-open-menu'));
    }

    document.addEventListener('DOMContentLoaded', () => {
        initElements();

        if (cancelBtn) {
            cancelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeConfirmModal();
            });
        }

        if (confirmBtn) {
            confirmBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const callback = activeConfirmHandler;
                closeConfirmModal();
                if (callback) {
                    callback();
                }
            });
        }

        if (confirmModal) {
            confirmModal.addEventListener('click', (e) => {
                if (e.target === confirmModal) {
                    closeConfirmModal();
                }
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && confirmModal && confirmModal.style.display === 'flex') {
                closeConfirmModal();
            }
        });

        // Event delegation for standard confirmation actions across the app:
        document.addEventListener('click', (e) => {
            // 1. Move to Trash (.open-delete-modal, .move-to-trash-action)
            const moveToTrashBtn = e.target.closest('.open-delete-modal, .move-to-trash-action');
            if (moveToTrashBtn) {
                e.preventDefault();
                e.stopPropagation();
                closeAllDropdowns();

                const targetRow = moveToTrashBtn.closest('.file-row');
                const filename = getFilename(moveToTrashBtn, targetRow);
                const targetId = moveToTrashBtn.dataset.id || null;

                window.showConfirmModal({
                    title: 'Move to Trash',
                    messageHtml: `Are you sure to move <span class="confirm-highlight">"${filename}"</span> to trash?`,
                    confirmText: 'Move to Trash',
                    confirmType: 'danger',
                    onConfirm: async () => {
                        try {
                            if (targetId) {
                                const res = await fetch(`/api/files/${targetId}`, { method: 'DELETE' });
                                const data = await res.json();
                                if (!res.ok || !data.success) throw new Error(data.error || 'Failed to move to trash');
                            }
                            window.animateRowRemoval(targetRow, 'No files found.');
                            if (window.showToast) window.showToast(`Moved "${filename}" to trash`, 'success');
                        } catch (err) {
                            console.error('Move to trash error:', err);
                            if (window.showToast) window.showToast(`Failed: ${err.message}`, 'error');
                        }
                    }
                });
                return;
            }

            // 2. Restore (.btn-restore, .restore-trash-action)
            const restoreBtn = e.target.closest('.btn-restore, .restore-trash-action');
            if (restoreBtn) {
                e.preventDefault();
                e.stopPropagation();
                closeAllDropdowns();

                const targetRow = restoreBtn.closest('.file-row');
                const filename = getFilename(restoreBtn, targetRow);
                const targetId = restoreBtn.dataset.id || restoreBtn.getAttribute('href')?.split('/').pop() || null;

                window.showConfirmModal({
                    title: 'Restore File',
                    messageHtml: `Are you sure to restore <span class="confirm-highlight">"${filename}"</span>?`,
                    confirmText: 'Restore',
                    confirmType: 'success',
                    onConfirm: async () => {
                        try {
                            if (targetId) {
                                const res = await fetch(`/api/files/${targetId}/restore`, { method: 'POST' });
                                const data = await res.json();
                                if (!res.ok || !data.success) throw new Error(data.error || 'Failed to restore file');
                            }
                            window.animateRowRemoval(targetRow, 'Trash is empty.', '.trash-table, .file-table-container');
                            if (window.showToast) window.showToast(`Restored "${filename}" successfully!`, 'success');
                        } catch (err) {
                            console.error('Restore error:', err);
                            if (window.showToast) window.showToast(`Failed: ${err.message}`, 'error');
                        }
                    }
                });
                return;
            }

            // 3. Delete Forever (.delete-forever-action)
            const deleteForeverBtn = e.target.closest('.delete-forever-action');
            if (deleteForeverBtn) {
                e.preventDefault();
                e.stopPropagation();
                closeAllDropdowns();

                const targetRow = deleteForeverBtn.closest('.file-row');
                const filename = getFilename(deleteForeverBtn, targetRow);
                const targetId = deleteForeverBtn.dataset.id || null;

                window.showConfirmModal({
                    title: 'Delete Forever',
                    messageHtml: `Are you sure you want to permanently delete <span class="confirm-highlight">"${filename}"</span>?`,
                    warning: 'This action cannot be undone.',
                    confirmText: 'Delete Forever',
                    confirmType: 'danger',
                    onConfirm: async () => {
                        try {
                            if (targetId) {
                                const res = await fetch(`/api/files/${targetId}?permanent=true`, { method: 'DELETE' });
                                const data = await res.json();
                                if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete file');
                            }
                            window.animateRowRemoval(targetRow, 'Trash is empty.', '.trash-table, .file-table-container');
                            if (window.showToast) window.showToast(`Permanently deleted "${filename}"`, 'success');
                        } catch (err) {
                            console.error('Permanent delete error:', err);
                            if (window.showToast) window.showToast(`Failed: ${err.message}`, 'error');
                        }
                    }
                });
                return;
            }
        });
    });
})();
