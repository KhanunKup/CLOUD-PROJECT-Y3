const passwordInput = document.getElementById('passwordInput');
const ruleLength = document.getElementById('rule-length');
const ruleCase = document.getElementById('rule-case');
const ruleNumSym = document.getElementById('rule-num-sym');

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

function togglePasswordVisibility(button) {
    // หาแท็ก <input> ที่อยู่ภายในกล่อง (.input-box) เดียวกับปุ่มที่ถูกกด
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