// ฟังก์ชันสำหรับรับค่ารายชื่อคนที่เข้าถึงไฟล์ได้ แล้วนำมาแสดงผลแบบไดนามิก
window.renderAccessList = function(accessList = [], triggerBtn = null) {
    window.currentAccessList = accessList; // Store globally to allow editing
    const container = document.getElementById('dynamic-access-list');
    if (!container) return;

    // เคลียร์ข้อมูลเก่าก่อน
    container.innerHTML = '';

    // ถ้าเปิดจากปุ่มไฟล์ใหม่ (triggerBtn ส่งมา)
    if (triggerBtn) {
        window.activeShareFileBtn = triggerBtn;

        // แสดงชื่อไฟล์ที่กำลังแชร์
        const fileNameEl = document.getElementById('shareModalFileName');
        if (fileNameEl) {
            fileNameEl.textContent = 'File: ' + (triggerBtn.dataset.filename || 'Selected File');
        }

        // รีเซ็ตค่า Security Settings กลับเป็นค่าเริ่มต้น
        const expireSelect = document.getElementById('shareExpireHours');
        if (expireSelect) expireSelect.value = '24';
        const maxDownSelect = document.getElementById('shareMaxDownloads');
        if (maxDownSelect) maxDownSelect.value = '0';
        const passInput = document.getElementById('sharePassword');
        if (passInput) passInput.value = '';
        const resultBox = document.getElementById('shareLinkResultBox');
        if (resultBox) resultBox.style.display = 'none';

        const serverAnyone = accessList.find(acc => acc.name && (acc.name.toLowerCase() === 'anyone' || acc.name.toLowerCase() === 'everyone'));
        if (serverAnyone) {
            // ใช้ค่าที่ไฟล์นี้เคยตั้งไว้ หรือค่าที่ส่งมาจาก server
            window.anyoneAccess = {
                permission: serverAnyone.permission || 'can view',
                timeRemaining: serverAnyone.timeRemaining || null
            };
        } else {
            // ถ้ายังไม่มีการตั้งค่า ให้ใช้ Default: everyone can view (Unlimited)
            window.anyoneAccess = { permission: 'can view', timeRemaining: null };
        }
    } else if (!window.anyoneAccess) {
        window.anyoneAccess = { permission: 'can view', timeRemaining: null };
    }

    const anyoneHtml = `
        <div class="access-item" data-names='["Anyone"]'>
            <div class="user-info">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                <span>Anyone</span>
            </div>
            <div class="access-details">
                <span class="time-remaining">Time remaining: ${window.anyoneAccess.timeRemaining || 'Unlimited'}</span>
                <button class="permission-dropdown">${window.anyoneAccess.permission}</button>
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', anyoneHtml);

    // 2. จัดกลุ่มรายชื่อที่มีสิทธิ์ (permission) และเวลา (timeRemaining) เหมือนกันเป๊ะๆ
    const grouped = {};
    accessList.forEach(acc => {
        // ข้าม Anyone ถ้าบังเอิญมีส่งมาจาก Backend เพื่อไม่ให้ซ้ำกับ Default
        if (acc.name && acc.name.toLowerCase() === 'anyone') return;

        const key = acc.permission + '|' + (acc.timeRemaining || '');
        if (!grouped[key]) {
            grouped[key] = {
                names: [],
                permission: acc.permission,
                timeRemaining: acc.timeRemaining
            };
        }
        grouped[key].names.push(acc.name);
    });

    // 3. วนลูปสร้าง HTML จากกลุ่มที่จัดแล้ว
    Object.values(grouped).forEach(group => {
        // จัดการข้อความเวลา
        const timeRemainingText = group.timeRemaining ? `Time remaining: ${group.timeRemaining}` : 'Time remaining: Unlimited';
        
        // จัดการแสดงผลชื่อ ถ้าเกิน 2 คนให้แสดง ... and X others
        let displayName = '';
        if (group.names.length === 1) {
            displayName = group.names[0];
        } else if (group.names.length === 2) {
            displayName = group.names[0] + ' and ' + group.names[1];
        } else {
            // เช่น anan and 4 others
            displayName = group.names[0] + ' and ' + (group.names.length - 1) + ' others';
        }

        const html = `
            <div class="access-item" data-names='${JSON.stringify(group.names).replace(/'/g, "&apos;")}'>
                <div class="user-info">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                    <span>${displayName}</span>
                </div>
                <div class="access-details">
                    <span class="time-remaining">${timeRemainingText}</span>
                    <button class="permission-dropdown">${group.permission}</button>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    });
};

