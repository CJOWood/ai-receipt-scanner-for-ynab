import type { Receipt } from 'shared'

export function generateProcessingFeedback(receipt: Receipt): string {
  let feedback = ''

  if (receipt.lineItems && receipt.lineItems.length > 1) {
    const lineItemTotal = receipt.lineItems.reduce((sum, item) => sum + item.lineItemTotalAmount, 0)
    feedback += `• Split: ${receipt.lineItems.length} items @ $${lineItemTotal.toFixed(2)}`
    if (receipt.totalTaxes && receipt.totalTaxes > 0) {
      const expectedTotal = lineItemTotal + receipt.totalTaxes
      const difference = Math.abs(receipt.totalAmount - expectedTotal)
      if (difference < 0.05) {
        feedback += ` + $${receipt.totalTaxes.toFixed(2)} Tax ≈ Total $${receipt.totalAmount.toFixed(2)}`
      } else {
        feedback += ` ⚠️ Items+Tax $${expectedTotal.toFixed(2)} ≠ Total $${receipt.totalAmount.toFixed(2)}`
      }
    } else {
      const difference = Math.abs(receipt.totalAmount - lineItemTotal)
      if (difference < 0.05) {
        feedback += ` (matches total)`
      } else {
        feedback += ` ⚠️ Items $${lineItemTotal.toFixed(2)} ≠ Total $${receipt.totalAmount.toFixed(2)}`
      }
    }
  } else {
    feedback += `\n• Single transaction`
    if (receipt.totalTaxes && receipt.totalTaxes > 0) {
      feedback += ` (+Tax $${receipt.totalTaxes.toFixed(2)})`
    }
  }

  return feedback
}
