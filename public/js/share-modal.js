// ฟังก์ชันสำหรับรับค่ารายชื่อคนที่เข้าถึงไฟล์ได้ แล้วนำมาแสดงผลแบบไดนามิก
window.renderAccessList = function(accessList = []) {
    window.currentAccessList = accessList; // Store globally to allow editing
    const container = document.getElementById('dynamic-access-list');
    if (!container) return;

    // เคลียร์ข้อมูลเก่าก่อน
    container.innerHTML = '';

    // 1. ใส่ "Anyone" เป็นค่า default ที่มีตลอดตามที่ต้องการ
    if (!window.anyoneAccess) {
        window.anyoneAccess = { permission: 'can view', timeRemaining: '67 days' };
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

    if (copyLinkBtn && copyLinkText) {
        copyLinkBtn.addEventListener('click', () => {
            // โค้ดจำลองการคัดลอกลิงก์
            // navigator.clipboard.writeText("https://easydrive.com/share/...");
            
            // เปลี่ยนข้อความเพื่อ Feedback ผู้ใช้
            copyLinkText.textContent = 'Copied!';
            
            // เปลี่ยนข้อความกลับหลังจาก 2 วินาที
            setTimeout(() => {
                copyLinkText.textContent = 'copy link';
            }, 1000);
        });
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
        saveChangesBtn.addEventListener('click', closeModal);
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
