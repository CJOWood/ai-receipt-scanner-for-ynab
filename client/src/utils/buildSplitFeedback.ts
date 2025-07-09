// Utility to build split transaction feedback for logs
import type { Receipt } from 'shared'

export interface SplitInfo {
  attempted?: boolean
  successful?: boolean
  splitCount?: number
  taxDistributed?: number
  adjustmentApplied?: number
  adjustmentType?: string
  detailedBreakdown?: {
    originalSplitTotal: number
    taxAmount: number
    finalAdjustment: number
  }
  reason?: string
  expectedAmount?: number
  totalSplitAmount?: number
}

// Builds a feedback string describing the result of a split transaction attempt.
//
// Given a splitInfo object (see below for example), this function generates a human-readable summary
// of what happened during the split process. It is used to inform the user about the outcome of splitting
// a receipt into multiple categories in YNAB, including details about tax distribution, adjustments, and
// whether the split was successful or not.
//
// Example input:
// {
//   attempted: true,                // Was a split attempted?
//   successful: true,               // Was the split successful?
//   splitCount: 6,                  // Number of categories split across
//   totalSplitAmount: -157.82,      // Actual sum of split line items (before adjustment)
//   expectedAmount: -167.28,        // What the split total should have been (matches receipt total)
//   taxDistributed: 9.46,           // Tax distributed across splits
//   adjustmentType: "tax_distribution", // Type of adjustment applied (if any)
//   detailedBreakdown: {
//     originalSplitTotal: -157.82,  // Sum of item line amounts before tax/adjustment
//     taxAmount: 9.46,              // Tax amount distributed
//     finalAdjustment: 0            // Final adjustment applied to match receipt
//   }
// }
//
// The output will include:
// - Whether the split was successful and how many categories were used
// - If tax was distributed, the amount
// - If an adjustment was applied, the type and amount
// - A breakdown of the math: items + tax + adjustment = receipt total
// - If the split failed, the reason and what was done instead
//
// This function is robust to missing or partial data and will only show relevant details.

export function buildSplitFeedback(
  splitInfo: SplitInfo | undefined,
  receipt: Receipt
): string {
  let splitFeedback = ''
  // If a split was attempted...
  if (splitInfo?.attempted) {
    if (splitInfo.successful) {
      // Show tax distribution if present
      if (splitInfo.taxDistributed && splitInfo.taxDistributed > 0) {
        splitFeedback += `\n• Tax distributed: $${splitInfo.taxDistributed.toFixed(2)}`
      }
      // Show adjustment if present (e.g. tolerance, proportional, or tax adjustment)
      if (splitInfo.adjustmentApplied && Math.abs(splitInfo.adjustmentApplied) > 0) {
        const adjType = splitInfo.adjustmentType
        const adjTypeText = adjType === 'tolerance' ? 'tolerance adjustment' : 
          adjType === 'proportional_adjustment' ? 'proportional adjustment' :
          adjType === 'tax_distribution' ? 'with tax distribution' : 'adjustment'
        splitFeedback += `\n• ${adjTypeText}: ${splitInfo.adjustmentApplied >= 0 ? '+' : ''}$${splitInfo.adjustmentApplied.toFixed(2)}`
      }
      // Show a detailed breakdown if available
      if (splitInfo.detailedBreakdown) {
        const breakdown = splitInfo.detailedBreakdown
        // Show the math: items + tax + adjustment = receipt total
        splitFeedback += `\n• Split breakdown: Items $${breakdown.originalSplitTotal.toFixed(2)}`
        if (breakdown.taxAmount > 0) {
          splitFeedback += ` + Tax $${breakdown.taxAmount.toFixed(2)}`
        }
        if (Math.abs(breakdown.finalAdjustment) > 0) {
          splitFeedback += ` + Adj $${breakdown.finalAdjustment.toFixed(2)}`
        }
        splitFeedback += ` = $${receipt.totalAmount.toFixed(2)}`
      }
    } else {
      // Split was attempted but failed: show reason and fallback
      splitFeedback = `\n• ⚠️ Split transaction attempted but failed.`
      splitFeedback += `\n• Expected total: $${splitInfo.expectedAmount?.toFixed(2)}, Split total: $${splitInfo.totalSplitAmount?.toFixed(2)}`
      splitFeedback += `\n• Transaction created as single entry in "${receipt.category}" instead`
    }
  } else if (receipt.lineItems && receipt.lineItems.length > 1) {
    // No split attempted, but there were multiple line items
    splitFeedback = `\n• Single transaction (no splits attempted)`
  }
  return splitFeedback
}
