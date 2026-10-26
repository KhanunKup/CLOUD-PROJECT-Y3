document.addEventListener('DOMContentLoaded', function () {
    const passwordInput = document.getElementById('passwordInput');
    const confirmPasswordInput = document.getElementById('confirmPasswordInput');
    const ruleLength = document.getElementById('rule-length');
    const ruleCase = document.getElementById('rule-case');
    const ruleNumSym = document.getElementById('rule-num-sym');
    const signupForm = document.getElementById('signupForm');

    if (!passwordInput || !signupForm) return;

    // --- ส่วนที่ 1: เช็คเงื่อนไขแบบ Real-time ---
    passwordInput.addEventListener('input', function () {
        const pwd = this.value;

        // 1. ความยาวอย่างน้อย 8 ตัวอักษร
        if (pwd.length >= 8) {
            ruleLength.classList.add('valid');
        } else {
            ruleLength.classList.remove('valid');
        }

        // 2. มีตัวพิมพ์ใหญ่และตัวพิมพ์เล็ก
        if (/(?=.*[a-z])(?=.*[A-Z])/.test(pwd)) {
            ruleCase.classList.add('valid');
        } else {
            ruleCase.classList.remove('valid');
        }

        // 3. มีตัวเลขและสัญลักษณ์พิเศษ
        if (/(?=.*\d)(?=.*[!@#$%^&*()_+{}\[\]:;<>,.?~\\/-])/.test(pwd)) {
            ruleNumSym.classList.add('valid');
        } else {
            ruleNumSym.classList.remove('valid');
        }
    });

    // --- ส่วนที่ 2: ดักจับการกดปุ่ม Sign Up ---
    signupForm.addEventListener('submit', function (e) {
        const pwd = passwordInput.value;
        const confirmPwd = confirmPasswordInput ? confirmPasswordInput.value : '';

        const isLengthValid = pwd.length >= 8;
        const isCaseValid = /(?=.*[a-z])(?=.*[A-Z])/.test(pwd);
        const isNumSymValid = /(?=.*\d)(?=.*[!@#$%^&*()_+{}\[\]:;<>,.?~\\/-])/.test(pwd);

        // หยุดการส่งฟอร์มถ้าไม่ตรงเงื่อนไข
        if (!isLengthValid || !isCaseValid || !isNumSymValid) {
            e.preventDefault();
            alert('กรุณาตั้งรหัสผ่านให้ตรงตามเงื่อนไขที่กำหนดให้ครบถ้วน');
            return;
        }

        if (pwd !== confirmPwd) {
            e.preventDefault();
            alert('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง');
            return;
        }
    });
});

// --- ส่วนที่ 3: เปิด/ปิด การมองเห็นรหัสผ่าน ---
function togglePasswordVisibility(button) {
    const input = button.parentElement.querySelector('input');
    const eyeOpen = button.querySelector('.eye-open');
    const eyeClosed = button.querySelector('.eye-closed');

    if (input.type === 'password') {
        input.type = 'text';
        eyeOpen.style.display = 'none';
        eyeClosed.style.display = 'block';
    } else {
        input.type = 'password';
        eyeOpen.style.display = 'block';
        eyeClosed.style.display = 'none';
    }
}