// frontend/public/js/info-drawer.js

(function () {
    let infoDrawer = null;
    let infoDrawerOverlay = null;
    let btnInfoToggle = null;
    let infoCloseBtn = null;
    let activeFile = null;

    // Elements
    let filenameEl, categoryEl, iconEl, previewGraphicEl;
    let propTypeEl, propSizeEl, propStorageEl, propLocationEl, propOwnerEl, propModifiedEl, propCreatedEl;
    let tagsContainerEl, accessStatusEl, accessStatusText;
    let quickPreviewBtn, quickDownloadBtn, manageAccessBtn, editTagsBtn;
    let tabBtns, tabPanes, timelineEl;
    let detailsTabBtn = null, activityTabBtn = null;
    let infoOwnerName, infoOwnerRole, cloudSectionEl;
    
    function initElements() {
        infoDrawer = document.getElementById('infoDrawer');
        infoDrawerOverlay = document.getElementById('infoDrawerOverlay');
        btnInfoToggle = document.getElementById('btnInfoToggle');
        infoCloseBtn = document.getElementById('infoDrawerCloseBtn');

        filenameEl = document.getElementById('infoDrawerFilename');
        categoryEl = document.getElementById('infoDrawerCategory');
        iconEl = document.getElementById('infoDrawerIcon');
        previewGraphicEl = document.getElementById('infoPreviewGraphic');

        propTypeEl = document.getElementById('infoPropType');
        propSizeEl = document.getElementById('infoPropSize');
        propStorageEl = document.getElementById('infoPropStorage');
        propLocationEl = document.getElementById('infoPropLocation');
        propOwnerEl = document.getElementById('infoPropOwner');
        propModifiedEl = document.getElementById('infoPropModified');
        propCreatedEl = document.getElementById('infoPropCreated');

        tagsContainerEl = document.getElementById('infoTagsContainer');
        accessStatusEl = document.getElementById('infoAccessStatus');
        accessStatusText = document.getElementById('infoAccessStatusText');

        quickPreviewBtn = document.getElementById('infoQuickPreviewBtn');
        quickDownloadBtn = document.getElementById('infoQuickDownloadBtn');
        manageAccessBtn = document.getElementById('infoManageAccessBtn');
        editTagsBtn = document.getElementById('infoEditTagsBtn');
        infoOwnerName = document.getElementById('infoOwnerName');
        infoOwnerRole = document.getElementById('infoOwnerRole');
        cloudSectionEl = document.querySelector('.info-section-cloud');

        tabBtns = document.querySelectorAll('.info-tab-btn');
        tabPanes = document.querySelectorAll('.info-tab-pane');
        detailsTabBtn = document.querySelector('.info-tab-btn[data-tab="details"]');
        activityTabBtn = document.querySelector('.info-tab-btn[data-tab="activity"]');
        timelineEl = document.getElementById('infoTimeline');
    }

    // Helper: format bytes
    function formatBytes(bytes) {
        if (!bytes || isNaN(bytes) || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Helper: format date
    function formatDate(dateStr) {
        if (!dateStr || dateStr === '—') return '—';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return dateStr;
        }
    }

    // Helper: get category details
    function getCategoryInfo(filename, isFolder, rawCat) {
        if (isFolder) {
            return {
                label: 'Folder',
                icon: '<i class="fas fa-folder" style="color: #6d533b;"></i>',
                bigIcon: '<i class="fas fa-folder" style="color: #8c7f73; font-size: 54px;"></i>',
                typeStr: 'Folder'
            };
        }
        const ext = (filename || '').split('.').pop().toLowerCase();
        
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
            return {
                label: 'Image',
                icon: '<i class="fas fa-image" style="color: #3b82f6;"></i>',
                bigIcon: '<i class="fas fa-file-image" style="color: #3b82f6; font-size: 54px;"></i>',
                typeStr: `Image (.${ext})`
            };
        }
        if (ext === 'pdf') {
            return {
                label: 'PDF Document',
                icon: '<i class="fas fa-file-pdf" style="color: #ef4444;"></i>',
                bigIcon: '<i class="fas fa-file-pdf" style="color: #ef4444; font-size: 54px;"></i>',
                typeStr: 'Adobe PDF Document (.pdf)'
            };
        }
        if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) {
            return {
                label: 'Word Document',
                icon: '<i class="fas fa-file-word" style="color: #2563eb;"></i>',
                bigIcon: '<i class="fas fa-file-word" style="color: #2563eb; font-size: 54px;"></i>',
                typeStr: `Microsoft Word (.${ext})`
            };
        }
        if (['xls', 'xlsx', 'csv'].includes(ext)) {
            return {
                label: 'Spreadsheet',
                icon: '<i class="fas fa-file-excel" style="color: #16a34a;"></i>',
                bigIcon: '<i class="fas fa-file-excel" style="color: #16a34a; font-size: 54px;"></i>',
                typeStr: `Spreadsheet (.${ext})`
            };
        }
        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
            return {
                label: 'Archive',
                icon: '<i class="fas fa-file-archive" style="color: #d97706;"></i>',
                bigIcon: '<i class="fas fa-file-archive" style="color: #d97706; font-size: 54px;"></i>',
                typeStr: `Archive (.${ext})`
            };
        }
        if (['py', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'sql', 'sh', 'java', 'c', 'cpp'].includes(ext) || rawCat === 'code') {
            return {
                label: 'Code',
                icon: '<i class="fas fa-code" style="color: #8b5cf6;"></i>',
                bigIcon: '<i class="fas fa-file-code" style="color: #8b5cf6; font-size: 54px;"></i>',
                typeStr: `Source Code (.${ext})`
            };
        }
        return {
            label: rawCat || 'Document',
            icon: '<i class="fas fa-file-alt" style="color: #6b7280;"></i>',
            bigIcon: '<i class="fas fa-file-alt" style="color: #6b7280; font-size: 54px;"></i>',
            typeStr: ext ? `File (.${ext})` : 'File'
        };
    }

    function renderDrawerContent(data) {
        if (!infoDrawer) initElements();
        activeFile = data;

        const filename = data.filename || data.name || 'Untitled';
        const isFolder = data.type === 'folder' || (!filename.includes('.') && data.category === 'folder');
        const catInfo = getCategoryInfo(filename, isFolder, data.category);

        // Header
        if (filenameEl) filenameEl.textContent = filename;
        if (categoryEl) categoryEl.textContent = catInfo.label;
        if (iconEl) iconEl.innerHTML = catInfo.icon;

        // Preview Graphic
        if (previewGraphicEl) {
            const ext = filename.split('.').pop().toLowerCase();
            const blobUrl = window.uploadedBlobMap && (window.uploadedBlobMap.get(data.id) || window.uploadedBlobMap.get(filename));
            if (blobUrl && ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
                previewGraphicEl.innerHTML = `<img src="${blobUrl}" alt="${filename}">`;
            } else {
                previewGraphicEl.innerHTML = catInfo.bigIcon;
            }
        }

        // Toggle Quick Preview button (Folders don't have preview)
        if (quickPreviewBtn) {
            quickPreviewBtn.style.display = isFolder ? 'none' : 'inline-flex';
        }

        // Ownership & Role check (Activity history is restricted to owner and admin)
        const currentUserRole = (infoDrawer && infoDrawer.dataset.currentUserRole) || window.currentUserRole || 'user';
        const isAdmin = currentUserRole === 'admin';
        const isOwner = (data.isOwner === true || data.isOwner === 'true' || data.owner === 'me' || data.owner === 'Admin Rick') && data.isOwner !== false && data.isOwner !== 'false';
        const canViewActivity = isOwner || isAdmin;

        // Manage Access button & Edit Tags button only available for owner
        if (manageAccessBtn) {
            manageAccessBtn.style.display = isOwner ? 'inline-block' : 'none';
        }
        if (editTagsBtn) {
            editTagsBtn.style.display = isOwner ? 'inline-block' : 'none';
        }

        // Toggle Activity Tab visibility (Restricted to owner and admin only)
        if (activityTabBtn) {
            activityTabBtn.style.display = canViewActivity ? 'inline-flex' : 'none';
            if (!canViewActivity && activityTabBtn.classList.contains('active')) {
                if (detailsTabBtn) detailsTabBtn.click();
            }
        }

        // Owner Info & Access Section
        if (infoOwnerName) {
            infoOwnerName.textContent = isOwner ? 'Admin Rick (You)' : (data.owner || 'Collaborator');
        }
        if (infoOwnerRole) {
            infoOwnerRole.textContent = isOwner ? 'Owner' : 'Shared by owner';
        }

        // Access Section
        const isShared = data.isShared || data.shareId || data.shareUrl || !isOwner;
        if (accessStatusText) {
            if (isOwner) {
                accessStatusText.textContent = isShared ? 'Shared (Collaborative link active)' : 'Private (Only you have access)';
            } else {
                accessStatusText.textContent = 'Shared with you (Viewer access)';
            }
        }
        if (accessStatusEl) {
            accessStatusEl.style.backgroundColor = isShared ? '#eef7ed' : '#faf6f0';
            accessStatusEl.style.color = isShared ? '#276722' : '#6d533b';
            accessStatusEl.querySelector('i').className = isOwner ? (isShared ? 'fas fa-globe' : 'fas fa-lock') : 'fas fa-user-check';
        }

        // Properties
        if (propTypeEl) propTypeEl.textContent = catInfo.typeStr;
        const sizeFormatted = isFolder ? '—' : formatBytes(data.size || 0);
        if (propSizeEl) propSizeEl.textContent = sizeFormatted;
        if (propStorageEl) {
            propStorageEl.textContent = isOwner ? sizeFormatted : "0 B (Doesn't count against storage)";
        }
        if (propLocationEl) {
            propLocationEl.textContent = isOwner ? (data.location || 'My Drive') : 'Shared with me';
        }
        if (propOwnerEl) propOwnerEl.textContent = isOwner ? 'Admin Rick' : (data.owner || 'Collaborator');
        if (propModifiedEl) propModifiedEl.textContent = formatDate(data.updated || data.updatedAt || data.created);
        if (propCreatedEl) propCreatedEl.textContent = formatDate(data.created || data.createdAt || data.date);

        // Cloud & Security (simplified/hidden for non-owners)
        if (cloudSectionEl) {
            cloudSectionEl.style.display = isOwner ? 'block' : 'none';
        }

        // Tags
        if (tagsContainerEl) {
            tagsContainerEl.innerHTML = '';
            const tags = Array.isArray(data.tags) ? data.tags : (typeof data.tags === 'string' && data.tags ? data.tags.split(',') : []);
            if (tags.length === 0) {
                tagsContainerEl.innerHTML = '<span class="info-tags-empty">No tags assigned</span>';
            } else {
                tags.forEach(tag => {
                    const cleanTag = tag.trim();
                    if (!cleanTag) return;
                    const chip = document.createElement('span');
                    chip.className = 'info-tag-chip';
                    chip.textContent = `#${cleanTag}`;
                    chip.title = `Click to filter by tag: ${cleanTag}`;
                    const currentQuery = (document.querySelector('.search-input')?.value || '').trim().toLowerCase();
                    const activeQueries = currentQuery ? currentQuery.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean) : [];
                    if (activeQueries.includes(cleanTag.toLowerCase())) {
                        chip.classList.add('tag-active');
                    }
                    tagsContainerEl.appendChild(chip);
                });
            }
        }

        // Activity Timeline
        if (timelineEl) {
            const timeStr = formatDate(data.created || data.date || new Date().toISOString());
            const modTimeStr = formatDate(data.updated || data.updatedAt || data.created);
            timelineEl.innerHTML = `
                <div class="info-timeline-item">
                    <span class="info-timeline-dot"><i class="fas fa-eye"></i></span>
                    <div class="info-timeline-content">
                        <span class="info-timeline-action">Details inspected</span>
                        <span class="info-timeline-user">by You</span>
                        <span class="info-timeline-time">Just now</span>
                    </div>
                </div>
                <div class="info-timeline-item">
                    <span class="info-timeline-dot"><i class="fas fa-pen"></i></span>
                    <div class="info-timeline-content">
                        <span class="info-timeline-action">Modified / Synced</span>
                        <span class="info-timeline-user">by ${data.owner || 'Admin Rick'}</span>
                        <span class="info-timeline-time">${modTimeStr}</span>
                    </div>
                </div>
                <div class="info-timeline-item">
                    <span class="info-timeline-dot"><i class="fas fa-cloud-upload-alt"></i></span>
                    <div class="info-timeline-content">
                        <span class="info-timeline-action">Uploaded to EasyDrive S3</span>
                        <span class="info-timeline-user">by ${data.owner || 'Admin Rick'}</span>
                        <span class="info-timeline-time">${timeStr}</span>
                    </div>
                </div>
            `;
        }
    }

    function openDrawer(data) {
        if (!infoDrawer) initElements();
        if (!infoDrawer) return;

        if (data) {
            renderDrawerContent(data);
        }

        infoDrawer.classList.add('open');
        infoDrawer.setAttribute('aria-hidden', 'false');
        if (infoDrawerOverlay) infoDrawerOverlay.style.display = 'block';
        if (btnInfoToggle) btnInfoToggle.classList.add('active');
    }

    function closeDrawer() {
        if (!infoDrawer) return;
        infoDrawer.classList.remove('open');
        infoDrawer.setAttribute('aria-hidden', 'true');
        if (infoDrawerOverlay) infoDrawerOverlay.style.display = 'none';
        if (btnInfoToggle) btnInfoToggle.classList.remove('active');
    }

    function toggleDrawer() {
        if (!infoDrawer) initElements();
        if (!infoDrawer) return;

        if (infoDrawer.classList.contains('open')) {
            closeDrawer();
        } else {
            // If opening and no active file yet, extract from currently focused or first row
            if (!activeFile) {
                const firstRow = document.querySelector('.file-row');
                if (firstRow) {
                    extractRowDataAndOpen(firstRow);
                    return;
                }
            }
            openDrawer(activeFile);
        }
    }

    function extractRowDataAndOpen(row) {
        if (!row) return;
        const id = row.dataset.id || '';
        const name = row.dataset.name || row.querySelector('.file-name-text')?.textContent.trim() || 'File';
        const type = row.dataset.type || (row.classList.contains('folder-row') ? 'folder' : 'file');
        const category = row.dataset.category || '';
        const tags = row.dataset.tags ? row.dataset.tags.split(',') : [];
        const date = row.querySelector('.file-date')?.textContent.trim() || '';
        const owner = row.querySelector('.file-owner')?.textContent.trim() || 'me';

        openDrawer({
            id: id,
            file_id: id,
            name: name,
            filename: name,
            type: type,
            category: category,
            tags: tags,
            date: date,
            created: date,
            updated: date,
            owner: owner
        });
    }

    window.openInfoDrawer = openDrawer;
    window.closeInfoDrawer = closeDrawer;
    window.toggleInfoDrawer = toggleDrawer;

    document.addEventListener('DOMContentLoaded', () => {

    // Global helper to update drawer tags in real-time
    window.updateInfoDrawerTags = function(fileId, newTags) {
        if (activeFile && (activeFile.id === fileId || activeFile.file_id === fileId)) {
            activeFile.tags = newTags;
            const tagsContainer = document.getElementById('infoTagsContainer');
            if (tagsContainer) {
                tagsContainer.innerHTML = '';
                if (!newTags || newTags.length === 0) {
                    tagsContainer.innerHTML = '<span class="info-tags-empty">No tags assigned</span>';
                } else {
                    const currentQuery = (document.querySelector('.search-input')?.value || '').trim().toLowerCase();
                    const activeQueries = currentQuery ? currentQuery.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean) : [];
                    newTags.forEach(tag => {
                        const cleanTag = String(tag).trim();
                        if (!cleanTag) return;
                        const chip = document.createElement('span');
                        chip.className = 'info-tag-chip';
                        chip.textContent = `#${cleanTag}`;
                        chip.title = `Click to filter by tag: ${cleanTag}`;
                        if (activeQueries.includes(cleanTag.toLowerCase())) {
                            chip.classList.add('tag-active');
                        }
                        tagsContainer.appendChild(chip);
                    });
                }
            }
        }
    };

        initElements();

        // Topbar toggle button
        if (btnInfoToggle) {
            btnInfoToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleDrawer();
            });
        }

        // Close button
        if (infoCloseBtn) {
            infoCloseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeDrawer();
            });
        }

        // Click outside on backdrop overlay to close
        if (infoDrawerOverlay) {
            infoDrawerOverlay.addEventListener('click', (e) => {
                e.stopPropagation();
                closeDrawer();
            });
        }

        // Tab Switching
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.dataset.tab;
                tabBtns.forEach(b => b.classList.remove('active'));
                tabPanes.forEach(p => p.classList.remove('active'));

                btn.classList.add('active');
                const targetPane = document.getElementById(targetTab === 'details' ? 'infoTabDetails' : 'infoTabActivity');
                if (targetPane) targetPane.classList.add('active');
            });
        });

        // Quick Preview button inside drawer
        if (quickPreviewBtn) {
            quickPreviewBtn.addEventListener('click', () => {
                if (!activeFile) return;
                if (window.openFilePreview) {
                    window.openFilePreview(activeFile);
                }
            });
        }

        // Quick Download button inside drawer
        if (quickDownloadBtn) {
            quickDownloadBtn.addEventListener('click', () => {
                if (!activeFile) return;
                const fileId = activeFile.id || activeFile.file_id;
                const filename = activeFile.name || activeFile.filename || 'download';
                const downloadUrl = fileId ? `/api/files/download/${fileId}` : `/mock-download/${encodeURIComponent(filename)}`;
                
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                if (window.showToast) window.showToast(`Downloading "${filename}"...`, 'info');
            });
        }

        // Manage Access button inside drawer
        if (manageAccessBtn) {
            manageAccessBtn.addEventListener('click', () => {
                if (!activeFile) return;
                const fileId = activeFile.id || activeFile.file_id;
                const shareModal = document.getElementById('shareModal');
                if (shareModal) {
                    shareModal.style.display = 'flex';
                    if (window.renderAccessList) {
                        const triggerBtn = document.querySelector(`.file-row[data-id="${fileId}"] .open-share-modal, .open-share-modal[data-id="${fileId}"]`);
                        window.renderAccessList(activeFile.accessList || [], triggerBtn);
                    }
                }
            });
        }

        // Edit Tags button inside drawer
        if (editTagsBtn) {
            editTagsBtn.addEventListener('click', () => {
                if (!activeFile) return;
                const fileId = activeFile.id || activeFile.file_id;
                const targetRow = document.querySelector(`.file-row[data-id="${fileId}"]`);
                const triggerBtn = document.querySelector(`.open-tags-modal[data-id="${fileId}"]`);
                if (window.openTagsModalForTarget) {
                    window.openTagsModalForTarget({
                        id: fileId,
                        name: activeFile.name || activeFile.filename,
                        type: activeFile.type || (activeFile.category === 'folder' ? 'folder' : 'file'),
                        tags: activeFile.tags,
                        targetRow,
                        triggerBtn
                    });
                } else if (triggerBtn) {
                    triggerBtn.click();
                }
            });
        }

        // Event delegation: clicking Information from dropdown menus
        document.addEventListener('click', (e) => {
            const infoBtn = e.target.closest('.open-info-drawer');
            if (infoBtn) {
                e.preventDefault();
                e.stopPropagation();

                // Close any open dropdowns
                document.querySelectorAll('.options-dropdown, .new-options-dropdown').forEach(d => {
                    d.classList.remove('show');
                });

                const row = infoBtn.closest('.file-row');
                const fileId = infoBtn.dataset.id || (row && row.dataset.id) || '';
                let filename = infoBtn.dataset.filename || '';
                if (!filename && row) {
                    filename = row.dataset.name || row.querySelector('.file-name-text')?.textContent.trim() || '';
                }

                const type = infoBtn.dataset.type || (row && row.dataset.type) || (filename.includes('.') ? 'file' : 'folder');
                const category = infoBtn.dataset.category || (row && row.dataset.category) || '';
                const tags = infoBtn.dataset.tags || (row && row.dataset.tags) || '';
                const size = infoBtn.dataset.size || (row && row.dataset.size) || '';
                const owner = infoBtn.dataset.owner || (row && row.querySelector('.file-owner')?.textContent.trim()) || 'Admin Rick';
                const created = infoBtn.dataset.created || (row && row.querySelector('.file-date')?.textContent.trim()) || '';

                openDrawer({
                    id: fileId,
                    file_id: fileId,
                    name: filename,
                    filename: filename,
                    type: type,
                    category: category,
                    tags: tags,
                    size: size,
                    owner: owner,
                    created: created,
                    updated: created
                });
            }
        });

        // Clicking on a row updates the drawer, or clicking outside closes it
        document.addEventListener('click', (e) => {
            if (!infoDrawer || !infoDrawer.classList.contains('open')) return;
            // Ignore clicks inside the drawer itself, in menus, or on toggle buttons
            if (e.target.closest('#infoDrawer, #btnInfoToggle, .open-info-drawer, .options-wrapper, .options-dropdown')) return;

            const row = e.target.closest('.file-row');
            if (row) {
                extractRowDataAndOpen(row);
                return;
            }

            // Clicked outside on the page -> close drawer
            closeDrawer();
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && infoDrawer && infoDrawer.classList.contains('open')) {
                e.preventDefault();
                e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                closeDrawer();
            }
        });
    });
})();
