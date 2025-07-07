import * as ynab from "ynab";
import env from "../utils/env-vars";
import { logger } from "../utils/logger";

const apiKey = env.YNAB_API_KEY;
const budgetId = env.YNAB_BUDGET_ID;
// Use the already-normalized array from env-vars
const allowedCategories: string[] = env.YNAB_CATEGORY_GROUPS;

const api = new ynab.API(apiKey);

export const getAllEnvelopes = async () => {
  logger.debug("getAllEnvelopes called", { budgetId, allowedCategories });
  // Use the lighter endpoint
  const categoryGroupsResp = await api.categories.getCategories(budgetId);
  const categoryGroups = categoryGroupsResp.data.category_groups;
  logger.debug("Fetched category groups", { length: categoryGroups?.length });

  let envelopes: string[] = [];
  if (!allowedCategories || allowedCategories.length === 0) {
    // No filter: include all non-deleted, non-hidden categories
    envelopes = categoryGroups
      .flatMap((group) => group.categories || [])
      .filter((cat) => !cat.deleted && !cat.hidden)
      .map((cat) => cat.name)
      .filter(Boolean);
  } else {
    // Filter by allowedCategories
    envelopes = categoryGroups
      .filter((group) => allowedCategories.includes(group.name))
      .flatMap((group) => group.categories || [])
      .filter((cat) => !cat.deleted && !cat.hidden)
      .map((cat) => cat.name)
      .filter(Boolean);
  }
  logger.debug("getAllEnvelopes result", { length: envelopes.length });
  if (!envelopes.length) {
    logger.warn("No envelopes found", { budgetId, allowedCategories });
    throw new Error("No envelopes found");
  }
  return envelopes;
};

export const getAllPayees = async () => {
  logger.debug("getAllPayees called", { budgetId });
  const payeesResp = await api.payees.getPayees(budgetId);
  const payees = payeesResp.data.payees
    ?.filter((p) => p.name && !p.deleted)
    .map((p) => p.name);
  logger.debug("getAllPayees result", { length: payees.length });
  if (!payees || !payees.length) {
    logger.warn("No payees found", { budgetId });
    throw new Error("No payees found");
  }
  return payees;
};

export const getAllAccounts = async () => {
  logger.debug("getAllAccounts called", { budgetId });
  const accountsResp = await api.accounts.getAccounts(budgetId);
  const accounts = accountsResp.data.accounts
    ?.filter((a) => !a.closed && !a.deleted)
    .map((a) => a.name);
  logger.debug("getAllAccounts result", { length: accounts.length });
  if (!accounts || !accounts.length) {
    logger.warn("No accounts found", { budgetId });
    throw new Error("No accounts found");
  }
  return accounts;
};

export const getYnabInfo = async () => {
  logger.debug("getYnabInfo called");
  const categories = await getAllEnvelopes();
  const payees = await getAllPayees();
  const accounts = await getAllAccounts();
  logger.debug("getYnabInfo result", { catLength: categories.length, payeeLength: payees.length, accLength: accounts.length });
  return { categories, payees, accounts };
};

