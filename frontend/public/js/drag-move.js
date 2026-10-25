// frontend/public/js/drag-move.js
// Interactive HTML5 Drag-and-Drop: Move files into folders and parent breadcrumbs
(function () {
  'use strict';

  let draggedItem = null;

  function parseCrumbFolderId(crumbEl) {
    if (!crumbEl) return null;
    if (crumbEl.dataset && crumbEl.dataset.folderId !== undefined) {
      return crumbEl.dataset.folderId ? crumbEl.dataset.folderId : null;
    }
    const href = crumbEl.getAttribute('href') || '';
    if (!href || href === '/drive' || href === '/drive/' || !href.includes('folder=')) {
      return null; // Target is root ('My Drive')
    }
    const match = href.match(/[?&]folder=([^&#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  async function moveFileRequest(fileId, targetFolderId) {
    const res = await fetch(`/api/files/${encodeURIComponent(fileId)}/move`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ target_folder_id: targetFolderId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  }

  function animateAndRemoveRow(rowEl) {
    if (!rowEl) return;
    rowEl.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    rowEl.style.opacity = '0';
    rowEl.style.transform = 'scale(0.96)';

    setTimeout(() => {
      const container = rowEl.parentNode;
      rowEl.remove();

      // Check if container is now empty
      if (container && container.querySelectorAll) {
        const remainingRows = container.querySelectorAll('.file-row');
        if (remainingRows.length === 0) {
          const emptyState = document.createElement('div');
          emptyState.className = 'empty-state';
          emptyState.textContent = 'This folder is empty. Click "+ New" to add files or subfolders.';
          container.appendChild(emptyState);
        }
      }
    }, 250);
  }

  function initDragAndDropMove() {
    const rows = document.querySelectorAll('.file-row');
    rows.forEach(row => {
      // Skip empty state placeholder
      if (row.classList.contains('empty-state')) return;

      // 1. Enable Draggable on row
      row.setAttribute('draggable', 'true');

      // Drag Start
      row.addEventListener('dragstart', (e) => {
        const fileId = row.dataset.id;
        const fileName = row.dataset.name || row.querySelector('.file-name, .file-name-text')?.textContent?.trim() || 'File';
        const isFolder = row.classList.contains('folder-row') || row.dataset.category === 'folder' || row.dataset.type === 'folder';

        draggedItem = { fileId, fileName, isFolder, element: row };

        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('application/json', JSON.stringify({ fileId, fileName, isFolder }));
        }

        // Add visual feedback to dragged item
        row.classList.add('dragging-active');
      });

      // Drag End
      row.addEventListener('dragend', () => {
        row.classList.remove('dragging-active');
        document.querySelectorAll('.drag-target-hover').forEach(el => {
          el.classList.remove('drag-target-hover');
        });
        draggedItem = null;
      });

      // 2. Drop Target logic for folder rows
      const isFolderRow = row.classList.contains('folder-row') || row.dataset.category === 'folder' || row.dataset.type === 'folder';
      if (isFolderRow) {
        row.addEventListener('dragover', (e) => {
          // If no dragged item or dragging self onto self, ignore
          const targetId = row.dataset.id;
          if (draggedItem && draggedItem.fileId === targetId) return;

          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
          row.classList.add('drag-target-hover');
        });

        row.addEventListener('dragleave', (e) => {
          // If moving between child elements of the same folder row, ignore
          if (e.relatedTarget && row.contains(e.relatedTarget)) return;
          row.classList.remove('drag-target-hover');
        });

        row.addEventListener('drop', async (e) => {
          e.preventDefault();
          row.classList.remove('drag-target-hover');

          let payload = draggedItem;
          if (!payload && e.dataTransfer) {
            try {
              payload = JSON.parse(e.dataTransfer.getData('application/json'));
            } catch (_) {}
          }

          if (!payload || !payload.fileId) return;

          const sourceFileId = payload.fileId;
          const sourceFileName = payload.fileName || 'Item';
          const destinationFolderId = row.dataset.id;
          const destinationFolderName = row.dataset.name || row.querySelector('.file-name, .file-name-text')?.textContent?.trim() || 'Folder';

          // Disallow dropping item into itself
          if (sourceFileId === destinationFolderId) return;

          const sourceRow = payload.element || document.querySelector(`.file-row[data-id="${sourceFileId}"]`);

          try {
            await moveFileRequest(sourceFileId, destinationFolderId);
            animateAndRemoveRow(sourceRow);
            if (window.showToast) {
              window.showToast(`Moved "${sourceFileName}" into "${destinationFolderName}"`, 'success');
            }
          } catch (err) {
            console.error('Drag move error:', err);
            if (sourceRow) sourceRow.classList.remove('dragging-active');
            if (window.showToast) {
              window.showToast(`Failed to move: ${err.message}`, 'error');
            }
          }
        });
      }
    });

    // 3. Breadcrumb Drop Targets (for moving to parent or My Drive)
    const crumbLinks = document.querySelectorAll('.drive-breadcrumbs .crumb-link, .crumb-link');
    crumbLinks.forEach(crumb => {
      crumb.addEventListener('dragover', (e) => {
        if (!draggedItem) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        crumb.classList.add('drag-target-hover');
      });

      crumb.addEventListener('dragleave', () => {
        crumb.classList.remove('drag-target-hover');
      });

      crumb.addEventListener('drop', async (e) => {
        e.preventDefault();
        crumb.classList.remove('drag-target-hover');

        let payload = draggedItem;
        if (!payload && e.dataTransfer) {
          try {
            payload = JSON.parse(e.dataTransfer.getData('application/json'));
          } catch (_) {}
        }

        if (!payload || !payload.fileId) return;

        const sourceFileId = payload.fileId;
        const sourceFileName = payload.fileName || 'Item';
        const targetFolderId = parseCrumbFolderId(crumb);
        const destinationName = crumb.textContent?.trim() || (targetFolderId ? 'Folder' : 'My Drive');

        const sourceRow = payload.element || document.querySelector(`.file-row[data-id="${sourceFileId}"]`);

        try {
          await moveFileRequest(sourceFileId, targetFolderId);
          animateAndRemoveRow(sourceRow);
          if (window.showToast) {
            window.showToast(`Moved "${sourceFileName}" to ${destinationName}`, 'success');
          }
        } catch (err) {
          console.error('Breadcrumb move error:', err);
          if (sourceRow) sourceRow.classList.remove('dragging-active');
          if (window.showToast) {
            window.showToast(`Failed to move: ${err.message}`, 'error');
          }
        }
      });
    });

    // (No lingering global listeners needed)
  }

  // Auto-initialize on DOM ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initDragAndDropMove);
    } else {
      initDragAndDropMove();
    }
  }

  const exported = {
    initDragAndDropMove,
    parseCrumbFolderId
  };

  if (typeof window !== 'undefined') {
    window.DragMove = exported;
    window.initDragAndDropMove = initDragAndDropMove;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
})();
