// public/js/menu.js
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
            textSpan.textContent = 'Downloading...';

            const targetId = downloadActionEl.dataset.id;
            const filename = downloadActionEl.dataset.filename || 'downloaded-file';

            (async () => {
                try {
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

                            const targetRow = stopShareBtn.closest('.file-row');
                            if (window.location.pathname.includes('/shared') && targetRow) {
                                // Decrement counter immediately
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
                            } else {
                                setTimeout(() => window.location.reload(), 600);
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

    // ─── Real-time Search Filtering (Drive, Shared, Trash) ───
    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.toLowerCase().trim();
            const fileRows = document.querySelectorAll('.file-row');
            let visibleCount = 0;

            fileRows.forEach(row => {
                const nameEl = row.querySelector('.file-name');
                const name = nameEl ? nameEl.textContent.toLowerCase() : '';
                if (!query || name.includes(query)) {
                    row.style.display = '';
                    visibleCount++;
                } else {
                    row.style.display = 'none';
                }
            });

            // Handle empty state display if no items match
            const container = document.querySelector('.file-table-container');
            let emptyEl = document.getElementById('searchNoResultsMsg');
            if (visibleCount === 0 && query) {
                if (!emptyEl && container) {
                    emptyEl = document.createElement('div');
                    emptyEl.id = 'searchNoResultsMsg';
                    emptyEl.style.padding = '25px';
                    emptyEl.style.textAlign = 'center';
                    emptyEl.style.color = '#736b5e';
                    emptyEl.style.fontSize = '14px';
                    emptyEl.textContent = `No items found matching "${query}"`;
                    container.appendChild(emptyEl);
                } else if (emptyEl) {
                    emptyEl.textContent = `No items found matching "${query}"`;
                    emptyEl.style.display = 'block';
                }
            } else if (emptyEl) {
                emptyEl.style.display = 'none';
            }
        });
    }
});
