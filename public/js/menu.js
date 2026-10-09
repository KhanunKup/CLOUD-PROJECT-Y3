// public/js/menu.js
document.addEventListener('DOMContentLoaded', () => {
    // หาปุ่ม toggle เพื่อเปิด dropdown
    const toggleBtns = document.querySelectorAll('.toggle-options');
    
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // กันไม่ให้ click ทะลุไปถึง document
            
            // ปิด dropdown อื่นๆ ก่อน (ถ้ามี)
            document.querySelectorAll('.options-dropdown').forEach(dropdown => {
                // btn.nextElementSibling คือ div.options-dropdown ใน HTML ปัจจุบัน
                if (dropdown !== btn.nextElementSibling) {
                    dropdown.classList.remove('show');
                }
            });
            
            // สลับการแสดงผล dropdown ปัจจุบัน
            if(btn.nextElementSibling) {
                btn.nextElementSibling.classList.toggle('show');
            }
        });
    });

    // กดที่เมนู Share ใน Dropdown (ให้ไปเปิด Modal แชร์)
    const shareBtns = document.querySelectorAll('.open-share-modal');
    shareBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const shareModal = document.getElementById('shareModal');
            if(shareModal) shareModal.style.display = 'flex';
            
            // ปิด Dropdown ด้วย
            const dropdown = btn.closest('.options-dropdown');
            if(dropdown) dropdown.classList.remove('show');
        });
    });

    // คลิกที่อื่นในหน้าเว็บให้ปิด dropdown ทั้งหมด
    document.addEventListener('click', () => {
        document.querySelectorAll('.options-dropdown').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
    });
});