document.addEventListener('DOMContentLoaded', () => {
    const shareModal = document.getElementById('shareModal');
    const closeShareModalBtn = document.getElementById('closeShareModalBtn');
    const saveChangesBtn = document.getElementById('saveChangesBtn');
    const cancelShareBtn = document.getElementById('cancelShareBtn');
    const copyLinkBtn = document.getElementById('copyLinkBtn');
    const copyLinkText = document.getElementById('copyLinkText');

    const closeModal = () => {
        if (shareModal) {
            shareModal.style.display = 'none';
        }
    };

    const createShareLinkBtn = document.getElementById('createShareLinkBtn');
    const createShareLinkText = document.getElementById('createShareLinkText');

    async function handleCreateShareLink() {
        const fileId = window.activeShareFileBtn ? window.activeShareFileBtn.dataset.id : null;
        if (!fileId) {
            if (window.showToast) window.showToast('Please select a file to share first', 'warning');
            return;
        }

        const expireHours = document.getElementById('shareExpireHours') ? document.getElementById('shareExpireHours').value : 24;
        const maxDownloads = document.getElementById('shareMaxDownloads') ? document.getElementById('shareMaxDownloads').value : 0;
        const password = document.getElementById('sharePassword') ? document.getElementById('sharePassword').value.trim() : '';

        const origBtnText = createShareLinkText ? createShareLinkText.textContent : 'Create & Copy Share Link';
        if (createShareLinkBtn) createShareLinkBtn.disabled = true;
        if (createShareLinkText) createShareLinkText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

        try {
            const res = await fetch('/api/shares', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_id: fileId,
                    expireHours: Number(expireHours),
                    maxDownloads: Number(maxDownloads),
                    password: password || undefined
                })
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Failed to generate share link');
            }

            const fullUrl = window.location.origin + data.shareUrl;

            // Copy to clipboard
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(fullUrl);
                } else {
                    const tempInput = document.createElement('input');
                    tempInput.value = fullUrl;
                    document.body.appendChild(tempInput);
                    tempInput.select();
                    document.execCommand('copy');
                    tempInput.remove();
                }
            } catch (clipErr) {
                console.warn('Clipboard write failed, link displayed in modal', clipErr);
            }

            // Display in result box
            const resultBox = document.getElementById('shareLinkResultBox');
            const linkA = document.getElementById('shareGeneratedLink');
            if (resultBox && linkA) {
                linkA.href = fullUrl;
                linkA.textContent = fullUrl;
                resultBox.style.display = 'block';
            }

            if (window.showToast) {
                window.showToast('Share link created & copied to clipboard!', 'success');
            }

            if (createShareLinkText) createShareLinkText.innerHTML = '<i class="fas fa-check"></i> Link Copied!';
            if (copyLinkText) copyLinkText.textContent = 'Copied!';

            setTimeout(() => {
                if (createShareLinkBtn) createShareLinkBtn.disabled = false;
                if (createShareLinkText) createShareLinkText.textContent = origBtnText;
                if (copyLinkText) copyLinkText.textContent = 'copy link';
            }, 2500);

        } catch (err) {
            console.error('Share generation error:', err);
            if (window.showToast) {
                window.showToast(`Error: ${err.message}`, 'error');
            }
            if (createShareLinkBtn) createShareLinkBtn.disabled = false;
            if (createShareLinkText) createShareLinkText.textContent = origBtnText;
        }
    }

    if (createShareLinkBtn) {
        createShareLinkBtn.addEventListener('click', handleCreateShareLink);
    }

    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', handleCreateShareLink);
    }

    const inviteInput = document.getElementById('invite-input');
    const invitePermission = document.getElementById('invite-permission');
    
    if (inviteInput && invitePermission) {
        inviteInput.addEventListener('input', (e) => {
            if (e.target.value.trim().length > 0) {
                invitePermission.style.display = 'block';
            } else {
                invitePermission.style.display = 'none';
            }
        });
    }

    // เมื่อกดปุ่ม Invite ให้เปลี่ยนข้อความเป็น "Invited!" และเปลี่ยนกลับหลังจาก 2 วินาที
    const inviteBtn = document.getElementById('invite-btn');
    if (inviteBtn) {
        inviteBtn.addEventListener('click', () => {
            const val = inviteInput ? inviteInput.value.trim() : '';
            // if (val.length === 0) return; // do nothing if empty
            
            // TODO: Here you could add the new person to the currentAccessList dynamically
            
            inviteBtn.textContent = 'Invited!';
            if (inviteInput) inviteInput.value = '';
            if (invitePermission) invitePermission.style.display = 'none';
            
            setTimeout(() => {
                inviteBtn.textContent = 'Invite';
            }, 1000);
        });
    }

    if (saveChangesBtn) {
        saveChangesBtn.addEventListener('click', () => {
            if (window.activeShareFileBtn) {
                let fullList = window.currentAccessList ? [...window.currentAccessList] : [];
                // ตัด Anyone เดิมออกก่อนแล้วใส่ Anyone ที่อัปเดตใหม่เข้าไป
                fullList = fullList.filter(acc => acc.name && acc.name.toLowerCase() !== 'anyone');
                fullList.push({
                    name: 'Anyone',
                    permission: (window.anyoneAccess && window.anyoneAccess.permission) || 'can view',
                    timeRemaining: (window.anyoneAccess && window.anyoneAccess.timeRemaining) || null
                });
                window.activeShareFileBtn.dataset.access = encodeURIComponent(JSON.stringify(fullList));
            }
            closeModal();
        });
    }

    if (cancelShareBtn) {
        cancelShareBtn.addEventListener('click', closeModal);
    }

    if (closeShareModalBtn) {
        closeShareModalBtn.addEventListener('click', closeModal);
    }

    if (cancelShareBtn) {
        cancelShareBtn.addEventListener('click', closeModal);
    }

    if (shareModal) {
        shareModal.addEventListener('click', (e) => {
            if (e.target === shareModal) {
                closeModal();
            }
        });
    }
});
