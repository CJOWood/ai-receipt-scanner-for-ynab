export interface StorageService {
  uploadFile(merchant: string, transactionDate: Date, file: File): Promise<void>;
}
