// public/js/tags-modal.js
document.addEventListener('DOMContentLoaded', () => {
    const tagsModal = document.getElementById('tagsModal');
    const titleEl = document.getElementById('tagsModalTitle');
    const labelEl = document.getElementById('tagsFileLabel');
    const filenameEl = document.getElementById('tagsModalFilename');
    const chipsContainer = document.getElementById('tagsChipsContainer');
    const newTagInput = document.getElementById('tagsNewTagInput');
    const addBtn = document.getElementById('tagsAddBtn');
    const cancelBtn = document.getElementById('tagsCancelBtn');
    const closeBtn = document.getElementById('tagsModalCloseBtn');
    const saveBtn = document.getElementById('tagsSaveBtn');

    let currentFileId = null;
    let currentTargetRow = null;
    let currentTriggerBtn = null;
    let currentTags = [];

    function escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function renderChips() {
        if (!chipsContainer) return;
        chipsContainer.innerHTML = '';

        if (currentTags.length === 0) {
            chipsContainer.innerHTML = '<span style="color: #616a54; font-size: 12.5px; font-style: italic; line-height: 28px;">No tags yet. Add one below!</span>';
            return;
        }

        currentTags.forEach(tag => {
            const chip = document.createElement('div');
            chip.className = 'tags-modal-chip';
            chip.innerHTML = `
                <span>${escapeHtml(tag)}</span>
                <button type="button" class="tags-chip-remove" data-tag="${escapeHtml(tag)}" title="Remove tag">&times;</button>
            `;
            chipsContainer.appendChild(chip);
        });
    }

    function addTagFromInput() {
        if (!newTagInput) return;
        const val = newTagInput.value.trim().toLowerCase();
        if (!val) return;

        // แยก comma ถ้าพิมพ์หลายอันพร้อมกัน เช่น "pdf, report"
        const incomingTags = val.split(',').map(t => t.trim()).filter(t => t.length > 0);
        let addedCount = 0;

        incomingTags.forEach(tag => {
            if (!currentTags.includes(tag)) {
                currentTags.push(tag);
                addedCount++;
            }
        });

        newTagInput.value = '';
        renderChips();
        newTagInput.focus();
    }

    function closeTagsModal() {
        if (tagsModal) tagsModal.style.display = 'none';
        currentFileId = null;
        currentTargetRow = null;
        currentTriggerBtn = null;
        currentTags = [];
        if (newTagInput) newTagInput.value = '';
    }

    // Helper to open Tags Modal for any target (file or folder)
    function openTagsModalForTarget(data = {}) {
        if (!data || !data.id) return;

        // Close any open dropdowns
        document.querySelectorAll('.options-dropdown').forEach(d => d.classList.remove('show'));

        currentFileId = data.id;
        currentTriggerBtn = data.triggerBtn || document.querySelector(`.open-tags-modal[data-id="${data.id}"]`);
        currentTargetRow = data.targetRow || (currentTriggerBtn ? currentTriggerBtn.closest('.file-row') : document.querySelector(`.file-row[data-id="${data.id}"]`));

        const isFolder = data.type === 'folder' ||
                         (currentTriggerBtn && currentTriggerBtn.dataset.type === 'folder') ||
                         (currentTargetRow && currentTargetRow.classList.contains('folder-row'));

        const filename = data.name || (currentTriggerBtn ? currentTriggerBtn.dataset.filename : '') || (currentTargetRow ? currentTargetRow.dataset.name : 'Item');

        if (titleEl) titleEl.textContent = isFolder ? 'Edit Folder Tags' : 'Edit File Tags';
        if (labelEl) labelEl.textContent = isFolder ? 'Folder:' : 'File:';
        if (filenameEl) filenameEl.textContent = filename;

        // Read existing tags
        if (Array.isArray(data.tags)) {
            currentTags = [...data.tags].map(t => String(t).trim().toLowerCase()).filter(Boolean);
        } else {
            const rawTags = (typeof data.tags === 'string' ? data.tags : '') ||
                            (currentTriggerBtn ? currentTriggerBtn.dataset.tags : '') ||
                            (currentTargetRow ? currentTargetRow.dataset.tags : '');
            currentTags = rawTags
                ? rawTags.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0)
                : [];
        }

        renderChips();

        if (tagsModal) {
            tagsModal.style.display = 'flex';
            setTimeout(() => {
                if (newTagInput) newTagInput.focus();
            }, 50);
        }
    }

    window.openTagsModalForTarget = openTagsModalForTarget;

    // เปิด Tags Modal เมื่อกดปุ่ม Edit Tags จาก dropdown
    document.addEventListener('click', (e) => {
        const btn = e.target.closest ? e.target.closest('.open-tags-modal') : null;
        if (btn) {
            e.stopPropagation();
            openTagsModalForTarget({
                id: btn.dataset.id,
                name: btn.dataset.filename,
                type: btn.dataset.type,
                tags: btn.dataset.tags,
                triggerBtn: btn,
                targetRow: btn.closest ? btn.closest('.file-row') : null
            });
        }
    });

    // ลบ tag chip
    if (chipsContainer) {
        chipsContainer.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.tags-chip-remove');
            if (removeBtn) {
                e.stopPropagation();
                const tagToRemove = removeBtn.dataset.tag;
                currentTags = currentTags.filter(t => t !== tagToRemove);
                renderChips();
            }
        });
    }

    // เพิ่ม tag ด้วยปุ่ม Add
    if (addBtn) {
        addBtn.addEventListener('click', (e) => {
            e.preventDefault();
            addTagFromInput();
        });
    }

    // เพิ่ม tag ด้วยปุ่ม Enter ใน input
    if (newTagInput) {
        newTagInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addTagFromInput();
            }
        });
    }

    // ปิด Modal
    if (cancelBtn) cancelBtn.addEventListener('click', closeTagsModal);
    if (closeBtn) closeBtn.addEventListener('click', closeTagsModal);

    if (tagsModal) {
        tagsModal.addEventListener('click', (e) => {
            if (e.target === tagsModal) {
                closeTagsModal();
            }
        });
    }

    // บันทึก Tags (Save)
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            if (!currentFileId) {
                closeTagsModal();
                return;
            }

            const originalBtnHtml = saveBtn.innerHTML;
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

            const fileId = currentFileId;
            const targetRow = currentTargetRow;
            const triggerBtn = currentTriggerBtn;
            const updatedTags = [...currentTags];

            try {
                const res = await fetch(`/api/files/${fileId}/tags`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tags: updatedTags })
                });

                const data = await res.json();
                if (!res.ok || !data.success) {
                    throw new Error(data.error || 'Failed to update tags');
                }

                // ── Real-Time DOM Update ──
                if (targetRow) {
                    // 1. อัปเดต dataset.tags บนแถวของไฟล์
                    targetRow.dataset.tags = updatedTags.join(',');

                    // 2. อัปเดต Tag Badges ข้างชื่อไฟล์
                    let tagsWrapper = targetRow.querySelector ? targetRow.querySelector('.file-tags-wrapper') : null;
                    if (!tagsWrapper && targetRow.querySelector) {
                        const nameEl = targetRow.querySelector('.file-name');
                        if (nameEl && nameEl.appendChild) {
                            tagsWrapper = document.createElement('div');
                            tagsWrapper.className = 'file-tags-wrapper';
                            nameEl.appendChild(tagsWrapper);
                        }
                    }

                    if (tagsWrapper) {
                        tagsWrapper.innerHTML = updatedTags.map(tag => 
                            `<span class="file-tag-badge" title="Click to filter by tag: ${escapeHtml(tag)}">${escapeHtml(tag)}</span>`
                        ).join('');
                    }

                    // 3. อัปเดต data-tags บนทุกปุ่มในแถว
                    if (typeof targetRow.querySelectorAll === 'function') {
                        targetRow.querySelectorAll('.open-tags-modal, .open-info-drawer').forEach(b => {
                            if (b && b.dataset) b.dataset.tags = updatedTags.join(',');
                        });
                    }
                }

                // 4. อัปเดต data-tags บนปุ่มเปิด modal ใน dropdown
                if (triggerBtn && triggerBtn.dataset) {
                    triggerBtn.dataset.tags = updatedTags.join(',');
                }

                // 5. อัปเดต Tags ใน Information Drawer ทันทีหากกำลังเปิดอยู่
                if (typeof window.updateInfoDrawerTags === 'function') {
                    window.updateInfoDrawerTags(fileId, updatedTags);
                }

                // 6. อัปเดตผลลัพธ์การค้นหาทันที
                if (typeof window.applyDriveFilters === 'function') {
                    window.applyDriveFilters();
                }

                if (window.showToast) {
                    window.showToast('Tags updated successfully!', 'success');
                }

                closeTagsModal();
            } catch (err) {
                console.error('Save tags error:', err);
                if (window.showToast) {
                    window.showToast(`Error: ${err.message}`, 'error');
                } else {
                    alert(`Error: ${err.message}`);
                }
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalBtnHtml;
            }
        });
    }
});
