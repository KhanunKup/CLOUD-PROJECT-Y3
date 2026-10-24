/**
 * Batch Actions and Multi-Select Controller
 * EasyDrive - Phase 5 (Drive & Trash Support)
 */
(function() {
    'use strict';

    const selectedFileIds = new Set();

    function initBatchActions() {
        const selectAllCheckbox = document.getElementById('selectAllCheckbox');
        const floatingBatchBar = document.getElementById('floatingBatchBar');
        const batchSelectedCount = document.getElementById('batchSelectedCount');
        const batchTrashBtn = document.getElementById('batchTrashBtn');
        const batchDownloadZipBtn = document.getElementById('batchDownloadZipBtn');
        const batchRestoreBtn = document.getElementById('batchRestoreBtn');
        const batchDeleteForeverBtn = document.getElementById('batchDeleteForeverBtn');
        const batchDeselectBtn = document.getElementById('batchDeselectBtn');
        const tableContainer = document.querySelector('.file-table-container');

        if (!floatingBatchBar) return;

        const isTrashPage = !!document.querySelector('.trash-table');

        // Context-aware button layout: Drive mode vs Trash mode
        if (isTrashPage) {
            if (batchDownloadZipBtn) batchDownloadZipBtn.style.display = 'none';
            if (batchTrashBtn) batchTrashBtn.style.display = 'none';
            if (batchRestoreBtn) batchRestoreBtn.style.display = 'inline-flex';
            if (batchDeleteForeverBtn) batchDeleteForeverBtn.style.display = 'inline-flex';
        } else {
            if (batchDownloadZipBtn) batchDownloadZipBtn.style.display = 'inline-flex';
            if (batchTrashBtn) batchTrashBtn.style.display = 'inline-flex';
            if (batchRestoreBtn) batchRestoreBtn.style.display = 'none';
            if (batchDeleteForeverBtn) batchDeleteForeverBtn.style.display = 'none';
        }

        function getVisibleRows() {
            return Array.from(document.querySelectorAll('.file-row')).filter(row => {
                return row.style.display !== 'none' && !row.classList.contains('is-dragged');
            });
        }

        function checkAndRenderEmptyState() {
            const container = document.querySelector('.trash-table, .file-table-container, .file-container');
            if (!container) return;
            const remainingRows = container.querySelectorAll('.file-row');
            if (remainingRows.length === 0 && !container.querySelector('.empty-state')) {
                const emptyEl = document.createElement('div');
                emptyEl.className = 'empty-state';
                emptyEl.textContent = isTrashPage ? 'Trash is empty.' : 'No files found.';
                container.appendChild(emptyEl);

                const emptyTrashForm = document.getElementById('emptyTrashForm');
                if (emptyTrashForm) {
                    emptyTrashForm.style.display = 'none';
                }
            }
        }

        function removeRowsWithAnimation(targetIds) {
            targetIds.forEach(id => {
                const row = document.querySelector(`.file-row[data-id="${id}"]`);
                if (row) {
                    row.style.transition = 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
                    row.style.opacity = '0';
                    row.style.transform = 'translateX(20px)';
                    row.style.height = '0px';
                    row.style.minHeight = '0px';
                    row.style.paddingTop = '0px';
                    row.style.paddingBottom = '0px';
                    row.style.borderBottom = 'none';
                    row.style.overflow = 'hidden';
                    setTimeout(() => {
                        if (row.parentNode) row.remove();
                        checkAndRenderEmptyState();
                    }, 260);
                }
            });
        }

        function updateUI() {
            const count = selectedFileIds.size;
            if (batchSelectedCount) {
                batchSelectedCount.textContent = count;
            }

            if (floatingBatchBar) {
                floatingBatchBar.classList.toggle('show', count > 0);
            }

            // Dynamic Download Button Text & Icon (Drive mode):
            if (!isTrashPage && batchDownloadZipBtn) {
                if (count === 1) {
                    const singleId = Array.from(selectedFileIds)[0];
                    const singleRow = document.querySelector(`.file-row[data-id="${singleId}"]`);
                    const isFolder = singleRow ? singleRow.dataset.type === 'folder' : false;

                    if (!isFolder) {
                        batchDownloadZipBtn.innerHTML = '<i class="fas fa-download"></i> <span>Download</span>';
                        batchDownloadZipBtn.title = 'Download selected file';
                    } else {
                        batchDownloadZipBtn.innerHTML = '<i class="fas fa-file-zipper"></i> <span>Download ZIP</span>';
                        batchDownloadZipBtn.title = 'Download folder as ZIP';
                    }
                } else {
                    batchDownloadZipBtn.innerHTML = '<i class="fas fa-file-zipper"></i> <span>Download ZIP</span>';
                    batchDownloadZipBtn.title = 'Download selected as ZIP';
                }
            }

            if (selectAllCheckbox) {
                const visibleRows = getVisibleRows();
                if (visibleRows.length === 0) {
                    selectAllCheckbox.checked = false;
                    selectAllCheckbox.indeterminate = false;
                } else {
                    const visibleSelectedCount = visibleRows.filter(r => selectedFileIds.has(r.dataset.id)).length;
                    if (visibleSelectedCount === visibleRows.length) {
                        selectAllCheckbox.checked = true;
                        selectAllCheckbox.indeterminate = false;
                    } else if (visibleSelectedCount > 0) {
                        selectAllCheckbox.checked = false;
                        selectAllCheckbox.indeterminate = true;
                    } else {
                        selectAllCheckbox.checked = false;
                        selectAllCheckbox.indeterminate = false;
                    }
                }
            }
        }

        function toggleRowSelection(row, isSelected) {
            const id = row.dataset.id;
            if (!id) return;

            if (isSelected) {
                selectedFileIds.add(id);
                row.classList.add('is-selected');
            } else {
                selectedFileIds.delete(id);
                row.classList.remove('is-selected');
            }

            const cb = row.querySelector('.row-select-checkbox');
            if (cb) cb.checked = isSelected;
        }

        function clearSelection() {
            selectedFileIds.clear();
            document.querySelectorAll('.file-row.is-selected').forEach(r => r.classList.remove('is-selected'));
            document.querySelectorAll('.row-select-checkbox').forEach(cb => {
                cb.checked = false;
                cb.indeterminate = false;
            });
            updateUI();
        }

        // Row checkbox click / change via delegation
        if (tableContainer) {
            tableContainer.addEventListener('change', (e) => {
                if (e.target.matches('.file-row .row-select-checkbox')) {
                    const row = e.target.closest('.file-row');
                    if (row) {
                        toggleRowSelection(row, e.target.checked);
                        updateUI();
                    }
                }
            });

            // Prevent checkbox click from triggering row open / preview actions
            tableContainer.addEventListener('click', (e) => {
                if (e.target.matches('.row-select-checkbox')) {
                    e.stopPropagation();
                }
            });
        }

        // Master Select All checkbox
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', () => {
                const shouldSelect = selectAllCheckbox.checked;
                const visibleRows = getVisibleRows();
                visibleRows.forEach(row => toggleRowSelection(row, shouldSelect));
                updateUI();
            });
        }

        // Deselect Button
        if (batchDeselectBtn) {
            batchDeselectBtn.addEventListener('click', (e) => {
                e.preventDefault();
                clearSelection();
            });
        }

        function isAnyModalOrOverlayOpen() {
            // Check preview modal
            const previewModal = document.getElementById('previewModal');
            if (previewModal && previewModal.style && previewModal.style.display !== 'none' && previewModal.style.display !== '') {
                return true;
            }
            // Check confirm modal
            const confirmModal = document.getElementById('confirmModal') || document.querySelector('.confirm-modal-overlay');
            if (confirmModal && confirmModal.style && confirmModal.style.display !== 'none' && confirmModal.style.display !== '') {
                return true;
            }
            // Check shortcuts modal
            const shortcutsModal = document.getElementById('shortcutsModal');
            if (shortcutsModal && shortcutsModal.style && shortcutsModal.style.display !== 'none' && shortcutsModal.style.display !== '') {
                return true;
            }
            // Check storage breakdown modal
            const storageModal = document.getElementById('storageBreakdownModal');
            if (storageModal && storageModal.style && storageModal.style.display !== 'none' && storageModal.style.display !== '') {
                return true;
            }
            // Check info drawer
            const infoDrawer = document.getElementById('infoDrawer');
            if (infoDrawer && (infoDrawer.classList.contains('open') || infoDrawer.classList.contains('active'))) {
                return true;
            }
            // Check open dropdowns
            const openDropdown = document.querySelector('.options-dropdown.show, .new-options-dropdown.show, .dropdown-menu.show');
            if (openDropdown) {
                return true;
            }
            // Generic check for any visible overlay or modal
            const openModals = document.querySelectorAll('.modal-overlay, .modal, .modal-backdrop');
            for (const modal of openModals) {
                if (modal.style && modal.style.display && modal.style.display !== 'none') {
                    return true;
                }
            }
            return false;
        }

        // Keyboard Shortcuts: Ctrl+A / Cmd+A and Esc
        document.addEventListener('keydown', (e) => {
            const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) ||
                             document.activeElement?.isContentEditable;

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !isTyping) {
                const visibleRows = getVisibleRows();
                if (visibleRows.length > 0) {
                    e.preventDefault();
                    const allSelected = visibleRows.every(row => selectedFileIds.has(row.dataset.id));
                    if (allSelected) {
                        clearSelection();
                    } else {
                        visibleRows.forEach(row => toggleRowSelection(row, true));
                        updateUI();
                    }
                }
            } else if (e.key === 'Escape') {
                if (isAnyModalOrOverlayOpen()) {
                    return;
                }
                if (selectedFileIds.size > 0) {
                    clearSelection();
                }
            }
        });

        // 1. Batch Move to Trash (Drive Page)
        if (batchTrashBtn) {
            batchTrashBtn.addEventListener('click', () => {
                const count = selectedFileIds.size;
                if (count === 0) return;

                const targetIds = Array.from(selectedFileIds);

                const executeTrash = async () => {
                    const originalHtml = batchTrashBtn.innerHTML;
                    batchTrashBtn.disabled = true;
                    batchTrashBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Moving...';

                    try {
                        const res = await fetch('/api/files/batch-trash', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ file_ids: targetIds })
                        });
                        const data = await res.json();

                        if (res.ok && data.success) {
                            removeRowsWithAnimation(targetIds);
                            clearSelection();

                            if (typeof window.showToast === 'function') {
                                window.showToast(data.message || `Moved ${targetIds.length} item(s) to trash`, 'success');
                            }

                            if (typeof window.fetchStorageStats === 'function') {
                                window.fetchStorageStats();
                            }
                        } else {
                            if (typeof window.showToast === 'function') {
                                window.showToast(data.error || 'Failed to move items to trash', 'error');
                            }
                        }
                    } catch (err) {
                        console.error('Batch trash error:', err);
                        if (typeof window.showToast === 'function') {
                            window.showToast('Network error while moving items to trash', 'error');
                        }
                    } finally {
                        batchTrashBtn.disabled = false;
                        batchTrashBtn.innerHTML = originalHtml;
                    }
                };

                if (typeof window.showConfirmModal === 'function') {
                    let messageHtml = '';
                    if (count === 1) {
                        const singleRow = document.querySelector(`.file-row[data-id="${targetIds[0]}"]`);
                        const singleName = singleRow ? (singleRow.dataset.name || 'this item') : 'this item';
                        messageHtml = `Are you sure you want to move <span class="confirm-highlight">"${singleName}"</span> to trash?`;
                    } else {
                        messageHtml = `Are you sure you want to move <span class="confirm-highlight">${count} selected items</span> to trash?`;
                    }

                    window.showConfirmModal({
                        title: 'Move to Trash',
                        messageHtml: messageHtml,
                        warning: 'Items in trash can be restored anytime from the Trash page.',
                        confirmText: 'Move to Trash',
                        confirmType: 'danger',
                        onConfirm: executeTrash
                    });
                } else {
                    if (window.confirm(`Are you sure you want to move ${count} selected item(s) to Trash?`)) {
                        executeTrash();
                    }
                }
            });
        }

        // 2. Batch Download (Drive Page: single file direct or ZIP archive)
        if (batchDownloadZipBtn) {
            batchDownloadZipBtn.addEventListener('click', async () => {
                const count = selectedFileIds.size;
                if (count === 0) return;

                const targetIds = Array.from(selectedFileIds);
                const originalHtml = batchDownloadZipBtn.innerHTML;

                if (count === 1) {
                    const singleId = targetIds[0];
                    const singleRow = document.querySelector(`.file-row[data-id="${singleId}"]`);
                    const isFolder = singleRow ? singleRow.dataset.type === 'folder' : false;

                    if (!isFolder) {
                        batchDownloadZipBtn.disabled = true;
                        batchDownloadZipBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading...';

                        if (typeof window.showToast === 'function') {
                            window.showToast('Downloading file...', 'info');
                        }

                        try {
                            const res = await fetch(`/api/files/${singleId}/download-url`);
                            const data = await res.json();
                            if (!res.ok || !data.success) {
                                throw new Error(data.error || 'Failed to get download URL');
                            }

                            const a = document.createElement('a');
                            a.href = data.downloadUrl;
                            a.download = data.filename || (singleRow ? singleRow.dataset.name : 'download');
                            document.body.appendChild(a);
                            a.click();
                            a.remove();

                            if (typeof window.showToast === 'function') {
                                window.showToast('Download started!', 'success');
                            }
                        } catch (err) {
                            console.error('Single file download error:', err);
                            if (typeof window.showToast === 'function') {
                                window.showToast(err.message || 'Failed to download file', 'error');
                            }
                        } finally {
                            batchDownloadZipBtn.disabled = false;
                            batchDownloadZipBtn.innerHTML = originalHtml;
                        }
                        return;
                    }
                }

                // Multiple files or folder -> Package ZIP
                batchDownloadZipBtn.disabled = true;
                batchDownloadZipBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing ZIP...';

                if (typeof window.showToast === 'function') {
                    window.showToast(`Packaging ${count} item(s) into ZIP...`, 'info');
                }

                try {
                    const res = await fetch('/api/files/batch-download-zip', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ file_ids: targetIds })
                    });

                    if (!res.ok) {
                        let errMsg = 'Failed to generate ZIP download';
                        try {
                            const errJson = await res.json();
                            if (errJson.error) errMsg = errJson.error;
                        } catch (_) {}
                        throw new Error(errMsg);
                    }

                    const blob = await res.blob();
                    const downloadUrl = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = downloadUrl;
                    link.download = 'EasyDrive_Batch_Download.zip';
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    window.URL.revokeObjectURL(downloadUrl);

                    if (typeof window.showToast === 'function') {
                        window.showToast('ZIP download started!', 'success');
                    }
                } catch (err) {
                    console.error('Batch download error:', err);
                    if (typeof window.showToast === 'function') {
                        window.showToast(err.message || 'Failed to download ZIP', 'error');
                    }
                } finally {
                    batchDownloadZipBtn.disabled = false;
                    batchDownloadZipBtn.innerHTML = originalHtml;
                }
            });
        }

        // 3. Batch Restore (Trash Page)
        if (batchRestoreBtn) {
            batchRestoreBtn.addEventListener('click', () => {
                const count = selectedFileIds.size;
                if (count === 0) return;

                const targetIds = Array.from(selectedFileIds);

                const executeRestore = async () => {
                    const originalHtml = batchRestoreBtn.innerHTML;
                    batchRestoreBtn.disabled = true;
                    batchRestoreBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Restoring...';

                    try {
                        const res = await fetch('/api/files/batch-restore', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ file_ids: targetIds })
                        });
                        const data = await res.json();

                        if (res.ok && data.success) {
                            removeRowsWithAnimation(targetIds);
                            clearSelection();

                            if (typeof window.showToast === 'function') {
                                window.showToast(data.message || `Restored ${targetIds.length} item(s) successfully`, 'success');
                            }
                        } else {
                            if (typeof window.showToast === 'function') {
                                window.showToast(data.error || 'Failed to restore items', 'error');
                            }
                        }
                    } catch (err) {
                        console.error('Batch restore error:', err);
                        if (typeof window.showToast === 'function') {
                            window.showToast('Network error while restoring items', 'error');
                        }
                    } finally {
                        batchRestoreBtn.disabled = false;
                        batchRestoreBtn.innerHTML = originalHtml;
                    }
                };

                if (typeof window.showConfirmModal === 'function') {
                    let messageHtml = '';
                    if (count === 1) {
                        const singleRow = document.querySelector(`.file-row[data-id="${targetIds[0]}"]`);
                        const singleName = singleRow ? (singleRow.dataset.name || 'this item') : 'this item';
                        messageHtml = `Are you sure you want to restore <span class="confirm-highlight">"${singleName}"</span>?`;
                    } else {
                        messageHtml = `Are you sure you want to restore <span class="confirm-highlight">${count} selected items</span>?`;
                    }

                    window.showConfirmModal({
                        title: 'Restore Files',
                        messageHtml: messageHtml,
                        confirmText: 'Restore',
                        confirmType: 'success',
                        onConfirm: executeRestore
                    });
                } else {
                    if (window.confirm(`Are you sure you want to restore ${count} selected item(s)?`)) {
                        executeRestore();
                    }
                }
            });
        }

        // 4. Batch Delete Forever (Trash Page)
        if (batchDeleteForeverBtn) {
            batchDeleteForeverBtn.addEventListener('click', () => {
                const count = selectedFileIds.size;
                if (count === 0) return;

                const targetIds = Array.from(selectedFileIds);

                const executeDeleteForever = async () => {
                    const originalHtml = batchDeleteForeverBtn.innerHTML;
                    batchDeleteForeverBtn.disabled = true;
                    batchDeleteForeverBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';

                    try {
                        const res = await fetch('/api/files/batch-delete-forever', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ file_ids: targetIds })
                        });
                        const data = await res.json();

                        if (res.ok && data.success) {
                            removeRowsWithAnimation(targetIds);
                            clearSelection();

                            if (typeof window.showToast === 'function') {
                                window.showToast(data.message || `Permanently deleted ${targetIds.length} item(s)`, 'success');
                            }

                            if (typeof window.fetchStorageStats === 'function') {
                                window.fetchStorageStats();
                            }
                        } else {
                            if (typeof window.showToast === 'function') {
                                window.showToast(data.error || 'Failed to permanently delete items', 'error');
                            }
                        }
                    } catch (err) {
                        console.error('Batch delete forever error:', err);
                        if (typeof window.showToast === 'function') {
                            window.showToast('Network error while deleting items permanently', 'error');
                        }
                    } finally {
                        batchDeleteForeverBtn.disabled = false;
                        batchDeleteForeverBtn.innerHTML = originalHtml;
                    }
                };

                if (typeof window.showConfirmModal === 'function') {
                    let messageHtml = '';
                    if (count === 1) {
                        const singleRow = document.querySelector(`.file-row[data-id="${targetIds[0]}"]`);
                        const singleName = singleRow ? (singleRow.dataset.name || 'this item') : 'this item';
                        messageHtml = `Are you sure you want to permanently delete <span class="confirm-highlight">"${singleName}"</span>?`;
                    } else {
                        messageHtml = `Are you sure you want to permanently delete <span class="confirm-highlight">${count} selected items</span>?`;
                    }

                    window.showConfirmModal({
                        title: 'Delete Forever',
                        messageHtml: messageHtml,
                        warning: 'This action cannot be undone. All selected files and nested contents will be permanently deleted.',
                        confirmText: 'Delete Forever',
                        confirmType: 'danger',
                        onConfirm: executeDeleteForever
                    });
                } else {
                    if (window.confirm(`Are you sure you want to permanently delete ${count} selected item(s)? This cannot be undone.`)) {
                        executeDeleteForever();
                    }
                }
            });
        }

        // Expose public API
        window.BatchActions = {
            getSelectedIds: () => Array.from(selectedFileIds),
            clearSelection,
            updateUI,
            toggleRowSelection,
            checkAndRenderEmptyState
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBatchActions);
    } else {
        initBatchActions();
    }
})();