export const createTransaction = async (
  accountName: string,
  merchant: string,
  category: string,
  transactionDate: string,
  memo: string,
  totalAmount: number,
  splits?: {
    category: string;
    amount: number;
  }[],
  totalTaxes?: number
): Promise<{
  success: true;
  splitInfo?: EnhancedSplitInfo;
  dateAdjustment?: {
    originalDate: string;
    adjustedDate: string;
    reason: string;
  };
}> => {  logger.debug("createTransaction called", { 
    accountName, 
    merchant, 
    category, 
    transactionDate, 
    memo, 
    totalAmount, 
    totalTaxes,
    splits: splits?.map(s => ({ category: s.category, amount: s.amount })) || null
  });
  
  const { validatedDate, dateAdjustment } = validateTransactionDate(transactionDate);

  // Fix all the amounts by multiplying by 1000 and truncating to an integer
  const fixedTotalAmount = Math.trunc(-totalAmount * 1000);
  const fixedSplits = splits?.map((split) => ({
    category: split.category,
    amount: Math.trunc(-split.amount * 1000),
  }));

  logger.debug("Fixed amounts calculated", {
    originalTotalAmount: totalAmount,
    fixedTotalAmount,
    originalTotalTaxes: totalTaxes,
    fixedSplits: fixedSplits?.map(s => ({ 
      category: s.category, 
      originalAmount: -s.amount / 1000, 
      fixedAmount: s.amount 
    })) || null
  });

  const budget = await api.budgets.getBudgetById(budgetId);

  const accountId = budget.data.budget.accounts?.find(
    (a) => a.name === accountName
  )?.id;

  if (!accountId) {
    logger.error("Account not found", { accountName, budgetId });
    throw new Error("Account not found");
  }

  // First process the splits, if specified. This is useful for transactions that need to be split across multiple categories
  // If a transaction is split, the sum of the lineItemTotalAmounts must add up to the totalAmount for the slip. If they don't
  // we ignore the splits and just log the transaction against a single category.
  const { subtransactions, splitInfo } = fixedSplits
    ? processEnhancedSplits(budget, fixedTotalAmount, fixedSplits, totalTaxes)
    : { subtransactions: [], splitInfo: { attempted: false, successful: false } as EnhancedSplitInfo };

  let categoryId: string | undefined;
  if (subtransactions.length === 0) {
    categoryId = budget.data.budget.categories?.find(
      (c) => c.name === category
    )?.id;

    if (!categoryId) {
      throw new Error("Category not found");
    }
  }

  const transactionData = {
    account_id: accountId,
    amount: fixedTotalAmount,
    category_id: categoryId,
    date: validatedDate,
    payee_name: merchant,
    approved: false,
    memo: memo,
    subtransactions: subtransactions.length > 1 ? subtransactions : undefined,
  };

  logger.debug("Creating YNAB transaction", {
    transactionData: {
      ...transactionData,
      amount: transactionData.amount,
      amountDollars: transactionData.amount / 1000,
      subtransactions: transactionData.subtransactions?.map(sub => ({
        ...sub,
        amount: sub.amount,
        amountDollars: sub.amount / 1000
      })) || undefined
    }
  });

  await api.transactions.createTransaction(budgetId, {
    transaction: transactionData,
  });
  logger.debug("createTransaction completed");
  
  return {
    success: true,
    splitInfo: fixedSplits ? splitInfo : undefined,
    dateAdjustment,
  };
};

const validateTransactionDate = (transactionDate: string): {
  validatedDate: string;
  dateAdjustment?: {
    originalDate: string;
    adjustedDate: string;
    reason: string;
  };
} => {
  const receiptDate = new Date(transactionDate);
  const today = new Date();
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(today.getFullYear() - 5);
  
  // Set time to start of day for comparison
  today.setHours(23, 59, 59, 999);
  fiveYearsAgo.setHours(0, 0, 0, 0);
  receiptDate.setHours(0, 0, 0, 0);
  
  let validatedDate = transactionDate;
  let dateAdjustment: { originalDate: string; adjustedDate: string; reason: string } | undefined;
  
  if (receiptDate > today) {
    const adjustedDate = today.toISOString().substring(0, 10);
    logger.warn("Transaction date is in the future, using today's date instead", { 
      originalDate: transactionDate, 
      adjustedDate 
    });
    validatedDate = adjustedDate;
    dateAdjustment = {
      originalDate: transactionDate,
      adjustedDate,
      reason: "Date was in the future"
    };
  } else if (receiptDate < fiveYearsAgo) {
    const adjustedDate = fiveYearsAgo.toISOString().substring(0, 10);
    logger.warn("Transaction date is more than 5 years ago, using 5 years ago instead", { 
      originalDate: transactionDate, 
      adjustedDate 
    });
    validatedDate = adjustedDate;
    dateAdjustment = {
      originalDate: transactionDate,
      adjustedDate,
      reason: "Date was more than 5 years ago"
    };
  }
  
  return { validatedDate, dateAdjustment };
};

