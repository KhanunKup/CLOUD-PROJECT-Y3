// public/js/rename-modal.js
document.addEventListener('DOMContentLoaded', () => {
    const renameModal = document.getElementById('renameModal');
    const renameInput = document.getElementById('renameInput');
    const cancelBtn = document.getElementById('renameCancelBtn');
    const confirmBtn = document.getElementById('renameConfirmBtn');

    let currentTargetRow = null;
    let currentRenameBtn = null;

    // เปิด Rename Modal เมื่อกดปุ่ม Rename จาก Dropdown
    document.addEventListener('click', (e) => {
        const renameBtn = e.target.closest('.open-rename-modal');
        if (renameBtn) {
            e.stopPropagation();

            // ปิด dropdown ทั้งหมด
            document.querySelectorAll('.options-dropdown').forEach(dropdown => {
                dropdown.classList.remove('show');
            });

            currentTargetRow = renameBtn.closest('.file-row');
            currentRenameBtn = renameBtn;

            let currentName = renameBtn.dataset.filename;
            if (!currentName && currentTargetRow) {
                const nameSpan = currentTargetRow.querySelector('.col-name');
                if (nameSpan) {
                    // ดึงเฉพาะ text ไม่เอา icon
                    const clone = nameSpan.cloneNode(true);
                    const icon = clone.querySelector('i');
                    if (icon) icon.remove();
                    currentName = clone.textContent.trim();
                }
            }

            if (renameModal && renameInput) {
                renameInput.value = currentName || 'File';
                renameModal.style.display = 'flex';
                
                // Focus และ select ข้อความเพื่อให้พิมพ์ทับได้ทันที
                setTimeout(() => {
                    renameInput.focus();
                    // ถ้ามีนามสกุลไฟล์ ให้ highlight เฉพาะชื่อไฟล์ ไม่รวม extension
                    const val = renameInput.value;
                    const lastDot = val.lastIndexOf('.');
                    if (lastDot > 0) {
                        renameInput.setSelectionRange(0, lastDot);
                    } else {
                        renameInput.select();
                    }
                }, 50);
            }
        }
    });

    const closeRenameModal = () => {
        if (renameModal) {
            renameModal.style.display = 'none';
        }
        currentTargetRow = null;
        currentRenameBtn = null;
    };

    const submitRename = () => {
        const newName = renameInput ? renameInput.value.trim() : '';
        if (newName && currentTargetRow) {
            const nameSpan = currentTargetRow.querySelector('.col-name');
            if (nameSpan) {
                const icon = nameSpan.querySelector('i');
                nameSpan.innerHTML = '';
                if (icon) {
                    nameSpan.appendChild(icon);
                    nameSpan.append(' ');
                }
                nameSpan.append(newName);
            }
            if (currentRenameBtn) {
                currentRenameBtn.dataset.filename = newName;
            }
        }
        closeRenameModal();
    };

    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeRenameModal);
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', submitRename);
    }

    if (renameInput) {
        renameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitRename();
            } else if (e.key === 'Escape') {
                closeRenameModal();
            }
        });
    }

    if (renameModal) {
        renameModal.addEventListener('click', (e) => {
            if (e.target === renameModal) {
                closeRenameModal();
            }
        });
    }
});
