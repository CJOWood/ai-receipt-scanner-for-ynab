import type { Receipt } from 'shared'

export function generateProcessingFeedback(receipt: Receipt): string {
  let feedback = '✓ Data validated and ready for YNAB import'

  // Add tax processing info
  if (receipt.totalTaxes && receipt.totalTaxes > 0) {
    feedback += `\n• Tax amount of $${receipt.totalTaxes.toFixed(2)} will be distributed proportionally`
  }

  // Add split transaction info
  if (receipt.lineItems && receipt.lineItems.length > 1) {
    const lineItemTotal = receipt.lineItems.reduce((sum, item) => sum + item.lineItemTotalAmount, 0)
    feedback += `\n• Split transaction planned across ${receipt.lineItems.length} line items`
    feedback += `\n• Line items total: $${lineItemTotal.toFixed(2)}`

    if (receipt.totalTaxes && receipt.totalTaxes > 0) {
      const expectedTotal = lineItemTotal + receipt.totalTaxes
      const difference = Math.abs(receipt.totalAmount - expectedTotal)

      if (difference < 0.05) {
        feedback += `\n• Math checks out: Items + Tax = $${expectedTotal.toFixed(2)} ≈ Total $${receipt.totalAmount.toFixed(2)}`
      } else {
        feedback += `\n• ⚠️ Math discrepancy: Items + Tax = $${expectedTotal.toFixed(2)}, but Total = $${receipt.totalAmount.toFixed(2)}`
        feedback += `\n• Will attempt proportional adjustment if difference is small`
      }
    } else {
      const difference = Math.abs(receipt.totalAmount - lineItemTotal)
      if (difference < 0.05) {
        feedback += `\n• Math checks out: Line items match receipt total`
      } else {
        feedback += `\n• ⚠️ Line items ($${lineItemTotal.toFixed(2)}) don't match total ($${receipt.totalAmount.toFixed(2)})`
        feedback += `\n• Will attempt proportional adjustment if difference is small`
      }
    }
  } else {
    feedback += `\n• Single transaction (no line item splits)`
  }

  return feedback
}
