// frontend/public/js/preview-modal.js
(function () {
    let previewModal = null;
    let previewFilename = null;
    let previewContentCard = null;
    let previewBodyContainer = null;
    let previewZoomLevel = null;
    let previewCloseBtn = null;
    let previewZoomInBtn = null;
    let previewZoomOutBtn = null;
    let previewDeleteBtn = null;
    let previewDownloadBtn = null;
    let previewShareBtn = null;

    let activeFile = null;
    let activeZoom = 100;

    // Demo text for File1.txt matching Figma design
    const FIGMA_DEMO_TEXT = {
        title: "ที่มาของคณะไอที ลาดกระบัง",
        paragraphs: [
            "โครงการจัดตั้งคณะเทคโนโลยีสารสนเทศ ได้รับความเห็นชอบจากสภา สถาบันเทคโนโลยีพระจอมเกล้า เจ้าคุณทหารลาดกระบัง เมื่อวันที่ 12 กรกฎาคม 2537 ซึ่งเป็นโครงการที่ริเริ่มโดยศาสตราจารย์ ดร.ไพรัช ธัชยพงษ์ อธิการบดี ในขณะนั้นได้มีวิสัยทัศน์ และเล็งเห็นถึงบทบาทความสำคัญ และแนวโน้มของเทคโนโลยีสารสนเทศ ต่อการพัฒนาประเทศ ประกอบกับความต้องการของตลาดแรงงานที่ขาดแคลนบุคลากรที่มีศักยภาพในด้านนี้อยู่มาก",
            "อนึ่งเพื่อให้ คณะเทคโนโลยีสารสนเทศ มีการดำเนินงานที่สอดคล้องกับนโยบายของรัฐบาล และสภาพการแข่งขันของสถาบันอุดมศึกษาที่สูงขึ้น และต้องการความคล่องตัวในการใช้ทรัพยากรร่วมกันอย่างมีประสิทธิภาพและพึ่งตนเองมากขึ้น คณะเทคโนโลยีสารสนเทศ จึงจัดตั้งขึ้น โดยไม่มีการแบ่งเป็นภาควิชาต่างๆ และได้รับสถาปนาเป็นส่วนราชการเมื่อวันที่ 27 กุมภาพันธ์ 2539",
            "คณะฯ ได้พัฒนาหลักสูตรปริญญาโท วิทยาศาสตรมหาบัณฑิต สาขาเทคโนโลยีสารสนเทศ เป็นหลักสูตรแรก ซึ่งมีสองแขนงวิชา คือ การจัดการเทคโนโลยีสารสนเทศ (Information Technology Management - ITM) และ วิทยาการสารสนเทศ (Information Science - IS) โดยเปิดสอนตั้งแต่ภาคการศึกษาที่ 2/2538 เป็นต้นมา"
        ]
    };

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderTextContent(text, isCode, ext, filename) {
        if (!previewBodyContainer) return;
        previewBodyContainer.innerHTML = '';

        const MAX_PREVIEW_BYTES = 2 * 1024 * 1024; // 2 MB
        let isTruncated = false;
        let displayContent = text || '';

        if (displayContent.length > MAX_PREVIEW_BYTES) {
            displayContent = displayContent.slice(0, MAX_PREVIEW_BYTES);
            isTruncated = true;
        }

        const fragment = (document.createDocumentFragment ? document.createDocumentFragment() : document.createElement('div'));

        if (isTruncated) {
            const warningEl = document.createElement('div');
            warningEl.className = 'preview-truncation-badge';
            warningEl.style.cssText = 'background:#fff3cd;color:#856404;border:1px solid #ffeeba;padding:10px 14px;border-radius:6px;margin-bottom:14px;font-size:13px;display:flex;align-items:center;gap:8px;';
            warningEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i><span><strong>Large file:</strong> Preview truncated to 2 MB for performance. Download file for complete content.</span>`;
            fragment.appendChild(warningEl);
        }

        if (isCode) {
            const codeWrapper = document.createElement('div');
            codeWrapper.className = 'preview-code-block';
            const pre = document.createElement('pre');
            pre.style.cssText = 'margin:0;font-family:Consolas,Monaco,"Courier New",monospace;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word;';
            const code = document.createElement('code');
            code.textContent = displayContent;
            pre.appendChild(code);
            codeWrapper.appendChild(pre);
            fragment.appendChild(codeWrapper);
        } else {
            const textWrapper = document.createElement('div');
            textWrapper.className = 'preview-text-content';
            const pre = document.createElement('pre');
            pre.style.cssText = 'font-family:inherit;white-space:pre-wrap;word-break:break-word;margin:0;color:#333;font-size:14px;line-height:1.6;';
            pre.textContent = displayContent;
            textWrapper.appendChild(pre);
            fragment.appendChild(textWrapper);
        }

        previewBodyContainer.appendChild(fragment);
    }

    function initElements() {
        previewModal = document.getElementById('previewModal');
        previewFilename = document.getElementById('previewFilename');
        previewContentCard = document.getElementById('previewContentCard');
        previewBodyContainer = document.getElementById('previewBodyContainer');
        previewZoomLevel = document.getElementById('previewZoomLevel');
        previewCloseBtn = document.getElementById('previewCloseBtn');
        previewZoomInBtn = document.getElementById('previewZoomInBtn');
        previewZoomOutBtn = document.getElementById('previewZoomOutBtn');
        previewDeleteBtn = document.getElementById('previewDeleteBtn');
        previewDownloadBtn = document.getElementById('previewDownloadBtn');
        previewShareBtn = document.getElementById('previewShareBtn');
    }

    function setZoom(zoom) {
        activeZoom = Math.min(200, Math.max(50, zoom));
        if (previewZoomLevel) {
            previewZoomLevel.textContent = `${activeZoom} %`;
        }
        if (previewContentCard) {
            previewContentCard.style.transform = `scale(${activeZoom / 100})`;
        }
    }

    function closePreview() {
        if (previewModal) {
            previewModal.style.display = 'none';
        }
        document.body.style.overflow = '';
        activeFile = null;
        setZoom(100);
    }

    function renderContent(file) {
        if (!previewBodyContainer) return;
        previewBodyContainer.innerHTML = '';
        if (previewContentCard) {
            previewContentCard.className = 'preview-content-card';
        }

        const fileId = file.id || file.file_id || '';
        const filename = file.name || file.filename || 'Untitled';
        const ext = filename.split('.').pop().toLowerCase();
        const category = file.category || '';

        // 1. Text & Code Files (.txt, .md, .json, .js, .py, .sh, .html, .css, etc.)
        const codeExts = ['py', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'scss', 'json', 'sh', 'bash', 'sql', 'java', 'c', 'cpp', 'cs', 'php', 'rb', 'go', 'rs', 'yaml', 'yml', 'xml', 'env'];
        const textExts = ['txt', 'md', 'csv', 'log', ...codeExts];
        if (textExts.includes(ext) || category === 'code' || (category === 'document' && (ext === 'txt' || ext === 'md'))) {
            const isCode = codeExts.includes(ext) || category === 'code';
            if (isCode && previewContentCard) previewContentCard.classList.add('preview-card-code');

            if (file.content !== undefined && file.content !== null) {
                renderTextContent(file.content, isCode, ext, filename);
                return;
            }

            // Display loading skeleton
            previewBodyContainer.innerHTML = `
                <div class="preview-loading-state" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:56px 24px;color:#888;">
                    <i class="fas fa-spinner fa-spin" style="font-size:32px;margin-bottom:14px;color:#6d533b;"></i>
                    <span style="font-size:14px;font-weight:500;">Loading file content...</span>
                </div>
            `;

            const contentUrl = fileId ? `/api/files/${fileId}/content` : (file.url || `/mock-download/${encodeURIComponent(filename)}`);
            fetch(contentUrl)
                .then(async res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load file`);
                    return res.text();
                })
                .then(text => {
                    if (activeFile && ((activeFile.id && activeFile.id === fileId) || (activeFile.file_id && activeFile.file_id === fileId) || (activeFile.name === filename || activeFile.filename === filename))) {
                        renderTextContent(text, isCode, ext, filename);
                    }
                })
                .catch(err => {
                    console.error('Error fetching file content for preview:', err);
                    if (previewBodyContainer) {
                        previewBodyContainer.innerHTML = `
                            <div class="preview-error-state" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 24px;text-align:center;">
                                <i class="fas fa-exclamation-circle" style="font-size:40px;color:#dc3545;margin-bottom:12px;"></i>
                                <h4 style="margin:0 0 8px 0;color:#333;">Unable to load file content</h4>
                                <p style="color:#777;font-size:13px;margin:0 0 16px 0;">${escapeHtml(err.message || 'File could not be loaded.')}</p>
                                <button type="button" class="preview-fallback-btn" id="previewRetryDownloadBtn">
                                    <i class="fas fa-download"></i> Download File Instead
                                </button>
                            </div>
                        `;
                        const retryBtn = previewBodyContainer.querySelector('#previewRetryDownloadBtn');
                        if (retryBtn) retryBtn.addEventListener('click', () => {
                            if (previewDownloadBtn) previewDownloadBtn.click();
                        });
                    }
                });
            return;
        }

        // 2. Image Files (.png, .jpg, .jpeg, .webp, .gif, .svg)
        const imageExts = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'];
        if (imageExts.includes(ext) || category === 'image') {
            if (previewContentCard) previewContentCard.classList.add('preview-card-image');
            const imgContainer = document.createElement('div');
            imgContainer.className = 'preview-image-container';

            const img = document.createElement('img');
            img.className = 'preview-image-element';
            const imageSrc = fileId ? `/api/files/${fileId}/content` : (file.url || '/images/doc-photo.svg');
            img.src = imageSrc;
            img.alt = filename;
            img.onerror = () => {
                img.src = '/images/doc-photo.svg';
            };

            imgContainer.appendChild(img);
            previewBodyContainer.appendChild(imgContainer);
            return;
        }

        // 3. PDF Files (.pdf)
        const blobUrl = (window.uploadedBlobMap && (window.uploadedBlobMap.get(file.id) || window.uploadedBlobMap.get(file.file_id) || window.uploadedBlobMap.get(filename))) || file.url;
        if (ext === 'pdf' || (category === 'document' && ext === 'pdf')) {
            if (previewContentCard) previewContentCard.classList.add('preview-card-frame');
            const pdfContainer = document.createElement('div');
            pdfContainer.className = 'preview-pdf-container';
            const iframe = document.createElement('iframe');
            iframe.className = 'preview-pdf-frame';
            iframe.src = fileId ? `/api/files/${fileId}/content` : (blobUrl || `/mock-download/${encodeURIComponent(filename)}`);
            pdfContainer.appendChild(iframe);
            previewBodyContainer.appendChild(pdfContainer);
            return;
        }

        // 3.5 Word & Office Documents (.doc, .docx, .odt, .rtf, .xls, .xlsx, .ppt, .pptx)
        const docExts = ['doc', 'docx', 'odt', 'rtf', 'pages', 'xls', 'xlsx', 'ppt', 'pptx'];
        if (docExts.includes(ext) || (category === 'document' && docExts.includes(ext))) {
            const docCard = document.createElement('div');
            docCard.className = 'preview-office-card';
            docCard.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:56px 24px;text-align:center;max-width:540px;margin:0 auto;';

            let iconClass = 'fa-file-word';
            let iconColor = '#2b579a';
            let typeLabel = 'Word Document';

            if (['xls', 'xlsx'].includes(ext)) {
                iconClass = 'fa-file-excel';
                iconColor = '#217346';
                typeLabel = 'Excel Spreadsheet';
            } else if (['ppt', 'pptx'].includes(ext)) {
                iconClass = 'fa-file-powerpoint';
                iconColor = '#d24726';
                typeLabel = 'PowerPoint Presentation';
            }

            docCard.innerHTML = `
                <i class="fas ${iconClass}" style="font-size:64px;color:${iconColor};margin-bottom:20px;"></i>
                <h3 style="margin:0 0 8px 0;font-size:20px;color:#333;word-break:break-word;">${escapeHtml(filename)}</h3>
                <span style="display:inline-block;padding:4px 12px;background:#f0ede7;color:#6d533b;border-radius:20px;font-size:12px;font-weight:600;margin-bottom:16px;">${typeLabel}</span>
                <p style="color:#777;font-size:14px;line-height:1.6;margin:0 0 24px 0;">This office document is stored securely in EasyDrive.<br>Download the file to open and edit in your desktop application.</p>
                <button type="button" class="preview-fallback-btn" id="previewOfficeDownloadBtn" style="padding:10px 24px;font-size:14px;font-weight:600;">
                    <i class="fas fa-download"></i> Download File
                </button>
            `;

            previewBodyContainer.appendChild(docCard);

            const officeDownload = docCard.querySelector('#previewOfficeDownloadBtn');
            if (officeDownload) {
                officeDownload.addEventListener('click', () => {
                    if (previewDownloadBtn) previewDownloadBtn.click();
                });
            }
            return;
        }

        // 4. Video & Audio Files (.mp4, .mov, .mp3, .wav)
        const videoExts = ['mp4', 'mov', 'webm', 'mkv'];
        const audioExts = ['mp3', 'wav', 'aac', 'ogg'];
        const mediaSourceUrl = fileId ? `/api/files/${fileId}/content` : (file.url || `/mock-download/${encodeURIComponent(filename)}`);

        if (videoExts.includes(ext) || category === 'video') {
            const mediaContainer = document.createElement('div');
            mediaContainer.className = 'preview-media-container';
            mediaContainer.innerHTML = `
                <video class="preview-video-element" controls autoplay src="${mediaSourceUrl}">
                    <source src="${mediaSourceUrl}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
            `;
            previewBodyContainer.appendChild(mediaContainer);
            return;
        }

        if (audioExts.includes(ext) || category === 'audio') {
            const mediaContainer = document.createElement('div');
            mediaContainer.className = 'preview-media-container';
            mediaContainer.innerHTML = `
                <i class="fas fa-music" style="font-size: 56px; color: #6d533b; margin-bottom: 16px;"></i>
                <h4 style="margin: 0 0 12px 0; font-size: 18px; color: #333;">${escapeHtml(filename)}</h4>
                <audio class="preview-audio-element" controls src="${mediaSourceUrl}">
                    <source src="${mediaSourceUrl}" type="audio/mpeg">
                    Your browser does not support the audio element.
                </audio>
            `;
            previewBodyContainer.appendChild(mediaContainer);
            return;
        }

        // 5. Fallback for Archives & Other Formats (.zip, .rar, etc.)
        const fallbackContainer = document.createElement('div');
        fallbackContainer.className = 'preview-fallback-container';
        const iconClass = ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) ? 'fa-file-archive' : 'fa-file-alt';

        fallbackContainer.innerHTML = `
            <i class="fas ${iconClass} preview-fallback-icon"></i>
            <h3 class="preview-fallback-title">${filename}</h3>
            <p class="preview-fallback-desc">No direct inline preview available for this file type.<br>You can download the file to inspect its content.</p>
            <button type="button" class="preview-fallback-btn" id="previewFallbackDownloadBtn">
                <i class="fas fa-download"></i> Download File
            </button>
        `;

        previewBodyContainer.appendChild(fallbackContainer);

        const fallbackDownload = fallbackContainer.querySelector('#previewFallbackDownloadBtn');
        if (fallbackDownload) {
            fallbackDownload.addEventListener('click', () => {
                if (previewDownloadBtn) previewDownloadBtn.click();
            });
        }
    }

    function openPreview(fileData) {
        if (!previewModal) initElements();
        if (!previewModal) return;

        activeFile = fileData;
        const filename = fileData.name || fileData.filename || 'File Preview';

        if (previewFilename) {
            previewFilename.textContent = filename;
        }

        renderContent(fileData);
        setZoom(100);

        previewModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    window.openFilePreview = openPreview;
    window.closeFilePreview = closePreview;

    document.addEventListener('DOMContentLoaded', () => {
        initElements();

        // Close Preview Modal
        if (previewCloseBtn) {
            previewCloseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closePreview();
            });
        }

        // Close when clicking outside modal dialog (on the overlay backdrop)
        if (previewModal) {
            previewModal.addEventListener('click', (e) => {
                if (e.target === previewModal) {
                    closePreview();
                }
            });
        }

        // Zoom Controls
        if (previewZoomInBtn) {
            previewZoomInBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                setZoom(activeZoom + 10);
            });
        }

        if (previewZoomOutBtn) {
            previewZoomOutBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                setZoom(activeZoom - 10);
            });
        }

        if (previewZoomLevel) {
            previewZoomLevel.addEventListener('click', (e) => {
                e.stopPropagation();
                setZoom(100);
            });
        }

        // Top Bar Action: Delete (Move to Trash)
        if (previewDeleteBtn) {
            previewDeleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!activeFile) return;

                const filename = activeFile.name || activeFile.filename || 'this item';
                const fileId = activeFile.id || activeFile.file_id;

                closePreview();

                if (window.showConfirmModal) {
                    window.showConfirmModal({
                        title: 'Move to Trash',
                        messageHtml: `Are you sure you want to move <span class="confirm-highlight">"${filename}"</span> to trash?`,
                        confirmText: 'Move to Trash',
                        confirmType: 'danger',
                        onConfirm: async () => {
                            try {
                                if (fileId) {
                                    const res = await fetch(`/api/files/${fileId}`, { method: 'DELETE' });
                                    const data = await res.json();
                                    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to move to trash');
                                }
                                // Find corresponding row in the DOM and animate removal
                                const targetRow = document.querySelector(`.file-row[data-id="${fileId}"]`) 
                                    || document.querySelector(`.file-row [data-id="${fileId}"]`)?.closest('.file-row');
                                if (targetRow && window.animateRowRemoval) {
                                    window.animateRowRemoval(targetRow, 'No files found.');
                                }
                                if (window.showToast) {
                                    window.showToast(`Moved "${filename}" to trash`, 'success');
                                }
                            } catch (err) {
                                console.error('Move to trash error:', err);
                                if (window.showToast) {
                                    window.showToast(`Failed: ${err.message}`, 'error');
                                }
                            }
                        }
                    });
                }
            });
        }

        // Top Bar Action: Download
        if (previewDownloadBtn) {
            previewDownloadBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!activeFile) return;

                const filename = activeFile.name || activeFile.filename || 'download';
                const fileId = activeFile.id || activeFile.file_id;

                // Trigger mock or real download link
                const downloadUrl = fileId ? `/api/files/download/${fileId}` : `/mock-download/${encodeURIComponent(filename)}`;
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();

                if (window.showToast) {
                    window.showToast(`Downloading "${filename}"...`, 'info');
                }
            });
        }

        // Top Bar Action: Share
        if (previewShareBtn) {
            previewShareBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!activeFile) return;

                const fileId = activeFile.id || activeFile.file_id;
                closePreview();

                // Open share modal using share modal triggers or global function
                const shareModal = document.getElementById('shareModal');
                if (shareModal) {
                    shareModal.style.display = 'flex';
                    // Fallback synthetic trigger so share modal has file metadata even if not in DOM
                    let triggerBtn = document.querySelector(`.file-row[data-id="${fileId}"] .open-share-modal, .open-share-modal[data-id="${fileId}"]`);
                    if (!triggerBtn) {
                        triggerBtn = {
                            dataset: {
                                id: fileId,
                                filename: activeFile.name || activeFile.filename || 'Selected File',
                                type: activeFile.type || 'file',
                                category: activeFile.category || 'file',
                                mode: activeFile.isShared ? 'edit' : 'create',
                                shareId: activeFile.shareId || '',
                                shareUrl: activeFile.shareUrl || '',
                                expireHours: activeFile.shareExpireHours || '24',
                                maxDownloads: activeFile.shareMaxDownloads !== undefined ? String(activeFile.shareMaxDownloads) : '0',
                                hasPassword: activeFile.hasPassword ? 'true' : 'false',
                                access: encodeURIComponent(JSON.stringify(activeFile.accessList || []))
                            },
                            closest: () => null
                        };
                    }
                    window.activeShareFileBtn = triggerBtn;
                    if (window.renderAccessList) {
                        window.renderAccessList(activeFile.accessList || [], triggerBtn);
                    }
                }
            });
        }

        // Keyboard Escape to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && previewModal && previewModal.style.display === 'flex') {
                e.preventDefault();
                e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                closePreview();
            }
        });

        // Event Delegation for clicking "Preview" buttons across all menus and pages
        document.addEventListener('click', (e) => {
            const previewBtn = e.target.closest('.open-preview-modal');
            if (previewBtn) {
                e.preventDefault();
                e.stopPropagation();

                // Close any open dropdowns
                document.querySelectorAll('.options-dropdown, .new-options-dropdown').forEach(d => {
                    d.classList.remove('show');
                });

                const row = previewBtn.closest('.file-row');
                const fileId = previewBtn.dataset.id || '';
                let filename = previewBtn.dataset.filename || '';

                if (!filename && row) {
                    const nameEl = row.querySelector('.file-name, .col-name');
                    if (nameEl) {
                        const clone = nameEl.cloneNode(true);
                        clone.querySelectorAll('svg, i').forEach(icon => icon.remove());
                        filename = clone.textContent.trim();
                    }
                }

                const category = previewBtn.dataset.category || '';
                openPreview({
                    id: fileId,
                    name: filename || 'File1.txt',
                    category: category
                });
            }
        });

        // Double-click on any file row to open Preview directly
        document.addEventListener('dblclick', (e) => {
            // Do not trigger if double clicking on buttons, dropdowns, inputs, or badges
            if (e.target.closest('.options-wrapper, .options-dropdown, .new-options-dropdown, button, a, input, .shared-badge-inline, .file-share-badges, .file-tag-badge')) {
                return;
            }

            const row = e.target.closest('.file-row');
            if (!row) return;

            // Skip folders (folder navigation handles folder double-click)
            if (row.classList.contains('folder-row') || row.dataset.type === 'folder') {
                return;
            }

            // Extract file details
            const fileId = row.dataset.id || row.querySelector('[data-id]')?.dataset.id || '';
            let filename = row.dataset.name || '';

            if (!filename) {
                const nameTextEl = row.querySelector('.file-name-text');
                if (nameTextEl) {
                    filename = nameTextEl.textContent.trim();
                } else {
                    const nameEl = row.querySelector('.file-name, .col-name');
                    if (nameEl) {
                        const clone = nameEl.cloneNode(true);
                        clone.querySelectorAll('svg, i, .file-tags-wrapper, .shared-badge-inline').forEach(el => el.remove());
                        filename = clone.textContent.trim();
                    }
                }
            }

            const category = row.dataset.category || '';

            openPreview({
                id: fileId,
                name: filename || 'File1.txt',
                category: category
            });
        });
    });
})();
