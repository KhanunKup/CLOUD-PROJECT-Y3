// public/js/upload-modal.js
document.addEventListener('DOMContentLoaded', () => {
    const uploadModal = document.getElementById('uploadModal');
    const uploadDropzone = document.getElementById('uploadDropzone');
    const uploadFileInput = document.getElementById('uploadFileInput');
    const uploadQueueList = document.getElementById('uploadQueueList');
    const uploadCancelBtn = document.getElementById('uploadCancelBtn');
    const uploadSubmitBtn = document.getElementById('uploadSubmitBtn');

    let selectedFiles = [];

    // เปิด Upload Modal
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('.open-upload-modal');
        if (trigger) {
            e.stopPropagation();

            // ปิด Dropdown ทั้งหมด
            document.querySelectorAll('.new-options-dropdown, .options-dropdown').forEach(d => {
                d.classList.remove('show');
            });

            if (uploadModal) {
                uploadModal.style.display = 'flex';
            }
        }
    });

    const closeUploadModal = () => {
        if (uploadModal) {
            uploadModal.style.display = 'none';
        }
    };

    // แปลงนามสกุลเป็นข้อความประเภทไฟล์สวยๆ (เช่น Text / .txt)
    const getFileTypeDisplay = (filename) => {
        const ext = filename.split('.').pop().toLowerCase();
        if (ext === 'txt') return 'Text / .txt';
        if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') return `Image / .${ext}`;
        if (ext === 'pdf') return 'PDF / .pdf';
        if (ext === 'doc' || ext === 'docx') return 'Doc / .docx';
        if (ext === 'xls' || ext === 'xlsx') return 'Spreadsheet / .xlsx';
        if (ext === 'zip' || ext === 'rar') return 'Archive / .zip';
        return `File / .${ext}`;
    };

    // Render รายการไฟล์ในคิวอัปโหลด
    const renderQueue = () => {
        if (!uploadQueueList) return;

        if (selectedFiles.length === 0) {
            uploadQueueList.innerHTML = `
                <div class="upload-queue-empty" style="text-align: center; color: #6b735c; font-size: 14px; padding: 20px 0;">
                    No files selected yet
                </div>
            `;
            return;
        }

        uploadQueueList.innerHTML = '';
        selectedFiles.forEach((file, index) => {
            const row = document.createElement('div');
            row.className = 'upload-queue-row';
            row.innerHTML = `
                <span class="col-upload-name" title="${file.name}">
                    <i class="far fa-file-alt"></i>
                    ${file.name}
                </span>
                <span class="col-upload-type">${getFileTypeDisplay(file.name)}</span>
                <button type="button" class="upload-remove-file-btn" data-index="${index}" title="Remove file">
                    <i class="fas fa-times"></i>
                </button>
            `;
            uploadQueueList.appendChild(row);
        });

        // ผูก event ให้ปุ่มลบไฟล์ออกจากคิว
        uploadQueueList.querySelectorAll('.upload-remove-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.index, 10);
                selectedFiles.splice(idx, 1);
                renderQueue();
            });
        });
    };

    // เพิ่มไฟล์เข้าคิว
    const addFilesToQueue = (files) => {
        if (!files || files.length === 0) return;
        Array.from(files).forEach(file => {
            // ไม่เพิ่มไฟล์ที่ชื่อซ้ำกันในคิวเดียวกัน
            if (!selectedFiles.some(f => f.name === file.name)) {
                selectedFiles.push(file);
            }
        });
        renderQueue();
    };

    // คลิกที่ Dropzone เพื่อเลือกไฟล์
    if (uploadDropzone && uploadFileInput) {
        uploadDropzone.addEventListener('click', () => {
            uploadFileInput.click();
        });

        uploadFileInput.addEventListener('change', (e) => {
            addFilesToQueue(e.target.files);
            uploadFileInput.value = ''; // reset ให้เลือกซ้ำได้
        });

        // จัดการ Drag & Drop
        ['dragenter', 'dragover'].forEach(eventName => {
            uploadDropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                uploadDropzone.classList.add('dragover');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            uploadDropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                uploadDropzone.classList.remove('dragover');
            });
        });

        uploadDropzone.addEventListener('drop', (e) => {
            if (e.dataTransfer && e.dataTransfer.files) {
                addFilesToQueue(e.dataTransfer.files);
            }
        });
    }

    // เมื่อกดปุ่ม Upload
    if (uploadSubmitBtn) {
        uploadSubmitBtn.addEventListener('click', () => {
            if (selectedFiles.length === 0) {
                alert('Please select or drag at least one file to upload.');
                return;
            }

            // ใน Frontend Prototype จำลองการเพิ่มไฟล์ลงในตารางหลัก
            const fileContainer = document.querySelector('.file-container');
            if (fileContainer) {
                const emptyNotice = fileContainer.querySelector('p');
                if (emptyNotice && emptyNotice.textContent.toLowerCase().includes('no')) {
                    emptyNotice.remove();
                }

                const divider = fileContainer.querySelector('.file-header-divider');

                selectedFiles.forEach(file => {
                    const ext = file.name.split('.').pop().toLowerCase();
                    const iconClass = (ext === 'png' || ext === 'jpg' || ext === 'jpeg') ? 'fas fa-image' : 'fas fa-file-alt';

                    const newRow = document.createElement('div');
                    newRow.className = 'file-row';
                    newRow.innerHTML = `
                        <span class="col-name">
                            <i class="${iconClass}"></i> 
                            ${file.name}
                        </span>
                        <span class="col-owner"><i class="far fa-user-circle"></i> me</span>
                        <span class="col-date">Just now</span>
                        <div class="options-wrapper">
                            <button class="options-btn toggle-options"><i class="fas fa-ellipsis-h"></i></button>
                            <div class="options-dropdown file-options">
                                <button class="option-item"><i class="fas fa-eye"></i> Preview</button>
                                <button class="option-item"><i class="fas fa-download"></i> Download</button>
                                <button class="option-item open-rename-modal" data-filename="${file.name}"><i class="fas fa-pencil-alt"></i> Rename</button>
                                <button class="option-item copy-link-action"><i class="fas fa-link"></i> <span class="copy-link-text">Copy link</span></button>
                                <button class="option-item open-share-modal" data-access="[]"><i class="fas fa-share"></i> Share</button>
                                <button class="option-item"><i class="fas fa-info-circle"></i> Information</button>
                                <button class="option-item"><i class="fas fa-trash-alt"></i> Move to Trash</button>
                            </div>
                        </div>
                    `;

                    // ผูก event สำหรับปุ่มเมนูของไฟล์ที่เพิ่งอัปโหลด
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
                });
            }

            // ล้างคิวและปิด Modal
            selectedFiles = [];
            renderQueue();
            closeUploadModal();
        });
    }

    if (uploadCancelBtn) {
        uploadCancelBtn.addEventListener('click', () => {
            selectedFiles = [];
            renderQueue();
            closeUploadModal();
        });
    }

    if (uploadModal) {
        uploadModal.addEventListener('click', (e) => {
            if (e.target === uploadModal) {
                closeUploadModal();
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && uploadModal && uploadModal.style.display === 'flex') {
            closeUploadModal();
        }
    });
});
