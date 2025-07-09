import type { Receipt } from 'shared';

export function formatLineItems(lineItems: Receipt['lineItems'] = []) {
  return lineItems
    .map(
      (item) => `  - ${item.productName}: $${item.lineItemTotalAmount.toFixed(2)} (${item.category})`
    )
    .join('\n');
}
