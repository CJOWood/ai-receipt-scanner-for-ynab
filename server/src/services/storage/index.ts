import env from "../../utils/env-vars";
import type { StorageService } from "./storage-service";
import {
  localStorageOptionsSchema,
  LocalStorageService,
} from "./local-storage-service";
import { s3StorageOptionsSchema, S3StorageService } from "./s3-storage-service";

export function getStorageService(): StorageService | null {
  if (env.FILE_STORAGE === "local") {
    return new LocalStorageService(
      localStorageOptionsSchema.parse({
        directory: env.LOCAL_DIRECTORY,
        dateSubdirectories: env.DATE_SUBDIRECTORIES,
      })
    );
  } else if (env.FILE_STORAGE === "s3") {
    return new S3StorageService(
      s3StorageOptionsSchema.parse({
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        bucket: env.S3_BUCKET,
        pathPrefix: env.S3_PATH_PREFIX,
        endpoint: env.S3_ENDPOINT,
        dateSubdirectories: env.DATE_SUBDIRECTORIES,
      })
    );
  }

  return null;
}
