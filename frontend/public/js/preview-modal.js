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
        if (previewContentCard) {
            previewContentCard.className = 'preview-content-card';
        }

        const filename = file.name || file.filename || 'Untitled';
        const ext = filename.split('.').pop().toLowerCase();
        const category = file.category || '';

        // 1. Text & Code Files (.txt, .md, .json, .js, .py, .sh, .html, .css, etc.)
        const codeExts = ['py', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'scss', 'json', 'sh', 'bash', 'sql', 'java', 'c', 'cpp', 'cs', 'php', 'rb', 'go', 'rs', 'yaml', 'yml', 'xml', 'env'];
        const textExts = ['txt', 'md', 'csv', 'log', ...codeExts];
        if (textExts.includes(ext) || category === 'code' || (category === 'document' && (ext === 'txt' || ext === 'md'))) {
            if ((filename.toLowerCase().includes('file1') || ext === 'txt') && category !== 'code' && !codeExts.includes(ext)) {
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
            } else if (codeExts.includes(ext) || category === 'code') {
                if (previewContentCard) previewContentCard.classList.add('preview-card-code');
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
            if (previewContentCard) previewContentCard.classList.add('preview-card-image');
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
        const blobUrl = (window.uploadedBlobMap && (window.uploadedBlobMap.get(file.id) || window.uploadedBlobMap.get(filename))) || file.url;
        if (ext === 'pdf' || (category === 'document' && ext === 'pdf')) {
            if (blobUrl) {
                if (previewContentCard) previewContentCard.classList.add('preview-card-frame');
                const pdfContainer = document.createElement('div');
                pdfContainer.className = 'preview-pdf-container';
                const iframe = document.createElement('iframe');
                iframe.className = 'preview-pdf-frame';
                iframe.src = blobUrl;
                pdfContainer.appendChild(iframe);
                previewBodyContainer.appendChild(pdfContainer);
                return;
            }

            // High-definition Document Reader View for PDF
            const docPaper = document.createElement('div');
            docPaper.className = 'preview-doc-paper';

            const isProposal = filename.toLowerCase().includes('proposal') || filename.toLowerCase().includes('project');
            const docTitle = isProposal 
                ? 'Project Proposal: Cloud Storage Platform (EasyDrive)' 
                : filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

            docPaper.innerHTML = `
                <div class="preview-doc-meta-bar">
                    <span class="preview-doc-badge pdf"><i class="fas fa-file-pdf"></i> PDF Document</span>
                    <span class="preview-doc-info"><i class="far fa-file"></i> 2 Pages</span>
                    <span class="preview-doc-info"><i class="far fa-calendar-alt"></i> October 2026</span>
                    <span class="preview-doc-info"><i class="fas fa-shield-alt"></i> Verified Document</span>
                </div>

                <div class="preview-doc-header">
                    <h1 class="preview-doc-title">${docTitle}</h1>
                    <div class="preview-doc-subtitle">Faculty of Information Technology • King Mongkut's Institute of Technology Ladkrabang</div>
                    <div class="preview-doc-divider"></div>
                </div>

                <div class="preview-doc-section">
                    <h2 class="preview-doc-h2"><i class="fas fa-bookmark"></i> 1. Executive Summary & Objectives</h2>
                    <p class="preview-doc-p">
                        This technical proposal outlines the design, architecture, and deployment strategy for <strong>EasyDrive</strong> — an enterprise-grade cloud object storage solution tailored for academic and institutional workflows at KMITL. The system solves file storage fragmentation by delivering secure pre-signed uploads, low-latency metadata indexing, robust granular permissions, and end-to-end auditability.
                    </p>
                    <div class="preview-doc-highlight-box">
                        <strong>Key Project Goal:</strong> Provide a unified, scalable distributed storage interface that reduces server bandwidth utilization by 80% using direct-to-S3 presigned URLs, while maintaining zero unauthorized access through cryptographically signed access tokens.
                    </div>
                </div>

                <div class="preview-doc-section">
                    <h2 class="preview-doc-h2"><i class="fas fa-network-wired"></i> 2. System Architecture & AWS Infrastructure</h2>
                    <p class="preview-doc-p">
                        EasyDrive adopts an event-driven serverless & microservices hybrid model optimized for high throughput and high availability across AWS Availability Zones:
                    </p>
                    <ul class="preview-doc-list">
                        <li><strong>Storage Layer (Amazon S3):</strong> Primary object storage configured with Server-Side Encryption (SSE-S3/KMS), multi-part chunked upload for files exceeding 100MB, and lifecycle transition rules to S3 Glacier for long-term archives.</li>
                        <li><strong>Metadata Layer (Amazon DynamoDB):</strong> NoSQL document database utilizing Partition Keys (<code>user_id</code> / <code>file_id</code>) and Global Secondary Indexes (GSI) for sub-millisecond query performance on folder navigation and search.</li>
                        <li><strong>Asynchronous Processing (Amazon SNS + SQS Worker):</strong> Decoupled worker service handling background metadata extraction, SHA-256 integrity verification, and automatic tagging.</li>
                    </ul>
                </div>

                <div class="preview-doc-page-divider">
                    <span>Page 1 of 2</span>
                </div>

                <div class="preview-doc-section">
                    <h2 class="preview-doc-h2"><i class="fas fa-user-shield"></i> 3. Security, Granular Sharing & Compliance</h2>
                    <p class="preview-doc-p">
                        The security model enforces defense-in-depth across the data ingestion and consumption lifecycle:
                    </p>
                    <ul class="preview-doc-list">
                        <li><strong>Granular Role-Based Access:</strong> Specific permissions (Viewer, Downloader, Co-Owner) managed via encrypted share IDs with customizable expiration timers and download count limits.</li>
                        <li><strong>Audit Logging:</strong> All read, write, trash, and download events are immutably recorded with actor identity, timestamp, IP address, and cryptographic file hashes.</li>
                        <li><strong>Soft-Delete Recovery:</strong> Deleted items are staged in a dedicated Trash repository with 30-day restore capability before permanent sanitization.</li>
                    </ul>
                </div>

                <div class="preview-doc-section">
                    <h2 class="preview-doc-h2"><i class="fas fa-calendar-check"></i> 4. Milestones & Delivery Schedule</h2>
                    <div class="preview-doc-table-wrap">
                        <table class="preview-doc-table">
                            <thead>
                                <tr>
                                    <th>Phase</th>
                                    <th>Milestone Deliverable</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>Phase 1</td>
                                    <td>Core Architecture, S3 Presigned Upload & Auth Engine</td>
                                    <td><span class="preview-doc-status completed">Completed</span></td>
                                </tr>
                                <tr>
                                    <td>Phase 2</td>
                                    <td>Folder Hierarchy, Sharing Permissions & Audit Log UI</td>
                                    <td><span class="preview-doc-status completed">Completed</span></td>
                                </tr>
                                <tr>
                                    <td>Phase 3</td>
                                    <td>Inline Previews (PDF/DOCX/Code/Media) & Soft-Trash</td>
                                    <td><span class="preview-doc-status active">In Progress</span></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="preview-doc-page-divider">
                    <span>Page 2 of 2 • End of Document</span>
                </div>
            `;

            previewBodyContainer.appendChild(docPaper);
            return;
        }

        // 3.5 Word & Office Documents (.doc, .docx, .odt, .rtf)
        const docExts = ['doc', 'docx', 'odt', 'rtf', 'pages'];
        if (docExts.includes(ext) || (category === 'document' && docExts.includes(ext))) {
            const docPaper = document.createElement('div');
            docPaper.className = 'preview-doc-paper';

            const isNotes = filename.toLowerCase().includes('notes') || filename.toLowerCase().includes('meeting');
            const docTitle = isNotes 
                ? 'Sprint Review & Architecture Sync: EasyDrive' 
                : filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

            docPaper.innerHTML = `
                <div class="preview-doc-meta-bar">
                    <span class="preview-doc-badge doc"><i class="fas fa-file-word"></i> Word Document</span>
                    <span class="preview-doc-info"><i class="far fa-file-alt"></i> 1 Page</span>
                    <span class="preview-doc-info"><i class="far fa-calendar-alt"></i> October 2026</span>
                    <span class="preview-doc-info"><i class="fas fa-users"></i> Cloud Engineering Team</span>
                </div>

                <div class="preview-doc-header">
                    <h1 class="preview-doc-title">${docTitle}</h1>
                    <div class="preview-doc-subtitle">Meeting Notes & Sprint Retrospective • KMITL Cloud Engineering Sprint #4</div>
                    <div class="preview-doc-divider"></div>
                </div>

                <div class="preview-doc-section">
                    <div class="preview-doc-callout">
                        <strong>Meeting Details:</strong> Date: October 21, 2026 | Location: Lab 402 & Online | Facilitator: Tech Lead<br>
                        <strong>Attendees:</strong> Cloud Architect, Backend Lead, UI Engineer, DevOps Engineer
                    </div>
                </div>

                <div class="preview-doc-section">
                    <h2 class="preview-doc-h2"><i class="fas fa-clipboard-list"></i> Discussion Points & Review</h2>
                    <ul class="preview-doc-list">
                        <li><strong>Presigned Download URLs:</strong> Resolved issue with download permissions. Presigned links are now issued with temporary 15-minute expirations for security.</li>
                        <li><strong>Dedicated Code Category:</strong> Implemented <code>Code</code> category and filter chip on My Drive page with syntax highlighting for developer assets (.py, .js, .html, .css, etc.).</li>
                        <li><strong>Inline Document Preview:</strong> Agreed that users should be able to preview full PDF and Word documents directly inside the modal rather than seeing download prompts.</li>
                        <li><strong>Trash Lifecycle:</strong> Confirmed that "Move to Trash" soft-delete works consistently from file action menu, selection bar, and preview modal.</li>
                    </ul>
                </div>

                <div class="preview-doc-section">
                    <h2 class="preview-doc-h2"><i class="fas fa-tasks"></i> Action Items & Ownership</h2>
                    <ul class="preview-doc-checklist">
                        <li class="checked"><i class="fas fa-check-square"></i> <strong>[Frontend]</strong> Add rich PDF and DOC preview reader inside modal with zoom support.</li>
                        <li class="checked"><i class="fas fa-check-square"></i> <strong>[Backend]</strong> Map code extensions and auto-tagging in Worker and API.</li>
                        <li class="checked"><i class="fas fa-check-square"></i> <strong>[Frontend]</strong> Standardize share modal labels (Folder: name / File: name).</li>
                        <li class="unchecked"><i class="far fa-square"></i> <strong>[DevOps]</strong> Finalize CloudFormation template and run automated load testing.</li>
                    </ul>
                </div>

                <div class="preview-doc-page-divider">
                    <span>Page 1 of 1 • End of Document</span>
                </div>
            `;

            previewBodyContainer.appendChild(docPaper);
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
                    if (window.renderAccessList) {
                        const triggerBtn = document.querySelector(`.file-row[data-id="${fileId}"] .open-share-modal, .open-share-modal[data-id="${fileId}"]`);
                        window.renderAccessList(activeFile.accessList || [], triggerBtn);
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
