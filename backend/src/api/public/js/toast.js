// frontend/public/js/toast.js
// Lightweight, dependency-free floating toast notification utility

(function () {
    let toastContainer = null;

    function getOrCreateContainer() {
        if (!toastContainer) {
            toastContainer = document.getElementById('toast-container');
        }
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.style.cssText = `
                position: fixed;
                top: 24px;
                right: 24px;
                z-index: 999999;
                display: flex;
                flex-direction: column;
                gap: 10px;
                pointer-events: none;
                max-width: 380px;
            `;
            document.body.appendChild(toastContainer);
        }
        return toastContainer;
    }

    /**
     * Show a toast notification
     * @param {string} message - Message text to display
     * @param {'success' | 'error' | 'info' | 'warning'} [type='success'] - Toast type
     * @param {number} [duration=3500] - Duration in ms before auto-dismiss
     */
    window.showToast = function (message, type = 'success', duration = 3500) {
        const container = getOrCreateContainer();

        const toast = document.createElement('div');
        toast.className = `easy-toast easy-toast-${type}`;
        toast.style.cssText = `
            pointer-events: auto;
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 18px;
            border-radius: 10px;
            font-family: 'Outfit', 'Kanit', sans-serif;
            font-size: 14px;
            font-weight: 500;
            color: #ffffff;
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
            opacity: 0;
            transform: translateX(30px);
            transition: all 0.28s cubic-bezier(0.4, 0, 0.2, 1);
            cursor: pointer;
            backdrop-filter: blur(4px);
        `;

        // Style colors by type
        if (type === 'success') {
            toast.style.backgroundColor = '#2e7d32'; // Forest Green
            toast.style.borderLeft = '4px solid #a5d6a7';
        } else if (type === 'error') {
            toast.style.backgroundColor = '#c62828'; // Crimson Red
            toast.style.borderLeft = '4px solid #ef9a9a';
        } else if (type === 'warning') {
            toast.style.backgroundColor = '#e65100'; // Amber Orange
            toast.style.borderLeft = '4px solid #ffe082';
        } else {
            toast.style.backgroundColor = '#1565c0'; // Ocean Blue
            toast.style.borderLeft = '4px solid #90caf9';
        }

        // Icon based on type
        let iconSvg = '';
        if (type === 'success') {
            iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        } else if (type === 'error') {
            iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
        } else {
            iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
        }

        toast.innerHTML = `
            <span style="display: flex; align-items: center; flex-shrink: 0;">${iconSvg}</span>
            <span style="flex: 1; line-height: 1.4;">${message}</span>
            <span style="font-size: 16px; opacity: 0.7; margin-left: 6px;">&times;</span>
        `;

        container.appendChild(toast);

        // Slide in animation
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        });

        // Auto dismiss
        let timeoutId = setTimeout(() => {
            dismissToast(toast);
        }, duration);

        toast.addEventListener('click', () => {
            clearTimeout(timeoutId);
            dismissToast(toast);
        });

        function dismissToast(el) {
            el.style.opacity = '0';
            el.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                if (el.parentNode) {
                    el.remove();
                }
            }, 300);
        }
    };
})();
