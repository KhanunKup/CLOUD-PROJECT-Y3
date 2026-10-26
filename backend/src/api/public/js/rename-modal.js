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
                const nameEl = currentTargetRow.querySelector('.file-name, .col-name');
                if (nameEl) {
                    const clone = nameEl.cloneNode(true);
                    clone.querySelectorAll('svg, i').forEach(icon => icon.remove());
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

    const submitRename = async () => {
        const newName = renameInput ? renameInput.value.trim() : '';
        const targetId = currentRenameBtn ? currentRenameBtn.dataset.id : null;
        const rowToUpdate = currentTargetRow;
        const btnToUpdate = currentRenameBtn;

        if (!newName) {
            closeRenameModal();
            return;
        }

        closeRenameModal();

        try {
            if (targetId) {
                const res = await fetch(`/api/files/${targetId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: newName })
                });
                const data = await res.json();
                if (!res.ok || !data.success) {
                    throw new Error(data.error || 'Failed to rename file');
                }
            }

            if (rowToUpdate) {
                const nameEl = rowToUpdate.querySelector('.file-name, .col-name');
                if (nameEl) {
                    const icon = nameEl.querySelector('svg, i');
                    nameEl.innerHTML = '';
                    if (icon) {
                        nameEl.appendChild(icon);
                        nameEl.append(' ');
                    }
                    nameEl.append(newName);
                }
                if (btnToUpdate) {
                    btnToUpdate.dataset.filename = newName;
                }
                const allMenuBtns = rowToUpdate.querySelectorAll('[data-filename]');
                allMenuBtns.forEach(btn => btn.dataset.filename = newName);
            }

            if (window.showToast) {
                window.showToast(`Renamed to "${newName}" successfully!`, 'success');
            }
        } catch (err) {
            console.error('Rename error:', err);
            if (window.showToast) {
                window.showToast(`Failed to rename: ${err.message}`, 'error');
            }
        }
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
