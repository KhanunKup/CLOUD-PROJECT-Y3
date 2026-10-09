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
        });
    });

    // กดปุ่ม Share เพื่อเปิด Modal
    const shareBtns = document.querySelectorAll('.open-share-modal');
    shareBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const shareModal = document.getElementById('shareModal');
            if(shareModal) {
                shareModal.style.display = 'flex';
                
                // อ่านข้อมูล Access List จาก attribute data-access ของปุ่มที่ถูกคลิก
                let fileAccessList = [];
                try {
                    if (btn.dataset.access) {
                        fileAccessList = JSON.parse(decodeURIComponent(btn.dataset.access));
                    }
                } catch (e) {
                    console.error("Failed to parse access list", e);
                }
                
                // เรียกใช้ฟังก์ชันที่ประกาศไว้ใน share-modal.js
                if (window.renderAccessList) {
                    window.renderAccessList(fileAccessList);
                }
            }
            
            // ปิด Dropdown
            const dropdown = btn.closest('.options-dropdown');
            if(dropdown) dropdown.classList.remove('show');
        });
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
        document.querySelectorAll('.options-dropdown').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
    });
});
