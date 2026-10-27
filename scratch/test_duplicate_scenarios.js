// scratch/test_duplicate_scenarios.js
const assert = require('assert');
const UploadCoordinator = require('../backend/src/api/upload-coordinator');
const { resolveUniqueName, getUniqueFilename } = require('../backend/src/api/filename-resolver');

async function runTests() {
  console.log('=== STARTING DUPLICATE FILENAME RESOLUTION TESTS ===');

  // Test 1: getUniqueFilename unit tests
  console.log('Test 1: getUniqueFilename edge cases...');
  assert.strictEqual(getUniqueFilename([], 'test.txt'), 'test.txt');
  assert.strictEqual(getUniqueFilename(['other.txt'], 'test.txt'), 'test.txt');
  assert.strictEqual(getUniqueFilename(['test.txt'], 'test.txt'), 'test (1).txt');
  assert.strictEqual(getUniqueFilename(['test.txt', 'test (1).txt'], 'test.txt'), 'test (2).txt');
  assert.strictEqual(getUniqueFilename(['test (1).txt'], 'test (1).txt'), 'test (2).txt');
  assert.strictEqual(getUniqueFilename(['myfolder'], 'myfolder'), 'myfolder (1)');
  assert.strictEqual(getUniqueFilename(['Test.txt'], 'test.txt'), 'test (1).txt'); // case-insensitive check
  console.log('✅ Test 1 passed!');

  // Test 2: UploadCoordinator Mock Mode
  console.log('Test 2: UploadCoordinator cross-folder vs same-folder uploads...');
  let mockDatabase = [];
  const coordinator = new UploadCoordinator({
    isMockMode: true,
    mockFilesRef: () => mockDatabase,
    mockStorage: { saveMockFiles: (files) => { mockDatabase = files; } }
  });

  const user = { user_id: 'user-001' };

  // 2a. Upload test.txt in root
  const resRoot1 = await coordinator.prepareUploads(user, [{ filename: 'test.txt', size: 100, folder_id: 'root' }]);
  assert.strictEqual(resRoot1.items[0].filename, 'test.txt');
  assert.strictEqual(resRoot1.items[0].deduplicated, false);
  assert.strictEqual(mockDatabase.length, 1);
  assert.strictEqual(mockDatabase[0].filename, 'test.txt');
  assert.strictEqual(mockDatabase[0].folder_id, 'root');

  // 2b. Upload test.txt into folder 'folder-testy'
  // Should keep 'test.txt' because folder-testy does NOT have test.txt yet!
  const resFolder1 = await coordinator.prepareUploads(user, [{ filename: 'test.txt', size: 100, folder_id: 'folder-testy' }]);
  assert.strictEqual(resFolder1.items[0].filename, 'test.txt', 'test.txt in folder-testy should remain test.txt!');
  assert.strictEqual(mockDatabase.length, 2);
  const folderFile = mockDatabase.find(f => f.folder_id === 'folder-testy');
  assert.strictEqual(folderFile.filename, 'test.txt');

  // 2c. Upload another test.txt into folder 'folder-testy'
  // Should auto-rename to 'test (1).txt' because folder-testy ALREADY has test.txt!
  const resFolder2 = await coordinator.prepareUploads(user, [{ filename: 'test.txt', size: 100, folder_id: 'folder-testy' }]);
  assert.strictEqual(resFolder2.items[0].filename, 'test (1).txt', 'duplicate in same folder must be test (1).txt!');
  assert.strictEqual(mockDatabase.length, 3);

  // 2d. Upload another test.txt in root
  // Should auto-rename to 'test (1).txt' in root!
  const resRoot2 = await coordinator.prepareUploads(user, [{ filename: 'test.txt', size: 100, folder_id: 'root' }]);
  assert.strictEqual(resRoot2.items[0].filename, 'test (1).txt');
  assert.strictEqual(mockDatabase.length, 4);

  // Verify that all 4 files have their OWN unique file_id and own s3_key
  const fileIds = mockDatabase.map(f => f.file_id);
  const uniqueFileIds = new Set(fileIds);
  assert.strictEqual(uniqueFileIds.size, 4, 'All 4 files must have distinct file_ids');

  const s3Keys = mockDatabase.map(f => f.s3_key);
  const uniqueS3Keys = new Set(s3Keys);
  assert.strictEqual(uniqueS3Keys.size, 4, 'All 4 files must have distinct storage keys (no shared binaries)');
  console.log('✅ Test 2 passed!');

  // Test 3: Moving files with name collisions
  console.log('Test 3: Move file resolution...');
  // Moving a file 'test (1).txt' from root into 'folder-testy' where 'test (1).txt' already exists
  const movedName = await resolveUniqueName({
    isMockMode: true,
    mockFiles: mockDatabase,
    userId: 'user-001',
    folderId: 'folder-testy',
    requestedName: 'test (1).txt',
    excludeFileId: 'file-from-root'
  });
  assert.strictEqual(movedName, 'test (2).txt', 'Moving into folder with conflict should resolve to test (2).txt');
  console.log('✅ Test 3 passed!');

  // Test 4: Creating folders with duplicate names
  console.log('Test 4: Create folder resolution...');
  mockDatabase.push({
    file_id: 'folder-01',
    owner_id: 'user-001',
    folder_id: 'root',
    filename: 'Projects',
    category: 'folder',
    status: 'active'
  });
  const newFolder1 = await resolveUniqueName({
    isMockMode: true,
    mockFiles: mockDatabase,
    userId: 'user-001',
    folderId: 'root',
    requestedName: 'Projects'
  });
  assert.strictEqual(newFolder1, 'Projects (1)');

  // In a subfolder where 'Projects' does not exist
  const newFolder2 = await resolveUniqueName({
    isMockMode: true,
    mockFiles: mockDatabase,
    userId: 'user-001',
    folderId: 'folder-testy',
    requestedName: 'Projects'
  });
  assert.strictEqual(newFolder2, 'Projects', 'In subfolder Projects should remain Projects');
  console.log('✅ Test 4 passed!');

  console.log('\n🎉 ALL DUPLICATE RESOLUTION TESTS PASSED 100%! 🎉');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