const retrieveSubtransactions = (
  budget: ynab.BudgetDetailResponse,
  fixedTotalAmount: number,
  fixedSplits: {
    category: string;
    amount: number;
  }[]
): {
  subtransactions: ynab.SaveSubTransaction[];
  splitInfo: {
    attempted: boolean;
    successful: boolean;
    reason?: string;
    splitCount?: number;
    totalSplitAmount?: number;
    expectedAmount?: number;
  };
} => {
  const subtransactions: ynab.SaveSubTransaction[] = [];
  
  const totalSplitAmount = fixedSplits.reduce(
    (acc, split) => acc + split.amount,
    0
  );

  const splitInfo: {
    attempted: boolean;
    successful: boolean;
    reason?: string;
    splitCount?: number;
    totalSplitAmount?: number;
    expectedAmount?: number;
  } = {
    attempted: true,
    successful: false,
    splitCount: fixedSplits.length,
    totalSplitAmount: totalSplitAmount / 1000, // Convert back to dollars for display
    expectedAmount: fixedTotalAmount / 1000, // Convert back to dollars for display
  };

  if (totalSplitAmount !== fixedTotalAmount) {
    logger.warn(
      `Total split amount ${totalSplitAmount} does not match total amount ${fixedTotalAmount}. Ignoring splits`
    );
    splitInfo.reason = `Split amounts ($${(totalSplitAmount / 1000).toFixed(2)}) don't equal total ($${(fixedTotalAmount / 1000).toFixed(2)})`;
  } else {
    let splitTotals: { [categoryId: string]: number } = {};

    for (const split of fixedSplits) {
      const splitCategoryId = budget.data.budget.categories?.find(
        (c) => c.name === split.category
      )?.id;

      if (!splitCategoryId) {
        logger.warn(
          `Could not find category ID for ${split.category}. Ignoring splits`
        );
        splitInfo.reason = `Category "${split.category}" not found in YNAB`;
        splitTotals = {};
        break;
      }

      if (!splitTotals[splitCategoryId]) {
        splitTotals[splitCategoryId] = 0;
      }

      splitTotals[splitCategoryId] += split.amount;
    }

    if (Object.keys(splitTotals).length > 0) {
      for (const [categoryId, amount] of Object.entries(splitTotals)) {
        subtransactions.push({
          amount: amount,
          category_id: categoryId,
        });
      }
      splitInfo.successful = true;
    }
  }

  return { subtransactions, splitInfo };
};

// Enhanced split info interface for better feedback
interface EnhancedSplitInfo {
  attempted: boolean;
  successful: boolean;
  reason?: string;
  splitCount?: number;
  totalSplitAmount?: number;
  expectedAmount?: number;
  taxDistributed?: number;
  adjustmentApplied?: number;
  adjustmentType?: 'tax_distribution' | 'proportional_adjustment' | 'tolerance';
  detailedBreakdown?: {
    originalSplitTotal: number;
    taxAmount: number;
    finalAdjustment: number;
  };
}

const SPLIT_TOLERANCE = 0.05; // $0.05 tolerance for small differences

