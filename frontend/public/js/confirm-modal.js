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
        if (typeof document === 'undefined') return;
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
     * Helper to animate smooth slide-up collapse and removal of a table row
     */
    function animateRowRemoval(rowEl, emptyStateText, containerSelector) {
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

            if (typeof document !== 'undefined') {
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
            }
        }, 300);
    }

    /**
     * Optimistically removes a file row from UI immediately (0ms perceived latency),
     * and performs the DELETE request in the background. Restores row if deletion fails.
     *
     * @param {Object} params
     * @param {string} params.targetId - ID of the file to delete
     * @param {HTMLElement} [params.targetRow] - The table row element to animate and remove
     * @param {string} [params.filename] - Filename for toast messages
     * @param {Function} [params.apiFetch] - Fetch function (defaults to global fetch)
     * @param {Function} [params.animateRowRemoval] - Removal animation function
     * @param {Function} [params.showToast] - Toast display function
     */
    async function executeOptimisticMoveToTrash({
        targetId,
        targetRow,
        filename = 'this item',
        apiFetch = (typeof fetch !== 'undefined' ? fetch : null),
        animateRowRemoval: animateFn = (typeof window !== 'undefined' && window.animateRowRemoval ? window.animateRowRemoval : animateRowRemoval),
        showToast = (typeof window !== 'undefined' && window.showToast ? window.showToast : null)
    } = {}) {
        const parent = targetRow?.parentNode;
        const nextSibling = targetRow?.nextSibling;

        // 1. Optimistic UI: Immediately animate row removal at 0ms
        if (targetRow && typeof animateFn === 'function') {
            animateFn(targetRow, 'No files found.');
        }

        // 2. Perform network request in background
        try {
            if (targetId && typeof apiFetch === 'function') {
                const res = await apiFetch(`/api/files/${targetId}`, { method: 'DELETE', keepalive: true });
                const data = await res.json();
                if (!res.ok || (data && data.success === false)) {
                    throw new Error((data && data.error) || 'Failed to move to trash');
                }
            }
            if (typeof showToast === 'function') {
                showToast(`Moved "${filename}" to trash`, 'success');
            }
        } catch (err) {
            // Rollback optimistic removal on error
            if (targetRow) {
                if (parent && !targetRow.parentNode) {
                    parent.insertBefore(targetRow, nextSibling);
                }
                if (targetRow.style) {
                    targetRow.style.opacity = '1';
                    targetRow.style.transform = 'none';
                    targetRow.style.height = '';
                    targetRow.style.minHeight = '';
                    targetRow.style.paddingTop = '';
                    targetRow.style.paddingBottom = '';
                    targetRow.style.borderBottom = '';
                    targetRow.style.overflow = '';
                    targetRow.style.pointerEvents = 'auto';
                }
            }
            console.error('Optimistic move to trash error:', err);
            if (typeof showToast === 'function') {
                showToast(`Failed: ${err.message}`, 'error');
            }
        }
    }

    /**
     * Optimistically removes a file row from Trash immediately (0ms perceived latency),
     * and performs the DELETE ?permanent=true request in the background. Restores row if deletion fails.
     *
     * @param {Object} params
     * @param {string} params.targetId - ID of the file to permanently delete
     * @param {HTMLElement} [params.targetRow] - The table row element to animate and remove
     * @param {string} [params.filename] - Filename for toast messages
     * @param {Function} [params.apiFetch] - Fetch function (defaults to global fetch)
     * @param {Function} [params.animateRowRemoval] - Removal animation function
     * @param {Function} [params.showToast] - Toast display function
     */
    async function executeOptimisticDeleteForever({
        targetId,
        targetRow,
        filename = 'this item',
        apiFetch = (typeof fetch !== 'undefined' ? fetch : null),
        animateRowRemoval: animateFn = (typeof window !== 'undefined' && window.animateRowRemoval ? window.animateRowRemoval : animateRowRemoval),
        showToast = (typeof window !== 'undefined' && window.showToast ? window.showToast : null)
    } = {}) {
        const parent = targetRow?.parentNode;
        const nextSibling = targetRow?.nextSibling;

        // 1. Optimistic UI: Immediately animate row removal at 0ms
        if (targetRow && typeof animateFn === 'function') {
            animateFn(targetRow, 'Trash is empty.', '.trash-table, .file-table-container');
        }

        // 2. Perform network request in background
        try {
            if (targetId && typeof apiFetch === 'function') {
                const res = await apiFetch(`/api/files/${targetId}?permanent=true`, { method: 'DELETE', keepalive: true });
                const data = await res.json();
                if (!res.ok || (data && data.success === false)) {
                    throw new Error((data && data.error) || 'Failed to permanently delete');
                }
            }
            if (typeof showToast === 'function') {
                showToast(`Permanently deleted "${filename}"`, 'success');
            }
        } catch (err) {
            // Rollback optimistic removal on error
            if (targetRow) {
                if (parent && !targetRow.parentNode) {
                    parent.insertBefore(targetRow, nextSibling);
                }
                if (targetRow.style) {
                    targetRow.style.opacity = '1';
                    targetRow.style.transform = 'none';
                    targetRow.style.height = '';
                    targetRow.style.minHeight = '';
                    targetRow.style.paddingTop = '';
                    targetRow.style.paddingBottom = '';
                    targetRow.style.borderBottom = '';
                    targetRow.style.overflow = '';
                    targetRow.style.pointerEvents = 'auto';
                }
            }
            console.error('Optimistic permanent delete error:', err);
            if (typeof showToast === 'function') {
                showToast(`Failed: ${err.message}`, 'error');
            }
        }
    }

    /**
     * Optimistically empties trash UI immediately (0ms perceived latency),
     * prompting a confirmation modal first. Removes all rows, shows empty state,
     * and calls POST /trash/empty in background. Rolls back rows if failed.
     *
     * @param {Object} params
     * @param {HTMLElement} [params.tableContainer]
     * @param {HTMLElement} [params.emptyTrashForm]
     * @param {Function} [params.apiFetch]
     * @param {Function} [params.showToast]
     * @param {Function} [params.showConfirmModal]
     * @param {boolean} [params.skipConfirm]
     */
    async function executeOptimisticEmptyTrash({
        tableContainer = (typeof document !== 'undefined' ? document.querySelector('.trash-table, .file-table-container') : null),
        emptyTrashForm = (typeof document !== 'undefined' ? document.getElementById('emptyTrashForm') : null),
        apiFetch = (typeof fetch !== 'undefined' ? fetch : null),
        showToast = (typeof window !== 'undefined' && window.showToast ? window.showToast : null),
        showConfirmModal = (typeof window !== 'undefined' && window.showConfirmModal ? window.showConfirmModal : null),
        skipConfirm = false
    } = {}) {
        const doEmpty = async () => {
            const rows = tableContainer ? Array.from(tableContainer.querySelectorAll('.file-row')) : [];
            const savedRows = rows.map(r => ({
                element: r,
                parent: r.parentNode,
                nextSibling: r.nextSibling,
                style: {
                    opacity: r.style ? r.style.opacity : '1',
                    transform: r.style ? r.style.transform : 'none',
                    display: r.style ? r.style.display : '',
                    height: r.style ? r.style.height : ''
                }
            }));

            const originalFormDisplay = emptyTrashForm ? emptyTrashForm.style.display : '';

            // 1. Optimistic Wipe at 0ms
            if (emptyTrashForm) {
                emptyTrashForm.style.display = 'none';
            }

            rows.forEach(r => {
                if (r.style) {
                    r.style.transition = 'all 0.25s ease';
                    r.style.opacity = '0';
                    r.style.transform = 'translateX(20px)';
                    r.style.height = '0px';
                    r.style.overflow = 'hidden';
                }
            });

            let emptyEl = null;
            setTimeout(() => {
                rows.forEach(r => {
                    if (typeof r.remove === 'function') r.remove();
                });
                if (tableContainer && !tableContainer.querySelector('.empty-state') && typeof document !== 'undefined') {
                    emptyEl = document.createElement('div');
                    emptyEl.className = 'empty-state';
                    emptyEl.textContent = 'Trash is empty.';
                    tableContainer.appendChild(emptyEl);
                }
            }, 250);

            // 2. Network Request in Background
            try {
                if (typeof apiFetch === 'function') {
                    const res = await apiFetch('/trash/empty', {
                        method: 'POST',
                        headers: { 'Accept': 'application/json' },
                        keepalive: true
                    });
                    const data = await res.json().catch(() => ({ success: res.ok }));
                    if (!res.ok || (data && data.success === false)) {
                        throw new Error((data && data.error) || 'Failed to empty trash');
                    }
                }
                if (typeof showToast === 'function') {
                    showToast('Trash emptied successfully', 'success');
                }
            } catch (err) {
                // Rollback on error
                if (emptyEl && typeof emptyEl.remove === 'function') emptyEl.remove();
                if (tableContainer) {
                    const existingEmpty = tableContainer.querySelector('.empty-state');
                    if (existingEmpty && typeof existingEmpty.remove === 'function') existingEmpty.remove();
                }

                savedRows.forEach(({ element, parent, nextSibling, style }) => {
                    if (parent && !element.parentNode && typeof parent.insertBefore === 'function') {
                        parent.insertBefore(element, nextSibling);
                    }
                    if (element.style) {
                        element.style.opacity = '1';
                        element.style.transform = 'none';
                        element.style.display = style.display || '';
                        element.style.height = style.height || '';
                        element.style.overflow = '';
                        element.style.pointerEvents = 'auto';
                    }
                });

                if (emptyTrashForm) {
                    emptyTrashForm.style.display = originalFormDisplay;
                }

                console.error('Optimistic empty trash error:', err);
                if (typeof showToast === 'function') {
                    showToast(`Failed: ${err.message}`, 'error');
                }
            }
        };

        if (skipConfirm || typeof showConfirmModal !== 'function') {
            return doEmpty();
        }

        showConfirmModal({
            title: 'Empty Trash',
            messageHtml: 'Are you sure you want to permanently delete all items in trash?',
            warning: 'This action cannot be undone.',
            confirmText: 'Empty Trash',
            confirmType: 'danger',
            onConfirm: doEmpty
        });
    }

    if (typeof window !== 'undefined') {
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
        window.animateRowRemoval = animateRowRemoval;
        window.executeOptimisticMoveToTrash = executeOptimisticMoveToTrash;
        window.executeOptimisticDeleteForever = executeOptimisticDeleteForever;
        window.executeOptimisticEmptyTrash = executeOptimisticEmptyTrash;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            executeOptimisticMoveToTrash,
            executeOptimisticDeleteForever,
            executeOptimisticEmptyTrash,
            animateRowRemoval
        };
    }

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

    if (typeof document !== 'undefined') {
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

        const emptyTrashForm = document.getElementById('emptyTrashForm');
        if (emptyTrashForm) {
            emptyTrashForm.addEventListener('submit', (e) => {
                e.preventDefault();
                executeOptimisticEmptyTrash({ emptyTrashForm });
            });
        }

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
                    onConfirm: () => {
                        executeOptimisticMoveToTrash({
                            targetId,
                            targetRow,
                            filename
                        });
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
                        if (targetRow) {
                            targetRow.style.transition = 'opacity 0.2s ease';
                            targetRow.style.opacity = '0.5';
                            targetRow.style.pointerEvents = 'none';
                        }
                        try {
                            if (targetId) {
                                const res = await fetch(`/api/files/${targetId}/restore`, { method: 'POST' });
                                const data = await res.json();
                                if (!res.ok || !data.success) throw new Error(data.error || 'Failed to restore file');
                            }
                            window.animateRowRemoval(targetRow, 'Trash is empty.', '.trash-table, .file-table-container');
                            if (window.showToast) window.showToast(`Restored "${filename}" successfully!`, 'success');
                        } catch (err) {
                            if (targetRow) {
                                targetRow.style.opacity = '1';
                                targetRow.style.pointerEvents = 'auto';
                            }
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
                    onConfirm: () => {
                        executeOptimisticDeleteForever({
                            targetId,
                            targetRow,
                            filename
                        });
                    }
                });
                return;
            }
        });
    });
    }
})();
