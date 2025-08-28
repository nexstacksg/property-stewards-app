import { S3Client } from '@aws-sdk/client-s3'

// Configure S3 client for DigitalOcean Spaces
export const s3Client = new S3Client({
  endpoint: `https://${process.env.DO_SPACE_ENDPOINT}`,
  region: 'sgp1', // Singapore region
  credentials: {
    accessKeyId: process.env.DO_SPACE_ACCESS_KEY!,
    secretAccessKey: process.env.DO_SPACE_SECRET_KEY!,
  },
  forcePathStyle: false, // DigitalOcean Spaces requires this to be false
})

export const BUCKET_NAME = process.env.DO_SPACE_NAME!
export const SPACE_DIRECTORY = 'data' // Main directory for all uploads
export const PUBLIC_URL = `https://${process.env.DO_SPACE_NAME}.${process.env.DO_SPACE_ENDPOINT}`