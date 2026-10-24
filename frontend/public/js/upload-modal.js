// public/js/upload-modal.js

// ฟังก์ชันแปลงขนาดไฟล์เป็นหน่วยที่อ่านง่าย (KB, MB, GB)
const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// ตรวจสอบชื่อโฟลเดอร์สำหรับพัฒนาโปรเจกต์ เช่น node_modules, .git
function isDevDirectoryName(name) {
    if (!name || typeof name !== 'string') return false;
    const devFolderNames = new Set([
        'node_modules',
        '.git',
        '.next',
        '.nuxt',
        'dist',
        'build',
        'vendor',
        '__pycache__',
        '.venv',
        'venv',
        '.cache',
        '.idea',
        '.vscode'
    ]);
    return devFolderNames.has(name.trim().toLowerCase());
}

// สกัดไฟล์จาก webkitdirectory (<input type="file" webkitdirectory>)
function extractWebkitFiles(filesList, options = {}) {
    if (!filesList || filesList.length === 0) {
        return { rootFolderName: 'New Folder', files: [], totalSize: 0, fileCount: 0, skippedDevFolders: [] };
    }
    const skipDevFolders = options.skipDevFolders !== false;
    const skippedDevFoldersSet = new Set();
    const filesArray = Array.from(filesList);
    const firstRelPath = filesArray[0].webkitRelativePath || '';
    const rootFolderName = firstRelPath ? firstRelPath.split('/')[0] : (filesArray[0].name || 'New Folder');
    let totalSize = 0;
    const files = [];

    for (const f of filesArray) {
        const fullRelPath = f.webkitRelativePath || f.name || '';
        let relPath = fullRelPath;
        if (fullRelPath.startsWith(rootFolderName + '/')) {
            relPath = fullRelPath.slice(rootFolderName.length + 1);
        } else if (fullRelPath === rootFolderName) {
            relPath = f.name;
        }

        if (skipDevFolders) {
            const segments = relPath.replace(/\\/g, '/').split('/');
            let hasDevSegment = false;
            for (const seg of segments) {
                if (isDevDirectoryName(seg)) {
                    hasDevSegment = true;
                    skippedDevFoldersSet.add(seg);
                    break;
                }
            }
            if (hasDevSegment) continue;
        }

        const size = Number(f.size) || 0;
        totalSize += size;
        files.push({
            file: f,
            relativePath: relPath,
            size: size,
            type: f.type || 'application/octet-stream'
        });
    }

    return {
        rootFolderName,
        files,
        totalSize,
        fileCount: files.length,
        skippedDevFolders: Array.from(skippedDevFoldersSet)
    };
}

// สกัดไฟล์และโฟลเดอร์ย่อยแบบ Recursive ผ่าน File System Access API (showDirectoryPicker)
async function traverseDirectoryHandle(dirHandle, pathOrOptions = '', maybeOptions = {}) {
    let path = '';
    let options = {};
    if (typeof pathOrOptions === 'object' && pathOrOptions !== null) {
        options = pathOrOptions;
        path = options.path || '';
    } else {
        path = typeof pathOrOptions === 'string' ? pathOrOptions : '';
        options = maybeOptions || {};
    }

    if (!dirHandle) return { rootFolderName: 'New Folder', files: [], totalSize: 0, fileCount: 0, skippedDevFolders: [] };
    const rootFolderName = dirHandle.name || 'New Folder';
    const files = [];
    let runningTotalSize = 0;
    const skipDevFolders = options.skipDevFolders !== false;
    const batchSize = Math.max(1, Number(options.batchSize) || 25);
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    const skippedDevFoldersSet = new Set();

    async function walk(handle, currentPath) {
        if (!handle || !handle.values) return;
        const fileBatch = [];
        const dirEntries = [];

        async function processBatch() {
            if (fileBatch.length === 0) return;
            const currentChunk = fileBatch.splice(0, fileBatch.length);
            const resolved = await Promise.all(currentChunk.map(async (entry) => {
                try {
                    const f = await entry.getFile();
                    const relPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
                    const size = Number(f.size) || 0;
                    return {
                        file: f,
                        relativePath: relPath,
                        size: size,
                        type: f.type || 'application/octet-stream'
                    };
                } catch (err) {
                    console.warn(`[traverseDirectoryHandle] Failed to read file handle: ${entry.name}`, err);
                    return null;
                }
            }));

            for (const item of resolved) {
                if (item) {
                    files.push(item);
                    runningTotalSize += item.size;
                }
            }

            if (onProgress) {
                onProgress({
                    fileCount: files.length,
                    totalSize: runningTotalSize,
                    currentPath: currentPath || rootFolderName
                });
            }
        }

        for await (const entry of handle.values()) {
            if (entry.kind === 'file') {
                fileBatch.push(entry);
                if (fileBatch.length >= batchSize) {
                    await processBatch();
                }
            } else if (entry.kind === 'directory') {
                if (skipDevFolders && isDevDirectoryName(entry.name)) {
                    skippedDevFoldersSet.add(entry.name);
                } else {
                    dirEntries.push(entry);
                }
            }
        }

        if (fileBatch.length > 0) {
            await processBatch();
        }

        for (const subDir of dirEntries) {
            const nextPath = currentPath ? `${currentPath}/${subDir.name}` : subDir.name;
            await walk(subDir, nextPath);
        }
    }

    await walk(dirHandle, path);
    return {
        rootFolderName,
        files,
        totalSize: runningTotalSize,
        fileCount: files.length,
        skippedDevFolders: Array.from(skippedDevFoldersSet)
    };
}

// สกัดไฟล์และโฟลเดอร์ย่อยแบบ Recursive ผ่าน DataTransferItem Entry (Drag & Drop พร้อม Live Progress และ Safe Error Recovery)
function readDirectoryEntry(entry, pathOrOptions = '', maybeOptions = {}) {
    let path = '';
    let options = {};
    if (typeof pathOrOptions === 'object' && pathOrOptions !== null) {
        options = pathOrOptions;
        path = options.path || '';
    } else {
        path = typeof pathOrOptions === 'string' ? pathOrOptions : '';
        options = maybeOptions || {};
    }
    const skipDevFolders = options.skipDevFolders !== false;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    const skippedDevFoldersSet = new Set();

    return new Promise(async (resolve) => {
        if (!entry) return resolve({ rootFolderName: 'New Folder', files: [], totalSize: 0, fileCount: 0, skippedDevFolders: [] });
        const rootFolderName = entry.name || 'New Folder';
        const files = [];
        let totalBytes = 0;

        async function drainReader(reader) {
            const all = [];
            while (true) {
                const batch = await new Promise((res) => {
                    reader.readEntries((entries) => res(entries || []), (err) => {
                        console.warn('readEntries error:', err?.message);
                        res([]);
                    });
                });
                if (!batch || batch.length === 0) break;
                all.push(...batch);
            }
            return all;
        }

        async function walkEntry(currentEntry, currentPath) {
            if (currentEntry.isFile) {
                try {
                    const f = await new Promise((res, rej) => currentEntry.file(res, rej));
                    const relPath = currentPath ? `${currentPath}/${f.name}` : f.name;
                    const sz = Number(f.size) || 0;
                    totalBytes += sz;
                    files.push({
                        file: f,
                        relativePath: relPath,
                        size: sz,
                        type: f.type || 'application/octet-stream'
                    });
                    if (onProgress) {
                        onProgress({
                            fileCount: files.length,
                            filesCount: files.length,
                            totalSize: totalBytes,
                            totalBytes,
                            currentPath: relPath
                        });
                    }
                } catch (e) {
                    console.warn(`Skip unreadable file ${currentEntry.name}:`, e.message);
                }
            } else if (currentEntry.isDirectory) {
                if (skipDevFolders && isDevDirectoryName(currentEntry.name)) {
                    skippedDevFoldersSet.add(currentEntry.name);
                    return;
                }
                try {
                    const reader = currentEntry.createReader();
                    const children = await drainReader(reader);
                    const nextPath = currentPath ? `${currentPath}/${currentEntry.name}` : (currentEntry === entry ? '' : currentEntry.name);
                    for (const child of children) {
                        await walkEntry(child, nextPath);
                    }
                } catch (dirErr) {
                    console.warn(`Skip unreadable directory ${currentEntry.name}:`, dirErr.message);
                }
            }
        }

        try {
            if (entry.isDirectory) {
                const reader = entry.createReader();
                const children = await drainReader(reader);
                for (const child of children) {
                    await walkEntry(child, '');
                }
            } else {
                await walkEntry(entry, '');
            }
        } catch (err) {
            console.warn('Error reading directory entry:', err.message);
        }

        resolve({
            rootFolderName,
            files,
            totalSize: totalBytes,
            fileCount: files.length,
            skippedDevFolders: Array.from(skippedDevFoldersSet)
        });
    });
}

