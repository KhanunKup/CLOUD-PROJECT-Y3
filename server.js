const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. ตั้งค่า View Engine ให้เป็น EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 2. อนุญาตให้เรียกใช้ไฟล์ Static (CSS, Images, JS ฝั่ง Client) จากโฟลเดอร์ public
app.use(express.static(path.join(__dirname, 'public')));

// อนุญาตให้ Express อ่านข้อมูล JSON และ Form URL-encoded ได้ (เตรียมพร้อมสำหรับต่อ API)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. สร้าง Route สำหรับหน้าเว็บหลัก
app.get('/', (req, res) => {
    // ส่งข้อมูลไฟล์จำลองไปแสดงผลที่ views/pages/homepage.ejs
    res.redirect('/signup');
});

app.get('/drive', (req, res) => {
    res.render('pages/homepage', { 
        files: [
            { 
                name: 'Folder 1', type: 'folder', owner: 'me', uploadDate: '08 Aug. 2008',
                accessList: [
                    { name: 'Anan', permission: 'can edit', timeRemaining: null },
                    { name: 'Passakorn', permission: 'can edit', timeRemaining: null },
                    { name: 'Khanun', permission: 'can edit', timeRemaining: null },
                    { name: 'john', permission: 'can edit', timeRemaining: null },
                    { name: 'peter', permission: 'can edit', timeRemaining: null }
                ]
            },
            { 
                name: 'File1.txt', type: 'file', owner: 'me', uploadDate: '08 Aug. 2008',
                accessList: [
                    { name: 'Passakorn', permission: 'can view', timeRemaining: '2 days' },
                    { name: 'โบนัส', permission: 'can view', timeRemaining: '2 days' },
                    { name: 'Worapa', permission: 'can edit', timeRemaining: null }
                ]
            },
            { 
                name: 'Image1.png', type: 'file', owner: 'me', uploadDate: '08 Aug. 2008',
                accessList: []
            }
        ]
    });
});

app.get('/signup', (req, res) => {
    res.render('pages/login', { 
    });
});

app.get('/shared', (req, res) => {
    res.render('pages/shared', { 
        files: [
            { 
                name: 'Folder 1', type: 'folder', owner: 'me', uploadDate: '08 Aug. 2008',
                accessList: [
                    { name: 'Anan', permission: 'can edit', timeRemaining: null },
                    { name: 'Passakorn', permission: 'can edit', timeRemaining: null },
                    { name: 'Khanun', permission: 'can edit', timeRemaining: null },
                    { name: 'john', permission: 'can edit', timeRemaining: null },
                ]
            },
            { 
                name: 'File1.txt', type: 'file', owner: 'me', uploadDate: '08 Aug. 2008',
                accessList: [
                    { name: 'Passakorn', permission: 'can view', timeRemaining: '2 days' },
                    { name: 'โบนัส', permission: 'can view', timeRemaining: '2 days' },
                    { name: 'Worapa', permission: 'can edit', timeRemaining: null }
                ]
            },
            { 
                name: 'Image1.png', type: 'file', owner: 'me', uploadDate: '08 Aug. 2008',
                accessList: []
            },
            {
                name: 'Document1.pdf', type: 'file', owner: 'me', uploadDate: '08 Aug. 2008',
                accessList: [
                    { name: 'Anan', permission: 'can view', timeRemaining: '5 days' },
                    { name: 'Passakorn', permission: 'can edit', timeRemaining: null }
                ]
            }
        ]
    });
});

// 4. เริ่มต้นเซิร์ฟเวอร์
app.listen(PORT, () => {
    console.log(`EASYDRIVE Server is running at http://localhost:${PORT}`);
});