export interface Receipt {
  merchant: string;
  transactionDate: string;
  memo: string;
  totalAmount: number;
  category: string;
  lineItems?: ReceiptLineItem[];
}

export interface ReceiptLineItem {
  productName: string;
  quantity?: number;
  lineItemTotalAmount: number;
  category: string;
}
