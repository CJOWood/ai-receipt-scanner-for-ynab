import * as ynab from "ynab";
import env from "../utils/env-vars";

const apiKey = env.YNAB_API_KEY;
const budgetId = env.YNAB_BUDGET_ID;
const allowedCategories = env.YNAB_CATEGORY_GROUPS;

const api = new ynab.API(apiKey);

export const getAllEnvelopes = async () => {
  const budget = await api.budgets.getBudgetById(budgetId);

  const envelopes = !allowedCategories
    ? budget.data.budget.categories?.map((c) => c?.name || "").filter((c) => c)
    : budget.data.budget.category_groups
        ?.filter((c) => allowedCategories.some((ac) => ac === c.name))
        .map((c) => c.id)
        .map((c) =>
          budget.data.budget.categories?.filter(
            (cat) => cat.category_group_id === c
          )
        )
        .flat()
        .map((c) => c?.name || "")
        .filter((c) => c);

  if (!envelopes) {
    throw new Error("No envelopes found");
  }

  return envelopes;
};

export const getAllPayees = async () => {
  const budget = await api.budgets.getBudgetById(budgetId);

  const payees = budget.data.budget.payees
    ?.filter((p) => p.name && !p.deleted)
    .map((p) => p.name);

  if (!payees) {
    throw new Error("No payees found");
  }

  return payees;
};

export const getAllAccounts = async () => {
  const budget = await api.budgets.getBudgetById(budgetId);

  const accounts = budget.data.budget.accounts
    ?.filter((a) => !a.closed && !a.deleted)
    .map((a) => a.name);

  if (!accounts) {
    throw new Error("No accounts found");
  }

  return accounts;
};

export const getYnabInfo = async () => {
  const categories = await getAllEnvelopes();
  const payees = await getAllPayees();
  const accounts = await getAllAccounts();

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
): Promise<void> => {
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
    throw new Error("Account not found");
  }

  // First process the splits, if specified. This is useful for transactions that need to be split across multiple categories
  // If a transaction is split, the sum of the lineItemTotalAmounts must add up to the totalAmount for the slip. If they don't
  // we ignore the splits and just log the transaction against a single category.
  const subtransactions: ynab.SaveSubTransaction[] = fixedSplits
    ? retrieveSubtransactions(budget, fixedTotalAmount, fixedSplits)
    : [];

  let categoryId: string | undefined;
  if (!subtransactions) {
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
};

const retrieveSubtransactions = (
  budget: ynab.BudgetDetailResponse,
  fixedTotalAmount: number,
  fixedSplits: {
    category: string;
    amount: number;
  }[]
) => {
  const subtransactions: ynab.SaveSubTransaction[] = [];

  const totalSplitAmount = fixedSplits.reduce(
    (acc, split) => acc + split.amount,
    0
  );

  if (totalSplitAmount !== fixedTotalAmount) {
    console.warn(
      `Total split amount ${totalSplitAmount} does not match total amount ${fixedTotalAmount}. Ignoring splits`
    );
  } else {
    let splitTotals: { [categoryId: string]: number } = {};

    for (const split of fixedSplits) {
      const splitCategoryId = budget.data.budget.categories?.find(
        (c) => c.name === split.category
      )?.id;

      if (!splitCategoryId) {
        console.warn(
          `Could not find category ID for ${split.category}. Ignoring splits`
        );
        splitTotals = {};
        break;
      }

      if (!splitTotals[splitCategoryId]) {
        splitTotals[splitCategoryId] = 0;
      }

      splitTotals[splitCategoryId] += split.amount;
    }

    for (const [categoryId, amount] of Object.entries(splitTotals)) {
      subtransactions.push({
        amount: amount,
        category_id: categoryId,
      });
    }
  }

  return subtransactions;
};
