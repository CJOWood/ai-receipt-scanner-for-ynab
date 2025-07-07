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
  }[]
): Promise<{
  success: true;
  splitInfo?: {
    attempted: boolean;
    successful: boolean;
    reason?: string;
    splitCount?: number;
    totalSplitAmount?: number;
    expectedAmount?: number;
  };
}> => {
  logger.debug("createTransaction called", { accountName, merchant, category, transactionDate, memo, totalAmount, splits });
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
    ? retrieveSubtransactions(budget, fixedTotalAmount, fixedSplits)
    : { subtransactions: [], splitInfo: { attempted: false, successful: false } };

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
      date: transactionDate,
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
  };
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