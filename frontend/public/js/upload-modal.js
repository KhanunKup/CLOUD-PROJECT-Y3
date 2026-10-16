// public/js/upload-modal.js
document.addEventListener('DOMContentLoaded', () => {
    const uploadModal = document.getElementById('uploadModal');
    const uploadDropzone = document.getElementById('uploadDropzone');
    const uploadFileInput = document.getElementById('uploadFileInput');
    const uploadFolderInput = document.getElementById('uploadFolderInput');
    const uploadBrowseFileBtn = document.getElementById('uploadBrowseFileBtn');
    const uploadBrowseFolderBtn = document.getElementById('uploadBrowseFolderBtn');
    const uploadQueueList = document.getElementById('uploadQueueList');
    const uploadCancelBtn = document.getElementById('uploadCancelBtn');
    const uploadSubmitBtn = document.getElementById('uploadSubmitBtn');

    // เก็บรายการในคิว: { name: string, type: 'file' | 'folder', isEditing: boolean, file?: File }
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

    // แปลงประเภทไฟล์เป็นข้อความสวยๆ
    const getFileTypeDisplay = (item) => {
        if (item.type === 'folder') {
            return 'Folder';
        }
        const ext = item.name.split('.').pop().toLowerCase();
        if (ext === 'txt') return 'Text / .txt';
        if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') return `Image / .${ext}`;
        if (ext === 'pdf') return 'PDF / .pdf';
        if (ext === 'doc' || ext === 'docx') return 'Doc / .docx';
        if (ext === 'xls' || ext === 'xlsx') return 'Spreadsheet / .xlsx';
        if (ext === 'zip' || ext === 'rar') return 'Archive / .zip';
        return `File / .${ext}`;
    };

    // เพิ่มรายการ (ไฟล์ หรือ โฟลเดอร์) เข้าสู่คิว
    const addItemToQueue = (name, type = 'file', fileObj = null) => {
        if (!name) return;
        // ป้องกันชื่อซ้ำในคิวเดียวกัน
        if (!selectedFiles.some(f => f.name === name)) {
            selectedFiles.push({
                name: name,
                type: type, // 'folder' หรือ 'file'
                isEditing: false,
                file: fileObj
            });
        }
    };

    // Render รายการไฟล์/โฟลเดอร์ในคิว
    const renderQueue = () => {
        if (!uploadQueueList) return;

        if (selectedFiles.length === 0) {
            uploadQueueList.innerHTML = `
                <div class="upload-queue-empty" style="text-align: center; color: #6b735c; font-size: 14px; padding: 20px 0;">
                    No files or folders selected yet
                </div>
            `;
            return;
        }

        uploadQueueList.innerHTML = '';
        selectedFiles.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'upload-queue-row';
            const isFolder = item.type === 'folder';

            if (item.isEditing) {
                let inputHtml = '';
                if (isFolder) {
                    inputHtml = `
                        <i class="fas fa-folder"></i>
                        <input type="text" class="upload-inline-name-input" data-index="${index}" data-is-folder="true" value="${item.name}">
                        <button type="button" class="upload-save-name-btn" data-index="${index}" title="Save">
                            <i class="fas fa-check"></i>
                        </button>
                    `;
                } else {
                    const lastDot = item.name.lastIndexOf('.');
                    const baseName = lastDot > 0 ? item.name.substring(0, lastDot) : item.name;
                    const ext = lastDot > 0 ? item.name.substring(lastDot) : '';

                    inputHtml = `
                        <i class="far fa-file-alt"></i>
                        <input type="text" class="upload-inline-name-input" data-index="${index}" data-is-folder="false" data-ext="${ext}" value="${baseName}">
                        <span class="upload-inline-ext">${ext}</span>
                        <button type="button" class="upload-save-name-btn" data-index="${index}" title="Save">
                            <i class="fas fa-check"></i>
                        </button>
                    `;
                }

                row.innerHTML = `
                    <span class="col-upload-name" style="flex: 1.4;">
                        ${inputHtml}
                    </span>
                    <span class="col-upload-type">${getFileTypeDisplay(item)}</span>
                    <button type="button" class="upload-remove-file-btn" data-index="${index}" title="Remove">
                        <i class="fas fa-times"></i>
                    </button>
                `;
            } else {
                let iconClass = 'far fa-file-alt';
                if (isFolder) {
                    iconClass = 'fas fa-folder';
                } else {
                    const ext = item.name.split('.').pop().toLowerCase();
                    if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
                        iconClass = 'fas fa-image';
                    }
                }

                row.innerHTML = `
                    <span class="col-upload-name" title="Click pencil or name to edit">
                        <i class="${iconClass}"></i>
                        <span class="upload-file-name-text" data-index="${index}">${item.name}</span>
                        <button type="button" class="upload-edit-name-btn" data-index="${index}" title="Rename">
                            <i class="fas fa-pencil-alt"></i>
                        </button>
                    </span>
                    <span class="col-upload-type">${getFileTypeDisplay(item)}</span>
                    <button type="button" class="upload-remove-file-btn" data-index="${index}" title="Remove">
                        <i class="fas fa-times"></i>
                    </button>
                `;
            }
            uploadQueueList.appendChild(row);
        });

        // Auto focus เมื่อเปิดกล่อง inline edit
        const inlineInput = uploadQueueList.querySelector('.upload-inline-name-input');
        if (inlineInput) {
            inlineInput.focus();
            inlineInput.select();

            const saveInlineName = (idx) => {
                const isFolder = inlineInput.dataset.isFolder === 'true';
                const newBase = inlineInput.value.trim();
                if (isFolder) {
                    if (newBase.length > 0) {
                        selectedFiles[idx].name = newBase;
                    }
                } else {
                    const ext = inlineInput.dataset.ext || '';
                    if (newBase.length > 0) {
                        selectedFiles[idx].name = newBase + ext;
                    }
                }
                selectedFiles[idx].isEditing = false;
                renderQueue();
            };

            inlineInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const idx = parseInt(inlineInput.dataset.index, 10);
                    saveInlineName(idx);
                } else if (e.key === 'Escape') {
                    const idx = parseInt(inlineInput.dataset.index, 10);
                    selectedFiles[idx].isEditing = false;
                    renderQueue();
                }
            });

            const saveBtn = uploadQueueList.querySelector('.upload-save-name-btn');
            if (saveBtn) {
                saveBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt(saveBtn.dataset.index, 10);
                    saveInlineName(idx);
                });
            }
        }

        // คลิกดินสอหรือชื่อเพื่อเริ่ม Rename
        uploadQueueList.querySelectorAll('.upload-edit-name-btn, .upload-file-name-text').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.index, 10);
                selectedFiles.forEach((f, i) => { f.isEditing = (i === idx); });
                renderQueue();
            });
        });

        // ผูก event ปุ่มลบออกจากคิว
        uploadQueueList.querySelectorAll('.upload-remove-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.index, 10);
                selectedFiles.splice(idx, 1);
                renderQueue();
            });
        });
    };

    // ปุ่ม Upload Files (สำหรับไฟล์เท่านั้น แยกชัดเจน)
    if (uploadBrowseFileBtn) {
        uploadBrowseFileBtn.addEventListener('click', async (e) => {
            e.stopPropagation();

            // ล้างโฟลเดอร์ออกจากคิวเมื่อกดเลือกไฟล์ เพื่อให้คิวเป็นไฟล์ล้วนตามปุ่มที่เลือก
            selectedFiles = selectedFiles.filter(f => f.type === 'file');

            // ใช้ File System Access API สำหรับเลือกไฟล์
            if (window.showOpenFilePicker) {
                try {
                    const fileHandles = await window.showOpenFilePicker({ multiple: true });
                    if (fileHandles && fileHandles.length > 0) {
                        for (const handle of fileHandles) {
                            const file = await handle.getFile();
                            addItemToQueue(file.name, 'file', file);
                        }
                        renderQueue();
                    }
                    return;
                } catch (err) {
                    if (err.name === 'AbortError') return;
                    console.warn('showOpenFilePicker failed, falling back:', err);
                }
            }

            if (uploadFileInput) {
                uploadFileInput.click();
            }
        });
    }

    // ปุ่ม Upload Folder (สำหรับโฟลเดอร์เท่านั้น แยกชัดเจน)
    if (uploadBrowseFolderBtn) {
        uploadBrowseFolderBtn.addEventListener('click', async (e) => {
            e.stopPropagation();

            // ล้างไฟล์ออกจากคิวเมื่อกดเลือกโฟลเดอร์ เพื่อให้คิวเป็นโฟลเดอร์ล้วนตามปุ่มที่เลือก
            selectedFiles = selectedFiles.filter(f => f.type === 'folder');

            // ใช้ File System Access API (Chrome / Edge) เพื่อเปิดหน้าต่าง "Select Folder" โดยเฉพาะ
            if (window.showDirectoryPicker) {
                try {
                    const dirHandle = await window.showDirectoryPicker();
                    if (dirHandle && dirHandle.name) {
                        addItemToQueue(dirHandle.name, 'folder');
                        renderQueue();
                    }
                    return;
                } catch (err) {
                    if (err.name === 'AbortError') return;
                    console.warn('showDirectoryPicker failed, falling back to input:', err);
                }
            }

            // Fallback มาตรฐาน input webkitdirectory
            if (uploadFolderInput) {
                uploadFolderInput.click();
            }
        });
    }

    // เมื่อเลือกไฟล์ผ่าน file input (Fallback)
    if (uploadFileInput) {
        uploadFileInput.addEventListener('change', (e) => {
            selectedFiles = selectedFiles.filter(f => f.type === 'file');
            if (e.target.files) {
                Array.from(e.target.files).forEach(file => {
                    addItemToQueue(file.name, 'file', file);
                });
            }
            uploadFileInput.value = '';
            renderQueue();
        });
    }

    // เมื่อเลือกโฟลเดอร์ผ่าน folder input (Fallback)
    if (uploadFolderInput) {
        uploadFolderInput.addEventListener('change', (e) => {
            selectedFiles = selectedFiles.filter(f => f.type === 'folder');
            if (e.target.files && e.target.files.length > 0) {
                const firstFile = e.target.files[0];
                const relPath = firstFile.webkitRelativePath || '';
                const folderName = relPath.split('/')[0] || 'New Folder';
                addItemToQueue(folderName, 'folder');
            }
            uploadFolderInput.value = '';
            renderQueue();
        });
    }

    // จัดการ Drag & Drop (รองรับทั้ง File และ Folder)
    if (uploadDropzone) {
        // คลิกส่วนว่างของ dropzone ให้เรียกปุ่ม Upload Files
        uploadDropzone.addEventListener('click', (e) => {
            if (e.target.closest('.upload-dropzone-badge')) return;
            if (uploadBrowseFileBtn) uploadBrowseFileBtn.click();
        });

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
            // ตรวจสอบ DataTransferItem เพื่อแยกประเภท Folder vs File
            if (e.dataTransfer && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
                for (let i = 0; i < e.dataTransfer.items.length; i++) {
                    const item = e.dataTransfer.items[i];
                    if (item.kind === 'file') {
                        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
                        if (entry) {
                            if (entry.isDirectory) {
                                addItemToQueue(entry.name, 'folder');
                            } else if (entry.isFile) {
                                const file = item.getAsFile();
                                addItemToQueue(file ? file.name : entry.name, 'file', file);
                            }
                        } else {
                            const file = item.getAsFile();
                            if (file) {
                                addItemToQueue(file.name, 'file', file);
                            }
                        }
                    }
                }
                renderQueue();
            } else if (e.dataTransfer && e.dataTransfer.files) {
                Array.from(e.dataTransfer.files).forEach(file => {
                    addItemToQueue(file.name, 'file', file);
                });
                renderQueue();
            }
        });
    }

    // เมื่อกดปุ่ม Upload (ส่งไฟล์ขึ้น S3 / Mock Storage และบันทึกลงฐานข้อมูล)
    if (uploadSubmitBtn) {
        uploadSubmitBtn.addEventListener('click', async () => {
            if (selectedFiles.length === 0) {
                if (window.showToast) {
                    window.showToast('Please select at least one file or folder to upload.', 'warning');
                } else {
                    alert('Please select at least one file or folder to upload.');
                }
                return;
            }

            const originalBtnText = uploadSubmitBtn.innerHTML;
            uploadSubmitBtn.disabled = true;
            uploadSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

            const fileContainer = document.querySelector('.file-table-container, .file-container');
            const tableHeader = fileContainer ? fileContainer.querySelector('.file-table-header, .file-header-divider') : null;

            let successCount = 0;

            try {
                for (const item of selectedFiles) {
                    const isFolder = item.type === 'folder';
                    let fileId = `file-${Date.now()}`;
                    let uploadedFileRecord = null;

                    if (isFolder) {
                        // 1. กรณีเป็น Folder ให้ยิงสร้าง Folder API
                        const res = await fetch('/api/folders', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ folderName: item.name })
                        });
                        const data = await res.json();
                        if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create folder');
                        fileId = data.file.file_id;
                        uploadedFileRecord = data.file;
                    } else {
                        // 2. กรณีเป็นไฟล์: ขอ Presigned Upload URL
                        const fileSize = item.file ? item.file.size : 1024;
                        const contentType = item.file ? (item.file.type || 'application/octet-stream') : 'application/octet-stream';

                        const urlRes = await fetch('/api/files/upload-url', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                filename: item.name,
                                size: fileSize,
                                contentType: contentType
                            })
                        });

                        const urlData = await urlRes.json();
                        if (!urlRes.ok || !urlData.success) throw new Error(urlData.error || 'Failed to get upload URL');

                        fileId = urlData.file_id;
                        uploadedFileRecord = urlData.file;
                        const uploadUrl = urlData.uploadUrl;

                        // 3. PUT binary data ไปยัง S3 / Mock Storage
                        const uploadBody = item.file || new Blob(['EasyDrive Mock File Content'], { type: contentType });
                        const putRes = await fetch(uploadUrl, {
                            method: 'PUT',
                            headers: { 'Content-Type': contentType },
                            body: uploadBody
                        });

                        if (!putRes.ok) throw new Error('Failed to upload file content to storage');
                    }

                    successCount++;

                    // 4. แทรกแถวลงในหน้าจอ (Realtime DOM Update)
                    if (fileContainer) {
                        const emptyNotice = fileContainer.querySelector('.empty-state, p');
                        if (emptyNotice) emptyNotice.remove();

                        const safeName = item.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

                        const iconSvg = isFolder
                            ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                   <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                               </svg>`
                            : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                   <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                   <polyline points="14 2 14 8 20 8"/>
                               </svg>`;

                        const ext = item.name.split('.').pop().toLowerCase();
                        const fileCat = isFolder ? 'folder' : ((uploadedFileRecord && uploadedFileRecord.category) || 'other');
                        const fileTags = isFolder ? ['folder'] : ((uploadedFileRecord && Array.isArray(uploadedFileRecord.tags)) ? uploadedFileRecord.tags : [fileCat, ext]);
                        const tagsJoined = fileTags.join(',');

                        const menuContent = isFolder
                            ? `<div class="options-dropdown folder-options">
                                   <button class="option-item download-action" data-id="${fileId}" data-filename="${safeName}"><i class="fas fa-download"></i> <span class="download-text">Download</span></button>
                                   <button class="option-item open-rename-modal" data-id="${fileId}" data-filename="${safeName}"><i class="fas fa-pencil-alt"></i> Rename</button>
                                   <button class="option-item copy-link-action" data-id="${fileId}" data-filename="${safeName}"><i class="fas fa-link"></i> <span class="copy-link-text">Copy link</span></button>
                                   <button class="option-item open-share-modal" data-id="${fileId}" data-filename="${safeName}" data-access="[]"><i class="fas fa-share"></i> Share</button>
                                   <button class="option-item"><i class="fas fa-info-circle"></i> Information</button>
                                   <button class="option-item open-delete-modal move-to-trash-action" data-id="${fileId}" data-filename="${safeName}"><i class="fas fa-trash-alt"></i> <span class="move-to-trash-text">Move to Trash</span></button>
                               </div>`
                            : `<div class="options-dropdown file-options">
                                   <button class="option-item"><i class="fas fa-eye"></i> Preview</button>
                                   <button class="option-item download-action" data-id="${fileId}" data-filename="${safeName}"><i class="fas fa-download"></i> <span class="download-text">Download</span></button>
                                   <button class="option-item open-rename-modal" data-id="${fileId}" data-filename="${safeName}"><i class="fas fa-pencil-alt"></i> Rename</button>
                                   <button class="option-item open-tags-modal" data-id="${fileId}" data-filename="${safeName}" data-tags="${tagsJoined}"><i class="fas fa-tags"></i> Edit Tags</button>
                                   <button class="option-item copy-link-action" data-id="${fileId}" data-filename="${safeName}"><i class="fas fa-link"></i> <span class="copy-link-text">Copy link</span></button>
                                   <button class="option-item open-share-modal" data-id="${fileId}" data-filename="${safeName}" data-access="[]"><i class="fas fa-share"></i> Share</button>
                                   <button class="option-item"><i class="fas fa-info-circle"></i> Information</button>
                                   <button class="option-item open-delete-modal move-to-trash-action" data-id="${fileId}" data-filename="${safeName}"><i class="fas fa-trash-alt"></i> <span class="move-to-trash-text">Move to Trash</span></button>
                               </div>`;

                        const newRow = document.createElement('div');
                        newRow.className = 'file-row';
                        newRow.dataset.id = fileId;
                        newRow.dataset.name = safeName;
                        newRow.dataset.category = fileCat;
                        newRow.dataset.tags = tagsJoined;
                        newRow.innerHTML = `
                            <div class="file-name">
                                ${iconSvg}
                                <span class="file-name-text">${safeName}</span>
                                <div class="file-tags-wrapper">
                                    ${fileTags.map(t => `<span class="file-tag-badge" title="Tag: ${t}">${t}</span>`).join('')}
                                </div>
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
                                ${menuContent}
                            </div>
                        `;

                        if (tableHeader && tableHeader.nextSibling) {
                            fileContainer.insertBefore(newRow, tableHeader.nextSibling);
                        } else {
                            fileContainer.appendChild(newRow);
                        }
                    }
                }

                if (window.showToast) {
                    window.showToast(`Uploaded ${successCount} item(s) successfully!`, 'success');
                }

                // Refresh sidebar storage and filters
                if (window.refreshSidebarStorage) {
                    window.refreshSidebarStorage();
                }
                if (window.applyDriveFilters) {
                    window.applyDriveFilters();
                }

                // ล้างคิวและปิด Modal
                selectedFiles = [];
                renderQueue();
                closeUploadModal();
            } catch (err) {
                console.error('Upload error:', err);
                if (window.showToast) {
                    window.showToast(`Upload failed: ${err.message}`, 'error');
                } else {
                    alert(`Upload failed: ${err.message}`);
                }
            } finally {
                uploadSubmitBtn.disabled = false;
                uploadSubmitBtn.innerHTML = originalBtnText;
            }
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
