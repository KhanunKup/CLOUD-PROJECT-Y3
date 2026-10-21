const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const crypto = require('crypto');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
  DynamoDBDocumentClient, 
  UpdateCommand, 
  QueryCommand, 
  GetCommand 
} = require('@aws-sdk/lib-dynamodb');

const REGION = process.env.AWS_REGION;
const FILES_TABLE = process.env.FILES_TABLE;
const USERS_TABLE = process.env.USERS_TABLE;

const s3 = new S3Client({ region: REGION });
const ddbClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);

// Category and Auto-Tag Extractor
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
  console.log('[EasyDrive Worker] Processing S3 Event:', JSON.stringify(event, null, 2));

  for (const record of event.Records || []) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    const size = record.s3.object.size;

    console.log(`[Worker] New upload detected: ${key} (${size} bytes) from bucket: ${bucket}`);

    try {
      // 1. Parse Key Structure: uploads/{owner_id}/{file_id}/{filename}
      const parts = key.split('/');
      let ownerId = 'unknown';
      let fileId = null;
      let filename = 'unknown';

      if (parts.length >= 4 && parts[0] === 'uploads') {
        ownerId = parts[1];
        fileId = parts[2];
        filename = parts.slice(3).join('/');
      } else {
        filename = parts.pop();
        fileId = parts.pop() || `file-${Date.now()}`;
      }

      // 2. Stream S3 object and calculate SHA-256 Hash (Zero-Knowledge / Ephemeral)
      const getObj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const hash = crypto.createHash('sha256');

      for await (const chunk of getObj.Body) {
        hash.update(chunk);
      }
      const fileHash = hash.digest('hex');
      console.log(`[Worker] SHA-256 Hash: ${fileHash}`);

      // 3. Extract Category and Tags based on extension
      const { category, tags } = getCategoryAndTags(filename);
      console.log(`[Worker] Category: ${category}, Tags:`, tags);

      // 4. Check for duplicate files in the system using HashIndex
      let isDuplicate = false;
      let duplicateOf = null;

      try {
        const hashQuery = await docClient.send(new QueryCommand({
          TableName: FILES_TABLE,
          IndexName: 'HashIndex',
          KeyConditionExpression: 'file_hash = :h',
          ExpressionAttributeValues: { ':h': fileHash },
          Limit: 1
        }));

        if (hashQuery.Items && hashQuery.Items.length > 0) {
          isDuplicate = true;
          duplicateOf = hashQuery.Items[0].file_id;
          console.log(`[Worker] Duplicate detected! Matches existing file: ${duplicateOf}`);
        }
      } catch (hashErr) {
        console.warn('[Worker] HashIndex query warning (table may not be indexed yet):', hashErr.message);
      }

      // 5. Update DynamoDB easydrive-files record
      await docClient.send(new UpdateCommand({
        TableName: FILES_TABLE,
        Key: { file_id: fileId },
        UpdateExpression: `SET 
          file_hash = :h,
          category = :cat,
          tags = :t,
          #sz = :s,
          #st = :status,
          is_duplicate = :dup,
          duplicate_of = :dupOf,
          updated_at = :up`,
        ExpressionAttributeNames: {
          '#sz': 'size',
          '#st': 'status'
        },
        ExpressionAttributeValues: {
          ':h': fileHash,
          ':cat': category,
          ':t': tags,
          ':s': size,
          ':status': 'active',
          ':dup': isDuplicate,
          ':dupOf': duplicateOf,
          ':up': new Date().toISOString()
        }
      }));
      console.log(`[Worker] Updated file metadata in DynamoDB for ${fileId}`);

      // 6. Update User Storage Quota and Category Breakdown in easydrive-users
      if (ownerId && ownerId !== 'unknown') {
        try {
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
          }));
          console.log(`[Worker] Updated storage breakdown for user ${ownerId}`);
        } catch (userErr) {
          console.warn(`[Worker] User storage update note:`, userErr.message);
        }
      }

    } catch (err) {
      console.error(`[Worker] Error processing S3 object ${key}:`, err);
    }
  }

  return { status: 'completed' };
};
