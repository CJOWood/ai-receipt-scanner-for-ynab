import type { Receipt } from 'shared'

/**
 * Generates a concise, user-friendly summary of how the receipt will be processed.
 * - For split transactions, shows the number of line items and their total.
 * - Warns if the sum of line items (+ tax) does not match the receipt total.
 * - For single transactions, notes if tax is present.
 *
 * @param receipt The parsed receipt object containing line items, taxes, and total.
 * @returns A string summary for user feedback.
 */
export function generateProcessingFeedback(receipt: Receipt): string {
  let feedback = ''

  // If there are multiple line items, this is a split transaction
  if (receipt.lineItems && receipt.lineItems.length > 1) {
    // Calculate the sum of all line item totals
    const lineItemTotal = receipt.lineItems.reduce((sum, item) => sum + item.lineItemTotalAmount, 0)
    feedback += `• Split Transaction: ${receipt.lineItems.length} items totaling $${lineItemTotal.toFixed(2)}`
    if (receipt.totalTaxes && receipt.totalTaxes > 0) {
      // If tax is present, check if items + tax matches the total
      const expectedTotal = lineItemTotal + receipt.totalTaxes
      const difference = Math.abs(receipt.totalAmount - expectedTotal)
      if (difference < 0.05) {
        // Totals match (within a small rounding tolerance)
        feedback += ` + $${receipt.totalTaxes.toFixed(2)} Tax ≈ Total $${receipt.totalAmount.toFixed(2)}`
      } else {
        // Warn if items + tax does not match the total
        feedback += `\n ⚠️ Discrepancy: Items+Tax $${expectedTotal.toFixed(2)} ≠ Total $${receipt.totalAmount.toFixed(2)}`
        feedback += `\n• Will attempt proportional adjustment if difference is small`
      }
    } else {
      // No tax: check if line items match the total
      const difference = Math.abs(receipt.totalAmount - lineItemTotal)
      if (difference < 0.05) {
        // Totals match (within a small rounding tolerance)
        feedback += ` (ignoring small difference ${difference.toFixed(2)})`
      } else {
        // Warn if line items do not match the total
        feedback += `\n ⚠️ Discrepancy: Items $${lineItemTotal.toFixed(2)} ≠ Total $${receipt.totalAmount.toFixed(2)}`
        feedback += `\n• Will attempt proportional adjustment if difference is small`
      }
    }
  } else {
    // Single transaction (no splits)
    feedback += `• Single transaction`
    // Note if tax is present
    if (receipt.totalTaxes && receipt.totalTaxes > 0) {
      feedback += ` (+ $${receipt.totalTaxes.toFixed(2)} Tax)`
    }
  }

  return feedback
}
