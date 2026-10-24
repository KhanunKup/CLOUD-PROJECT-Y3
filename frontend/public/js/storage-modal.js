// frontend/public/js/storage-modal.js
// Interactive Storage Breakdown Modal: Fetching, Live Bar Rendering & Event Wiring
(function () {
  'use strict';

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const val = parseFloat((bytes / Math.pow(k, i)).toFixed(1));
    return `${val} ${sizes[i]}`;
  }

  function renderStorageModal(data) {
    const usedBytes = Number(data.totalUsed ?? data.usedBytes ?? 0);
    const quotaBytes = Number(data.quota ?? data.quotaBytes ?? (50 * 1024 * 1024 * 1024));
    const freeBytes = Number(data.freeBytes ?? Math.max(0, quotaBytes - usedBytes));
    const percent = data.percent !== undefined ? data.percent : (quotaBytes > 0 ? ((usedBytes / quotaBytes) * 100).toFixed(1) : 0);

    // 1. Overview cards
    const usedElem = document.getElementById('storageModalUsed');
    if (usedElem) usedElem.textContent = data.formattedUsed || formatBytes(usedBytes);

    const freeElem = document.getElementById('storageModalFree');
    if (freeElem) freeElem.textContent = data.formattedFree || formatBytes(freeBytes);

    const quotaElem = document.getElementById('storageModalQuota');
    if (quotaElem) quotaElem.textContent = data.formattedQuota || formatBytes(quotaBytes);

    const pctBadge = document.getElementById('storageModalPercentBadge');
    if (pctBadge) pctBadge.textContent = `${percent}% used`;

    // 2. Segmented progress bar
    const categories = ['document', 'image', 'video', 'audio', 'archive', 'code', 'other'];
    const breakdown = data.breakdown || {};
    const modalRoot = document.getElementById('storageBreakdownModal') || document;

    categories.forEach(cat => {
      const bytes = Number(breakdown[cat] || 0);
      let segElem = modalRoot.querySelector(`.segment-${cat}`);
      if (!segElem && cat === 'video') {
        segElem = modalRoot.querySelector('.segment-media');
      }
      if (segElem) {
        if (bytes > 0) {
          const rawPct = quotaBytes > 0 ? (bytes / quotaBytes) * 100 : 0;
          const widthVal = Math.max(rawPct, 0.5).toFixed(2);
          segElem.style.width = `${widthVal}%`;
          segElem.title = `${cat.charAt(0).toUpperCase() + cat.slice(1)}: ${formatBytes(bytes)} (${rawPct.toFixed(1)}%)`;
        } else {
          segElem.style.width = '0%';
          segElem.title = `${cat.charAt(0).toUpperCase() + cat.slice(1)}: 0 B`;
        }
      }
    });

    // 3. Category Breakdown List
    const categoryRows = document.querySelectorAll('.storage-category-row');
    categoryRows.forEach(row => {
      const cat = row.dataset?.category || row.getAttribute?.('data-category');
      if (!cat) return;

      const bytes = Number(breakdown[cat] || 0);
      const sizeElem = row.querySelector('.storage-cat-size');
      const pctElem = row.querySelector('.storage-cat-pct');

      const pct = quotaBytes > 0 ? ((bytes / quotaBytes) * 100).toFixed(1) : '0.0';

      if (sizeElem) {
        sizeElem.textContent = data.breakdownFormatted?.[cat] || formatBytes(bytes);
      }
      if (pctElem) {
        pctElem.textContent = `${pct}%`;
      }
    });
  }

  async function fetchStorageBreakdown() {
    try {
      const res = await fetch('/api/user/storage');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data && (data.success || data.quota)) {
        renderStorageModal(data);
      }
    } catch (err) {
      console.error('Failed to load storage breakdown:', err);
    }
  }

  function openStorageModal() {
    // Dismiss and clear any stuck popover state from sidebar
    document.querySelectorAll('.sidebar-storage, #sidebarStorageSection').forEach(el => {
      el.classList.remove('popover-open');
    });
    const popover = document.getElementById('storagePopover');
    if (popover) {
      popover.style.display = 'none';
    }

    const modal = document.getElementById('storageBreakdownModal');
    if (modal) {
      modal.style.display = 'flex';
    }
    fetchStorageBreakdown();
  }

  function closeStorageModal() {
    const modal = document.getElementById('storageBreakdownModal');
    if (modal) {
      modal.style.display = 'none';
    }
    document.querySelectorAll('.sidebar-storage, #sidebarStorageSection').forEach(el => {
      el.classList.remove('popover-open');
    });
    const popover = document.getElementById('storagePopover');
    if (popover) {
      popover.style.display = '';
    }
  }

  function initStorageModal() {
    // 1. Sidebar trigger click
    const trigger = document.querySelector('.sidebar-storage');
    if (trigger) {
      trigger.style.cursor = 'pointer';
      trigger.setAttribute('title', 'Click to view storage breakdown');
      trigger.addEventListener('click', (e) => {
        if (e && e.preventDefault) e.preventDefault();
        openStorageModal();
      });
    }

    // 2. Close buttons
    const closeBtn1 = document.getElementById('closeStorageModalBtn');
    if (closeBtn1) {
      closeBtn1.addEventListener('click', closeStorageModal);
    }

    const closeBtn2 = document.getElementById('closeStorageModalBtn2');
    if (closeBtn2) {
      closeBtn2.addEventListener('click', closeStorageModal);
    }

    // 3. Backdrop overlay click
    const modal = document.getElementById('storageBreakdownModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeStorageModal();
        }
      });
    }

    // 4. Escape key press
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const m = document.getElementById('storageBreakdownModal');
        if (m && m.style.display !== 'none') {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          closeStorageModal();
        }
      }
    });
  }

  // Auto-run on DOM ready in browser
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initStorageModal);
    } else {
      initStorageModal();
    }
  }

  // Export functions globally and for modules
  const exported = {
    formatBytes,
    renderStorageModal,
    fetchStorageBreakdown,
    openStorageModal,
    closeStorageModal,
    initStorageModal
  };

  if (typeof window !== 'undefined') {
    window.StorageModal = exported;
    window.openStorageModal = openStorageModal;
    window.closeStorageModal = closeStorageModal;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
})();
