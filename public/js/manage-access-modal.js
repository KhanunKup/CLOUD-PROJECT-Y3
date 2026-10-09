// public/js/manage-access-modal.js
document.addEventListener('DOMContentLoaded', () => {
    const manageModal = document.getElementById('manageAccessModal');
    const saveBtn = document.getElementById('maSaveBtn');
    const shareModal = document.getElementById('shareModal'); // for returning maybe?
    
    // elements to update
    const maUserName = document.getElementById('ma-user-name');
    const maGlobeIcon = document.getElementById('ma-globe-icon');
    const maUserIcon = document.getElementById('ma-user-icon');
    
    let currentEditingNames = [];
    
    // When an access item is clicked in the dynamic-access-list or static one
    document.addEventListener('click', (e) => {
        const accessItem = e.target.closest('.access-item');
        
        if (accessItem) {
            // Find user name
            const span = accessItem.querySelector('.user-info span');
            if (span) {
                const name = span.textContent.trim();
                maUserName.textContent = name;
                
                if (name.toLowerCase() === 'anyone') {
                    maGlobeIcon.style.display = 'inline';
                    maUserIcon.style.display = 'none';
                } else {
                    maGlobeIcon.style.display = 'none';
                    maUserIcon.style.display = 'inline';
                }
            }
            
            const namesData = accessItem.getAttribute('data-names');
            const dropdownIcon = document.getElementById('ma-user-dropdown-icon');
            const dropdownList = document.getElementById('ma-user-dropdown-list');
            
            if (namesData && dropdownIcon && dropdownList) {
                try {
                    let namesArray = JSON.parse(namesData);
                    currentEditingNames = [...namesArray];
                    
                    const renderDropdown = () => {
                        if (namesArray.length > 1) {
                            dropdownIcon.style.display = 'inline-block';
                            dropdownList.innerHTML = '';
                            namesArray.forEach((n, index) => {
                                const row = document.createElement('div');
                                row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 4px 10px; background-color: #798369; border-radius: 6px; margin-bottom: 2px; color: #dbe4cd;';
                                row.innerHTML = `
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <i class="far fa-user-circle" style="font-size: 15px;"></i>
                                        <span style="font-weight: 600; font-size: 14px;">${n}</span>
                                    </div>
                                    <i class="fas fa-times remove-user-btn" data-index="${index}" style="cursor: pointer; color: inherit; font-size: 12px; opacity: 0.8;" title="Remove access"></i>
                                `;
                                dropdownList.appendChild(row);
                            });
                            dropdownList.style.display = 'none'; // hide by default when first opening modal
                            dropdownIcon.classList.remove('fa-chevron-up');
                            dropdownIcon.classList.add('fa-chevron-down');
                            
                            // Attach events to X buttons
                            dropdownList.querySelectorAll('.remove-user-btn').forEach(btn => {
                                btn.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    const idx = parseInt(btn.getAttribute('data-index'));
                                    const removedName = namesArray[idx];
                                    namesArray.splice(idx, 1);
                                    currentEditingNames = [...namesArray]; // update current editing
                                    
                                    // Remove from global list entirely if desired, but for now we just remove from current array
                                    if (window.currentAccessList) {
                                        window.currentAccessList = window.currentAccessList.filter(acc => acc.name !== removedName);
                                    }
                                    
                                    // Update parent data
                                    accessItem.setAttribute('data-names', JSON.stringify(namesArray));
                                    
                                    // Update display name
                                    let newDisplayName = '';
                                    if (namesArray.length === 1) {
                                        newDisplayName = namesArray[0];
                                    } else if (namesArray.length === 2) {
                                        newDisplayName = namesArray[0] + ' and ' + namesArray[1];
                                    } else if (namesArray.length > 2) {
                                        newDisplayName = namesArray[0] + ' and ' + (namesArray.length - 1) + ' others';
                                    }
                                    
                                    maUserName.textContent = newDisplayName;
                                    
                                    // Re-render dropdown or hide it
                                    if (namesArray.length > 1) {
                                        renderDropdown();
                                        dropdownList.style.display = 'flex'; // keep it open
                                        dropdownIcon.classList.remove('fa-chevron-down');
                                        dropdownIcon.classList.add('fa-chevron-up');
                                    } else {
                                        dropdownIcon.style.display = 'none';
                                        dropdownList.style.display = 'none';
                                    }
                                    
                                    // Also update original text in access item list behind the modal
                                    const parentSpan = accessItem.querySelector('.user-info span');
                                    if (parentSpan) parentSpan.textContent = newDisplayName;
                                    
                                    // re-render the background list
                                    if (window.renderAccessList) {
                                        window.renderAccessList(window.currentAccessList);
                                    }
                                });
                            });
                        } else {
                            dropdownIcon.style.display = 'none';
                            dropdownList.style.display = 'none';
                        }
                    };
                    
                    renderDropdown();
                    
                } catch (e) {
                    console.error("Error parsing names", e);
                    dropdownIcon.style.display = 'none';
                    dropdownList.style.display = 'none';
                }
            } else if (dropdownIcon && dropdownList) {
                dropdownIcon.style.display = 'none';
                dropdownList.style.display = 'none';
            }
            
            // pre-fill the modal with current group settings
            // find one of the members to get their current settings
            if (currentEditingNames.length > 0) {
                const sampleName = currentEditingNames[0];
                let acc = null;
                if (sampleName === 'Anyone') {
                    acc = window.anyoneAccess;
                } else if (window.currentAccessList) {
                    acc = window.currentAccessList.find(a => a.name === sampleName);
                }
                
                if (acc) {
                    const permRadio = document.querySelector(`input[name="ma-permission"][value="${acc.permission}"]`);
                    if (permRadio) permRadio.checked = true;
                    
                    const foreverCheck = document.getElementById('ma-time-forever');
                    if (acc.timeRemaining && acc.timeRemaining !== 'Unlimited') {
                        foreverCheck.checked = false;
                        // we'd parse timeRemaining here, but for simplicity we just leave inputs blank if it's a test
                    } else {
                        foreverCheck.checked = true;
                    }
                    toggleTimeInputs();
                }
            }
            
            // Show modal
            if (manageModal) {
                manageModal.style.display = 'flex';
            }
        }
    });

    const dropdownIcon = document.getElementById('ma-user-dropdown-icon');
    const dropdownList = document.getElementById('ma-user-dropdown-list');
    if (dropdownIcon && dropdownList) {
        dropdownIcon.addEventListener('click', () => {
            if (dropdownList.style.display === 'none') {
                dropdownList.style.display = 'flex';
                dropdownIcon.classList.remove('fa-chevron-down');
                dropdownIcon.classList.add('fa-chevron-up');
            } else {
                dropdownList.style.display = 'none';
                dropdownIcon.classList.remove('fa-chevron-up');
                dropdownIcon.classList.add('fa-chevron-down');
            }
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            if (manageModal) {
                // Get new permission
                const permissionRadio = document.querySelector('input[name="ma-permission"]:checked');
                const newPermission = permissionRadio ? permissionRadio.value : 'can view';
                
                // Get new time
                let newTime = null;
                const foreverCheck = document.getElementById('ma-time-forever');
                if (foreverCheck && !foreverCheck.checked) {
                    const y = document.getElementById('ma-time-year').value.trim();
                    const m = document.getElementById('ma-time-month').value.trim();
                    const d = document.getElementById('ma-time-day').value.trim();
                    const h = document.getElementById('ma-time-hour').value.trim();
                    const min = document.getElementById('ma-time-min').value.trim();
                    
                    let parts = [];
                    if (y) parts.push(y + ' year(s)');
                    if (m) parts.push(m + ' month(s)');
                    if (d) parts.push(d + ' day(s)');
                    if (h) parts.push(h + ' hour(s)');
                    if (min) parts.push(min + ' minute(s)');
                    if (parts.length > 0) newTime = parts.join(', ');
                    else newTime = '1 day'; // fallback
                }
                
                // Update global list
                if (currentEditingNames.includes('Anyone')) {
                    if (window.anyoneAccess) {
                        window.anyoneAccess.permission = newPermission;
                        window.anyoneAccess.timeRemaining = newTime;
                    }
                }
                
                if (window.currentAccessList) {
                    window.currentAccessList.forEach(acc => {
                        if (currentEditingNames.includes(acc.name)) {
                            acc.permission = newPermission;
                            acc.timeRemaining = newTime;
                        }
                    });
                }
                
                if (window.renderAccessList) {
                    window.renderAccessList(window.currentAccessList);
                }
                
                manageModal.style.display = 'none';
            }
        });
    }

    // Close on overlay click or cancel/close buttons
    if (manageModal) {
        manageModal.addEventListener('click', (e) => {
            if (e.target === manageModal) {
                manageModal.style.display = 'none';
            }
        });
    }

    const cancelBtn = document.getElementById('maCancelBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            if (manageModal) manageModal.style.display = 'none';
        });
    }

    const closeTopBtn = document.getElementById('maCloseTopBtn');
    if (closeTopBtn) {
        closeTopBtn.addEventListener('click', () => {
            if (manageModal) manageModal.style.display = 'none';
        });
    }

    // Logic for Forever checkbox
    const timeInputs = document.querySelectorAll('.ma-time-input');
    const foreverCheck = document.getElementById('ma-time-forever');

    const toggleTimeInputs = () => {
        if (foreverCheck && foreverCheck.checked) {
            timeInputs.forEach(input => {
                input.disabled = true;
                input.value = ''; // clear values
                input.style.opacity = '0.5';
                input.style.cursor = 'not-allowed';
                input.placeholder = '--';
            });
        } else {
            timeInputs.forEach(input => {
                input.disabled = false;
                input.style.opacity = '1';
                input.style.cursor = 'text';
                input.placeholder = '';
            });
        }
    };

    if (foreverCheck) {
        foreverCheck.addEventListener('change', toggleTimeInputs);
    }
    
    // Password toggle
    const passwordCheck = document.getElementById('ma-password-check');
    const passwordContainer = document.getElementById('ma-password-container');
    const passwordInput = document.getElementById('ma-password-input');
    const passwordToggle = document.getElementById('ma-password-toggle');

    if (passwordCheck && passwordContainer) {
        passwordCheck.addEventListener('change', () => {
            if (passwordCheck.checked) {
                passwordContainer.style.display = 'block';
            } else {
                passwordContainer.style.display = 'none';
                if (passwordInput) passwordInput.value = '';
            }
        });
    }

    if (passwordToggle && passwordInput) {
        passwordToggle.addEventListener('click', () => {
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                passwordToggle.classList.remove('fa-eye');
                passwordToggle.classList.add('fa-eye-slash');
            } else {
                passwordInput.type = 'password';
                passwordToggle.classList.remove('fa-eye-slash');
                passwordToggle.classList.add('fa-eye');
            }
        });
    }
});