// Helper สำหรับการเรียก Fetch พร้อม Retry อัตโนมัติเมื่อเกิด Transient Network Error หรือ Socket Reset
async function safeFetchWithRetry(url, options = {}, maxRetries = 2, delayMs = 400) {
    const fetchFn = options.apiFetch || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetchFn) throw new Error('fetch implementation is required');
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const res = await fetchFn(url, options);
            if (res.status >= 500 && attempt < maxRetries) {
                await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
                continue;
            }
            return res;
        } catch (err) {
            lastErr = err;
            if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
            }
        }
    }
    throw lastErr;
}

// ดึง Upload URLs เป็นชุดผ่าน Batch Registration API
async function fetchBatchUploadUrls({ filesPayload, apiFetch = (typeof fetch !== 'undefined' ? fetch : null) } = {}) {
    if (!filesPayload || !Array.isArray(filesPayload) || filesPayload.length === 0 || !apiFetch) return [];
    try {
        const res = await safeFetchWithRetry('/api/files/batch-upload-urls', {
            apiFetch,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: filesPayload })
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data && data.success && Array.isArray(data.items)) ? data.items : [];
    } catch (e) {
        return [];
    }
}

// อัปโหลดโฟลเดอร์แบบ Recursive พร้อมไฟล์ภายในและโฟลเดอร์ย่อยทั้งหมด (รองรับ Concurrent Worker Pool)
async function uploadFolderRecursive({
    folderItem,
    parentFolderId = null,
    apiFetch = (typeof fetch !== 'undefined' ? fetch : null),
    concurrency = 6,
    onProgress = () => {},
    onDirProgress = null
}) {
    if (!apiFetch) throw new Error('fetch implementation is required');
    if (!folderItem || !folderItem.name) throw new Error('folderItem is required');

    // 1. สร้างหรือค้นหาโฟลเดอร์หลัก (Root Folder)
    const rootRes = await safeFetchWithRetry('/api/folders', { apiFetch,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            folderName: folderItem.name,
            folder_id: parentFolderId,
            reuseExisting: true
        })
    });
    const rootData = await rootRes.json();
    if (!rootRes.ok || !rootData.success) {
        throw new Error(rootData.error || `Failed to create folder "${folderItem.name}"`);
    }

    const rootFolder = rootData.file;
    const rootFolderId = rootFolder.file_id;
    const childFiles = folderItem.files || [];
    const totalFiles = childFiles.length;

    if (totalFiles === 0) {
        return {
            success: true,
            rootFolder: rootFolder,
            uploadedFilesCount: 0
        };
    }

    // 2. Pre-resolve ไดเรกทอรีย่อยทั้งหมดล่วงหน้าก่อนเริ่มส่งไฟล์ (Depth-level Concurrent Batching พร้อม Realtime Progress)
    const dirPaths = extractUniqueDirectoryPaths(childFiles);
    const folderPathMap = await preResolveDirectories({
        rootFolderId,
        dirPaths,
        apiFetch,
        concurrency,
        onProgress: onDirProgress
    });

    // 3. Batch URL Pre-generation: ดึง Upload URLs เป็นชุด (Chunk ละ 50 ไฟล์) เพื่อลด HTTP round trips
    const BATCH_URL_CHUNK_SIZE = 50;
    const urlMap = new Map(); // index -> { uploadUrl, file_id }

    for (let c = 0; c < totalFiles; c += BATCH_URL_CHUNK_SIZE) {
        const chunkIndices = [];
        const chunkFilesPayload = [];
        for (let i = c; i < Math.min(totalFiles, c + BATCH_URL_CHUNK_SIZE); i++) {
            const itemFile = childFiles[i];
            const rawRelPath = itemFile.relativePath || (itemFile.file ? itemFile.file.name : `file-${i}`);
            const normalizedPath = rawRelPath.replace(/\\/g, '/');
            const lastSlash = normalizedPath.lastIndexOf('/');
            const dirPath = lastSlash >= 0 ? normalizedPath.substring(0, lastSlash) : '';
            const filename = lastSlash >= 0 ? normalizedPath.substring(lastSlash + 1) : normalizedPath;
            const targetFolderId = folderPathMap.get(dirPath) || rootFolderId;
            const fileSize = itemFile.size !== undefined ? itemFile.size : (itemFile.file ? itemFile.file.size : 1024);
            const contentType = itemFile.type || (itemFile.file && itemFile.file.type) || 'application/octet-stream';

            chunkIndices.push(i);
            chunkFilesPayload.push({
                filename,
                size: fileSize,
                contentType,
                folder_id: targetFolderId
            });
        }

        const batchItems = await fetchBatchUploadUrls({ filesPayload: chunkFilesPayload, apiFetch });
        if (Array.isArray(batchItems)) {
            batchItems.forEach((bItem, idx) => {
                const origIdx = chunkIndices[idx];
                if (origIdx !== undefined) {
                    urlMap.set(origIdx, bItem);
                }
            });
        }
    }

    // 4. Concurrent Worker Pool สำหรับการอัปโหลดไฟล์พร้อมกันแบบคู่ขนาน (ค่าเริ่มต้น 6 Workers)
    const poolSize = Math.max(1, Math.min(concurrency, totalFiles));
    let cursor = 0;
    let completedCount = 0;
    const errors = [];

    async function worker(workerId) {
        while (cursor < totalFiles) {
            const index = cursor++;
            const itemFile = childFiles[index];
            const rawRelPath = itemFile.relativePath || (itemFile.file ? itemFile.file.name : `file-${index}`);
            const normalizedPath = rawRelPath.replace(/\\/g, '/');
            const lastSlash = normalizedPath.lastIndexOf('/');
            const dirPath = lastSlash >= 0 ? normalizedPath.substring(0, lastSlash) : '';
            const filename = lastSlash >= 0 ? normalizedPath.substring(lastSlash + 1) : normalizedPath;

            const targetFolderId = folderPathMap.get(dirPath) || rootFolderId;

            try {
                const fileSize = itemFile.size !== undefined ? itemFile.size : (itemFile.file ? itemFile.file.size : 1024);
                const contentType = itemFile.type || (itemFile.file && itemFile.file.type) || 'application/octet-stream';

                let uploadUrl;
                const cached = urlMap.get(index);
                if (cached && cached.uploadUrl) {
                    uploadUrl = cached.uploadUrl;
                } else {
                    const urlRes = await safeFetchWithRetry('/api/files/upload-url', { apiFetch,
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            filename: filename,
                            size: fileSize,
                            contentType: contentType,
                            folder_id: targetFolderId
                        })
                    });
                    const urlData = await urlRes.json();
                    if (!urlRes.ok || !urlData.success) {
                        throw new Error(urlData.error || `Failed to get upload URL for "${filename}"`);
                    }
                    uploadUrl = urlData.uploadUrl;
                }

                const uploadBody = itemFile.file || (typeof Blob !== 'undefined' ? new Blob(['EasyDrive Mock File Content'], { type: contentType }) : 'EasyDrive Mock File Content');

                const putRes = await safeFetchWithRetry(uploadUrl, { apiFetch,
                    method: 'PUT',
                    headers: { 'Content-Type': contentType },
                    body: uploadBody
                });
                if (!putRes.ok) {
                    throw new Error(`Failed to upload content for "${filename}"`);
                }

                completedCount++;
                onProgress({
                    completed: completedCount,
                    total: totalFiles,
                    currentPath: normalizedPath,
                    percent: Math.round((completedCount / totalFiles) * 100),
                    workerId
                });
            } catch (err) {
                console.error(`Error uploading file "${normalizedPath}":`, err);
                errors.push({ file: normalizedPath, error: err.message });
                completedCount++;
                onProgress({
                    completed: completedCount,
                    total: totalFiles,
                    currentPath: `${normalizedPath} (error)`,
                    percent: Math.round((completedCount / totalFiles) * 100),
                    workerId,
                    hasError: true
                });
            }
        }
    }

    const workers = Array.from({ length: poolSize }, (_, id) => worker(id + 1));
    await Promise.all(workers);

    if (errors.length > 0 && completedCount === 0) {
        throw new Error(`Failed to upload files: ${errors[0].error}`);
    }

    return {
        success: true,
        rootFolder: rootFolder,
        uploadedFilesCount: completedCount,
        errors: errors
    };
}

