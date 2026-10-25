const path = require('path');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
  DynamoDBDocumentClient, 
  UpdateCommand 
} = require('@aws-sdk/lib-dynamodb');

const REGION = process.env.AWS_REGION;
const FILES_TABLE = process.env.FILES_TABLE;
const USERS_TABLE = process.env.USERS_TABLE;

const ddbClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);

function getCategoryAndTags(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const categories = {
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
    document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'],
    archive: ['zip', 'rar', '7z', 'tar', 'gz'],
    code: ['py', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'scss', 'json', 'sh', 'bash', 'sql', 'java', 'c', 'cpp', 'cs', 'php', 'rb', 'go', 'rs', 'yaml', 'yml', 'xml', 'env'],
    video: ['mp4', 'mov', 'avi', 'mkv'],
    audio: ['mp3', 'wav', 'aac']
  };

  for (const [cat, exts] of Object.entries(categories)) {
    if (exts.includes(ext)) {
      return { category: cat, tags: [cat, ext] };
    }
  }
  return { category: 'other', tags: [ext || 'unknown'] };
}

exports.handler = async (event) => {
  for (const record of event.Records || []) {
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    const size = record.s3.object.size;

    // ข้ามถ้าไม่ใช่ไฟล์ในโฟลเดอร์ uploads
    if (!key.startsWith('uploads/')) continue;

    try {
      const parts = key.split('/');
      let ownerId = parts[1];
      let fileId = parts.length >= 4 ? parts[parts.length - 2] : null;
      let filename = parts[parts.length - 1];

      if (!fileId) continue;

      const { category, tags } = getCategoryAndTags(filename);

      // 1. อัปเดตสถานะไฟล์ใน FILES_TABLE เป็น active ทันที (ไม่ต้องดึงไฟล์มาคำนวณ Hash ซ้ำ)
      await docClient.send(new UpdateCommand({
        TableName: FILES_TABLE,
        Key: { file_id: fileId },
        UpdateExpression: 'SET #st = :status, category = :cat, tags = :t, #sz = :s, updated_at = :up',
        ExpressionAttributeNames: {
          '#st': 'status',
          '#sz': 'size'
        },
        ExpressionAttributeValues: {
          ':status': 'active',
          ':cat': category,
          ':t': tags,
          ':s': size,
          ':up': new Date().toISOString()
        }
      })).catch(() => {});

      // 2. อัปเดต USERS_TABLE แบบ Atomic คำสั่งเดียวจบ (ไม่วนลูปซ้ำ)
      if (ownerId && ownerId !== 'unknown') {
        await docClient.send(new UpdateCommand({
          TableName: USERS_TABLE,
          Key: { user_id: ownerId },
          UpdateExpression: `SET 
            totalUsed = if_not_exists(totalUsed, :zero) + :s,
            breakdown.#cat = if_not_exists(breakdown.#cat, :zero) + :s,
            updated_at = :up`,
          ExpressionAttributeNames: {
            '#cat': category
          },
          ExpressionAttributeValues: {
            ':s': size,
            ':zero': 0,
            ':up': new Date().toISOString()
          }
        })).catch(() => {});
      }

    } catch (err) {
      console.error(`[Worker Quick Fail] ${key}:`, err.message);
    }
  }

  return { status: 'completed' };
};