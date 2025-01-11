import { z } from "zod";
import { S3Client } from "bun";
import { StorageService } from "./storage-service";
import {
  createRandomFileName,
  getDateAsPaddedStringParts,
  mimeTypeToExtension,
} from "./helpers";

export const s3StorageOptionsSchema = z.object({
  dateSubdirectories: z.boolean().optional().default(true),
  accessKeyId: z.string().nonempty(),
  secretAccessKey: z.string().nonempty(),
  bucket: z.string().nonempty(),
  pathPrefix: z.string().optional(),
  endpoint: z.string().nonempty(),
});

export class S3StorageService implements StorageService {
  #s3Client: S3Client;
  #pathPrefix: string | undefined;
  #dateSubdirectories: boolean;

  constructor(options: z.infer<typeof s3StorageOptionsSchema>) {
    this.#s3Client = new S3Client({
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      bucket: options.bucket,
      endpoint: options.endpoint,
    });
    this.#dateSubdirectories = options.dateSubdirectories;
    this.#pathPrefix = options.pathPrefix;
  }

  async uploadFile(
    merchant: string,
    transactionDate: Date,
    file: File
  ): Promise<void> {
    const { year, month, day } = getDateAsPaddedStringParts(transactionDate);

    let pathPrefixToUse = this.#dateSubdirectories
      ? `${this.#pathPrefix}/${year}/${month}/${day}`
      : this.#pathPrefix;

    const fileExtension = mimeTypeToExtension(file.type);
    const fileName = createRandomFileName(
      this.#dateSubdirectories
        ? `${merchant}.${fileExtension}`
        : `${year}-${month}-${day}_${merchant}.${fileExtension}`
    );

    const filePath = `${pathPrefixToUse}/${fileName}`;
    const s3File = this.#s3Client.file(filePath);

    await s3File.write(file);
  }
}