// ตรวจจับโฟลเดอร์สำหรับพัฒนาโปรเจกต์ เช่น node_modules หรือ .git
function detectDevFolders(filesList) {
    if (!filesList || !Array.isArray(filesList)) return [];
    const devFolderNames = ['node_modules', '.git'];
    const statsMap = new Map();

    for (const f of filesList) {
        const rawPath = f.relativePath || (f.file ? f.file.name : '');
        const normPath = rawPath.replace(/\\/g, '/');
        for (const devName of devFolderNames) {
            if (normPath === devName || normPath.startsWith(devName + '/') || normPath.includes('/' + devName + '/')) {
                if (!statsMap.has(devName)) {
                    statsMap.set(devName, { name: devName, count: 0, size: 0 });
                }
                const stat = statsMap.get(devName);
                stat.count++;
                stat.size += Number(f.size) || 0;
            }
        }
    }

    return Array.from(statsMap.values());
}

// กรองไฟล์ในโฟลเดอร์พัฒนาออกจาก folderItem
function excludeDevFolder(folderItem, devFolderName) {
    if (!folderItem || !folderItem.files) return folderItem;
    folderItem.files = folderItem.files.filter(f => {
        const rawPath = f.relativePath || (f.file ? f.file.name : '');
        const normPath = rawPath.replace(/\\/g, '/');
        return !(normPath === devFolderName || normPath.startsWith(devFolderName + '/') || normPath.includes('/' + devFolderName + '/'));
    });
    folderItem.fileCount = folderItem.files.length;
    folderItem.totalSize = folderItem.files.reduce((acc, f) => acc + (f.size || 0), 0);
    return folderItem;
}

// กรองไฟล์โฟลเดอร์พัฒนา (.git, node_modules) เข้าหรือออกจาก folderItem ตามสถานะ checkbox
function applyDevFolderFilter(folderItem, shouldExclude = true) {
    if (!folderItem) return folderItem;
    if (!folderItem.rawFiles) {
        folderItem.rawFiles = folderItem.files ? [...folderItem.files] : [];
    }
    if (shouldExclude) {
        folderItem.files = folderItem.rawFiles.filter(f => {
            const rawPath = f.relativePath || (f.file ? f.file.name : (f.name || ''));
            const normPath = rawPath.replace(/\\/g, '/');
            const segments = normPath.split('/');
            return !segments.some(seg => isDevDirectoryName(seg));
        });
    } else {
        folderItem.files = [...folderItem.rawFiles];
    }
    folderItem.fileCount = folderItem.files.length;
    folderItem.totalSize = folderItem.files.reduce((acc, f) => acc + (Number(f.size) || 0), 0);
    return folderItem;
}

