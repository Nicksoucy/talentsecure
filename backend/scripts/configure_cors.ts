
import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

async function configureR2Cors() {
    if (!process.env.USE_R2 || process.env.USE_R2 !== 'true') {
        console.log('R2 is not enabled in .env. Skipping R2 CORS configuration.');
        return;
    }

    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
        console.error('Missing R2 credentials in .env');
        return;
    }

    console.log(`Configuring CORS for R2 bucket: ${R2_BUCKET_NAME}...`);

    const client = new S3Client({
        region: 'auto',
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: R2_ACCESS_KEY_ID,
            secretAccessKey: R2_SECRET_ACCESS_KEY,
        },
    });

    const command = new PutBucketCorsCommand({
        Bucket: R2_BUCKET_NAME,
        CORSConfiguration: {
            CORSRules: [
                {
                    AllowedHeaders: ['*'],
                    AllowedMethods: ['PUT', 'GET', 'HEAD', 'POST', 'DELETE'],
                    AllowedOrigins: ['http://localhost:5173', 'http://localhost:3000', 'https://staging.talentsecure.ca', 'https://app.talentsecure.ca', '*'],
                    ExposeHeaders: ['ETag'],
                    MaxAgeSeconds: 3000,
                },
            ],
        },
    });

    try {
        await client.send(command);
        console.log('✅ Successfully updated CORS configuration for R2.');
    } catch (error) {
        console.error('❌ Error updating CORS configuration:', error);
    }
}

configureR2Cors();
