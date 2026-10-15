// public/js/delete-modal.js
document.addEventListener('DOMContentLoaded', () => {
    const deleteModal = document.getElementById('deleteModal');
    const deleteTargetName = document.getElementById('deleteTargetName');
    const cancelBtn = document.getElementById('deleteCancelBtn');
    const confirmBtn = document.getElementById('deleteConfirmBtn');

    let currentTargetRow = null;
    let currentDeleteBtn = null;

    // เปิด Delete Modal เมื่อกดปุ่ม Move to Trash จาก Dropdown
    document.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.open-delete-modal, .move-to-trash-action');
        if (deleteBtn) {
            e.stopPropagation();

            // ปิด dropdown ทั้งหมด
            document.querySelectorAll('.options-dropdown, .new-options-dropdown').forEach(dropdown => {
                dropdown.classList.remove('show');
                dropdown.classList.remove('dropup');
            });
            document.querySelectorAll('.file-row').forEach(row => row.classList.remove('has-open-menu'));

            currentTargetRow = deleteBtn.closest('.file-row');
            currentDeleteBtn = deleteBtn;

            // ดึงชื่อไฟล์/โฟลเดอร์
            let filename = deleteBtn.dataset.filename;
            if (!filename && currentTargetRow) {
                const nameEl = currentTargetRow.querySelector('.file-name, .col-name');
                if (nameEl) {
                    const clone = nameEl.cloneNode(true);
                    // ตัด icon svg หรือ i ออก
                    clone.querySelectorAll('svg, i').forEach(icon => icon.remove());
                    filename = clone.textContent.trim();
                }
            }

            if (deleteTargetName) {
                deleteTargetName.textContent = filename ? `"${filename}"` : 'this item';
            }

            if (deleteModal) {
                deleteModal.style.display = 'flex';
            }
        }
    });

    const closeDeleteModal = () => {
        if (deleteModal) {
            deleteModal.style.display = 'none';
        }
        currentTargetRow = null;
        currentDeleteBtn = null;
    };

    if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeDeleteModal();
        });
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();

            const rowToDelete = currentTargetRow;
            closeDeleteModal();

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

                    // หากไม่เหลือแถวไฟล์ในตาราง ให้แสดง empty state
                    const remainingRows = document.querySelectorAll('.file-table-container .file-row, .file-container .file-row');
                    if (remainingRows.length === 0) {
                        const tableContainer = document.querySelector('.file-table-container, .file-container');
                        if (tableContainer && !tableContainer.querySelector('.empty-state')) {
                            const emptyEl = document.createElement('div');
                            emptyEl.className = 'empty-state';
                            emptyEl.textContent = 'No files found.';
                            tableContainer.appendChild(emptyEl);
                        }
                    }
                }, 300);
            }
        });
    }

    // คลิกด้านนอก Modal เพื่อปิด
    if (deleteModal) {
        deleteModal.addEventListener('click', (e) => {
            if (e.target === deleteModal) {
                closeDeleteModal();
            }
        });
    }

    // กด Esc เพื่อปิด
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && deleteModal && deleteModal.style.display === 'flex') {
            closeDeleteModal();
        }
    });
});