// สกัด Unique Directory Paths ทั้งหมดและเรียงลำดับจากตื้นไปลึก (Breadth-first)
function extractUniqueDirectoryPaths(filesList) {
    if (!filesList || !Array.isArray(filesList)) return [];
    const dirSet = new Set();

    for (const f of filesList) {
        const rawPath = f.relativePath || (f.file ? f.file.name : '');
        const normPath = rawPath.replace(/\\/g, '/');
        const parts = normPath.split('/').filter(p => p.length > 0);
        parts.pop(); // ตัดชื่อไฟล์ออก เหลือเฉพาะไดเรกทอรี

        let accumulated = '';
        for (const segment of parts) {
            accumulated = accumulated ? `${accumulated}/${segment}` : segment;
            dirSet.add(accumulated);
        }
    }

    const dirArray = Array.from(dirSet);
    dirArray.sort((a, b) => {
        const depthA = (a.match(/\//g) || []).length;
        const depthB = (b.match(/\//g) || []).length;
        if (depthA !== depthB) return depthA - depthB;
        return a.localeCompare(b);
    });

    return dirArray;
}

// สร้างหรือผสานไดเรกทอรีย่อยทั้งหมดล่วงหน้าก่อนเริ่มส่งไฟล์ (Depth-level Concurrent Batching พร้อม Realtime Progress)
async function preResolveDirectories({
    rootFolderId,
    dirPaths = [],
    apiFetch = (typeof fetch !== 'undefined' ? fetch : null),
    concurrency = 6,
    onProgress = null
}) {
    if (!apiFetch) throw new Error('fetch implementation is required');
    const folderPathMap = new Map();
    folderPathMap.set('', rootFolderId);

    if (!dirPaths || dirPaths.length === 0) {
        return folderPathMap;
    }

    // จัดกลุ่มไดเรกทอรีตามระดับความลึก (Depth level) เพื่อสร้างโฟลเดอร์แม่ก่อน และสร้างโฟลเดอร์ลูกที่ระดับเดียวกันแบบคู่ขนาน
    const uniquePaths = [...new Set(dirPaths.map(p => p.replace(/\\/g, '/')))].filter(Boolean);
    const depthMap = new Map();
    for (const p of uniquePaths) {
        const depth = (p.match(/\//g) || []).length;
        if (!depthMap.has(depth)) depthMap.set(depth, []);
        depthMap.get(depth).push(p);
    }

    const sortedDepths = Array.from(depthMap.keys()).sort((a, b) => a - b);
    const totalDirs = uniquePaths.length;
    let completedCount = 0;

    for (const depth of sortedDepths) {
        const pathsAtDepth = depthMap.get(depth);
        let cursor = 0;
        const poolSize = Math.max(1, Math.min(concurrency, pathsAtDepth.length));

        async function worker() {
            while (cursor < pathsAtDepth.length) {
                const index = cursor++;
                const dirPath = pathsAtDepth[index];
                if (folderPathMap.has(dirPath)) continue;

                const lastSlash = dirPath.lastIndexOf('/');
                const parentPath = lastSlash > 0 ? dirPath.substring(0, lastSlash) : '';
                const folderName = lastSlash >= 0 ? dirPath.substring(lastSlash + 1) : dirPath;
                const parentFolderId = folderPathMap.get(parentPath) || rootFolderId;

                const res = await safeFetchWithRetry('/api/folders', {
                    apiFetch,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        folderName: folderName,
                        folder_id: parentFolderId,
                        reuseExisting: true
                    })
                });

                const data = await res.json();
                if (!res.ok || !data.success) {
                    throw new Error(data.error || `Failed to pre-resolve directory "${folderName}"`);
                }
                folderPathMap.set(dirPath, data.file.file_id);
                completedCount++;

                if (typeof onProgress === 'function') {
                    onProgress({
                        current: completedCount,
                        total: totalDirs,
                        dirName: folderName,
                        dirPath: dirPath,
                        percent: Math.min(100, Math.round((completedCount / totalDirs) * 100))
                    });
                }
            }
        }

        const workers = Array.from({ length: poolSize }, () => worker());
        await Promise.all(workers);
    }

    return folderPathMap;
}

// อัปเดตสถานะการสแกนโฟลเดอร์ใน UI แบบ Real-time
function setScanningState(isScanning, stats = {}) {
    if (typeof document === 'undefined') return;
    const scanningBox = document.getElementById('uploadScanningBox');
    const queueEmpty = document.getElementById('uploadQueueEmpty');
    const queueList = document.getElementById('uploadQueueList');
    const submitBtn = document.getElementById('uploadSubmitBtn');
    const scanningTitle = document.getElementById('uploadScanningTitle');
    const scanningCount = document.getElementById('uploadScanningCount');

    if (isScanning) {
        if (scanningBox) scanningBox.style.display = 'block';
        if (queueEmpty) queueEmpty.style.display = 'none';
        if (queueList) queueList.style.display = 'none';
        if (scanningTitle) {
            scanningTitle.textContent = stats.folderName ? `กำลังสแกนโฟลเดอร์ "${stats.folderName}"...` : 'กำลังสแกนโครงสร้างโฟลเดอร์...';
        }
        if (scanningCount) {
            scanningCount.textContent = 'พบแล้ว 0 รายการ (0 B)';
        }
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.6';
            submitBtn.style.cursor = 'not-allowed';
            submitBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Scanning...';
        }
    } else {
        if (scanningBox) scanningBox.style.display = 'none';
        if (queueList) queueList.style.display = 'block';
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            submitBtn.style.cursor = 'pointer';
            submitBtn.textContent = 'Upload';
        }
    }
}

// อัปเดตตัวเลขความคืบหน้าระหว่างสแกนแบบ Real-time
function updateScanningProgress(progress = {}) {
    if (typeof document === 'undefined') return;
    const scanningCount = document.getElementById('uploadScanningCount');
    if (scanningCount) {
        const count = progress.fileCount !== undefined ? progress.fileCount : (progress.filesCount || 0);
        const totalSize = progress.totalSize !== undefined ? progress.totalSize : (progress.totalBytes || 0);
        const sizeStr = formatBytes(totalSize);
        scanningCount.textContent = `พบแล้ว ${count} รายการ (${sizeStr})`;
    }
}

// แปลงประเภทไฟล์เป็นข้อความสวยๆ พร้อมระบุโฟลเดอร์พัฒนาที่ถูกข้าม
function getFileTypeDisplay(item) {
    if (!item) return '';
    if (item.type === 'folder') {
        const count = item.fileCount !== undefined ? item.fileCount : (item.files ? item.files.length : 0);
        const sizeStr = formatBytes(item.totalSize || 0);
        const skipped = (item.skippedDevFolders && item.skippedDevFolders.length > 0)
            ? ` • ข้าม ${item.skippedDevFolders.join(', ')} แล้ว`
            : '';
        return `Folder (${count} files, ${sizeStr}${skipped})`;
    }
    const ext = (item.name || '').split('.').pop().toLowerCase();
    const codeExts = ['py', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'scss', 'json', 'sh', 'bash', 'sql', 'java', 'c', 'cpp', 'cs', 'php', 'rb', 'go', 'rs', 'yaml', 'yml', 'xml', 'env'];
    if (codeExts.includes(ext)) return `Code / .${ext}`;
    if (ext === 'txt') return 'Text / .txt';
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp' || ext === 'gif' || ext === 'svg') return `Image / .${ext}`;
    if (ext === 'pdf') return 'PDF / .pdf';
    if (ext === 'doc' || ext === 'docx') return 'Doc / .docx';
    if (ext === 'xls' || ext === 'xlsx') return 'Spreadsheet / .xlsx';
    if (ext === 'zip' || ext === 'rar' || ext === '7z' || ext === 'tar' || ext === 'gz') return `Archive / .${ext}`;
    return `File / .${ext}`;
}

// ประมวลผลรายการไฟล์และโฟลเดอร์จากการลากวาง (Drag & Drop) รองรับ getAsFileSystemHandle และ fallback webkitGetAsEntry
async function processDroppedItems(dataTransfer, options = {}) {
    if (!dataTransfer) return;
    const {
        skipDevFolders = true,
        onScanningState = () => {},
        onProgress = () => {},
        onFolderScanned = () => {},
        onFileScanned = () => {},
        traverseDirectoryHandle: customTraverse = null,
        readDirectoryEntry: customReadEntry = null
    } = options;

    const traverseFn = customTraverse || (typeof traverseDirectoryHandle !== 'undefined' ? traverseDirectoryHandle : null);
    const readEntryFn = customReadEntry || (typeof readDirectoryEntry !== 'undefined' ? readDirectoryEntry : null);

    if (dataTransfer.items && dataTransfer.items.length > 0) {
        for (let i = 0; i < dataTransfer.items.length; i++) {
            const item = dataTransfer.items[i];
            if (item.kind !== 'file') continue;

            // 1. ลองใช้ getAsFileSystemHandle() ของเบราว์เซอร์ยุคใหม่ก่อน (มี Parallel Streaming Batching)
            let handled = false;
            if (typeof item.getAsFileSystemHandle === 'function' && traverseFn) {
                try {
                    const handle = await item.getAsFileSystemHandle();
                    if (handle && handle.kind === 'directory') {
                        onScanningState(true, { folderName: handle.name });
                        try {
                            const folderData = await traverseFn(handle, {
                                skipDevFolders,
                                onProgress
                            });
                            onFolderScanned(folderData);
                        } finally {
                            onScanningState(false);
                        }
                        handled = true;
                    }
                } catch (handleErr) {
                    console.warn('getAsFileSystemHandle fallback:', handleErr);
                }
            }
            if (handled) continue;

            // 2. Fallback ไปยัง webkitGetAsEntry()
            const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
            if (entry) {
                if (entry.isDirectory && readEntryFn) {
                    onScanningState(true, { folderName: entry.name });
                    try {
                        const folderData = await readEntryFn(entry, {
                            skipDevFolders,
                            onProgress
                        });
                        onFolderScanned(folderData);
                    } finally {
                        onScanningState(false);
                    }
                } else if (entry.isFile) {
                    const file = typeof item.getAsFile === 'function' ? item.getAsFile() : null;
                    onFileScanned(file, file ? file.name : entry.name);
                }
            } else if (typeof item.getAsFile === 'function') {
                const file = item.getAsFile();
                if (file) onFileScanned(file, file.name);
            }
        }
    } else if (dataTransfer.files && dataTransfer.files.length > 0) {
        Array.from(dataTransfer.files).forEach(file => {
            onFileScanned(file, file.name);
        });
    }
}

// ส่งออก Helper functions เพื่อการทดสอบ
if (typeof window !== 'undefined') {
    window.UploadModalHelpers = {
        isDevDirectoryName,
        formatBytes,
        getFileTypeDisplay,
        extractWebkitFiles,
        traverseDirectoryHandle,
        readDirectoryEntry,
        uploadFolderRecursive,
        detectDevFolders,
        excludeDevFolder,
        applyDevFolderFilter,
        fetchBatchUploadUrls,
        extractUniqueDirectoryPaths,
        preResolveDirectories,
        safeFetchWithRetry,
        setScanningState,
        updateScanningProgress,
        processDroppedItems
    };
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        isDevDirectoryName,
        formatBytes,
        getFileTypeDisplay,
        extractWebkitFiles,
        traverseDirectoryHandle,
        readDirectoryEntry,
        uploadFolderRecursive,
        detectDevFolders,
        excludeDevFolder,
        applyDevFolderFilter,
        fetchBatchUploadUrls,
        extractUniqueDirectoryPaths,
        preResolveDirectories,
        setScanningState,
        updateScanningProgress,
        processDroppedItems
    };
}

if (typeof document !== 'undefined') {
document.addEventListener('DOMContentLoaded', () => {
    const uploadModal = document.getElementById('uploadModal');
    const uploadDropzone = document.getElementById('uploadDropzone');
    const uploadFileInput = document.getElementById('uploadFileInput');
    const uploadFolderInput = document.getElementById('uploadFolderInput');
    const uploadBrowseFileBtn = document.getElementById('uploadBrowseFileBtn');
    const uploadBrowseFolderBtn = document.getElementById('uploadBrowseFolderBtn');
    const uploadQueueList = document.getElementById('uploadQueueList');
    const uploadCancelBtn = document.getElementById('uploadCancelBtn');
    const uploadSubmitBtn = document.getElementById('uploadSubmitBtn');
    const uploadSkipDevFoldersCheckbox = document.getElementById('uploadSkipDevFoldersCheckbox');

    // เก็บรายการในคิว: { name: string, type: 'file' | 'folder', isEditing: boolean, file?: File }
    let selectedFiles = [];

    // จัดการ Event เมื่อ Checkbox ข้ามโฟลเดอร์สำหรับพัฒนาถูกติ๊กหรือปลดติ๊ก
    if (uploadSkipDevFoldersCheckbox) {
        uploadSkipDevFoldersCheckbox.addEventListener('change', () => {
            const shouldExclude = uploadSkipDevFoldersCheckbox.checked;
            selectedFiles.forEach(item => {
                if (item.type === 'folder') {
                    applyDevFolderFilter(item, shouldExclude);
                }
            });
            renderQueue();
        });
    }

    // เปิด Upload Modal
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('.open-upload-modal');
        if (trigger) {
            e.stopPropagation();

            // ปิด Dropdown ทั้งหมด
            document.querySelectorAll('.new-options-dropdown, .options-dropdown').forEach(d => {
                d.classList.remove('show');
            });

            if (uploadSkipDevFoldersCheckbox) {
                uploadSkipDevFoldersCheckbox.checked = true;
            }

            if (uploadModal) {
                uploadModal.style.display = 'flex';
            }
        }
    });

    const closeUploadModal = () => {
        if (uploadModal) {
            uploadModal.style.display = 'none';
        }
    };

    // เพิ่มรายการโฟลเดอร์พร้อมไฟล์ย่อยเข้าสู่คิว
    const addFolderItemToQueue = (folderData) => {
        if (!folderData || !folderData.rootFolderName) return;
        const existingIdx = selectedFiles.findIndex(f => f.name === folderData.rootFolderName);
        const shouldSkipDev = uploadSkipDevFoldersCheckbox ? uploadSkipDevFoldersCheckbox.checked : true;
        const item = {
            name: folderData.rootFolderName,
            originalName: folderData.rootFolderName,
            type: 'folder',
            isEditing: false,
            rawFiles: folderData.files ? [...folderData.files] : [],
            files: folderData.files ? [...folderData.files] : [],
            totalSize: folderData.totalSize || 0,
            fileCount: folderData.fileCount || (folderData.files ? folderData.files.length : 0),
            skippedDevFolders: folderData.skippedDevFolders || []
        };
        applyDevFolderFilter(item, shouldSkipDev);
        if (existingIdx >= 0) {
            selectedFiles[existingIdx] = item;
        } else {
            selectedFiles.push(item);
        }
    };

    // เพิ่มรายการ (ไฟล์ หรือ โฟลเดอร์) เข้าสู่คิว
    const addItemToQueue = (name, type = 'file', fileObj = null) => {
        if (fileObj) {
            window.uploadedBlobMap = window.uploadedBlobMap || new Map();
            try {
                window.uploadedBlobMap.set(name, URL.createObjectURL(fileObj));
            } catch (e) {}
        }
        if (!name) return;
        // ป้องกันชื่อซ้ำในคิวเดียวกัน
        if (!selectedFiles.some(f => f.name === name)) {
            selectedFiles.push({
                name: name,
                type: type, // 'folder' หรือ 'file'
                isEditing: false,
                file: fileObj
            });
        }
    };

    // Render รายการไฟล์/โฟลเดอร์ในคิว
    const renderQueue = () => {
        if (!uploadQueueList) return;

        if (selectedFiles.length === 0) {
            uploadQueueList.innerHTML = `
                <div class="upload-queue-empty" style="text-align: center; color: #6b735c; font-size: 14px; padding: 20px 0;">
                    No files or folders selected yet
                </div>
            `;
            return;
        }

        uploadQueueList.innerHTML = '';
        selectedFiles.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'upload-queue-row';
            const isFolder = item.type === 'folder';

            if (item.isEditing) {
                let inputHtml = '';
                if (isFolder) {
                    inputHtml = `
                        <i class="fas fa-folder"></i>
                        <input type="text" class="upload-inline-name-input" data-index="${index}" data-is-folder="true" value="${item.name}">
                        <button type="button" class="upload-save-name-btn" data-index="${index}" title="Save">
                            <i class="fas fa-check"></i>
                        </button>
                    `;
                } else {
                    const lastDot = item.name.lastIndexOf('.');
                    const baseName = lastDot > 0 ? item.name.substring(0, lastDot) : item.name;
                    const ext = lastDot > 0 ? item.name.substring(lastDot) : '';

                    inputHtml = `
                        <i class="far fa-file-alt"></i>
                        <input type="text" class="upload-inline-name-input" data-index="${index}" data-is-folder="false" data-ext="${ext}" value="${baseName}">
                        <span class="upload-inline-ext">${ext}</span>
                        <button type="button" class="upload-save-name-btn" data-index="${index}" title="Save">
                            <i class="fas fa-check"></i>
                        </button>
                    `;
                }

                row.innerHTML = `
                    <span class="col-upload-name" style="flex: 1.4;">
                        ${inputHtml}
                    </span>
                    <span class="col-upload-type">${getFileTypeDisplay(item)}</span>
                    <button type="button" class="upload-remove-file-btn" data-index="${index}" title="Remove">
                        <i class="fas fa-times"></i>
                    </button>
                `;
            } else {
                let iconClass = 'far fa-file-alt';
                if (isFolder) {
                    iconClass = 'fas fa-folder';
                } else {
                    const ext = item.name.split('.').pop().toLowerCase();
                    if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
                        iconClass = 'fas fa-image';
                    }
                }

                row.innerHTML = `
                    <span class="col-upload-name" title="Click pencil or name to edit">
                        <i class="${iconClass}"></i>
                        <span class="upload-file-name-text" data-index="${index}">${item.name}</span>
                        <button type="button" class="upload-edit-name-btn" data-index="${index}" title="Rename">
                            <i class="fas fa-pencil-alt"></i>
                        </button>
                    </span>
                    <span class="col-upload-type">${getFileTypeDisplay(item)}</span>
                    <button type="button" class="upload-remove-file-btn" data-index="${index}" title="Remove">
                        <i class="fas fa-times"></i>
                    </button>
                `;
            }
            uploadQueueList.appendChild(row);
        });

        // Auto focus เมื่อเปิดกล่อง inline edit
        const inlineInput = uploadQueueList.querySelector('.upload-inline-name-input');
        if (inlineInput) {
            inlineInput.focus();
            inlineInput.select();

            const saveInlineName = (idx) => {
                const isFolder = inlineInput.dataset.isFolder === 'true';
                const newBase = inlineInput.value.trim();
                if (isFolder) {
                    if (newBase.length > 0) {
                        selectedFiles[idx].name = newBase;
                    }
                } else {
                    const ext = inlineInput.dataset.ext || '';
                    if (newBase.length > 0) {
                        selectedFiles[idx].name = newBase + ext;
                    }
                }
                selectedFiles[idx].isEditing = false;
                renderQueue();
            };

            inlineInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const idx = parseInt(inlineInput.dataset.index, 10);
                    saveInlineName(idx);
                } else if (e.key === 'Escape') {
                    const idx = parseInt(inlineInput.dataset.index, 10);
                    selectedFiles[idx].isEditing = false;
                    renderQueue();
                }
            });

            const saveBtn = uploadQueueList.querySelector('.upload-save-name-btn');
            if (saveBtn) {
                saveBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt(saveBtn.dataset.index, 10);
                    saveInlineName(idx);
                });
            }
        }

        // คลิกดินสอหรือชื่อเพื่อเริ่ม Rename
        uploadQueueList.querySelectorAll('.upload-edit-name-btn, .upload-file-name-text').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.index, 10);
                selectedFiles.forEach((f, i) => { f.isEditing = (i === idx); });
                renderQueue();
            });
        });

        // ผูก event ปุ่มลบออกจากคิว
        uploadQueueList.querySelectorAll('.upload-remove-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.index, 10);
                selectedFiles.splice(idx, 1);
                renderQueue();
            });
        });
    };

    // ปุ่ม Upload Files (สำหรับไฟล์เท่านั้น แยกชัดเจน)
    if (uploadBrowseFileBtn) {
        uploadBrowseFileBtn.addEventListener('click', async (e) => {
            e.stopPropagation();

            // ล้างโฟลเดอร์ออกจากคิวเมื่อกดเลือกไฟล์ เพื่อให้คิวเป็นไฟล์ล้วนตามปุ่มที่เลือก
            selectedFiles = selectedFiles.filter(f => f.type === 'file');

            // ใช้ File System Access API สำหรับเลือกไฟล์
            if (window.showOpenFilePicker) {
                try {
                    const fileHandles = await window.showOpenFilePicker({ multiple: true });
                    if (fileHandles && fileHandles.length > 0) {
                        for (const handle of fileHandles) {
                            const file = await handle.getFile();
                            addItemToQueue(file.name, 'file', file);
                        }
                        renderQueue();
                    }
                    return;
                } catch (err) {
                    if (err.name === 'AbortError') return;
                    console.warn('showOpenFilePicker failed, falling back:', err);
                }
            }

            if (uploadFileInput) {
                uploadFileInput.click();
            }
        });
    }

    // ปุ่ม Upload Folder (สำหรับโฟลเดอร์เท่านั้น แยกชัดเจน)
    if (uploadBrowseFolderBtn) {
        uploadBrowseFolderBtn.addEventListener('click', async (e) => {
            e.stopPropagation();

            // ล้างไฟล์ออกจากคิวเมื่อกดเลือกโฟลเดอร์ เพื่อให้คิวเป็นโฟลเดอร์ล้วนตามปุ่มที่เลือก
            selectedFiles = selectedFiles.filter(f => f.type === 'folder');

            // ใช้ File System Access API (Chrome / Edge) เพื่อเปิดหน้าต่าง "Select Folder" โดยเฉพาะ
            if (window.showDirectoryPicker) {
                try {
                    const dirHandle = await window.showDirectoryPicker();
                    if (dirHandle && dirHandle.name) {
                        setScanningState(true, { folderName: dirHandle.name });
                        const skipDevFolders = uploadSkipDevFoldersCheckbox ? uploadSkipDevFoldersCheckbox.checked : true;
                        const folderData = await traverseDirectoryHandle(dirHandle, {
                            skipDevFolders,
                            onProgress: (p) => updateScanningProgress(p)
                        });
                        setScanningState(false);
                        addFolderItemToQueue(folderData);
                        renderQueue();
                    }
                    return;
                } catch (err) {
                    setScanningState(false);
                    if (err.name === 'AbortError') return;
                    console.warn('showDirectoryPicker failed, falling back to input:', err);
                }
            }

            // Fallback มาตรฐาน input webkitdirectory
            if (uploadFolderInput) {
                uploadFolderInput.click();
            }
        });
    }

    // เมื่อเลือกไฟล์ผ่าน file input (Fallback)
    if (uploadFileInput) {
        uploadFileInput.addEventListener('change', (e) => {
            selectedFiles = selectedFiles.filter(f => f.type === 'file');
            if (e.target.files) {
                Array.from(e.target.files).forEach(file => {
                    addItemToQueue(file.name, 'file', file);
                });
            }
            uploadFileInput.value = '';
            renderQueue();
        });
    }

    // เมื่อเลือกโฟลเดอร์ผ่าน folder input (Fallback)
    if (uploadFolderInput) {
        uploadFolderInput.addEventListener('change', (e) => {
            selectedFiles = selectedFiles.filter(f => f.type === 'folder');
            if (e.target.files && e.target.files.length > 0) {
                const skipDevFolders = uploadSkipDevFoldersCheckbox ? uploadSkipDevFoldersCheckbox.checked : true;
                const folderData = extractWebkitFiles(e.target.files, { skipDevFolders });
                addFolderItemToQueue(folderData);
            }
            uploadFolderInput.value = '';
            renderQueue();
        });
    }

    // จัดการ Drag & Drop (รองรับทั้ง File และ Folder)
    if (uploadDropzone) {
        // คลิกส่วนว่างของ dropzone ให้เรียกปุ่ม Upload Files
        uploadDropzone.addEventListener('click', (e) => {
            if (e.target.closest('.upload-dropzone-badge')) return;
            if (uploadBrowseFileBtn) uploadBrowseFileBtn.click();
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            uploadDropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                uploadDropzone.classList.add('dragover');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            uploadDropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                uploadDropzone.classList.remove('dragover');
            });
        });

        uploadDropzone.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadDropzone.classList.remove('dragover');

            const skipDevFolders = uploadSkipDevFoldersCheckbox ? uploadSkipDevFoldersCheckbox.checked : true;
            await processDroppedItems(e.dataTransfer, {
                skipDevFolders,
                onScanningState: (state, stats) => setScanningState(state, stats),
                onProgress: (p) => updateScanningProgress(p),
                onFolderScanned: (folderData) => addFolderItemToQueue(folderData),
                onFileScanned: (file, name) => addItemToQueue(name, 'file', file),
                traverseDirectoryHandle,
                readDirectoryEntry
            });
            renderQueue();
        });
    }

    // เมื่อกดปุ่ม Upload (ส่งไฟล์ขึ้น S3 / Mock Storage และบันทึกลงฐานข้อมูล)
    if (uploadSubmitBtn) {
        uploadSubmitBtn.addEventListener('click', async () => {
            if (selectedFiles.length === 0) {
                if (window.showToast) {
                    window.showToast('Please select at least one file or folder to upload.', 'warning');
                } else {
                    alert('Please select at least one file or folder to upload.');
                }
                return;
            }

            const originalBtnText = uploadSubmitBtn.innerHTML;
            uploadSubmitBtn.disabled = true;
            uploadSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

            const fileContainer = document.querySelector('.file-table-container, .file-container');
            const tableHeader = fileContainer ? fileContainer.querySelector('.file-table-header, .file-header-divider') : null;

            let successCount = 0;

            const urlParams = new URLSearchParams(window.location.search);
            const currentFolderId = urlParams.get('folder') || null;

            const progressBox = document.getElementById('uploadProgressBox');
            const progressText = document.getElementById('uploadProgressText');
            const progressPercent = document.getElementById('uploadProgressPercent');
            const progressBar = document.getElementById('uploadProgressBar');

            // แสดงกล่องสถานะความคืบหน้าทันทีตั้งแต่เริ่มเตรียมอัปโหลด ป้องกันปุ่มหมุนค้างโดยไม่มีข้อมูล
            if (progressBox) progressBox.style.display = 'block';
            if (progressBar) progressBar.style.width = '0%';
            if (progressPercent) progressPercent.textContent = '0%';
            if (progressText) progressText.textContent = 'Preparing upload...';

            const totalFilesCount = selectedFiles.reduce((acc, item) => {
                if (item.type === 'folder') return acc + (item.files && item.files.length > 0 ? item.files.length : 1);
                return acc + 1;
            }, 0);
            let overallCompleted = 0;

            const updateOverallProgress = (currentName) => {
                if (progressBox) progressBox.style.display = 'block';
                const pct = totalFilesCount > 0 ? Math.min(100, Math.round((overallCompleted / totalFilesCount) * 100)) : 0;
                if (progressBar) progressBar.style.width = `${pct}%`;
                if (progressPercent) progressPercent.textContent = `${pct}%`;
                if (progressText) progressText.textContent = `Uploading ${overallCompleted}/${totalFilesCount}: ${currentName}`;
                if (uploadSubmitBtn) uploadSubmitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${pct}% (${overallCompleted}/${totalFilesCount})`;
            };

            try {
                // Client-side Quota Pre-check: Calculate total upload payload and compare with free quota
                const totalUploadBytes = selectedFiles.reduce((acc, item) => {
                    if (item.type === 'file' && item.file) return acc + (Number(item.file.size) || 0);
                    if (item.type === 'folder') return acc + (Number(item.totalSize) || 0);
                    return acc;
                }, 0);
                if (totalUploadBytes > 0) {
                    try {
                        const storageRes = await fetch('/api/user/storage');
                        if (storageRes.ok) {
                            const storageData = await storageRes.json();
                            const freeBytes = storageData.freeBytes !== undefined
                                ? storageData.freeBytes
                                : Math.max(0, (storageData.quota || 0) - (storageData.totalUsed || 0));
                            if (totalUploadBytes > freeBytes) {
                                const freeFormatted = storageData.formattedFree || formatBytes(freeBytes);
                                const neededFormatted = formatBytes(totalUploadBytes);
                                if (window.showToast) {
                                    window.showToast(`Storage quota exceeded! Free: ${freeFormatted}, Required: ${neededFormatted}`, 'error');
                                } else {
                                    alert(`Storage quota exceeded! Free: ${freeFormatted}, Required: ${neededFormatted}`);
                                }
                                return;
                            }
                        }
                    } catch (quotaErr) {
                        console.warn('Quota pre-check request failed, falling back to backend guard:', quotaErr);
                    }
                }

                for (const item of selectedFiles) {
                    const isFolder = item.type === 'folder';
                    let fileId = `file-${Date.now()}`;
                    let uploadedFileRecord = null;

                    if (isFolder) {
                        // 1. กรณีเป็น Folder: เรียก uploadFolderRecursive สร้างโฟลเดอร์หลัก โฟลเดอร์ย่อย และอัปโหลดไฟล์ภายในทั้งหมด
                        const shouldSkipDev = uploadSkipDevFoldersCheckbox ? uploadSkipDevFoldersCheckbox.checked : true;
                        applyDevFolderFilter(item, shouldSkipDev);
                        if (progressText) progressText.textContent = `Preparing folder: ${item.name}...`;
                        const folderRes = await uploadFolderRecursive({
                            folderItem: item,
                            parentFolderId: currentFolderId,
                            apiFetch: fetch,
                            onProgress: ({ completed, total, currentPath, percent }) => {
                                overallCompleted++;
                                updateOverallProgress(currentPath);
                            },
                            onDirProgress: ({ current, total, dirName, percent }) => {
                                if (progressBox) progressBox.style.display = 'block';
                                if (progressBar) progressBar.style.width = `${percent}%`;
                                if (progressPercent) progressPercent.textContent = `${percent}%`;
                                if (progressText) progressText.textContent = `Preparing directory structure (${current}/${total}): ${dirName}`;
                                if (uploadSubmitBtn) uploadSubmitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Preparing (${current}/${total})`;
                            }
                        });
                        fileId = folderRes.rootFolder.file_id;
                        uploadedFileRecord = folderRes.rootFolder;
                        if (!item.files || item.files.length === 0) {
                            overallCompleted++;
                            updateOverallProgress(item.name);
                        }
                    } else {
                        // 2. กรณีเป็นไฟล์: ขอ Presigned Upload URL
                        updateOverallProgress(item.name);
                        const fileSize = item.file ? item.file.size : 1024;
                        const contentType = item.file ? (item.file.type || 'application/octet-stream') : 'application/octet-stream';

                        const urlRes = await fetch('/api/files/upload-url', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                filename: item.name,
                                size: fileSize,
                                contentType: contentType,
                                folder_id: currentFolderId
                            })
                        });

                        const urlData = await urlRes.json();
                        if (!urlRes.ok || !urlData.success) throw new Error(urlData.error || 'Failed to get upload URL');

                        fileId = urlData.file_id;
                        uploadedFileRecord = urlData.file;
                        const uploadUrl = urlData.uploadUrl;

                        // 3. PUT binary data ไปยัง S3 / Mock Storage
                        const uploadBody = item.file || new Blob(['EasyDrive Mock File Content'], { type: contentType });
                        const putRes = await fetch(uploadUrl, {
                            method: 'PUT',
                            headers: { 'Content-Type': contentType },
                            body: uploadBody
                        });

                        if (!putRes.ok) throw new Error('Failed to upload file content to storage');
                        overallCompleted++;
                        updateOverallProgress(item.name);
                    }

                    successCount++;
                    if (item.file) {
                        window.uploadedBlobMap = window.uploadedBlobMap || new Map();
                        try {
                            const bUrl = URL.createObjectURL(item.file);
                            window.uploadedBlobMap.set(fileId, bUrl);
                            window.uploadedBlobMap.set(item.name, bUrl);
                        } catch (e) {}
                    }

                    // 4. แทรกแถวลงในหน้าจอ (Realtime DOM Update)
                    if (fileContainer) {
                        const emptyNotice = fileContainer.querySelector('.empty-state, p');
                        if (emptyNotice) emptyNotice.remove();

                        const safeName = item.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

                        const iconSvg = isFolder
                            ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                   <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                               </svg>`
                            : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                   <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                   <polyline points="14 2 14 8 20 8"/>
                               </svg>`;

                        const ext = item.name.split('.').pop().toLowerCase();
                        const fileCat = isFolder ? 'folder' : ((uploadedFileRecord && uploadedFileRecord.category) || 'other');
                        const fileTags = isFolder ? ['folder'] : ((uploadedFileRecord && Array.isArray(uploadedFileRecord.tags)) ? uploadedFileRecord.tags : [fileCat, ext]);
                        const tagsJoined = fileTags.join(',');

                        const menuContent = isFolder
                            ? `<div class="options-dropdown folder-options">
                                   <button class="option-item open-folder-action" data-id="${fileId}" data-filename="${safeName}"><i class="fas fa-folder-open"></i> Open</button>
                                   <button class="option-item download-action" data-id="${fileId}" data-filename="${safeName}"><i class="fas fa-download"></i> <span class="download-text">Download</span></button>
                                   <button class="option-item open-rename-modal" data-id="${fileId}" data-filename="${safeName}"><i class="fas fa-pencil-alt"></i> Rename</button>
                                   <button class="option-item copy-link-action" data-id="${fileId}" data-filename="${safeName}"><i class="fas fa-link"></i> <span class="copy-link-text">Copy link</span></button>
                                   <button class="option-item open-share-modal" data-id="${fileId}" data-filename="${safeName}" data-access="[]"><i class="fas fa-share"></i> Share</button>
                                   <button class="option-item open-info-drawer" data-id="${fileId}" data-filename="${safeName}" data-type="${isFolder ? 'folder' : 'file'}" data-category="${fileCat}"><i class="fas fa-info-circle"></i> Information</button>
                                   <button class="option-item open-delete-modal move-to-trash-action" data-id="${fileId}" data-filename="${safeName}"><i class="fas fa-trash-alt"></i> <span class="move-to-trash-text">Move to Trash</span></button>
                               </div>`
                            : `<div class="options-dropdown file-options">
                                   <button class="option-item open-preview-modal" data-id="${fileId}" data-filename="${safeName}" data-category="${fileCat}"><i class="fas fa-eye"></i> Preview</button>
                                   <button class="option-item download-action" data-id="${fileId}" data-filename="${safeName}"><i class="fas fa-download"></i> <span class="download-text">Download</span></button>
                                   <button class="option-item open-rename-modal" data-id="${fileId}" data-filename="${safeName}"><i class="fas fa-pencil-alt"></i> Rename</button>
                                   <button class="option-item open-tags-modal" data-id="${fileId}" data-filename="${safeName}" data-tags="${tagsJoined}"><i class="fas fa-tags"></i> Edit Tags</button>
                                   <button class="option-item copy-link-action" data-id="${fileId}" data-filename="${safeName}"><i class="fas fa-link"></i> <span class="copy-link-text">Copy link</span></button>
                                   <button class="option-item open-share-modal" data-id="${fileId}" data-filename="${safeName}" data-access="[]"><i class="fas fa-share"></i> Share</button>
                                   <button class="option-item open-info-drawer" data-id="${fileId}" data-filename="${safeName}" data-type="${isFolder ? 'folder' : 'file'}" data-category="${fileCat}"><i class="fas fa-info-circle"></i> Information</button>
                                   <button class="option-item open-delete-modal move-to-trash-action" data-id="${fileId}" data-filename="${safeName}"><i class="fas fa-trash-alt"></i> <span class="move-to-trash-text">Move to Trash</span></button>
                               </div>`;

                        const newRow = document.createElement('div');
                        newRow.className = isFolder ? 'file-row folder-row' : 'file-row';
                        newRow.dataset.id = fileId;
                        newRow.dataset.name = safeName;
                        newRow.dataset.type = isFolder ? 'folder' : 'file';
                        newRow.dataset.folderId = currentFolderId || '';
                        newRow.dataset.category = fileCat;
                        newRow.dataset.tags = tagsJoined;
                        newRow.dataset.date = (uploadedFileRecord && (uploadedFileRecord.created_at || uploadedFileRecord.createdAt)) || new Date().toISOString();
                        newRow.innerHTML = `
                            <div class="file-name">
                                ${iconSvg}
                                <span class="file-name-text">${safeName}</span>
                                <div class="file-tags-wrapper">
                                    ${fileTags.map(t => `<span class="file-tag-badge" title="Click to filter by tag: ${t}">${t}</span>`).join('')}
                                </div>
                            </div>
                            <div class="file-owner">
                                <div class="owner-avatar">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                                        <circle cx="12" cy="7" r="4"/>
                                    </svg>
                                </div>
                                me
                            </div>
                            <div class="file-date">Just now</div>
                            <div class="options-wrapper">
                                <button class="options-btn toggle-options" aria-label="Options">
                                    <i class="fas fa-ellipsis-v"></i>
                                </button>
                                ${menuContent}
                            </div>
                        `;

                        const existingRow = fileContainer.querySelector(`.file-row[data-id="${fileId}"]`);
                        if (!existingRow) {
                            if (tableHeader && tableHeader.nextSibling) {
                                fileContainer.insertBefore(newRow, tableHeader.nextSibling);
                            } else {
                                fileContainer.appendChild(newRow);
                            }
                        }
                    }
                }

                if (window.showToast) {
                    window.showToast(`Uploaded ${successCount} item(s) successfully!`, 'success');
                }

                // Refresh sidebar storage and filters
                if (window.refreshSidebarStorage) {
                    window.refreshSidebarStorage();
                }
                if (typeof window !== 'undefined' && typeof window.sortDriveTable === 'function') {
                    const savedCol = (typeof localStorage !== 'undefined' && localStorage.getItem('drive_sort_col')) || 'date';
                    const savedDir = (typeof localStorage !== 'undefined' && localStorage.getItem('drive_sort_dir')) || 'desc';
                    window.sortDriveTable(fileContainer, savedCol, savedDir);
                }
                if (window.applyDriveFilters) {
                    window.applyDriveFilters();
                }

                // ล้างคิวและปิด Modal
                selectedFiles = [];
                renderQueue();
                closeUploadModal();
            } catch (err) {
                console.error('Upload error:', err);
                if (window.showToast) {
                    window.showToast(`Upload failed: ${err.message}`, 'error');
                } else {
                    alert(`Upload failed: ${err.message}`);
                }
            } finally {
                uploadSubmitBtn.disabled = false;
                uploadSubmitBtn.innerHTML = originalBtnText;
                if (progressBox) progressBox.style.display = 'none';
                if (progressBar) progressBar.style.width = '0%';
            }
        });
    }

    if (uploadCancelBtn) {
        uploadCancelBtn.addEventListener('click', () => {
            selectedFiles = [];
            renderQueue();
            closeUploadModal();
        });
    }

    if (uploadModal) {
        uploadModal.addEventListener('click', (e) => {
            if (e.target === uploadModal) {
                closeUploadModal();
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && uploadModal && uploadModal.style.display === 'flex') {
            closeUploadModal();
        }
    });
});
}
