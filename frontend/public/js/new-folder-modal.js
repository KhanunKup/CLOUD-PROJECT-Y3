// public/js/new-folder-modal.js
document.addEventListener('DOMContentLoaded', () => {
    const newFolderModal = document.getElementById('newFolderModal');
    const folderNameInput = document.getElementById('newFolderNameInput');
    const cancelBtn = document.getElementById('newFolderCancelBtn');
    const createBtn = document.getElementById('newFolderCreateBtn');

    // เปิด New Folder Modal
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('.open-new-folder-modal');
        if (trigger) {
            e.stopPropagation();

            // ปิด Dropdown ทั้งหมด
            document.querySelectorAll('.new-options-dropdown, .options-dropdown').forEach(d => {
                d.classList.remove('show');
            });

            if (newFolderModal && folderNameInput) {
                folderNameInput.value = 'Folder #1';
                newFolderModal.style.display = 'flex';

                setTimeout(() => {
                    folderNameInput.focus();
                    folderNameInput.select();
                }, 50);
            }
        }
    });

    const closeNewFolderModal = () => {
        if (newFolderModal) {
            newFolderModal.style.display = 'none';
        }
    };

    const submitCreateFolder = () => {
        const folderName = folderNameInput ? folderNameInput.value.trim() : '';
        const finalName = folderName || 'Folder #1';

        // สร้างแถวโฟลเดอร์ใหม่จำลองในตาราง (Frontend Prototype)
        const fileContainer = document.querySelector('.file-table-container, .file-container');
        if (fileContainer) {
            // ลบข้อความ empty state ถ้ามี
            const emptyNotice = fileContainer.querySelector('.empty-state, p');
            if (emptyNotice) {
                emptyNotice.remove();
            }

            const tableHeader = fileContainer.querySelector('.file-table-header, .file-header-divider');

            const safeName = finalName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

            const newRow = document.createElement('div');
            newRow.className = 'file-row';
            newRow.innerHTML = `
                <div class="file-name">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    ${safeName}
                </div>
                <div class="file-owner">
                    <div class="owner-avatar">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                            <circle cx="12" cy="7" r="4"/>
                        </svg>
                    </div>
                    me
                </div>
                <div class="file-date">Just now</div>
                <div class="options-wrapper">
                    <button class="options-btn toggle-options" aria-label="Options">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div class="options-dropdown folder-options">
                        <button class="option-item download-action"><i class="fas fa-download"></i> <span class="download-text">Download</span></button>
                        <button class="option-item open-rename-modal" data-filename="${safeName}"><i class="fas fa-pencil-alt"></i> Rename</button>
                        <button class="option-item copy-link-action"><i class="fas fa-link"></i> <span class="copy-link-text">Copy link</span></button>
                        <button class="option-item open-share-modal" data-access="[]"><i class="fas fa-share"></i> Share</button>
                        <button class="option-item"><i class="fas fa-info-circle"></i> Information</button>
                        <button class="option-item open-delete-modal move-to-trash-action" data-filename="${safeName}"><i class="fas fa-trash-alt"></i> <span class="move-to-trash-text">Move to Trash</span></button>
                    </div>
                </div>
            `;

            if (tableHeader && tableHeader.nextSibling) {
                fileContainer.insertBefore(newRow, tableHeader.nextSibling);
            } else {
                fileContainer.appendChild(newRow);
            }
        }

        closeNewFolderModal();
    };

    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeNewFolderModal);
    }

    if (createBtn) {
        createBtn.addEventListener('click', submitCreateFolder);
    }

    if (folderNameInput) {
        folderNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitCreateFolder();
            } else if (e.key === 'Escape') {
                closeNewFolderModal();
            }
        });
    }

    if (newFolderModal) {
        newFolderModal.addEventListener('click', (e) => {
            if (e.target === newFolderModal) {
                closeNewFolderModal();
            }
        });
    }
});
