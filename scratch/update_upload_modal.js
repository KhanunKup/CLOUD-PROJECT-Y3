// scratch/update_upload_modal.js
const fs = require('fs');

['frontend/public/js/upload-modal.js', 'backend/src/api/public/js/upload-modal.js'].forEach(filePath => {
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(
    'if (!urlData.deduplicated && fileContainer) {',
    'if (fileContainer) {'
  );
  content = content.replace(
    "const safeName = item.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;');",
    "const displayName = (urlData && (urlData.filename || (urlData.file && urlData.file.filename))) || item.name;\n                        const safeName = displayName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;');"
  );
  content = content.replace(
    "const ext = item.name.split('.').pop().toLowerCase();",
    "const ext = displayName.split('.').pop().toLowerCase();"
  );
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated', filePath);
});

