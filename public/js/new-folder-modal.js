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
        const fileContainer = document.querySelector('.file-container');
        if (fileContainer) {
            // ลบข้อความ "No files found" ถ้ามี
            const emptyNotice = fileContainer.querySelector('p');
            if (emptyNotice && emptyNotice.textContent.toLowerCase().includes('no')) {
                emptyNotice.remove();
            }

            const divider = fileContainer.querySelector('.file-header-divider');

            const newRow = document.createElement('div');
            newRow.className = 'file-row';
            newRow.innerHTML = `
                <span class="col-name">
                    <i class="fas fa-folder"></i> 
                    ${finalName}
                </span>
                <span class="col-owner"><i class="far fa-user-circle"></i> me</span>
                <span class="col-date">Just now</span>
                <div class="options-wrapper">
                    <button class="options-btn toggle-options"><i class="fas fa-ellipsis-h"></i></button>
                    <div class="options-dropdown folder-options">
                        <button class="option-item"><i class="fas fa-download"></i> Download</button>
                        <button class="option-item open-rename-modal" data-filename="${finalName}"><i class="fas fa-pencil-alt"></i> Rename</button>
                        <button class="option-item copy-link-action"><i class="fas fa-link"></i> <span class="copy-link-text">Copy link</span></button>
                        <button class="option-item open-share-modal" data-access="[]"><i class="fas fa-share"></i> Share</button>
                        <button class="option-item"><i class="fas fa-info-circle"></i> Information</button>
                        <button class="option-item"><i class="fas fa-trash-alt"></i> Move to Trash</button>
                    </div>
                </div>
            `;

            // ผูก event ให้ปุ่ม toggle options ของแถวใหม่
            const toggleBtn = newRow.querySelector('.toggle-options');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const dropdown = toggleBtn.nextElementSibling;
                    document.querySelectorAll('.options-dropdown, .new-options-dropdown').forEach(d => {
                        if (d !== dropdown) d.classList.remove('show');
                    });
                    if (dropdown) dropdown.classList.toggle('show');
                });
            }

            if (divider && divider.nextSibling) {
                fileContainer.insertBefore(newRow, divider.nextSibling);
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
