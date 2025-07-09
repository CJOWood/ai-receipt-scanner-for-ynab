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

export function buildSplitFeedback(
  splitInfo: SplitInfo | undefined,
  receipt: Receipt
): string {
  let splitFeedback = ''
  if (splitInfo?.attempted) {
    if (splitInfo.successful) {
      splitFeedback = `\n• Split across ${splitInfo.splitCount} categories successfully`
      if (splitInfo.taxDistributed && splitInfo.taxDistributed > 0) {
        splitFeedback += `\n• Tax distributed: $${splitInfo.taxDistributed.toFixed(2)}`
      }
      if (splitInfo.adjustmentApplied && Math.abs(splitInfo.adjustmentApplied) > 0) {
        const adjType = splitInfo.adjustmentType
        const adjTypeText = adjType === 'tolerance' ? 'tolerance adjustment' : 
          adjType === 'proportional_adjustment' ? 'proportional adjustment' :
          adjType === 'tax_distribution' ? 'with tax distribution' : 'adjustment'
        splitFeedback += `\n• ${adjTypeText}: ${splitInfo.adjustmentApplied >= 0 ? '+' : ''}$${splitInfo.adjustmentApplied.toFixed(2)}`
      }
      if (splitInfo.detailedBreakdown) {
        const breakdown = splitInfo.detailedBreakdown
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
      splitFeedback = `\n• ⚠️ Split transaction attempted but failed: ${splitInfo.reason}`
      splitFeedback += `\n• Expected total: $${splitInfo.expectedAmount?.toFixed(2)}, Split total: $${splitInfo.totalSplitAmount?.toFixed(2)}`
      splitFeedback += `\n• Transaction created as single entry in "${receipt.category}" instead`
    }
  } else if (receipt.lineItems && receipt.lineItems.length > 1) {
    splitFeedback = `\n• Single transaction (no splits attempted)`
  }
  return splitFeedback
}
