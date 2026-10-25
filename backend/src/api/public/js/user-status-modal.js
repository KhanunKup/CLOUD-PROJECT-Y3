// public/js/user-status-modal.js
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('userStatusModal');
    const closeBtn = document.getElementById('userStatusCloseBtn');

    // ฟังก์ชันเปิด Modal
    function openUserStatusModal() {
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    // ฟังก์ชันปิด Modal
    function closeUserStatusModal() {
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // คลิกปุ่ม 3 ขีดข้างชื่อ User ใน Sidebar
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('.sidebar-menu-btn');
        if (trigger) {
            e.preventDefault();
            e.stopPropagation();
            openUserStatusModal();
        }
    });

    // ปุ่มกากบาทปิด Modal
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeUserStatusModal();
        });
    }

    // คลิกพื้นที่ด้านนอกกล่อง Modal เพื่อปิด
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeUserStatusModal();
            }
        });
    }

    // กดปุ่ม Esc เพื่อปิด Modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
            closeUserStatusModal();
        }
    });
});
