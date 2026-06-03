import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomBytes } from "crypto";

export class S3Service {
  private client: S3Client;
  private bucketName: string;
  private publicUrl: string;

  constructor(bucketName: string) {
    if (!bucketName) {
      throw new Error("Bucket name is required for S3Service");
    }

    this.bucketName = bucketName;

    const endpoint = process.env.S3_ENDPOINT;
    const region = process.env.S3_REGION ?? "us-east-1";
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    this.publicUrl = (process.env.S3_PUBLIC_URL ?? "").replace(/\/$/, "");

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY environment variables are required",
      );
    }

    this.client = new S3Client({
      region,
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
  }

  private generateUniqueId(): string {
    return randomBytes(35).toString("hex");
  }

  async generatePresignedUrl(originalFilename: string, contentType: string) {
    if (!originalFilename || !contentType) {
      throw new Error("Filename and content type are required");
    }

    const uniqueId = this.generateUniqueId();
    const fileKey = `uploads/${uniqueId}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: fileKey,
      ContentType: contentType,
      ContentDisposition: `attachment; filename="${originalFilename}"`,
      Metadata: {
        "original-filename": originalFilename,
        "original-name": originalFilename,
      },
    });

    try {
      const uploadUrl = await getSignedUrl(this.client, command, {
        expiresIn: 3600,
      });
      const publicUrl = `${this.publicUrl}/${fileKey}`;

      return {
        uploadUrl,
        fileKey: uniqueId,
        filePath: fileKey,
        publicUrl,
      };
    } catch (error) {
      console.error("Error generating presigned URL:", error);
      throw error;
    }
  }

  async getObject(key: string) {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    return this.client.send(command);
  }

  async uploadFile(key: string, buffer: Buffer, contentType: string) {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        }),
      );
    } catch (error) {
      console.error("Error uploading file to S3:", error);
      throw error;
    }
  }

  async deleteFile(key: string) {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
    } catch (error) {
      console.error("Error deleting file from S3:", error);
      throw error;
    }
  }
}

let s3ServiceInstance: S3Service | null = null;

function getS3Service() {
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("S3_BUCKET_NAME environment variable is required");
  }

  s3ServiceInstance ??= new S3Service(bucketName);
  return s3ServiceInstance;
}

export const s3Service = {
  generatePresignedUrl(...args: Parameters<S3Service["generatePresignedUrl"]>) {
    return getS3Service().generatePresignedUrl(...args);
  },
  getObject(...args: Parameters<S3Service["getObject"]>) {
    return getS3Service().getObject(...args);
  },
  uploadFile(...args: Parameters<S3Service["uploadFile"]>) {
    return getS3Service().uploadFile(...args);
  },
  deleteFile(...args: Parameters<S3Service["deleteFile"]>) {
    return getS3Service().deleteFile(...args);
  },
};
