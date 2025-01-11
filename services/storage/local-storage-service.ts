import { z } from "zod";
import * as crypto from "node:crypto";
import type { StorageService } from "./storage-service";
import { readdirSync } from "node:fs";
import path from "node:path";
import {
  createRandomFileName,
  getDateAsPaddedStringParts,
  mimeTypeToExtension,
} from "./helpers";

export const localStorageOptionsSchema = z.object({
  dateSubdirectories: z.boolean().optional().default(true),
  directory: z.string().nonempty(),
});

export class LocalStorageService implements StorageService {
  #directory: string;
  #dateSubdirectories: boolean;

  constructor(options: z.infer<typeof localStorageOptionsSchema>) {
    this.#directory = options.directory.endsWith("/")
      ? options.directory.slice(0, -1)
      : options.directory;
    this.#dateSubdirectories = options.dateSubdirectories;
  }

  async uploadFile(
    merchant: string,
    transactionDate: Date,
    file: File
  ): Promise<void> {
    const { year, month, day } = getDateAsPaddedStringParts(transactionDate);

    let fileDirectory = this.#dateSubdirectories
      ? path.join(this.#directory, `${year}`, `${month}`, `${day}`)
      : this.#directory;

    const fileExtension = mimeTypeToExtension(file.type);
    const fileName = createRandomFileName(
      this.#dateSubdirectories
        ? `${merchant}.${fileExtension}`
        : `${year}-${month}-${day}_${merchant}.${fileExtension}`
    );

    const filePath = path.join(fileDirectory, fileName);

    await Bun.write(filePath, file);
  }
}
