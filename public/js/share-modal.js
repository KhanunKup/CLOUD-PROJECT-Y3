// public/js/share-modal.js
document.addEventListener('DOMContentLoaded', () => {
    const shareModal = document.getElementById('shareModal');
    const closeShareModalBtn = document.getElementById('closeShareModalBtn');
    const cancelShareBtn = document.getElementById('cancelShareBtn');

    // ฟังก์ชันปิด Modal
    const closeModal = () => {
        if (shareModal) {
            shareModal.style.display = 'none';
        }
    };

    if (closeShareModalBtn) {
        closeShareModalBtn.addEventListener('click', closeModal);
    }

    if (cancelShareBtn) {
        cancelShareBtn.addEventListener('click', closeModal);
    }

    // ตัวอย่างการคลิกนอก Modal แล้วปิด (Optional)
    if (shareModal) {
        shareModal.addEventListener('click', (e) => {
            if (e.target === shareModal) {
                closeModal();
            }
        });
    }
});

