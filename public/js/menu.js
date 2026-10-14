// public/js/menu.js
document.addEventListener('DOMContentLoaded', () => {
    // ปุ่มสำหรับเปิด Dropdown
    const toggleBtns = document.querySelectorAll('.toggle-options');
    
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // กัน event ทะลุไปที่ document
            
            // ปิด dropdown อื่นๆ
            document.querySelectorAll('.options-dropdown').forEach(dropdown => {
                if (dropdown !== btn.nextElementSibling) {
                    dropdown.classList.remove('show');
                }
            });
            
            // สลับสถานะของ dropdown ปัจจุบัน
            if(btn.nextElementSibling) {
                btn.nextElementSibling.classList.toggle('show');
            }
            const newDropdown = document.getElementById('newOptionsDropdown');
            if (newDropdown) newDropdown.classList.remove('show');
        });
    });

    // ปุ่มสำหรับเปิด Dropdown ของ + New
    const btnNew = document.querySelector('.btn-new');
    const newOptionsDropdown = document.getElementById('newOptionsDropdown');

    if (btnNew && newOptionsDropdown) {
        btnNew.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // ปิด dropdown ของไฟล์อื่นๆ
            document.querySelectorAll('.options-dropdown').forEach(dropdown => {
                dropdown.classList.remove('show');
            });
            
            newOptionsDropdown.classList.toggle('show');
        });
    }

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

    // คลิกที่อื่นในหน้าเว็บ ให้ปิด Dropdown
    document.addEventListener('click', () => {
        document.querySelectorAll('.options-dropdown, .new-options-dropdown').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
    });
});
