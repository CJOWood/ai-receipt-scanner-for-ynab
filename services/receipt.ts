import type { Receipt } from "./shared-types";
import {
  createTransaction,
  getAllEnvelopes as getAllCategories,
  getAllPayees,
} from "./budget";
import { parseReceipt, buildPrompt } from "./gen-ai";
import { getStorageService } from "./storage";
import env from "../utils/env-vars";

const storageService = getStorageService();

export type ReceiptProgressHandler = (event: string, data?: unknown) => void | Promise<void>;

export const processAndUploadReceipt = async (
  account: string,
  file: File,
  onProgress?: ReceiptProgressHandler
): Promise<Receipt> => {
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  await onProgress?.("upload-start");

  // Get the list of available YNAB categories
  const ynabCategories = await getAllCategories();
  await onProgress?.("categories-loaded", ynabCategories);

  let receipt: Receipt | null = null;

  let ynabPayees = env.YNAB_INCLUDE_PAYEES_IN_PROMPT
    ? await getAllPayees()
    : null;
  if (ynabPayees) {
    await onProgress?.("payees-loaded", ynabPayees);
  }

  try {
    await onProgress?.("request-gemini", buildPrompt(ynabPayees));
    receipt = await parseReceipt(
      fileBuffer,
      file.type,
      ynabCategories,
      ynabPayees
    );

    if (!receipt) {
      throw new Error("Receipt was supposedly parsed but null was returned.");
    }
    await onProgress?.("response-gemini", receipt);
  } catch (err) {
    console.error(`Failed to parse the receipt: ${err}`);
    throw new ReceiptParseError();
  }

  try {
    await onProgress?.("request-ynab");
    await createTransaction(
      account,
      receipt.merchant,
      receipt.category,
      receipt.transactionDate,
      receipt.memo,
      receipt.totalAmount,
      receipt.lineItems?.map((li) => ({
        category: li.category,
        amount: li.lineItemTotalAmount,
      }))
    );
    await onProgress?.("response-ynab");
  } catch (err) {
    console.error(`Failed to import the receipt into YNAB: ${err}`);
    throw new ReceiptYnabImportError();
  }

  if (storageService) {
    try {
      await onProgress?.("upload-file");
      await storageService.uploadFile(
        receipt.merchant,
        new Date(receipt.transactionDate),
        file
      );
      await onProgress?.("upload-file-done");
    } catch (err) {
      console.error(`Failed to upload the receipt: ${err}`);
      throw new ReceiptFileUploadError();
    }
  }

  return receipt;
};

export class ReceiptParseError extends Error {
  constructor() {
    super("Failed to parse the receipt");
    this.name = "ReceiptParseError";
  }
}

export class ReceiptYnabImportError extends Error {
  constructor() {
    super("Failed to import the receipt into YNAB");
    this.name = "ReceiptYnabImportError";
  }
}

export class ReceiptFileUploadError extends Error {
  constructor() {
    super("Failed to upload the receipt file");
    this.name = "ReceiptFileUploadError";
  }
}
