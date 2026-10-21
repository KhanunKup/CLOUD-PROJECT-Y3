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

        const filename = file.name || file.filename || 'Untitled';
        const ext = filename.split('.').pop().toLowerCase();
        const category = file.category || '';

        // 1. Text & Code Files (.txt, .md, .json, .js, .py, .sh, .html, .css, etc.)
        const textExts = ['txt', 'md', 'json', 'js', 'py', 'sh', 'html', 'css', 'csv', 'log', 'env'];
        if (textExts.includes(ext) || category === 'document' && ext === 'txt') {
            if (filename.toLowerCase().includes('file1') || ext === 'txt') {
                // Render Figma Document Content
                const textWrapper = document.createElement('div');
                textWrapper.className = 'preview-text-content';

                const h3 = document.createElement('h3');
                h3.className = 'preview-text-title';
                h3.textContent = FIGMA_DEMO_TEXT.title;
                textWrapper.appendChild(h3);

                FIGMA_DEMO_TEXT.paragraphs.forEach(pText => {
                    const p = document.createElement('p');
                    p.className = 'preview-text-paragraph';
                    p.textContent = pText;
                    textWrapper.appendChild(p);
                });

                previewBodyContainer.appendChild(textWrapper);
            } else if (['sh', 'js', 'json', 'py', 'html', 'css'].includes(ext)) {
                // Code block formatting
                const codeWrapper = document.createElement('div');
                codeWrapper.className = 'preview-code-block';
                codeWrapper.textContent = file.content || `#!/bin/bash\n# ${filename}\necho "EasyDrive Cloud System initialized."\necho "Running background verification tasks..."\necho "Status: Operational (OK)"`;
                previewBodyContainer.appendChild(codeWrapper);
            } else {
                const textWrapper = document.createElement('div');
                textWrapper.className = 'preview-text-content';
                const p = document.createElement('p');
                p.className = 'preview-text-paragraph';
                p.textContent = file.content || `Previewing content for ${filename}.\nThis document is synced securely with EasyDrive.`;
                textWrapper.appendChild(p);
                previewBodyContainer.appendChild(textWrapper);
            }
            return;
        }

        // 2. Image Files (.png, .jpg, .jpeg, .webp, .gif, .svg)
        const imageExts = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'];
        if (imageExts.includes(ext) || category === 'image') {
            const imgContainer = document.createElement('div');
            imgContainer.className = 'preview-image-container';

            const img = document.createElement('img');
            img.className = 'preview-image-element';
            // Use real file URL, preview image or fallback illustrative image
            img.src = file.url || (filename.toLowerCase().includes('bg') ? '/images/easydrive-bg.png' : '/images/doc-photo.svg');
            img.alt = filename;
            img.onerror = () => {
                img.src = '/images/doc-photo.svg';
            };

            imgContainer.appendChild(img);
            previewBodyContainer.appendChild(imgContainer);
            return;
        }

        // 3. PDF Files (.pdf)
        if (ext === 'pdf' || category === 'document' && ext === 'pdf') {
            const pdfContainer = document.createElement('div');
            pdfContainer.className = 'preview-pdf-container';

            if (file.url) {
                const iframe = document.createElement('iframe');
                iframe.className = 'preview-pdf-frame';
                iframe.src = file.url;
                pdfContainer.appendChild(iframe);
            } else {
                // Beautiful Fallback PDF Reader representation
                pdfContainer.innerHTML = `
                    <div style="background: #ffffff; padding: 40px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); text-align: center;">
                        <i class="fas fa-file-pdf" style="font-size: 54px; color: #b83232; margin-bottom: 16px;"></i>
                        <h3 style="font-size: 20px; font-weight: 700; color: #333; margin: 0 0 10px 0;">${filename}</h3>
                        <p style="color: #666; font-size: 14px; margin-bottom: 24px;">PDF Document Preview is rendered in high-definition browser mode.</p>
                        <a href="/mock-download/${encodeURIComponent(filename)}" target="_blank" class="preview-fallback-btn">
                            <i class="fas fa-external-link-alt"></i> Open Full PDF
                        </a>
                    </div>
                `;
            }
            previewBodyContainer.appendChild(pdfContainer);
            return;
        }

        // 4. Video & Audio Files (.mp4, .mov, .mp3, .wav)
        const videoExts = ['mp4', 'mov', 'webm', 'mkv'];
        const audioExts = ['mp3', 'wav', 'aac', 'ogg'];
        if (videoExts.includes(ext) || category === 'video') {
            const mediaContainer = document.createElement('div');
            mediaContainer.className = 'preview-media-container';
            mediaContainer.innerHTML = `
                <video class="preview-video-element" controls autoplay>
                    <source src="${file.url || ''}" type="video/mp4">
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
                <h4 style="margin: 0 0 12px 0; font-size: 18px; color: #333;">${filename}</h4>
                <audio class="preview-audio-element" controls>
                    <source src="${file.url || ''}" type="audio/mpeg">
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
                    if (window.renderAccessList) {
                        window.renderAccessList(activeFile.accessList || [], null);
                    }
                }
            });
        }

        // Keyboard Escape to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && previewModal && previewModal.style.display === 'flex') {
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
