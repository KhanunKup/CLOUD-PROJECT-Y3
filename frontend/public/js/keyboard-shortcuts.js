// frontend/public/js/keyboard-shortcuts.js
// Global Keyboard Navigation & Accessibility Engine for EasyDrive

(function () {
  'use strict';

  function isTypingInInput(target) {
    const el = target || (typeof document !== 'undefined' ? document.activeElement : null);
    if (!el) return false;
    if (el.matches && el.matches('input, textarea, select, [contenteditable]')) return true;
    if (el.isContentEditable) return true;
    const tag = (el.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  function getRows() {
    return Array.from(document.querySelectorAll('.file-row:not(.empty-state)'));
  }

  function getSelectedRow() {
    return document.querySelector('.file-row.is-keyboard-selected');
  }

  function setSelectedRow(row) {
    const rows = getRows();
    rows.forEach(r => r.classList.remove('is-keyboard-selected'));
    if (row) {
      row.classList.add('is-keyboard-selected');
      if (typeof row.scrollIntoView === 'function') {
        row.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  function moveSelection(direction) {
    const rows = getRows();
    if (!rows.length) return;

    const currentIndex = rows.findIndex(r => r.classList.contains('is-keyboard-selected'));

    let newIndex = 0;
    if (currentIndex === -1) {
      newIndex = direction > 0 ? 0 : rows.length - 1;
    } else {
      newIndex = currentIndex + direction;
      if (newIndex < 0) newIndex = 0;
      if (newIndex >= rows.length) newIndex = rows.length - 1;
    }

    setSelectedRow(rows[newIndex]);
  }

  function focusSearch(e) {
    const searchInput = document.querySelector('.search-input') ||
                        document.getElementById('searchInput') ||
                        document.querySelector('input[type="search"]');
    if (searchInput) {
      if (e && e.preventDefault) e.preventDefault();
      if (typeof searchInput.focus === 'function') searchInput.focus();
      if (typeof searchInput.select === 'function') searchInput.select();
    }
  }

  function handlePreview(e) {
    const selectedRow = getSelectedRow();
    if (!selectedRow) return;

    if (e && e.preventDefault) e.preventDefault();

    const isFolder = selectedRow.classList.contains('folder-row') ||
                     selectedRow.dataset.type === 'folder' ||
                     selectedRow.dataset.category === 'folder';
    if (isFolder) return;

    const previewBtn = selectedRow.querySelector('.open-preview-modal, .btn-preview, [data-action="preview"]');
    if (previewBtn && typeof previewBtn.click === 'function') {
      previewBtn.click();
      return;
    }

    if (typeof window.openFilePreview === 'function') {
      window.openFilePreview({
        id: selectedRow.dataset.id,
        name: selectedRow.dataset.name,
        type: selectedRow.dataset.type,
        size: selectedRow.dataset.size,
        hash: selectedRow.dataset.hash,
        owner: selectedRow.dataset.owner,
        tags: (selectedRow.dataset.tags || '').split(',').filter(Boolean),
        date: selectedRow.dataset.date
      });
    }
  }

  function handleDelete(e) {
    if (typeof window !== 'undefined' && window.BatchActions && typeof window.BatchActions.getSelectedIds === 'function') {
      const selectedIds = window.BatchActions.getSelectedIds();
      if (selectedIds && selectedIds.length > 0) {
        if (e && e.preventDefault) e.preventDefault();
        const isTrashPage = typeof document !== 'undefined' && !!document.querySelector('.trash-table');
        const targetBtnId = isTrashPage ? 'batchDeleteForeverBtn' : 'batchTrashBtn';
        const batchBtn = document.getElementById(targetBtnId);
        if (batchBtn && typeof batchBtn.click === 'function') {
          batchBtn.click();
          return;
        }
      }
    }

    const selectedRow = getSelectedRow();
    if (!selectedRow) return;

    if (e && e.preventDefault) e.preventDefault();

    const deleteBtn = selectedRow.querySelector('.open-delete-modal, .move-to-trash-action, [data-action="delete"]');
    if (deleteBtn && typeof deleteBtn.click === 'function') {
      deleteBtn.click();
    }
  }

  function handleEnter(e) {
    const selectedRow = getSelectedRow();
    if (!selectedRow) return;

    if (e && e.preventDefault) e.preventDefault();

    const isFolder = selectedRow.classList.contains('folder-row') ||
                     selectedRow.dataset.type === 'folder' ||
                     selectedRow.dataset.category === 'folder';

    if (isFolder) {
      const folderId = selectedRow.dataset.id;
      if (folderId) {
        window.location.href = `/drive?folder=${encodeURIComponent(folderId)}`;
      }
      return;
    }

    // If file, trigger preview
    handlePreview(e);
  }

  function handleEnterFolder(e) {
    const selectedRow = getSelectedRow();
    if (!selectedRow) return;

    const isFolder = selectedRow.classList.contains('folder-row') ||
                     selectedRow.dataset.type === 'folder' ||
                     selectedRow.dataset.category === 'folder';

    if (isFolder) {
      if (e && e.preventDefault) e.preventDefault();
      const folderId = selectedRow.dataset.id;
      if (folderId) {
        window.location.href = `/drive?folder=${encodeURIComponent(folderId)}`;
      }
    }
  }

  function handleExitFolder(e) {
    const crumbs = document.querySelectorAll('.drive-breadcrumbs .crumb-link, .crumb-link');
    if (!crumbs || crumbs.length === 0) return;

    const parentCrumb = crumbs[crumbs.length - 1];
    const href = parentCrumb.getAttribute ? (parentCrumb.getAttribute('href') || parentCrumb.href) : parentCrumb.href;
    if (href) {
      if (e && e.preventDefault) e.preventDefault();
      window.location.href = href;
    }
  }

  function openShortcutsModal() {
    const modal = document.getElementById('shortcutsModal');
    if (modal) modal.style.display = 'flex';
  }

  function closeShortcutsModal() {
    const modal = document.getElementById('shortcutsModal');
    if (modal) modal.style.display = 'none';
  }

  function toggleShortcutsModal(e) {
    if (e && e.preventDefault) e.preventDefault();
    const modal = document.getElementById('shortcutsModal');
    if (!modal) return;
    if (modal.style.display && modal.style.display !== 'none') {
      closeShortcutsModal();
    } else {
      openShortcutsModal();
    }
  }

  function handleEscape(e) {
    // Priority 1: If open dropdown menu exists, dismiss it first and stop propagation
    const openDropdown = document.querySelector('.options-dropdown.show, .dropdown-menu.show');
    if (openDropdown) {
      if (e) {
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      }
      openDropdown.classList.remove('show');
      return true;
    }

    // Priority 2: If Shortcuts Modal is open on top of another modal/page, close ONLY it and stop propagation
    const shortcutsModal = document.getElementById('shortcutsModal');
    if (shortcutsModal && shortcutsModal.style.display && shortcutsModal.style.display !== 'none') {
      if (e) {
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      }
      closeShortcutsModal();
      return true;
    }

    // Priority 3: If Info Drawer is open, close ONLY it
    const infoDrawer = document.getElementById('infoDrawer');
    if (infoDrawer && (infoDrawer.classList.contains('open') || infoDrawer.classList.contains('active'))) {
      if (e) {
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      }
      if (typeof window.closeInfoDrawer === 'function') window.closeInfoDrawer();
      return true;
    }

    // Priority 4: If an active input is focused, blur it
    if (document.activeElement && isTypingInInput(document.activeElement)) {
      if (typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
        return true;
      }
    }

    // Priority 5: Fallback for generic open modals (LIFO: close only topmost modal)
    const openModals = Array.from(document.querySelectorAll('.modal-overlay, .modal, .modal-backdrop'))
      .filter(m => m.style && m.style.display !== 'none' && m.id !== 'shortcutsModal');

    if (openModals.length > 0) {
      const topModal = openModals[openModals.length - 1];
      if (topModal.id === 'storageBreakdownModal' && typeof window.closeStorageModal === 'function') {
        window.closeStorageModal();
      } else if (topModal.id === 'previewModal' && typeof window.closePreview === 'function') {
        window.closePreview();
      } else {
        topModal.style.display = 'none';
        topModal.classList.remove('show', 'active');
      }
      if (e) {
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      }
      return true;
    }

    return false;
  }

  function onKeyDown(e) {
    // 1. LIFO Escape handling (closes topmost modal/drawer/dropdown first)
    if (e.key === 'Escape') {
      const handled = handleEscape(e);
      if (handled) return;
    }

    // 2. Strict Focus Guard: ignore all other shortcuts when typing in inputs
    if (isTypingInInput(e.target)) {
      return;
    }

    // 3. Shortcut routing
    const key = e.key;
    const code = e.code;

    if (key === '/' && !e.ctrlKey && !e.metaKey) {
      focusSearch(e);
      return;
    }

    if (key === '?' || (key === '/' && e.shiftKey)) {
      toggleShortcutsModal(e);
      return;
    }

    if (code === 'Space' || key === ' ' || key === 'p' || key === 'P') {
      handlePreview(e);
      return;
    }

    if (key === 'Delete' || key === 'Backspace') {
      handleDelete(e);
      return;
    }

    if (key === 'ArrowDown') {
      e.preventDefault();
      moveSelection(1);
      return;
    }

    if (key === 'ArrowUp') {
      e.preventDefault();
      moveSelection(-1);
      return;
    }

    if (key === 'Enter') {
      handleEnter(e);
      return;
    }

    if (key === 'ArrowRight') {
      handleEnterFolder(e);
      return;
    }

    if (key === 'ArrowLeft') {
      handleExitFolder(e);
      return;
    }
  }

  function initKeyboardShortcuts() {
    document.addEventListener('keydown', onKeyDown, true);

    // Mouse interaction clears any active keyboard navigation selection
    // so rows do NOT retain a persistent hover-like background when clicked with mouse
    document.addEventListener('click', () => {
      const current = getSelectedRow();
      if (current) {
        current.classList.remove('is-keyboard-selected');
      }
    });

    // Wire cheatsheet modal close buttons
    const closeBtn1 = document.getElementById('closeShortcutsModalBtn');
    if (closeBtn1) closeBtn1.addEventListener('click', closeShortcutsModal);

    const closeBtn2 = document.getElementById('closeShortcutsModalBtn2');
    if (closeBtn2) closeBtn2.addEventListener('click', closeShortcutsModal);

    const modal = document.getElementById('shortcutsModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeShortcutsModal();
      });
    }
  }

  // Auto-init on DOM ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initKeyboardShortcuts);
    } else {
      initKeyboardShortcuts();
    }
  }

  const exported = {
    initKeyboardShortcuts,
    isTypingInInput,
    moveSelection,
    setSelectedRow,
    getSelectedRow,
    focusSearch,
    handleEscape,
    handleEnter,
    handlePreview,
    handleDelete,
    openShortcutsModal,
    closeShortcutsModal,
    toggleShortcutsModal
  };

  if (typeof window !== 'undefined') {
    window.KeyboardShortcuts = exported;
    window.openShortcutsModal = openShortcutsModal;
    window.closeShortcutsModal = closeShortcutsModal;
    window.toggleShortcutsModal = toggleShortcutsModal;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
})();
