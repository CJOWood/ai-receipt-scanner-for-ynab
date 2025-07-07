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
}> => {
  logger.debug("createTransaction called", { accountName, merchant, category, transactionDate, memo, totalAmount, splits });
  
  const { validatedDate, dateAdjustment } = validateTransactionDate(transactionDate);
  
  // Fix all the amounts by multiplying by 1000 and truncating to an integer
  const fixedTotalAmount = Math.trunc(-totalAmount * 1000);
  const fixedSplits = splits?.map((split) => ({
    category: split.category,
    amount: Math.trunc(-split.amount * 1000),
  }));

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

  await api.transactions.createTransaction(budgetId, {
    transaction: {
      account_id: accountId,
      amount: fixedTotalAmount,
      category_id: categoryId,
      date: validatedDate,
      payee_name: merchant,
      approved: false,
      memo: memo,
      subtransactions: subtransactions.length > 1 ? subtransactions : undefined,
    },
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
  const subtransactions: ynab.SaveSubTransaction[] = [];
  
  // Calculate original split total
  const originalSplitTotal = fixedSplits.reduce((acc, split) => acc + split.amount, 0);
  
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
    const fixedTotalTaxes = Math.trunc(totalTaxes * 1000);
    const splitTotal = adjustedSplits.reduce((acc, split) => acc + split.amount, 0);
    
    // Distribute tax proportionally to each split
    adjustedSplits = adjustedSplits.map((split, index) => {
      const proportion = split.amount / splitTotal;
      const taxShare = index === adjustedSplits.length - 1 
        ? fixedTotalTaxes - taxDistributed // Last item gets remainder to avoid rounding errors
        : Math.trunc(proportion * fixedTotalTaxes);
      
      taxDistributed += taxShare;
      
      return {
        ...split,
        amount: split.amount + taxShare
      };
    });
    
    splitInfo.taxDistributed = taxDistributed / 1000;
    splitInfo.adjustmentType = 'tax_distribution';
  }

  // Step 2: Check if we need further adjustment
  const adjustedSplitTotal = adjustedSplits.reduce((acc, split) => acc + split.amount, 0);
  const difference = fixedTotalAmount - adjustedSplitTotal;
  const differenceInDollars = Math.abs(difference / 1000);
  
  // Step 3: Apply proportional adjustment if within tolerance or always if small
  if (differenceInDollars <= SPLIT_TOLERANCE || Math.abs(difference) <= 50) { // 50 = 5 cents in fixed-point
    if (Math.abs(difference) > 0) {
      // Distribute the difference proportionally
      let remainingDifference = difference;
      
      adjustedSplits = adjustedSplits.map((split, index) => {
        if (index === adjustedSplits.length - 1) {
          // Last item gets the remainder to ensure exact match
          return {
            ...split,
            amount: split.amount + remainingDifference
          };
        } else {
          const proportion = split.amount / adjustedSplitTotal;
          const adjustment = Math.trunc(proportion * difference);
          remainingDifference -= adjustment;
          
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
    }

    // Create subtransactions
    for (const [categoryId, amount] of Object.entries(splitTotals)) {
      subtransactions.push({
        amount: amount,
        category_id: categoryId,
      });
    }

    splitInfo.successful = true;
    splitInfo.detailedBreakdown = {
      originalSplitTotal: originalSplitTotal / 1000,
      taxAmount: (taxDistributed || 0) / 1000,
      finalAdjustment: (difference || 0) / 1000,
    };

  } else {
    // Difference is too large, don't attempt split
    splitInfo.reason = `Split amounts ($${(adjustedSplitTotal / 1000).toFixed(2)}) don't match total ($${(fixedTotalAmount / 1000).toFixed(2)}) - difference of $${differenceInDollars.toFixed(2)} exceeds tolerance`;
  }

  return { subtransactions, splitInfo };
};