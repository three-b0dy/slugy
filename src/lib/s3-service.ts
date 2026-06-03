import AWS from "aws-sdk";
import CryptoJS from "crypto-js";

export class S3Service {
  private s3: AWS.S3;
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

    this.s3 = new AWS.S3({
      region,
      endpoint,
      accessKeyId,
      secretAccessKey,
      signatureVersion: "v4",
      s3ForcePathStyle: true,
    });
  }

  private generateUniqueId(): string {
    return CryptoJS.lib.WordArray.random(35).toString(CryptoJS.enc.Hex);
  }

  async generatePresignedUrl(originalFilename: string, contentType: string) {
    if (!originalFilename || !contentType) {
      throw new Error("Filename and content type are required");
    }

    const uniqueId = this.generateUniqueId();
    const fileKey = `uploads/${uniqueId}`;

    const params = {
      Bucket: this.bucketName,
      Key: fileKey,
      Expires: 3600,
      ContentType: contentType,
      ContentDisposition: `attachment; filename="${originalFilename}"`,
      Metadata: {
        "original-filename": originalFilename,
        "original-name": originalFilename,
      },
    };

    try {
      const uploadUrl = await this.s3.getSignedUrlPromise("putObject", params);
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
    return this.s3.getObject({ Bucket: this.bucketName, Key: key }).promise();
  }

  async uploadFile(key: string, buffer: Buffer, contentType: string) {
    try {
      await this.s3
        .upload({
          Bucket: this.bucketName,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        })
        .promise();
    } catch (error) {
      console.error("Error uploading file to S3:", error);
      throw error;
    }
  }

  async deleteFile(key: string) {
    try {
      await this.s3
        .deleteObject({ Bucket: this.bucketName, Key: key })
        .promise();
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
