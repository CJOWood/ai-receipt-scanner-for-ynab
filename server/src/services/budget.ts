import * as ynab from "ynab";
import env from "../utils/env-vars";
import { logger } from "../utils/logger";

const apiKey = env.YNAB_API_KEY;
const budgetId = env.YNAB_BUDGET_ID;
// Use the already-normalized array from env-vars
const allowedCategories: string[] = env.YNAB_CATEGORY_GROUPS;

const api = new ynab.API(apiKey);

export const getAllCategories = async () => {
  logger.debug("getAllCategories called", { budgetId, allowedCategories });
  // Use the lighter endpoint
  const categoryGroupsResp = await api.categories.getCategories(budgetId);
  const categoryGroups = categoryGroupsResp.data.category_groups;
  logger.debug("Fetched category groups", { length: categoryGroups?.length });

  let categories: string[] = [];
  if (!allowedCategories || allowedCategories.length === 0) {
    // No filter: include all non-deleted, non-hidden categories
    categories = categoryGroups
      .flatMap((group) => group.categories || [])
      .filter((cat) => !cat.deleted && !cat.hidden)
      .map((cat) => cat.name)
      .filter(Boolean);
  } else {
    // Filter by allowedCategories
    categories = categoryGroups
      .filter((group) => allowedCategories.includes(group.name))
      .flatMap((group) => group.categories || [])
      .filter((cat) => !cat.deleted && !cat.hidden)
      .map((cat) => cat.name)
      .filter(Boolean);
  }
  logger.debug("getAllCategories result", { length: categories.length });
  if (!categories.length) {
    logger.warn("No categories found", { budgetId, allowedCategories });
    throw new Error("No categories found");
  }
  return categories;
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
  const categories = await getAllCategories();
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
        return { subtransactions: [], splitInfo };
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
  // Convert all milliunit values to dollars for calculations
  const fixedTotalAmountDollars = fixedTotalAmount / 1000;
  const fixedSplitsDollars = fixedSplits.map(s => ({ category: s.category, amountDollars: s.amount / 1000 }));
  const totalTaxesDollars = totalTaxes || 0;

  logger.debug("Starting processEnhancedSplits", {
    fixedTotalAmountDollars,
    totalTaxesDollars,
    fixedSplitsCount: fixedSplits.length,
    isExpense: fixedTotalAmountDollars < 0,
    fixedSplits: fixedSplitsDollars
  });

  const subtransactions: ynab.SaveSubTransaction[] = [];
  // Calculate original split total in dollars
  const originalSplitTotalDollars = fixedSplitsDollars.reduce((acc, split) => acc + split.amountDollars, 0);

  logger.debug("Original split calculation", {
    originalSplitTotalDollars,
    splitBreakdown: fixedSplitsDollars.map(s => `${s.category}: ${s.amountDollars}`)
  });

  const splitInfo: EnhancedSplitInfo = {
    attempted: true,
    successful: false,
    splitCount: fixedSplits.length,
    totalSplitAmount: originalSplitTotalDollars,
    expectedAmount: fixedTotalAmountDollars,
  };

  // Step 1: Distribute taxes proportionally if available
  let adjustedSplits = [...fixedSplitsDollars];
  let taxDistributedDollars = 0;

  if (totalTaxesDollars > 0) {
    logger.debug("Starting tax distribution", { totalTaxesDollars });
    const splitTotalDollars = adjustedSplits.reduce((acc, split) => acc + split.amountDollars, 0);
    const isExpense = fixedTotalAmountDollars < 0;
    const taxToDistributeDollars = isExpense ? -totalTaxesDollars : totalTaxesDollars;

    logger.debug("Tax distribution calculations", {
      totalTaxesDollars,
      splitTotalDollars,
      isExpense,
      taxToDistributeDollars
    });

    // Distribute tax proportionally to each split
    adjustedSplits = adjustedSplits.map((split, index) => {
      const proportion = Math.abs(split.amountDollars) / Math.abs(splitTotalDollars);
      const taxShareDollars = index === adjustedSplits.length - 1
        ? taxToDistributeDollars - taxDistributedDollars
        : Math.round(proportion * taxToDistributeDollars * 100) / 100;
      taxDistributedDollars += taxShareDollars;
      logger.debug(`Tax distribution for split ${index}`, {
        category: split.category,
        originalAmountDollars: split.amountDollars,
        proportion: proportion.toFixed(4),
        taxShareDollars,
        newAmountDollars: split.amountDollars + taxShareDollars,
        isLast: index === adjustedSplits.length - 1
      });
      return {
        ...split,
        amountDollars: split.amountDollars + taxShareDollars
      };
    });

    logger.debug("Tax distribution completed", {
      taxDistributedDollars,
      expectedTaxDollars: taxToDistributeDollars,
      differenceDollars: taxToDistributeDollars - taxDistributedDollars
    });
    splitInfo.taxDistributed = Math.abs(taxDistributedDollars);
    splitInfo.adjustmentType = 'tax_distribution';
  }

  // Step 2: Check if we need further adjustment
  const adjustedSplitTotalDollars = adjustedSplits.reduce((acc, split) => acc + split.amountDollars, 0);
  const differenceDollars = fixedTotalAmountDollars - adjustedSplitTotalDollars;
  const absDifferenceDollars = Math.abs(differenceDollars);

  logger.debug("After tax distribution, checking alignment", {
    adjustedSplitTotalDollars,
    fixedTotalAmountDollars,
    differenceDollars,
    absDifferenceDollars,
    tolerance: SPLIT_TOLERANCE,
    withinTolerance: absDifferenceDollars <= SPLIT_TOLERANCE,
    withinSmallAdjustment: absDifferenceDollars <= 0.05
  });

  // Step 3: Apply proportional adjustment if within tolerance or always if small
  if (absDifferenceDollars <= SPLIT_TOLERANCE) {
    if (absDifferenceDollars > 0) {
      logger.debug("Applying proportional adjustment", {
        differenceDollars,
        adjustedSplitTotalDollars
      });
      let remainingDifferenceDollars = differenceDollars;
      adjustedSplits = adjustedSplits.map((split, index) => {
        if (index === adjustedSplits.length - 1) {
          logger.debug(`Final adjustment for split ${index} (last item)`, {
            category: split.category,
            beforeAmountDollars: split.amountDollars,
            remainingDifferenceDollars,
            afterAmountDollars: split.amountDollars + remainingDifferenceDollars
          });
          return {
            ...split,
            amountDollars: split.amountDollars + remainingDifferenceDollars
          };
        } else {
          const proportion = split.amountDollars / adjustedSplitTotalDollars;
          const adjustmentDollars = Math.round(proportion * differenceDollars * 100) / 100;
          remainingDifferenceDollars -= adjustmentDollars;
          logger.debug(`Proportional adjustment for split ${index}`, {
            category: split.category,
            beforeAmountDollars: split.amountDollars,
            proportion: proportion.toFixed(4),
            adjustmentDollars,
            afterAmountDollars: split.amountDollars + adjustmentDollars,
            remainingDifferenceDollars
          });
          return {
            ...split,
            amountDollars: split.amountDollars + adjustmentDollars
          };
        }
      });
      splitInfo.adjustmentApplied = differenceDollars;
      if (!splitInfo.adjustmentType) {
        splitInfo.adjustmentType = absDifferenceDollars <= SPLIT_TOLERANCE ? 'tolerance' : 'proportional_adjustment';
      }
    }
    // Step 4: Create subtransactions
    let splitTotals: { [categoryId: string]: number } = {};
    logger.debug("Creating subtransactions from adjusted splits", {
      finalAdjustedSplits: adjustedSplits.map(s => ({
        category: s.category,
        amountDollars: s.amountDollars
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
      splitTotals[splitCategoryId] += split.amountDollars;
      logger.debug(`Added to category totals`, {
        category: split.category,
        categoryId: splitCategoryId,
        splitAmountDollars: split.amountDollars,
        categoryTotalDollars: splitTotals[splitCategoryId]
      });
    }
    // Create subtransactions
    for (const [categoryId, amountDollars] of Object.entries(splitTotals)) {
      const categoryName = budget.data.budget.categories?.find(c => c.id === categoryId)?.name || 'Unknown';
      logger.debug(`Creating subtransaction`, {
        categoryId,
        categoryName,
        amountDollars
      });
      subtransactions.push({
        amount: Math.round(amountDollars * 1000),
        category_id: categoryId,
      });
    }
    // Final verification
    const finalSubtransactionTotalDollars = subtransactions.reduce((acc, sub) => acc + sub.amount / 1000, 0);
    logger.debug("Final subtransaction verification", {
      subtransactionCount: subtransactions.length,
      finalSubtransactionTotalDollars,
      expectedTotalDollars: fixedTotalAmountDollars,
      matches: finalSubtransactionTotalDollars === fixedTotalAmountDollars,
      differenceDollars: fixedTotalAmountDollars - finalSubtransactionTotalDollars
    });
    splitInfo.successful = true;
    splitInfo.detailedBreakdown = {
      originalSplitTotal: originalSplitTotalDollars,
      taxAmount: Math.abs(taxDistributedDollars),
      finalAdjustment: differenceDollars,
    };
  } else {
    // Difference is too large, don't attempt split
    logger.warn("Split difference too large, not attempting split", {
      adjustedSplitTotalDollars,
      fixedTotalAmountDollars,
      differenceDollars,
      absDifferenceDollars,
      tolerance: SPLIT_TOLERANCE
    });
    splitInfo.reason = `Split amounts ($${adjustedSplitTotalDollars.toFixed(2)}) don't match total ($${fixedTotalAmountDollars.toFixed(2)}) - difference of $${absDifferenceDollars.toFixed(2)} exceeds tolerance`;
  }
  logger.debug("processEnhancedSplits completed", {
    successful: splitInfo.successful,
    subtransactionCount: subtransactions.length,
    splitInfo
  });
  return { subtransactions, splitInfo };
};