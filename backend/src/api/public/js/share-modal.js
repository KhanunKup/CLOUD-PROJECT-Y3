// ฟังก์ชันสำหรับรับค่ารายชื่อคนที่เข้าถึงไฟล์ได้ แล้วนำมาแสดงผลแบบไดนามิก
window.renderAccessList = function(accessList = [], triggerBtn = null) {
    window.currentAccessList = accessList; // Store globally to allow editing
    const container = document.getElementById('dynamic-access-list');
    if (!container) return;

    // เคลียร์ข้อมูลเก่าก่อน
    container.innerHTML = '';

    const shareModeInput = document.getElementById('shareModeInput');
    const shareIdInput = document.getElementById('shareIdInput');
    const shareModalTitle = document.getElementById('shareModalTitle');
    const shareStatusBadge = document.getElementById('shareStatusBadge');
    const createShareLinkText = document.getElementById('createShareLinkText');
    const modalStopShareBtn = document.getElementById('modalStopShareBtn');
    const pwNotice = document.getElementById('sharePasswordCurrentNotice');
    const removePwCheckbox = document.getElementById('shareRemovePasswordCheckbox');
    const resultBox = document.getElementById('shareLinkResultBox');
    const linkA = document.getElementById('shareGeneratedLink');

    // ถ้าเปิดจากปุ่มไฟล์ใหม่ (triggerBtn ส่งมา)
    if (triggerBtn) {
        window.activeShareFileBtn = triggerBtn;

        // ตรวจสอบว่าเป็นไฟล์หรือโฟลเดอร์
        const isFolder = triggerBtn.dataset.type === 'folder' || triggerBtn.dataset.category === 'folder' || Boolean(triggerBtn.closest('.folder-options, .folder-row')) || triggerBtn.closest('.file-row')?.dataset?.type === 'folder';
        const itemTypeLabel = isFolder ? 'Folder' : 'File';
        const filename = triggerBtn.dataset.filename || (isFolder ? 'Selected Folder' : 'Selected File');
        const fileNameEl = document.getElementById('shareModalFileName');
        if (fileNameEl) {
            fileNameEl.textContent = `${itemTypeLabel}: ${filename}`;
        }

        const mode = triggerBtn.dataset.mode || 'create';
        const isEdit = mode === 'edit';

        if (shareModeInput) shareModeInput.value = isEdit ? 'edit' : 'create';
        if (shareIdInput) shareIdInput.value = triggerBtn.dataset.shareId || '';

        if (shareModalTitle) {
            shareModalTitle.textContent = isEdit ? 'Edit Share Settings' : 'Share this';
        }

        if (shareStatusBadge) {
            shareStatusBadge.innerHTML = isEdit
                ? '<span style="background: rgba(46, 125, 50, 0.25); border: 1px solid rgba(129, 199, 132, 0.4); padding: 2px 8px; border-radius: 12px; color: #a5d6a7;"><i class="fas fa-circle-check"></i> Active Share</span>'
                : '';
        }

        // Expiration (TTL)
        const expireSelect = document.getElementById('shareExpireHours');
        if (expireSelect) {
            expireSelect.value = isEdit && triggerBtn.dataset.expireHours ? triggerBtn.dataset.expireHours : '24';
        }

        // Download Limit
        const maxDownSelect = document.getElementById('shareMaxDownloads');
        if (maxDownSelect) {
            maxDownSelect.value = isEdit && triggerBtn.dataset.maxDownloads !== undefined ? triggerBtn.dataset.maxDownloads : '0';
        }

        // Passcode Protection
        const passInput = document.getElementById('sharePassword');
        if (passInput) {
            passInput.value = '';
            if (isEdit && triggerBtn.dataset.hasPassword === 'true') {
                passInput.placeholder = 'Leave blank to keep current password';
            } else {
                passInput.placeholder = 'Leave empty for public link';
            }
        }

        if (pwNotice) {
            pwNotice.style.display = (isEdit && triggerBtn.dataset.hasPassword === 'true') ? 'flex' : 'none';
        }
        if (removePwCheckbox) {
            removePwCheckbox.checked = false;
        }

        // Action Buttons
        if (createShareLinkText) {
            createShareLinkText.textContent = isEdit ? 'Update Share Settings' : 'Create & Copy Share Link';
        }

        if (modalStopShareBtn) {
            modalStopShareBtn.style.display = isEdit ? 'inline-flex' : 'none';
        }

        // Share Link display
        if (isEdit && triggerBtn.dataset.shareUrl) {
            const fullUrl = window.location.origin + triggerBtn.dataset.shareUrl;
            if (resultBox && linkA) {
                linkA.href = fullUrl;
                linkA.textContent = fullUrl;
                resultBox.style.display = 'block';
            }
        } else {
            if (resultBox) resultBox.style.display = 'none';
        }

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
                <span title="Anyone">Anyone</span>
            </div>
            <div class="access-details">
                <span class="time-remaining">Time remaining: ${window.anyoneAccess.timeRemaining || 'Unlimited'}</span>
                <button class="permission-dropdown">${window.anyoneAccess.permission}</button>
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', anyoneHtml);

    // 2. วนลูปสร้าง HTML สำหรับผู้ใช้แต่ละคนแบบรายบุคคล (Individual Collaborators)
    const specificCollaborators = accessList.filter(acc => {
        const n = (acc.name || acc.email || '').toLowerCase();
        return n !== 'anyone' && n !== 'everyone';
    });

    specificCollaborators.forEach(collab => {
        const userEmail = (collab.email || collab.name || '').trim();
        const timeRemainingText = collab.timeRemaining ? `Time remaining: ${collab.timeRemaining}` : 'Time remaining: Unlimited';

        const html = `
            <div class="access-item" data-email="${userEmail}" data-names='${JSON.stringify([userEmail]).replace(/'/g, "&apos;")}'>
                <div class="user-info">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                    <span title="${userEmail}">${userEmail}</span>
                </div>
                <div class="access-details">
                    <span class="time-remaining">${timeRemainingText}</span>
                    <select class="permission-dropdown permission-select" data-email="${userEmail}">
                        <option value="can view" ${collab.permission !== 'can edit' ? 'selected' : ''}>can view</option>
                        <option value="can edit" ${collab.permission === 'can edit' ? 'selected' : ''}>can edit</option>
                    </select>
                    <button type="button" class="remove-access-btn" data-email="${userEmail}" title="Remove collaborator" style="background: none; border: none; color: #ffb4b4; cursor: pointer; padding: 4px 6px; font-size: 15px; margin-left: 6px; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px;"><i class="fas fa-times"></i></button>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    });

    // Event listener for inline permission dropdown change
    container.querySelectorAll('.permission-select').forEach(select => {
        select.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        select.addEventListener('change', async (e) => {
            e.stopPropagation();
            const targetEmail = (select.dataset.email || '').toLowerCase();
            const newPerm = select.value;
            const targetCollab = (window.currentAccessList || []).find(a => (a.email || a.name || '').toLowerCase() === targetEmail);
            if (targetCollab) {
                targetCollab.permission = newPerm;
            }

            // Auto-save to backend immediately
            const fileId = window.activeShareFileBtn ? (window.activeShareFileBtn.dataset.id || window.activeShareFileBtn.dataset.folderId) : null;
            if (fileId) {
                const specificCollaborators = (window.currentAccessList || []).filter(acc => {
                    const n = (acc.name || acc.email || '').toLowerCase();
                    return n !== 'anyone' && n !== 'everyone';
                });

                try {
                    const res = await fetch(`/api/files/${fileId}/access`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ accessList: specificCollaborators })
                    });
                    const data = await res.json();
                    if (!data.success) throw new Error(data.error || 'Failed to update access');
                    if (window.showToast) {
                        window.showToast(`Updated permission for ${targetEmail} to "${newPerm}"`, 'success');
                    }
                } catch (err) {
                    console.error('Auto-save permission error:', err);
                    if (window.showToast) {
                        window.showToast('Failed to update permission: ' + err.message, 'error');
                    }
                }
            }
        });
    });

    // Event listener for removing collaborators from access list
    container.querySelectorAll('.remove-access-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const item = btn.closest('.access-item');
            if (!item) return;
            const namesData = item.getAttribute('data-names');
            if (!namesData) return;
            try {
                const names = JSON.parse(namesData);
                window.currentAccessList = (window.currentAccessList || []).filter(acc => !names.includes(acc.name) && !names.includes(acc.email));
                if (window.renderAccessList) {
                    window.renderAccessList(window.currentAccessList);
                }
                if (window.showToast) {
                    window.showToast('Removed collaborator(s) from access list', 'info');
                }
            } catch (err) {
                console.error('Error removing collaborator:', err);
            }
        });
    });
};

document.addEventListener('DOMContentLoaded', () => {
    const shareModal = document.getElementById('shareModal');
    const closeShareModalBtn = document.getElementById('closeShareModalBtn');
    const saveChangesBtn = document.getElementById('saveChangesBtn');
    const cancelShareBtn = document.getElementById('cancelShareBtn');
    const copyLinkBtn = document.getElementById('copyLinkBtn');
    const copyLinkText = document.getElementById('copyLinkText');
    const modalStopShareBtn = document.getElementById('modalStopShareBtn');

    const closeModal = () => {
        if (shareModal) {
            shareModal.style.display = 'none';
        }
    };

    const createShareLinkBtn = document.getElementById('createShareLinkBtn');
    const createShareLinkText = document.getElementById('createShareLinkText');

    async function handleCreateShareLink() {
        const isEdit = document.getElementById('shareModeInput') && document.getElementById('shareModeInput').value === 'edit';
        const shareId = document.getElementById('shareIdInput') ? document.getElementById('shareIdInput').value : null;
        // Guarded window.activeShareFileBtn fallback
        const fileId = window.activeShareFileBtn ? (window.activeShareFileBtn.dataset.id || window.activeShareFileBtn.dataset.folderId) : null;

        if (!isEdit && !fileId) {
            if (window.showToast) window.showToast('Please select a file to share first', 'warning');
            return;
        }
        if (isEdit && !shareId) {
            if (window.showToast) window.showToast('Missing share link ID', 'error');
            return;
        }

        const expireHours = document.getElementById('shareExpireHours') ? document.getElementById('shareExpireHours').value : 24;
        const maxDownloads = document.getElementById('shareMaxDownloads') ? document.getElementById('shareMaxDownloads').value : 0;
        const password = document.getElementById('sharePassword') ? document.getElementById('sharePassword').value.trim() : '';
        const removePassword = document.getElementById('shareRemovePasswordCheckbox') ? document.getElementById('shareRemovePasswordCheckbox').checked : false;

        const origBtnText = isEdit ? 'Update Share Settings' : 'Create & Copy Share Link';
        if (createShareLinkBtn) createShareLinkBtn.disabled = true;
        if (createShareLinkText) createShareLinkText.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${isEdit ? 'Updating...' : 'Generating...'}`;

        try {
            if (isEdit) {
                const payload = {
                    expireHours: Number(expireHours),
                    maxDownloads: Number(maxDownloads)
                };
                if (removePassword) {
                    payload.removePassword = true;
                } else if (password) {
                    payload.password = password;
                }

                const res = await fetch(`/api/shares/${shareId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                if (!res.ok || !data.success) {
                    throw new Error(data.error || 'Failed to update share settings');
                }

                const hasPw = removePassword ? false : (password ? true : (window.activeShareFileBtn?.dataset?.hasPassword === 'true'));
                if (window.activeShareFileBtn) {
                    window.activeShareFileBtn.dataset.expireHours = expireHours;
                    window.activeShareFileBtn.dataset.maxDownloads = maxDownloads;
                    window.activeShareFileBtn.dataset.hasPassword = hasPw ? 'true' : 'false';
                }

                if (window.updateShareRowBadges) {
                    window.updateShareRowBadges(shareId, {
                        expireHours: Number(expireHours),
                        maxDownloads: Number(maxDownloads),
                        hasPassword: hasPw
                    });
                }

                if (window.showToast) {
                    window.showToast('Share settings updated successfully!', 'success');
                }
                if (createShareLinkText) createShareLinkText.innerHTML = '<i class="fas fa-check"></i> Updated!';

                setTimeout(() => {
                    closeModal();
                    if (createShareLinkBtn) createShareLinkBtn.disabled = false;
                    if (createShareLinkText) createShareLinkText.textContent = origBtnText;
                }, 400);
                return;
            } else {
                // Mode Create
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

                // Real-Time DOM Update on Drive
                if (window.markFileAsShared) {
                    window.markFileAsShared(fileId, data);
                }

                if (createShareLinkText) createShareLinkText.innerHTML = '<i class="fas fa-check"></i> Link Copied!';
                if (copyLinkText) copyLinkText.textContent = 'Copied!';

                setTimeout(() => {
                    if (createShareLinkBtn) createShareLinkBtn.disabled = false;
                    if (createShareLinkText) createShareLinkText.textContent = origBtnText;
                    if (copyLinkText) copyLinkText.textContent = 'copy link';
                }, 1800);
            }
        } catch (err) {
            console.error('Share action error:', err);
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
        copyLinkBtn.addEventListener('click', async () => {
            const isEdit = document.getElementById('shareModeInput') && document.getElementById('shareModeInput').value === 'edit';
            if (isEdit && window.activeShareFileBtn && window.activeShareFileBtn.dataset.shareUrl) {
                const fullUrl = window.location.origin + window.activeShareFileBtn.dataset.shareUrl;
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
                    if (window.showToast) window.showToast('Share link copied to clipboard!', 'success');
                    if (copyLinkText) copyLinkText.textContent = 'Copied!';
                    setTimeout(() => { if (copyLinkText) copyLinkText.textContent = 'copy link'; }, 1500);
                } catch (err) {
                    console.warn('Copy link error:', err);
                }
                return;
            }
            handleCreateShareLink();
        });
    }

    if (modalStopShareBtn) {
        modalStopShareBtn.addEventListener('click', () => {
            const shareId = document.getElementById('shareIdInput') ? document.getElementById('shareIdInput').value : null;
            if (!shareId) return;

            const filename = (window.activeShareFileBtn && window.activeShareFileBtn.dataset.filename) || 'this file';

            if (window.showConfirmModal) {
                closeModal();
                window.showConfirmModal({
                    title: 'Stop Sharing',
                    messageHtml: `Are you sure you want to stop sharing <span class="confirm-highlight">"${filename}"</span>?<br><br>The public link will be deactivated immediately and anyone with the link will lose access.`,
                    warning: 'This will revoke the shared link immediately.',
                    confirmText: 'Stop Sharing',
                    confirmType: 'danger',
                    onConfirm: async () => {
                        try {
                            const res = await fetch(`/api/shares/${shareId}`, { method: 'DELETE' });
                            const data = await res.json();
                            if (!res.ok || !data.success) throw new Error(data.error || 'Failed to revoke share');

                            if (window.showToast) window.showToast(`Stopped sharing "${filename}"`, 'success');

                            const fileId = (window.activeShareFileBtn && window.activeShareFileBtn.dataset.id) || null;
                            if (window.markFileAsUnshared) {
                                window.markFileAsUnshared(fileId, shareId);
                            }
                        } catch (err) {
                            console.error('Stop share error:', err);
                            if (window.showToast) window.showToast(`Failed: ${err.message}`, 'error');
                        }
                    }
                });
            }
        });
    }

    // ─── Real-Time DOM Helper: Update Share Row Badges on /shared and /drive ───
    window.updateShareRowBadges = function(shareId, updateData) {
        if (!shareId) return;

        // 1. If on /shared, update row in #sharedByMeTable
        const row = document.getElementById(`row-share-${shareId}`) || document.querySelector(`[data-share-id="${shareId}"]`)?.closest('.file-row');
        if (row) {
            const badgesContainer = row.querySelector('.file-share-badges');
            if (badgesContainer) {
                badgesContainer.dataset.expireHours = updateData.expireHours;
                badgesContainer.dataset.maxDownloads = updateData.maxDownloads;
                if (updateData.hasPassword !== undefined) {
                    badgesContainer.dataset.hasPassword = updateData.hasPassword ? 'true' : 'false';
                }

                const isPw = badgesContainer.dataset.hasPassword === 'true';
                const pwHtml = isPw
                    ? '<span class="badge-share-status badge-pw" title="Password Protected"><i class="fas fa-lock"></i> Password</span>'
                    : '<span class="badge-share-status badge-public" title="Public Link"><i class="fas fa-globe"></i> Public</span>';

                const ttlHtml = `<span class="badge-share-status badge-ttl" title="Time Remaining"><i class="fas fa-clock"></i> ${updateData.expireHours}h left</span>`;

                const maxDl = Number(updateData.maxDownloads) || 0;
                const dlHtml = maxDl > 0
                    ? `<span class="badge-share-status badge-dl-limit" title="Downloads Left"><i class="fas fa-fire"></i> ${maxDl} DL left</span>`
                    : '<span class="badge-share-status badge-dl-unlimited" title="Downloads"><i class="fas fa-download"></i> Unlimited</span>';

                badgesContainer.innerHTML = `${pwHtml}\n${ttlHtml}\n${dlHtml}`;
            }

            // Also update any trigger button inside this row
            const shareBtn = row.querySelector('.open-share-modal:not(.file-share-badges)');
            if (shareBtn) {
                shareBtn.dataset.expireHours = updateData.expireHours;
                shareBtn.dataset.maxDownloads = updateData.maxDownloads;
                if (updateData.hasPassword !== undefined) {
                    shareBtn.dataset.hasPassword = updateData.hasPassword ? 'true' : 'false';
                }
            }
        }

        // 2. If on /drive, update .shared-badge-inline and dropdown button
        const driveBadges = document.querySelectorAll(`.shared-badge-inline[data-share-id="${shareId}"], .open-share-modal[data-share-id="${shareId}"]`);
        driveBadges.forEach(el => {
            el.dataset.expireHours = updateData.expireHours;
            el.dataset.maxDownloads = updateData.maxDownloads;
            if (updateData.hasPassword !== undefined) {
                el.dataset.hasPassword = updateData.hasPassword ? 'true' : 'false';
            }
        });
    };

    const inviteInput = document.getElementById('invite-input');
    const invitePermission = document.getElementById('invite-permission');
    
    if (invitePermission) {
        invitePermission.style.display = 'block';
    }

    // เมื่อกดปุ่ม Invite: ตรวจสอบความถูกต้องของอีเมล เพิ่มเข้าสู่ currentAccessList และ render ใหม่
    const inviteBtn = document.getElementById('invite-btn');
    if (inviteBtn) {
        inviteBtn.addEventListener('click', () => {
            const rawVal = inviteInput ? inviteInput.value.trim() : '';
            if (!rawVal) {
                if (window.showToast) {
                    window.showToast('Please enter at least one email address to invite', 'warning');
                } else {
                    alert('Please enter at least one email address to invite');
                }
                return;
            }

            const rawEmails = rawVal.split(',').map(e => e.trim()).filter(Boolean);
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const invalidEmails = rawEmails.filter(e => !emailRegex.test(e));

            if (invalidEmails.length > 0) {
                if (window.showToast) {
                    window.showToast(`Invalid email address: ${invalidEmails.join(', ')}`, 'warning');
                } else {
                    alert(`Invalid email address: ${invalidEmails.join(', ')}`);
                }
                return;
            }

            const permission = (invitePermission && invitePermission.value) ? invitePermission.value : 'can view';
            window.currentAccessList = window.currentAccessList || [];

            let addedCount = 0;
            rawEmails.forEach(email => {
                const normalized = email.toLowerCase();
                const existing = window.currentAccessList.find(a => (a.email || a.name || '').toLowerCase() === normalized);
                if (existing) {
                    existing.permission = permission; // Update permission if already invited
                } else {
                    window.currentAccessList.push({
                        name: email,
                        email: normalized,
                        permission: permission,
                        timeRemaining: null
                    });
                    addedCount++;
                }
            });

            if (window.renderAccessList) {
                window.renderAccessList(window.currentAccessList);
            }

            if (window.showToast) {
                window.showToast(`Added ${rawEmails.length} collaborator(s) (${permission})`, 'success');
            }

            // บันทึกสิทธิ์ลงฐานข้อมูลอัตโนมัติทันทีเมื่อกด Invite
            const fileId = window.activeShareFileBtn ? (window.activeShareFileBtn.dataset.id || window.activeShareFileBtn.dataset.folderId) : null;
            if (fileId) {
                const specificCollaborators = window.currentAccessList.filter(acc => {
                    const n = (acc.name || acc.email || '').toLowerCase();
                    return n !== 'anyone' && n !== 'everyone';
                });

                fetch(`/api/files/${fileId}/access`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accessList: specificCollaborators })
                }).then(res => res.json()).then(data => {
                    if (!data.success) throw new Error(data.error);
                    if (window.markFileAsShared) {
                        window.markFileAsShared(fileId, {
                            shareId: `invite-${fileId}`,
                            accessList: specificCollaborators,
                            hasPassword: false,
                            expireHours: '24',
                            maxDownloads: 0
                        });
                    }
                }).catch(err => {
                    console.error('Auto-save collaborator error:', err);
                });
            }

            inviteBtn.textContent = 'Invited!';
            if (inviteInput) inviteInput.value = '';
            // invitePermission stays visible

            setTimeout(() => {
                inviteBtn.textContent = 'Invite';
            }, 1000);
        });
    }

    if (saveChangesBtn) {
        saveChangesBtn.addEventListener('click', async () => {
            const fileId = window.activeShareFileBtn ? window.activeShareFileBtn.dataset.id : null;
            let fullList = window.currentAccessList ? [...window.currentAccessList] : [];
            const specificCollaborators = fullList.filter(acc => acc.name && acc.name.toLowerCase() !== 'anyone');

            if (fileId) {
                try {
                    const res = await fetch(`/api/files/${fileId}/access`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ accessList: specificCollaborators })
                    });
                    const data = await res.json();
                    if (!res.ok || !data.success) {
                        throw new Error(data.error || 'Failed to update access list');
                    }
                    if (window.showToast) {
                        window.showToast('Collaborator access permissions saved!', 'success');
                    }
                    if (window.activeShareFileBtn) {
                        window.activeShareFileBtn.dataset.access = encodeURIComponent(JSON.stringify(fullList));
                    }
                } catch (err) {
                    console.error('Error saving access list:', err);
                    if (window.showToast) {
                        window.showToast(`Save failed: ${err.message}`, 'error');
                    }
                }
            } else if (window.activeShareFileBtn) {
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
