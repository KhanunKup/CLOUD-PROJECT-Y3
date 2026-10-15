// public/js/delete-forever-modal.js
document.addEventListener('DOMContentLoaded', () => {
    const deleteForeverModal = document.getElementById('deleteForeverModal');
    const deleteForeverTargetName = document.getElementById('deleteForeverTargetName');
    const cancelBtn = document.getElementById('deleteForeverCancelBtn');
    const confirmBtn = document.getElementById('deleteForeverConfirmBtn');

    let currentTargetRow = null;
    let currentTargetId = null;

    // เปิด Delete Forever Modal เมื่อกดปุ่ม Delete Forever ในเมนู 3 จุดของหน้า Trash
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('.delete-forever-action');
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
            currentTargetId = trigger.dataset.id || null;

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

            if (deleteForeverTargetName) {
                deleteForeverTargetName.textContent = filename ? `"${filename}"` : 'this item';
            }

            if (deleteForeverModal) {
                deleteForeverModal.style.display = 'flex';
            }
        }
    });

    const closeDeleteForeverModal = () => {
        if (deleteForeverModal) {
            deleteForeverModal.style.display = 'none';
        }
        currentTargetRow = null;
        currentTargetId = null;
    };

    if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeDeleteForeverModal();
        });
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', (e) => {
            e.stopPropagation();

            const rowToDelete = currentTargetRow;
            const targetId = currentTargetId;
            closeDeleteForeverModal();

            // ส่งคำขอลบไปยัง backend ใน background เพื่อรักษาความสอดคล้องของข้อมูล
            if (targetId) {
                fetch(`/trash/delete/${targetId}`).catch(() => {});
            }

            if (rowToDelete) {
                // อนิเมชันเลือนหายพร้อมยุบความสูงลง เพื่อให้รายการด้านล่างเลื่อนขึ้นมาแทนที่อย่างนุ่มนวล
                rowToDelete.style.transition = 'all 0.3s ease';
                rowToDelete.style.opacity = '0';
                rowToDelete.style.transform = 'translateX(20px)';
                rowToDelete.style.height = '0px';
                rowToDelete.style.minHeight = '0px';
                rowToDelete.style.paddingTop = '0px';
                rowToDelete.style.paddingBottom = '0px';
                rowToDelete.style.borderBottom = 'none';
                rowToDelete.style.overflow = 'hidden';

                setTimeout(() => {
                    if (rowToDelete && rowToDelete.parentNode) {
                        rowToDelete.remove();
                    }

                    // หากไม่เหลือแถวไฟล์ในตาราง ให้แสดง empty state และซ่อนปุ่ม Empty Trash
                    const remainingRows = document.querySelectorAll('.trash-table .file-row, .file-table-container .file-row');
                    if (remainingRows.length === 0) {
                        const tableContainer = document.querySelector('.trash-table, .file-table-container');
                        if (tableContainer && !tableContainer.querySelector('.empty-state')) {
                            const emptyEl = document.createElement('div');
                            emptyEl.className = 'empty-state';
                            emptyEl.textContent = 'Trash is empty.';
                            tableContainer.appendChild(emptyEl);
                        }

                        const emptyTrashBtn = document.querySelector('.btn-empty-trash');
                        if (emptyTrashBtn) {
                            emptyTrashBtn.closest('form')?.remove();
                        }
                    }
                }, 300);
            }
        });
    }

    // คลิกด้านนอก Modal เพื่อปิด
    if (deleteForeverModal) {
        deleteForeverModal.addEventListener('click', (e) => {
            if (e.target === deleteForeverModal) {
                closeDeleteForeverModal();
            }
        });
    }

    // กด Esc เพื่อปิด
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && deleteForeverModal && deleteForeverModal.style.display === 'flex') {
            closeDeleteForeverModal();
        }
    });
});
