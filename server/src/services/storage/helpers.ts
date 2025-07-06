import * as crypto from "node:crypto";

export function mimeTypeToExtension(mimeType: string): string {
  // Just map types supported by endpoint
  switch (mimeType.toLowerCase()) {
    case "application/pdf":
      return "pdf";
    case "image/jpeg":
      return "jpg";
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      throw new Error(`Unsupported MIME type: ${mimeType}`);
  }
}

export function getDateAsPaddedStringParts(date: Date): {
  year: string;
  month: string;
  day: string;
} {
  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");

  return { year, month, day };
}

export function createRandomFileName(fileName: string): string {
  const extensionSymbol = fileName.lastIndexOf(".");
  if (extensionSymbol === -1) {
    throw new Error("File name does not contain an extension");
  }

  const fileNameWithoutExtension = fileName.slice(0, extensionSymbol);
  const fileExtension = fileName.slice(extensionSymbol + 1);

  const fileNameRandomString = crypto.randomBytes(8).toString("hex");

  return `${fileNameWithoutExtension}-${fileNameRandomString}.${fileExtension}`;
}