// Enhanced function to process splits with tax distribution and proportional adjustments
const processEnhancedSplits = (
  budget: ynab.BudgetDetailResponse,
  fixedTotalAmount: number,
  fixedSplits: { category: string; amount: number; }[],
  totalTaxes?: number
): {
  subtransactions: ynab.SaveSubTransaction[];
  splitInfo: EnhancedSplitInfo;
} => {
  logger.debug("Starting processEnhancedSplits", {
    fixedTotalAmount,
    fixedTotalAmountDollars: fixedTotalAmount / 1000,
    totalTaxes,
    totalTaxesDollars: totalTaxes || 0,
    fixedSplitsCount: fixedSplits.length,
    isExpense: fixedTotalAmount < 0,
    fixedSplits: fixedSplits.map(s => ({ category: s.category, amount: s.amount, amountDollars: s.amount / 1000 }))
  });

  const subtransactions: ynab.SaveSubTransaction[] = [];
  
  // Calculate original split total
  const originalSplitTotal = fixedSplits.reduce((acc, split) => acc + split.amount, 0);
  
  logger.debug("Original split calculation", {
    originalSplitTotal,
    originalSplitTotalDollars: originalSplitTotal / 1000,
    splitBreakdown: fixedSplits.map(s => `${s.category}: ${s.amount / 1000}`)
  });
  
  const splitInfo: EnhancedSplitInfo = {
    attempted: true,
    successful: false,
    splitCount: fixedSplits.length,
    totalSplitAmount: originalSplitTotal / 1000, // Convert back to dollars for display
    expectedAmount: fixedTotalAmount / 1000, // Convert back to dollars for display
  };

  // Step 1: Distribute taxes proportionally if available
  let adjustedSplits = [...fixedSplits];
  let taxDistributed = 0;
  
  if (totalTaxes && totalTaxes > 0) {
    logger.debug("Starting tax distribution", { totalTaxes, totalTaxesDollars: totalTaxes });
    
    const fixedTotalTaxes = Math.trunc(totalTaxes * 1000);
    const splitTotal = adjustedSplits.reduce((acc, split) => acc + split.amount, 0);
    
    // Since YNAB uses negative values for expenses, we need to make tax negative too
    const isExpense = fixedTotalAmount < 0;
    const taxToDistribute = isExpense ? -fixedTotalTaxes : fixedTotalTaxes;
    
    logger.debug("Tax distribution calculations", {
      fixedTotalTaxes,
      fixedTotalTaxesDollars: fixedTotalTaxes / 1000,
      splitTotal,
      splitTotalDollars: splitTotal / 1000,
      isExpense,
      taxToDistribute,
      taxToDistributeDollars: taxToDistribute / 1000
    });
    
    // Distribute tax proportionally to each split
    adjustedSplits = adjustedSplits.map((split, index) => {
      const proportion = Math.abs(split.amount) / Math.abs(splitTotal); // Use absolute values for proportion calculation
      const taxShare = index === adjustedSplits.length - 1 
        ? taxToDistribute - taxDistributed // Last item gets remainder to avoid rounding errors
        : Math.trunc(proportion * taxToDistribute);
      
      taxDistributed += taxShare;
      
      logger.debug(`Tax distribution for split ${index}`, {
        category: split.category,
        originalAmount: split.amount,
        originalAmountDollars: split.amount / 1000,
        proportion: proportion.toFixed(4),
        taxShare,
        taxShareDollars: taxShare / 1000,
        newAmount: split.amount + taxShare,
        newAmountDollars: (split.amount + taxShare) / 1000,
        isLast: index === adjustedSplits.length - 1
      });
      
      return {
        ...split,
        amount: split.amount + taxShare
      };
    });
    
    logger.debug("Tax distribution completed", {
      taxDistributed,
      taxDistributedDollars: taxDistributed / 1000,
      expectedTax: taxToDistribute,
      expectedTaxDollars: taxToDistribute / 1000,
      difference: taxToDistribute - taxDistributed,
      differenceDollars: (taxToDistribute - taxDistributed) / 1000
    });
    
    splitInfo.taxDistributed = Math.abs(taxDistributed) / 1000; // Report absolute value for user display
    splitInfo.adjustmentType = 'tax_distribution';
  }

  // Step 2: Check if we need further adjustment
  const adjustedSplitTotal = adjustedSplits.reduce((acc, split) => acc + split.amount, 0);
  const difference = fixedTotalAmount - adjustedSplitTotal;
  const differenceInDollars = Math.abs(difference / 1000);
  
  logger.debug("After tax distribution, checking alignment", {
    adjustedSplitTotal,
    adjustedSplitTotalDollars: adjustedSplitTotal / 1000,
    fixedTotalAmount,
    fixedTotalAmountDollars: fixedTotalAmount / 1000,
    difference,
    differenceInDollars,
    tolerance: SPLIT_TOLERANCE,
    withinTolerance: differenceInDollars <= SPLIT_TOLERANCE,
    withinSmallAdjustment: Math.abs(difference) <= 50
  });
  
  // Step 3: Apply proportional adjustment if within tolerance or always if small
  if (differenceInDollars <= SPLIT_TOLERANCE || Math.abs(difference) <= 50) { // 50 = 5 cents in fixed-point
    if (Math.abs(difference) > 0) {
      logger.debug("Applying proportional adjustment", {
        difference,
        differenceInDollars,
        adjustedSplitTotal,
        adjustedSplitTotalDollars: adjustedSplitTotal / 1000
      });
      
      // Distribute the difference proportionally
      let remainingDifference = difference;
      
      adjustedSplits = adjustedSplits.map((split, index) => {
        if (index === adjustedSplits.length - 1) {
          // Last item gets the remainder to ensure exact match
          logger.debug(`Final adjustment for split ${index} (last item)`, {
            category: split.category,
            beforeAmount: split.amount,
            beforeAmountDollars: split.amount / 1000,
            remainingDifference,
            remainingDifferenceDollars: remainingDifference / 1000,
            afterAmount: split.amount + remainingDifference,
            afterAmountDollars: (split.amount + remainingDifference) / 1000
          });
          
          return {
            ...split,
            amount: split.amount + remainingDifference
          };
        } else {
          const proportion = split.amount / adjustedSplitTotal;
          const adjustment = Math.trunc(proportion * difference);
          remainingDifference -= adjustment;
          
          logger.debug(`Proportional adjustment for split ${index}`, {
            category: split.category,
            beforeAmount: split.amount,
            beforeAmountDollars: split.amount / 1000,
            proportion: proportion.toFixed(4),
            adjustment,
            adjustmentDollars: adjustment / 1000,
            afterAmount: split.amount + adjustment,
            afterAmountDollars: (split.amount + adjustment) / 1000,
            remainingDifference,
            remainingDifferenceDollars: remainingDifference / 1000
          });
          
          return {
            ...split,
            amount: split.amount + adjustment
          };
        }
      });
      
      splitInfo.adjustmentApplied = difference / 1000;
      if (!splitInfo.adjustmentType) {
        splitInfo.adjustmentType = differenceInDollars <= SPLIT_TOLERANCE ? 'tolerance' : 'proportional_adjustment';
      }
    }

    // Step 4: Create subtransactions
    let splitTotals: { [categoryId: string]: number } = {};

    logger.debug("Creating subtransactions from adjusted splits", {
      finalAdjustedSplits: adjustedSplits.map(s => ({
        category: s.category,
        amount: s.amount,
        amountDollars: s.amount / 1000
      }))
    });

    for (const split of adjustedSplits) {
      const splitCategoryId = budget.data.budget.categories?.find(
        (c) => c.name === split.category
      )?.id;

      if (!splitCategoryId) {
        logger.warn(`Could not find category ID for ${split.category}. Ignoring splits`);
        splitInfo.reason = `Category "${split.category}" not found in YNAB`;
        return { subtransactions: [], splitInfo };
      }

      if (!splitTotals[splitCategoryId]) {
        splitTotals[splitCategoryId] = 0;
      }

      splitTotals[splitCategoryId] += split.amount;
      
      logger.debug(`Added to category totals`, {
        category: split.category,
        categoryId: splitCategoryId,
        splitAmount: split.amount,
        splitAmountDollars: split.amount / 1000,
        categoryTotal: splitTotals[splitCategoryId],
        categoryTotalDollars: splitTotals[splitCategoryId] / 1000
      });
    }

    // Create subtransactions
    for (const [categoryId, amount] of Object.entries(splitTotals)) {
      const categoryName = budget.data.budget.categories?.find(c => c.id === categoryId)?.name || 'Unknown';
      
      logger.debug(`Creating subtransaction`, {
        categoryId,
        categoryName,
        amount,
        amountDollars: amount / 1000
      });
      
      subtransactions.push({
        amount: amount,
        category_id: categoryId,
      });
    }

    // Final verification
    const finalSubtransactionTotal = subtransactions.reduce((acc, sub) => acc + sub.amount, 0);
    
    logger.debug("Final subtransaction verification", {
      subtransactionCount: subtransactions.length,
      finalSubtransactionTotal,
      finalSubtransactionTotalDollars: finalSubtransactionTotal / 1000,
      expectedTotal: fixedTotalAmount,
      expectedTotalDollars: fixedTotalAmount / 1000,
      matches: finalSubtransactionTotal === fixedTotalAmount,
      difference: fixedTotalAmount - finalSubtransactionTotal,
      differenceDollars: (fixedTotalAmount - finalSubtransactionTotal) / 1000
    });

    splitInfo.successful = true;
    splitInfo.detailedBreakdown = {
      originalSplitTotal: originalSplitTotal / 1000,
      taxAmount: Math.abs(taxDistributed || 0) / 1000, // Always show tax as positive for user display
      finalAdjustment: (difference || 0) / 1000,
    };

  } else {
    // Difference is too large, don't attempt split
    logger.warn("Split difference too large, not attempting split", {
      adjustedSplitTotal,
      adjustedSplitTotalDollars: adjustedSplitTotal / 1000,
      fixedTotalAmount,
      fixedTotalAmountDollars: fixedTotalAmount / 1000,
      difference,
      differenceInDollars,
      tolerance: SPLIT_TOLERANCE
    });
    
    splitInfo.reason = `Split amounts ($${(adjustedSplitTotal / 1000).toFixed(2)}) don't match total ($${(fixedTotalAmount / 1000).toFixed(2)}) - difference of $${differenceInDollars.toFixed(2)} exceeds tolerance`;
  }

  logger.debug("processEnhancedSplits completed", {
    successful: splitInfo.successful,
    subtransactionCount: subtransactions.length,
    splitInfo
  });

  return { subtransactions, splitInfo };
};