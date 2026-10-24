// public/js/menu.js

// Function to handle clicking on tag badges (file table or info drawer)
function handleTagClick(targetEl, searchInput) {
    if (!targetEl) return false;
    const tagEl = targetEl.closest ? targetEl.closest('.file-tag-badge, .info-tag-chip') : targetEl;
    if (!tagEl) return false;

    const rawTag = (tagEl.textContent || '').trim().replace(/^#/, '');
    if (!rawTag) return false;

    const sInput = searchInput || (typeof document !== 'undefined' ? document.querySelector('.search-input') : null);
    if (!sInput) return false;

    // Parse current tokens (comma-separated, trimmed, without '#')
    const currentVal = (sInput.value || '').trim();
    let tokens = currentVal ? currentVal.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean) : [];

    const lowerTag = rawTag.toLowerCase();
    const existingIndex = tokens.findIndex(t => t.toLowerCase() === lowerTag);

    if (existingIndex !== -1) {
        // Toggle OFF: remove this tag from the list
        tokens.splice(existingIndex, 1);
    } else {
        // Toggle ON: append this tag to the list
        tokens.push(rawTag);
    }

    sInput.value = tokens.join(', ');

    if (typeof Event !== 'undefined') {
        sInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (typeof sInput.focus === 'function') {
        sInput.focus();
    }
    return true;
}

if (typeof window !== 'undefined') {
    window.handleTagClick = handleTagClick;
}
// ─── Core Folders-on-Top Sorting Engine ───
function sortDriveTable(container, sortCol = 'date', sortDir = 'desc') {
    const tableContainer = container || (typeof document !== 'undefined' ? document.querySelector('.file-table-container') : null);
    if (!tableContainer) return;

    const rows = Array.from(tableContainer.querySelectorAll('.file-row'));
    if (rows.length === 0) return;

    const folders = [];
    const files = [];

    rows.forEach(row => {
        const isFolder = (row.classList && row.classList.contains('folder-row')) ||
                         (row.dataset && (row.dataset.category === 'folder' || row.dataset.type === 'folder'));
        if (isFolder) folders.push(row);
        else files.push(row);
    });

    function getVal(row, col) {
        if (!row) return '';
        if (col === 'name') {
            return ((row.dataset && row.dataset.name) || (row.querySelector && row.querySelector('.file-name')?.textContent) || '').toLowerCase().trim();
        }
        if (col === 'owner') {
            return ((row.dataset && row.dataset.owner) || (row.querySelector && row.querySelector('.file-owner')?.textContent) || '').toLowerCase().trim();
        }
        if (col === 'date') {
            const raw = (row.dataset && (row.dataset.date || row.dataset.created)) || (row.querySelector && row.querySelector('.file-date')?.textContent) || '';
            const t = new Date(raw).getTime();
            const lower = String(raw).trim().toLowerCase();
            if (lower === 'just now' || lower === 'recently' || lower === 'today') {
                return Date.now();
            }
            return isNaN(t) ? 0 : t;
        }
        return '';
    }

    function comparator(a, b) {
        const valA = getVal(a, sortCol);
        const valB = getVal(b, sortCol);

        let res = 0;
        if (typeof valA === 'number' && typeof valB === 'number') {
            res = valA - valB;
        } else {
            res = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
        }
        if (res === 0) {
            const nameA = getVal(a, 'name');
            const nameB = getVal(b, 'name');
            return String(nameA).localeCompare(String(nameB), undefined, { numeric: true, sensitivity: 'base' });
        }

        return sortDir === 'desc' ? -res : res;
    }

    folders.sort(comparator);
    files.sort(comparator);

    // Re-append: Folders on Top, Files below
    folders.forEach(row => tableContainer.appendChild(row));
    files.forEach(row => tableContainer.appendChild(row));

    // Update Header UI
    const headerCols = tableContainer.querySelectorAll ? tableContainer.querySelectorAll('.sortable-col') : (typeof document !== 'undefined' ? document.querySelectorAll('.sortable-col') : []);
    if (headerCols && headerCols.length > 0) {
        headerCols.forEach(col => {
            const cSort = col.dataset ? col.dataset.sort : '';
            const iconEl = col.querySelector ? col.querySelector('.sort-icon') : null;
            if (cSort === sortCol) {
                if (col.classList && col.classList.add) col.classList.add('sort-active');
                if (iconEl) {
                    iconEl.innerHTML = sortDir === 'asc' ? '<i class="fas fa-arrow-up"></i>' : '<i class="fas fa-arrow-down"></i>';
                }
            } else {
                if (col.classList && col.classList.remove) col.classList.remove('sort-active');
                if (iconEl) {
                    iconEl.innerHTML = '<i class="fas fa-sort"></i>';
                }
            }
        });
    }
}

if (typeof window !== 'undefined') {
    window.sortDriveTable = sortDriveTable;
}

if (typeof document !== 'undefined') {
document.addEventListener('DOMContentLoaded', () => {
    // ฟังก์ชันคำนวณตำแหน่ง Dropdown เพื่อให้อยู่ในหน้าจอเสมอ (auto-dropup เมื่อขอบล่างไม่พอ)
    function positionDropdown(dropdown, anchorEl) {
        if (!dropdown) return;
        dropdown.classList.remove('dropup');
        dropdown.classList.add('show');

        const rect = dropdown.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        const anchorRect = anchorEl ? anchorEl.getBoundingClientRect() : null;

        const spaceBelow = anchorRect ? (viewportHeight - anchorRect.bottom) : (viewportHeight - rect.top);
        const spaceAbove = anchorRect ? anchorRect.top : rect.top;

        // ถ้าเมนูล้นขอบล่างหน้าจอ หรือพื้นที่ด้านล่างไม่พอ และด้านบนมีที่ว่างมากกว่า
        if (rect.bottom > viewportHeight - 12 || (spaceBelow < rect.height + 8 && spaceAbove > spaceBelow)) {
            dropdown.classList.add('dropup');
        }
    }

    function closeAllDropdowns() {
        document.querySelectorAll('.options-dropdown, .new-options-dropdown').forEach(d => {
            d.classList.remove('show');
            d.classList.remove('dropup');
        });
        document.querySelectorAll('.file-row').forEach(row => row.classList.remove('has-open-menu'));
        document.querySelectorAll('.options-wrapper, .new-action-wrapper').forEach(w => w.classList.remove('has-open-menu'));
    }

    // ปุ่มสำหรับเปิด Dropdown (ใช้ Event Delegation เพื่อรองรับทั้งไฟล์เดิมและไฟล์ที่เพิ่งอัปโหลด)
    document.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.toggle-options');
        if (toggleBtn) {
            e.stopPropagation();
            const dropdown = toggleBtn.nextElementSibling;
            const isAlreadyOpen = dropdown && dropdown.classList.contains('show');

            // ปิด dropdown อื่นๆ ทั้งหมด
            closeAllDropdowns();

            // สลับสถานะของ dropdown ปัจจุบัน
            if (dropdown && !isAlreadyOpen) {
                positionDropdown(dropdown, toggleBtn);
                const parentRow = toggleBtn.closest('.file-row');
                if (parentRow) parentRow.classList.add('has-open-menu');
                const parentWrapper = toggleBtn.closest('.options-wrapper');
                if (parentWrapper) parentWrapper.classList.add('has-open-menu');
            }
            return;
        }

        // หากคลิกปุ่ม copy link หรือ download ใน dropdown อย่าเพิ่งปิด dropdown ทันที เพื่อให้ผู้ใช้เห็นข้อความ Copied! / Downloaded!
        if (e.target.closest('.copy-link-action, .copy-share-link-btn, .download-action, .download-text')) {
            return;
        }

        // คลิกที่อื่นในหน้าเว็บ ให้ปิด Dropdown ทั้งหมด
        closeAllDropdowns();
    });

    // ปุ่มสำหรับเปิด Dropdown ของ + New
    const btnNew = document.querySelector('.btn-new');
    const newOptionsDropdown = document.getElementById('newOptionsDropdown');

    if (btnNew && newOptionsDropdown) {
        btnNew.addEventListener('click', (e) => {
            e.stopPropagation();
            const isAlreadyOpen = newOptionsDropdown.classList.contains('show');

            closeAllDropdowns();

            if (!isAlreadyOpen) {
                positionDropdown(newOptionsDropdown, btnNew);
                const parentWrapper = btnNew.closest('.new-action-wrapper');
                if (parentWrapper) parentWrapper.classList.add('has-open-menu');
            }
        });
    }

    // เมื่อ resize หน้าจอ ให้คำนวณตำแหน่งใหม่หากมี dropdown เปิดอยู่
    window.addEventListener('resize', () => {
        const activeDropdown = document.querySelector('.options-dropdown.show, .new-options-dropdown.show');
        if (activeDropdown) {
            const toggleBtn = activeDropdown.previousElementSibling;
            positionDropdown(activeDropdown, toggleBtn);
        }
    });

    // กดปุ่ม Share เพื่อเปิด Modal (ใช้ Event Delegation เพื่อรองรับไฟล์ที่เพิ่มเข้ามาใหม่ด้วย)
    document.addEventListener('click', (e) => {
        const shareBtn = e.target.closest('.open-share-modal');
        if (shareBtn) {
            e.stopPropagation();
            const shareModal = document.getElementById('shareModal');
            if (shareModal) {
                shareModal.style.display = 'flex';

                // อ่านข้อมูล Access List จาก attribute data-access ของปุ่มที่ถูกคลิก
                let fileAccessList = [];
                try {
                    if (shareBtn.dataset.access) {
                        fileAccessList = JSON.parse(decodeURIComponent(shareBtn.dataset.access));
                    }
                } catch (err) {
                    console.error("Failed to parse access list", err);
                }

                // เรียกใช้ฟังก์ชันที่ประกาศไว้ใน share-modal.js พร้อมส่ง shareBtn อ้างอิง
                if (window.renderAccessList) {
                    window.renderAccessList(fileAccessList, shareBtn);
                }

                // Fetch fresh access list from backend to ensure up-to-date persistence
                const fileId = shareBtn.dataset.id;
                if (fileId) {
                    fetch(`/api/files/${fileId}/access`)
                        .then(res => res.json())
                        .then(data => {
                            if (data.success && Array.isArray(data.accessList)) {
                                shareBtn.dataset.access = encodeURIComponent(JSON.stringify(data.accessList));
                                if (window.renderAccessList) {
                                    window.renderAccessList(data.accessList, shareBtn);
                                }
                            }
                        })
                        .catch(err => console.warn('Failed to fetch fresh access list:', err));
                }
            }

            // ปิด Dropdown
            const dropdown = shareBtn.closest('.options-dropdown');
            if (dropdown) dropdown.classList.remove('show');
        }
    });

    // กดปุ่ม Copy link หรือ Download ใน Dropdown (ใช้ Event Delegation เพื่อรองรับทั้งไฟล์เดิมและไฟล์ที่เพิ่มเข้ามาใหม่)
    document.addEventListener('click', (e) => {
        // Copy link
        const copyBtn = e.target.closest('.copy-link-action');
        if (copyBtn) {
            e.stopPropagation();
            const textSpan = copyBtn.querySelector('.copy-link-text') || copyBtn;
            const originalText = textSpan.textContent;
            textSpan.textContent = 'Generating...';

            const fileId = copyBtn.dataset.id;
            if (fileId) {
                fetch('/api/shares', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ file_id: fileId, expireHours: 24, maxDownloads: 0 })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.shareUrl) {
                        const fullUrl = window.location.origin + data.shareUrl;
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            navigator.clipboard.writeText(fullUrl);
                        }
                        if (window.showToast) {
                            window.showToast('Share link copied to clipboard!', 'success');
                        }
                        textSpan.textContent = 'Copied!';
                        if (window.markFileAsShared) {
                            window.markFileAsShared(fileId, data);
                        }
                    } else {
                        textSpan.textContent = originalText;
                    }
                })
                .catch(err => {
                    console.error('Quick copy share link failed:', err);
                    textSpan.textContent = originalText;
                })
                .finally(() => {
                    setTimeout(() => {
                        textSpan.textContent = originalText;
                    }, 1500);
                });
            } else {
                textSpan.textContent = 'Copied!';
                setTimeout(() => {
                    textSpan.textContent = originalText;
                }, 1000);
            }
            return;
        }

        // Download
        const downloadActionEl = e.target.closest('.download-action');
        if (downloadActionEl) {
            e.stopPropagation();
            const textSpan = downloadActionEl.querySelector('.download-text') || downloadActionEl;
            const originalText = textSpan.textContent;
            const targetId = downloadActionEl.dataset.id;
            const filename = downloadActionEl.dataset.filename || 'downloaded-file';
            const isFolder = downloadActionEl.dataset.type === 'folder' ||
                             Boolean(downloadActionEl.closest('.folder-options')) ||
                             Boolean(downloadActionEl.closest('.folder-row'));

            (async () => {
                try {
                    if (isFolder) {
                        textSpan.textContent = 'Preparing ZIP...';
                        if (window.showToast) {
                            window.showToast(`Preparing folder ZIP download for "${filename}"...`, 'info');
                        }

                        if (targetId) {
                            const a = document.createElement('a');
                            a.href = `/api/folders/${encodeURIComponent(targetId)}/download-zip`;
                            a.download = `${filename}.zip`;
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                        }
                        textSpan.textContent = 'Downloaded!';
                        setTimeout(() => { textSpan.textContent = originalText; }, 1500);
                        return;
                    }

                    textSpan.textContent = 'Downloading...';
                    if (targetId) {
                        const res = await fetch(`/api/files/${targetId}/download-url`);
                        const data = await res.json();
                        if (!res.ok || !data.success) {
                            throw new Error(data.error || 'Failed to get download URL');
                        }

                        // Trigger download
                        const a = document.createElement('a');
                        a.href = data.downloadUrl;
                        a.download = data.filename || filename;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();

                        if (window.showToast) {
                            window.showToast(`Downloading "${data.filename || filename}"`, 'info');
                        }
                    } else {
                        // Fallback simulated download for items without ID
                        const a = document.createElement('a');
                        a.href = `/mock-download/${encodeURIComponent(filename)}`;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                    }

                    textSpan.textContent = 'Downloaded!';
                } catch (err) {
                    console.error('Download error:', err);
                    textSpan.textContent = originalText;
                    if (window.showToast) {
                        window.showToast(`Download failed: ${err.message}`, 'error');
                    }
                } finally {
                    setTimeout(() => {
                        textSpan.textContent = originalText;
                    }, 1200);
                }
            })();
            return;
        }

        // Copy Share Link (from Shared By Me menu)
        const copyShareBtn = e.target.closest('.copy-share-link-btn');
        if (copyShareBtn) {
            e.stopPropagation();
            const textSpan = copyShareBtn.querySelector('.copy-link-text') || copyShareBtn;
            const originalText = textSpan.textContent;
            const shareUrl = copyShareBtn.dataset.url;
            if (shareUrl) {
                const fullUrl = window.location.origin + shareUrl;
                try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(fullUrl);
                    } else {
                        const tempInput = document.createElement('input');
                        tempInput.value = fullUrl;
                        document.body.appendChild(tempInput);
                        tempInput.select();
                        document.execCommand('copy');
                        tempInput.remove();
                    }
                    if (window.showToast) {
                        window.showToast('Share link copied to clipboard!', 'success');
                    }
                    textSpan.textContent = 'Copied!';
                } catch (clipErr) {
                    console.warn('Copy share link error:', clipErr);
                } finally {
                    setTimeout(() => {
                        textSpan.textContent = originalText;
                    }, 1500);
                }
            }
            return;
        }

        // Stop Sharing action (from Drive menu or Shared By Me menu)
        const stopShareBtn = e.target.closest('.stop-sharing-action');
        if (stopShareBtn) {
            e.preventDefault();
            e.stopPropagation();
            closeAllDropdowns();

            const shareId = stopShareBtn.dataset.shareId;
            const filename = stopShareBtn.dataset.filename || 'this file';

            if (!shareId) {
                if (window.showToast) window.showToast('Share link ID not found', 'error');
                return;
            }

            if (window.showConfirmModal) {
                window.showConfirmModal({
                    title: 'Stop Sharing',
                    messageHtml: `Are you sure you want to stop sharing <span class="confirm-highlight">"${filename}"</span>?<br><br>The public link will be deactivated immediately and anyone with the link will lose access.`,
                    warning: 'This will revoke the shared link immediately.',
                    confirmText: 'Stop Sharing',
                    confirmType: 'danger',
                    onConfirm: async () => {
                        try {
                            const res = await fetch(`/api/shares/${shareId}`, { method: 'DELETE' });
                            const data = await res.json();
                            if (!res.ok || !data.success) throw new Error(data.error || 'Failed to revoke share');

                            if (window.showToast) window.showToast(`Stopped sharing "${filename}"`, 'success');

                            const fileId = stopShareBtn.dataset.fileId;
                            if (window.markFileAsUnshared) {
                                window.markFileAsUnshared(fileId, shareId);
                            }
                        } catch (err) {
                            console.error('Stop share error:', err);
                            if (window.showToast) window.showToast(`Failed: ${err.message}`, 'error');
                        }
                    }
                });
            }
            return;
        }
    });

    // ─── Real-Time DOM Helper: Mark file as Shared ───
    window.markFileAsShared = function(fileId, shareData) {
        if (!fileId) return;
        const trigger = document.querySelector(`[data-id="${fileId}"]`) || document.querySelector(`[data-file-id="${fileId}"]`);
        const row = trigger ? trigger.closest('.file-row') : null;
        if (!row) return;

        const shareId = shareData.shareId || shareData.share_id || '';
        const shareUrl = shareData.shareUrl || `/share/${shareId}`;
        const filename = trigger.dataset.filename || '';
        const hasPassword = Boolean(shareData.hasPassword);
        const expireHours = shareData.expireHours || '24';
        const maxDownloads = shareData.maxDownloads !== undefined ? shareData.maxDownloads : '0';

        // 1. Update or create .shared-badge-inline in .file-name
        const fileNameEl = row.querySelector('.file-name');
        if (fileNameEl) {
            let badge = fileNameEl.querySelector('.shared-badge-inline');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'shared-badge-inline open-share-modal';
                badge.title = 'Click to edit share settings';
                badge.innerHTML = '<i class="fas fa-link"></i> Shared';
                fileNameEl.appendChild(badge);
            }
            badge.dataset.id = fileId;
            badge.dataset.shareId = shareId;
            badge.dataset.filename = filename;
            badge.dataset.mode = 'edit';
            badge.dataset.expireHours = expireHours;
            badge.dataset.maxDownloads = maxDownloads;
            badge.dataset.hasPassword = hasPassword ? 'true' : 'false';
            badge.dataset.shareUrl = shareUrl;
            badge.dataset.access = encodeURIComponent(JSON.stringify(shareData.accessList || []));
        }

        // 2. Update .open-share-modal button in dropdown menu
        const shareModalBtn = row.querySelector('.open-share-modal:not(.shared-badge-inline)');
        if (shareModalBtn) {
            shareModalBtn.dataset.mode = 'edit';
            shareModalBtn.dataset.shareId = shareId;
            shareModalBtn.dataset.shareUrl = shareUrl;
            shareModalBtn.dataset.expireHours = expireHours;
            shareModalBtn.dataset.maxDownloads = maxDownloads;
            shareModalBtn.dataset.hasPassword = hasPassword ? 'true' : 'false';
            shareModalBtn.innerHTML = '<i class="fas fa-sliders-h"></i> Edit Share';

            // 3. Add .stop-sharing-action button if not already present
            let stopBtn = row.querySelector('.stop-sharing-action');
            if (!stopBtn) {
                stopBtn = document.createElement('button');
                stopBtn.className = 'option-item stop-sharing-action';
                stopBtn.style.color = '#d32f2f';
                stopBtn.dataset.shareId = shareId;
                stopBtn.dataset.fileId = fileId;
                stopBtn.dataset.filename = filename;
                stopBtn.innerHTML = '<i class="fas fa-link-slash"></i> Stop Sharing';
                shareModalBtn.insertAdjacentElement('afterend', stopBtn);
            } else {
                stopBtn.dataset.shareId = shareId;
                stopBtn.dataset.fileId = fileId;
                stopBtn.dataset.filename = filename;
            }
        }
    };

    // ─── Real-Time DOM Helper: Mark file as Unshared / Stop Sharing ───
    window.markFileAsUnshared = function(fileId, shareId) {
        // If on /shared page
        if (window.location.pathname.includes('/shared')) {
            const targetRow = (shareId ? document.getElementById(`row-share-${shareId}`) : null) || 
                              (fileId ? document.querySelector(`[data-id="${fileId}"]`)?.closest('.file-row') : null);
            if (targetRow) {
                const countEl = document.getElementById('sharedByMeCount');
                if (countEl) {
                    const curr = parseInt(countEl.textContent, 10) || 0;
                    countEl.textContent = Math.max(0, curr - 1);
                }
                if (window.animateRowRemoval) {
                    window.animateRowRemoval(targetRow, 'You haven\'t shared any files yet. Share files from My Drive to see them here.', '#sharedByMeTable');
                } else {
                    targetRow.remove();
                }
                setTimeout(() => {
                    if (window.updateSharedTabCounts) window.updateSharedTabCounts();
                }, 350);
            }
            return;
        }

        // If on /drive or other pages
        const trigger = (fileId ? document.querySelector(`[data-id="${fileId}"]`) : null) || 
                        (shareId ? document.querySelector(`[data-share-id="${shareId}"]`) : null);
        const row = trigger ? trigger.closest('.file-row') : null;
        if (!row) return;

        // 1. Remove .shared-badge-inline
        const badge = row.querySelector('.shared-badge-inline');
        if (badge) badge.remove();

        // 2. Revert .open-share-modal button to create mode
        const shareModalBtn = row.querySelector('.open-share-modal:not(.shared-badge-inline)');
        if (shareModalBtn) {
            shareModalBtn.dataset.mode = 'create';
            delete shareModalBtn.dataset.shareId;
            delete shareModalBtn.dataset.shareUrl;
            shareModalBtn.innerHTML = '<i class="fas fa-share"></i> Share';
        }

        // 3. Remove .stop-sharing-action button
        const stopBtn = row.querySelector('.stop-sharing-action');
        if (stopBtn) stopBtn.remove();
    };

    // ─── Shared Page Real-Time Tab Counts Helper ───
    window.updateSharedTabCounts = function() {
        const byMeTable = document.getElementById('sharedByMeTable');
        const byMeCountEl = document.getElementById('sharedByMeCount');
        if (byMeTable && byMeCountEl) {
            const rows = byMeTable.querySelectorAll('.file-row');
            byMeCountEl.textContent = rows.length;
            if (rows.length === 0 && !byMeTable.querySelector('.empty-state')) {
                const emptyEl = document.createElement('div');
                emptyEl.className = 'empty-state';
                emptyEl.textContent = "You haven't shared any files yet. Share files from My Drive to see them here.";
                byMeTable.appendChild(emptyEl);
            }
        }

        const withMeTable = document.getElementById('sharedWithMeTable');
        const withMeCountEl = document.getElementById('sharedWithMeCount');
        if (withMeTable && withMeCountEl) {
            const rows = withMeTable.querySelectorAll('.file-row');
            withMeCountEl.textContent = rows.length;
            if (rows.length === 0 && !withMeTable.querySelector('.empty-state')) {
                const emptyEl = document.createElement('div');
                emptyEl.className = 'empty-state';
                emptyEl.textContent = "No files have been shared with you yet.";
                withMeTable.appendChild(emptyEl);
            }
        }
    };

    // ─── Shared Page Tabs Switching & State Persistence ───
    function switchSharedTab(targetId, updateHash = true) {
        const tabBtns = document.querySelectorAll('.shared-tab-btn');
        const panels = document.querySelectorAll('.shared-table-panel');
        if (!tabBtns.length) return;

        tabBtns.forEach(b => {
            if (b.dataset.target === targetId) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });

        panels.forEach(panel => {
            if (panel.id === targetId) {
                panel.style.display = 'flex';
            } else {
                panel.style.display = 'none';
            }
        });

        try {
            localStorage.setItem('shared_active_tab', targetId);
        } catch (e) {}

        if (updateHash) {
            const targetHash = targetId === 'sharedByMeTable' ? '#shared-by-me' : '#shared-with-me';
            if (window.location.hash !== targetHash) {
                if (window.history && window.history.replaceState) {
                    window.history.replaceState(null, '', targetHash);
                } else {
                    window.location.hash = targetHash;
                }
            }
        }
    }
    window.switchSharedTab = switchSharedTab;

    const tabBtns = document.querySelectorAll('.shared-tab-btn');
    if (tabBtns.length > 0) {
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                switchSharedTab(btn.dataset.target, true);
            });
        });

        // Initialize active tab from URL Hash or localStorage
        function initSharedTabState() {
            const currentHash = (window.location.hash || '').toLowerCase();
            let savedTab = null;
            try {
                savedTab = localStorage.getItem('shared_active_tab');
            } catch (e) {}

            if (currentHash === '#shared-by-me' || currentHash === '#by-me') {
                switchSharedTab('sharedByMeTable', false);
            } else if (currentHash === '#shared-with-me' || currentHash === '#with-me') {
                switchSharedTab('sharedWithMeTable', false);
            } else if (savedTab === 'sharedByMeTable') {
                switchSharedTab('sharedByMeTable', true);
            } else {
                switchSharedTab('sharedWithMeTable', false);
            }
        }

        initSharedTabState();
        window.addEventListener('hashchange', initSharedTabState);
    }

    // ─── Real-time Category & Search Filtering (Drive, Shared, Trash) ───
    const searchInput = document.querySelector('.search-input');
    const categoryChips = document.querySelectorAll('#categoryFilters .category-chip');
    let activeCategory = 'all';

    function applyDriveFilters() {
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const queries = query ? query.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean) : [];
        const fileRows = document.querySelectorAll('.file-row');
        let visibleCount = 0;

        // Toggle search clear button visibility
        const searchClearBtn = document.querySelector('.search-clear-btn') || document.getElementById('searchClearBtn');
        if (searchClearBtn) {
            searchClearBtn.style.display = query ? 'flex' : 'none';
        }

        // 0. Update active state on all tag badges and chips
        const allTagBadges = document.querySelectorAll('.file-tag-badge, .info-tag-chip');
        if (allTagBadges && allTagBadges.length > 0) {
            allTagBadges.forEach(badge => {
                const bText = (badge.textContent || '').trim().replace(/^#/, '').toLowerCase();
                const isActive = queries.length > 0 && queries.includes(bText);
                if (badge.classList) {
                    if (isActive) {
                        badge.classList.add('tag-active');
                    } else {
                        badge.classList.remove('tag-active');
                    }
                }
            });
        }

        fileRows.forEach(row => {
            const rowCat = (row.dataset.category || '').toLowerCase();
            const rowTags = (row.dataset.tags || '').toLowerCase();
            const nameEl = row.querySelector('.file-name');
            const name = (row.dataset.name || (nameEl ? nameEl.textContent : '')).toLowerCase();

            // 1. Category match
            let matchCategory = true;
            if (activeCategory !== 'all') {
                if (activeCategory === 'folder') {
                    matchCategory = rowCat === 'folder';
                } else {
                    matchCategory = rowCat === activeCategory;
                }
            }

            // 2. Query match: AND (intersection) across all comma-separated queries
            let matchQuery = true;
            if (queries.length > 0) {
                matchQuery = queries.every(q => name.includes(q) || rowTags.includes(q));
            }

            if (matchCategory && matchQuery) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        });

        // Empty state
        const container = document.querySelector('.file-table-container');
        let emptyEl = document.getElementById('searchNoResultsMsg');
        if (visibleCount === 0 && (query || activeCategory !== 'all')) {
            const message = query 
                ? `No items found matching "${query}"`
                : `No files found in category "${activeCategory}"`;
            if (!emptyEl && container) {
                emptyEl = document.createElement('div');
                emptyEl.id = 'searchNoResultsMsg';
                emptyEl.style.padding = '25px';
                emptyEl.style.textAlign = 'center';
                emptyEl.style.color = '#736b5e';
                emptyEl.style.fontSize = '14px';
                emptyEl.textContent = message;
                container.appendChild(emptyEl);
            } else if (emptyEl) {
                emptyEl.textContent = message;
                emptyEl.style.display = 'block';
            }
        } else if (emptyEl) {
            emptyEl.style.display = 'none';
        }
    }

    // Expose globally
    window.applyDriveFilters = applyDriveFilters;
    // ─── Table Column Sorting State & Persistence ───
    let currentSortCol = 'date';
    let currentSortDir = 'desc';

    try {
        const savedCol = localStorage.getItem('drive_sort_col');
        const savedDir = localStorage.getItem('drive_sort_dir');
        if (savedCol && savedCol !== 'date') {
            currentSortCol = savedCol;
            currentSortDir = savedDir || 'asc';
        } else {
            // Fresh load always enforces Date column to Newest First (desc)
            currentSortCol = 'date';
            currentSortDir = 'desc';
            try {
                localStorage.setItem('drive_sort_col', 'date');
                localStorage.setItem('drive_sort_dir', 'desc');
            } catch (e) {}
        }
    } catch (e) {}

    // Perform initial sort on all table containers
    const tableContainers = document.querySelectorAll('.file-table-container');
    if (tableContainers && tableContainers.length > 0) {
        tableContainers.forEach(container => {
            if (typeof window !== 'undefined' && typeof window.sortDriveTable === 'function') {
                window.sortDriveTable(container, currentSortCol, currentSortDir);
            } else if (typeof sortDriveTable === 'function') {
                sortDriveTable(container, currentSortCol, currentSortDir);
            }
        });
    }

    // Header click event delegation for column sorting
    document.addEventListener('click', (e) => {
        const headerCol = e.target.closest ? e.target.closest('.sortable-col') : null;
        if (headerCol) {
            e.stopPropagation();
            const col = headerCol.dataset ? headerCol.dataset.sort : '';
            if (!col) return;

            if (col === currentSortCol) {
                currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
            } else {
                currentSortCol = col;
                currentSortDir = col === 'date' ? 'desc' : 'asc';
            }

            try {
                localStorage.setItem('drive_sort_col', currentSortCol);
                localStorage.setItem('drive_sort_dir', currentSortDir);
            } catch (e) {}

            const container = headerCol.closest ? headerCol.closest('.file-table-container') : document.querySelector('.file-table-container');
            if (typeof window !== 'undefined' && typeof window.sortDriveTable === 'function') {
                window.sortDriveTable(container, currentSortCol, currentSortDir);
            } else if (typeof sortDriveTable === 'function') {
                sortDriveTable(container, currentSortCol, currentSortDir);
            }

            if (typeof window !== 'undefined' && typeof window.applyDriveFilters === 'function') {
                window.applyDriveFilters();
            } else if (typeof applyDriveFilters === 'function') {
                applyDriveFilters();
            }
        }
    });

    if (categoryChips && categoryChips.length > 0) {
        categoryChips.forEach(chip => {
            chip.addEventListener('click', (e) => {
                e.preventDefault();
                categoryChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                activeCategory = chip.dataset.category || 'all';
                applyDriveFilters();
            });
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', applyDriveFilters);

        // Click listener for one-click search clear button
        document.addEventListener('click', (e) => {
            const clearBtn = e.target.closest ? e.target.closest('.search-clear-btn') : null;
            if (clearBtn) {
                e.stopPropagation();
                if (searchInput) {
                    searchInput.value = '';
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                    if (typeof searchInput.focus === 'function') searchInput.focus();
                }
            }
        });


        // ─── Interactive One-Click Tag Filter (Event Delegation) ───
        document.addEventListener('click', (e) => {
            const tagEl = e.target.closest ? e.target.closest('.file-tag-badge, .info-tag-chip') : null;
            if (tagEl) {
                e.stopPropagation();
                handleTagClick(tagEl, searchInput);
            }
        });
    }

    // ─── Global Sidebar Storage Refresher ───
    window.refreshSidebarStorage = async function() {
        try {
            const res = await fetch('/api/user/storage');
            const data = await res.json();
            if (!res.ok || !data.success) return;

            const storage = data.storage || data;
            const percent = storage.percent || 0;
            const bp = storage.breakdownPercent || {};
            const bf = storage.breakdownFormatted || {};

            const percentLabel = document.querySelector('.storage-percent-label');
            if (percentLabel) percentLabel.textContent = `${percent}%`;

            const textSummary = document.querySelector('.storage-used-quota-text');
            if (textSummary) textSummary.textContent = `${storage.formattedUsed || '0 B'} / ${storage.formattedQuota || '10 GB'}`;

            const popoverTotal = document.querySelector('.popover-total');
            if (popoverTotal) popoverTotal.textContent = `${storage.formattedUsed || '0 B'}`;

            const docVal = document.querySelector('.doc-val');
            if (docVal && bf.document) docVal.textContent = bf.document;

            const imgVal = document.querySelector('.img-val');
            if (imgVal && bf.image) imgVal.textContent = bf.image;

            const codeVal = document.querySelector('.code-val');
            if (codeVal && bf.code) codeVal.textContent = bf.code;

            const archiveVal = document.querySelector('.archive-val');
            if (archiveVal && bf.archive) archiveVal.textContent = bf.archive;

            const otherVal = document.querySelector('.other-val');
            if (otherVal && bf.other) otherVal.textContent = bf.other;

            const freeVal = document.querySelector('.free-val');
            if (freeVal && storage.formattedFree) freeVal.textContent = storage.formattedFree;

            const segDoc = document.querySelector('.storage-seg.seg-doc');
            if (segDoc) segDoc.style.width = `${bp.document || 0}%`;

            const segImg = document.querySelector('.storage-seg.seg-img');
            if (segImg) segImg.style.width = `${bp.image || 0}%`;

            const segCode = document.querySelector('.storage-seg.seg-code');
            if (segCode) segCode.style.width = `${bp.code || 0}%`;

            const segArchive = document.querySelector('.storage-seg.seg-archive');
            if (segArchive) segArchive.style.width = `${bp.archive || 0}%`;

            const segOther = document.querySelector('.storage-seg.seg-other');
            if (segOther) segOther.style.width = `${(bp.other || 0) + (bp.video || 0) + (bp.audio || 0)}%`;
        } catch (e) {
            console.warn('Failed to refresh storage breakdown:', e);
        }
    };

    // Toggle popover on mobile/touch click
    const storageSection = document.getElementById('sidebarStorageSection');
    if (storageSection) {
        storageSection.addEventListener('click', (e) => {
            // If clicking directly on storage, toggle open state
            storageSection.classList.remove('popover-open');
        });
        storageSection.addEventListener('mouseleave', () => {
            storageSection.classList.remove('popover-open');
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#sidebarStorageSection, .sidebar-storage, .storage-popover')) {
                storageSection.classList.remove('popover-open');
            }
        });
    }

    // ─── Folder Navigation ───
    function navigateToFolder(folderId) {
        if (!folderId) return;
        if (window.location.pathname.startsWith('/trash')) return;
        window.location.href = `/drive?folder=${encodeURIComponent(folderId)}`;
    }

    // 1. Double click on folder row
    document.addEventListener('dblclick', (e) => {
        const folderRow = e.target.closest('.folder-row');
        if (folderRow) {
            if (e.target.closest('.options-wrapper, .options-dropdown, button, .open-share-modal, .shared-badge-inline, .file-tag-badge, .info-tag-chip')) return;
            const folderId = folderRow.dataset.id;
            if (folderId) {
                navigateToFolder(folderId);
            }
        }
    });

    // 2. Single click on folder row or folder name
    document.addEventListener('click', (e) => {
        const folderRow = e.target.closest('.folder-row');
        if (folderRow) {
            if (e.target.closest('.options-wrapper, .options-dropdown, button, .open-share-modal, .shared-badge-inline, .file-tag-badge, .info-tag-chip')) return;
            const folderId = folderRow.dataset.id;
            if (folderId) {
                navigateToFolder(folderId);
            }
        }
    });

    // 3. Click 'Open' in folder options dropdown
    document.addEventListener('click', (e) => {
        const openBtn = e.target.closest('.open-folder-action');
        if (openBtn) {
            e.stopPropagation();
            const folderId = openBtn.dataset.id;
            if (folderId) {
                navigateToFolder(folderId);
            }
        }
    });
});
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        handleTagClick,
        sortDriveTable,
        applyDriveFilters: (...args) => {
            if (typeof window !== 'undefined' && typeof window.applyDriveFilters === 'function') {
                return window.applyDriveFilters(...args);
            }
        }
    };
}
