// public/js/restore-modal.js
document.addEventListener('DOMContentLoaded', () => {
    const restoreModal = document.getElementById('restoreModal');
    const restoreTargetName = document.getElementById('restoreTargetName');
    const cancelBtn = document.getElementById('restoreCancelBtn');
    const confirmBtn = document.getElementById('restoreConfirmBtn');

    let currentTargetRow = null;
    let currentTargetId = null;

    // เปิด Restore Modal เมื่อกดปุ่ม Restore ในตาราง หรือในเมนู 3 จุด
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('.btn-restore, .restore-trash-action');
        if (trigger) {
            e.preventDefault();
            e.stopPropagation();

            // ปิด dropdown ทั้งหมด
            document.querySelectorAll('.options-dropdown, .new-options-dropdown').forEach(dropdown => {
                dropdown.classList.remove('show');
                dropdown.classList.remove('dropup');
            });
            document.querySelectorAll('.file-row').forEach(row => row.classList.remove('has-open-menu'));

            currentTargetRow = trigger.closest('.file-row');
            currentTargetId = trigger.dataset.id || trigger.getAttribute('href')?.split('/').pop() || null;

            // ดึงชื่อไฟล์/โฟลเดอร์
            let filename = trigger.dataset.filename;
            if (!filename && currentTargetRow) {
                const nameEl = currentTargetRow.querySelector('.file-name, .col-name');
                if (nameEl) {
                    const clone = nameEl.cloneNode(true);
                    clone.querySelectorAll('svg, i').forEach(icon => icon.remove());
                    filename = clone.textContent.trim();
                }
            }

            if (restoreTargetName) {
                restoreTargetName.textContent = filename ? `"${filename}"` : 'this item';
            }

            if (restoreModal) {
                restoreModal.style.display = 'flex';
            }
        }
    });

    const closeRestoreModal = () => {
        if (restoreModal) {
            restoreModal.style.display = 'none';
        }
        currentTargetRow = null;
        currentTargetId = null;
    };

    if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeRestoreModal();
        });
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', (e) => {
            e.stopPropagation();

            const rowToRestore = currentTargetRow;
            const targetId = currentTargetId;
            closeRestoreModal();

            if (rowToRestore) {
                // อนิเมชันเลือนหายพร้อมยุบความสูงลง เพื่อให้รายการด้านล่างเลื่อนขึ้นมาแทนที่อย่างนุ่มนวล
                rowToRestore.style.transition = 'all 0.3s ease';
                rowToRestore.style.opacity = '0';
                rowToRestore.style.transform = 'translateX(20px)';
                rowToRestore.style.height = '0px';
                rowToRestore.style.minHeight = '0px';
                rowToRestore.style.paddingTop = '0px';
                rowToRestore.style.paddingBottom = '0px';
                rowToRestore.style.borderBottom = 'none';
                rowToRestore.style.overflow = 'hidden';

                setTimeout(() => {
                    if (rowToRestore && rowToRestore.parentNode) {
                        rowToRestore.remove();
                    }

                    // หากไม่เหลือแถวไฟล์ในตาราง ให้แสดง empty state
                    const remainingRows = document.querySelectorAll('.trash-table .file-row, .file-table-container .file-row');
                    if (remainingRows.length === 0) {
                        const tableContainer = document.querySelector('.trash-table, .file-table-container');
                        if (tableContainer && !tableContainer.querySelector('.empty-state')) {
                            const emptyEl = document.createElement('div');
                            emptyEl.className = 'empty-state';
                            emptyEl.textContent = 'Trash is empty.';
                            tableContainer.appendChild(emptyEl);
                        }
                    }
                }, 300);
            }
        });
    }

    // คลิกด้านนอก Modal เพื่อปิด
    if (restoreModal) {
        restoreModal.addEventListener('click', (e) => {
            if (e.target === restoreModal) {
                closeRestoreModal();
            }
        });
    }

    // กด Esc เพื่อปิด
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && restoreModal && restoreModal.style.display === 'flex') {
            closeRestoreModal();
        }
    });
});
