// public/js/menu.js
document.addEventListener('DOMContentLoaded', () => {
    // ฟังก์ชันคำนวณตำแหน่ง Dropdown เพื่อให้อยู่ในหน้าจอเสมอ (auto-dropup เมื่อขอบล่างไม่พอ)
    function positionDropdown(dropdown, anchorEl) {
        if (!dropdown) return;
        dropdown.classList.remove('dropup');
        dropdown.classList.add('show');

        const rect = dropdown.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        const anchorRect = anchorEl ? anchorEl.getBoundingClientRect() : null;

        const spaceBelow = anchorRect ? (viewportHeight - anchorRect.bottom) : (viewportHeight - rect.top);
        const spaceAbove = anchorRect ? anchorRect.top : rect.top;

        // ถ้าเมนูล้นขอบล่างหน้าจอ หรือพื้นที่ด้านล่างไม่พอ และด้านบนมีที่ว่างมากกว่า
        if (rect.bottom > viewportHeight - 12 || (spaceBelow < rect.height + 8 && spaceAbove > spaceBelow)) {
            dropdown.classList.add('dropup');
        }
    }

    function closeAllDropdowns() {
        document.querySelectorAll('.options-dropdown, .new-options-dropdown').forEach(d => {
            d.classList.remove('show');
            d.classList.remove('dropup');
        });
        document.querySelectorAll('.file-row').forEach(row => row.classList.remove('has-open-menu'));
        document.querySelectorAll('.options-wrapper, .new-action-wrapper').forEach(w => w.classList.remove('has-open-menu'));
    }

    // ปุ่มสำหรับเปิด Dropdown (ใช้ Event Delegation เพื่อรองรับทั้งไฟล์เดิมและไฟล์ที่เพิ่งอัปโหลด)
    document.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.toggle-options');
        if (toggleBtn) {
            e.stopPropagation();
            const dropdown = toggleBtn.nextElementSibling;
            const isAlreadyOpen = dropdown && dropdown.classList.contains('show');

            // ปิด dropdown อื่นๆ ทั้งหมด
            closeAllDropdowns();

            // สลับสถานะของ dropdown ปัจจุบัน
            if (dropdown && !isAlreadyOpen) {
                positionDropdown(dropdown, toggleBtn);
                const parentRow = toggleBtn.closest('.file-row');
                if (parentRow) parentRow.classList.add('has-open-menu');
                const parentWrapper = toggleBtn.closest('.options-wrapper');
                if (parentWrapper) parentWrapper.classList.add('has-open-menu');
            }
            return;
        }

        // คลิกที่อื่นในหน้าเว็บ ให้ปิด Dropdown ทั้งหมด
        closeAllDropdowns();
    });

    // ปุ่มสำหรับเปิด Dropdown ของ + New
    const btnNew = document.querySelector('.btn-new');
    const newOptionsDropdown = document.getElementById('newOptionsDropdown');

    if (btnNew && newOptionsDropdown) {
        btnNew.addEventListener('click', (e) => {
            e.stopPropagation();
            const isAlreadyOpen = newOptionsDropdown.classList.contains('show');

            closeAllDropdowns();

            if (!isAlreadyOpen) {
                positionDropdown(newOptionsDropdown, btnNew);
                const parentWrapper = btnNew.closest('.new-action-wrapper');
                if (parentWrapper) parentWrapper.classList.add('has-open-menu');
            }
        });
    }

    // เมื่อ resize หน้าจอ ให้คำนวณตำแหน่งใหม่หากมี dropdown เปิดอยู่
    window.addEventListener('resize', () => {
        const activeDropdown = document.querySelector('.options-dropdown.show, .new-options-dropdown.show');
        if (activeDropdown) {
            const toggleBtn = activeDropdown.previousElementSibling;
            positionDropdown(activeDropdown, toggleBtn);
        }
    });

    // กดปุ่ม Share เพื่อเปิด Modal (ใช้ Event Delegation เพื่อรองรับไฟล์ที่เพิ่มเข้ามาใหม่ด้วย)
    document.addEventListener('click', (e) => {
        const shareBtn = e.target.closest('.open-share-modal');
        if (shareBtn) {
            e.stopPropagation();
            const shareModal = document.getElementById('shareModal');
            if(shareModal) {
                shareModal.style.display = 'flex';
                
                // อ่านข้อมูล Access List จาก attribute data-access ของปุ่มที่ถูกคลิก
                let fileAccessList = [];
                try {
                    if (shareBtn.dataset.access) {
                        fileAccessList = JSON.parse(decodeURIComponent(shareBtn.dataset.access));
                    }
                } catch (err) {
                    console.error("Failed to parse access list", err);
                }
                
                // เรียกใช้ฟังก์ชันที่ประกาศไว้ใน share-modal.js พร้อมส่ง shareBtn อ้างอิง
                if (window.renderAccessList) {
                    window.renderAccessList(fileAccessList, shareBtn);
                }
            }
            
            // ปิด Dropdown
            const dropdown = shareBtn.closest('.options-dropdown');
            if(dropdown) dropdown.classList.remove('show');
        }
    });

    // กดปุ่ม Copy link ใน Dropdown
    const copyLinkBtns = document.querySelectorAll('.copy-link-action');
    copyLinkBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // กัน event ทะลุไปที่ document
            
            const textSpan = btn.querySelector('.copy-link-text');
            if (textSpan) {
                const originalText = textSpan.textContent;
                textSpan.textContent = 'Copied!';
                
                setTimeout(() => {
                    textSpan.textContent = originalText;
                }, 1000);
            }
        });
    });
});
