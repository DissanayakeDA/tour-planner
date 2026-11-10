// Pure money maths for a trip (no I/O). Ported unchanged from v1 server.js `summarize`,
// plus `expensesWithoutBills`.
//
// expenses[] must already carry their `bills` arrays. Amounts are plain JS numbers.

const r2 = (n) => Math.round(n * 100) / 100;

export function summarize(trip, members, categories, expenses, contributions) {
  const spent = expenses.reduce((s, e) => s + e.amount, 0);
  const collected = contributions.reduce((s, c) => s + c.amount, 0);
  const fundSpent = expenses.filter((e) => e.paid_by == null).reduce((s, e) => s + e.amount, 0);
  const categoryBudget = categories.reduce((s, c) => s + c.budget, 0);
  const budget = trip.budget > 0 ? trip.budget : categoryBudget;
  const share = members.length ? spent / members.length : 0;

  const byCategory = categories.map((c) => ({
    id: c.id,
    name: c.name,
    budget: c.budget,
    spent: r2(expenses.filter((e) => e.category_id === c.id).reduce((s, e) => s + e.amount, 0)),
  }));
  const uncategorized = expenses.filter((e) => e.category_id == null).reduce((s, e) => s + e.amount, 0);
  if (uncategorized > 0) byCategory.push({ id: null, name: 'Uncategorized', budget: 0, spent: r2(uncategorized) });

  const byMember = members.map((m) => {
    const contributed = contributions.filter((c) => c.member_id === m.id).reduce((s, c) => s + c.amount, 0);
    const paidPersonally = expenses.filter((e) => e.paid_by === m.id).reduce((s, e) => s + e.amount, 0);
    return {
      id: m.id,
      name: m.name,
      contributed: r2(contributed),
      paidPersonally: r2(paidPersonally),
      share: r2(share),
      balance: r2(contributed + paidPersonally - share), // + = should get money back, - = owes
    };
  });

  // Settle up: the fund gives back any leftover cash; members with a negative balance pay.
  const cashInHand = collected - fundSpent;
  const parties = byMember.map((m) => ({ name: m.name, bal: m.balance }));
  if (members.length && Math.abs(cashInHand) > 0.004) parties.push({ name: 'Trip fund', bal: -r2(cashInHand) });
  const creditors = parties.filter((p) => p.bal > 0.004).sort((a, b) => b.bal - a.bal);
  const debtors = parties
    .filter((p) => p.bal < -0.004)
    .map((p) => ({ ...p, bal: -p.bal }))
    .sort((a, b) => b.bal - a.bal);
  const settlements = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].bal, creditors[j].bal);
    if (amt > 0.004) settlements.push({ from: debtors[i].name, to: creditors[j].name, amount: r2(amt) });
    debtors[i].bal -= amt;
    creditors[j].bal -= amt;
    if (debtors[i].bal < 0.005) i++;
    if (creditors[j].bal < 0.005) j++;
  }

  // team_size is the headcount entered at trip setup. The budget per person uses it; the equal
  // share of actual spending uses the members registered so far (settle-up needs real people).
  const teamSize = trip.team_size > 0 ? trip.team_size : members.length;

  return {
    budget: r2(budget),
    teamSize,
    membersRegistered: members.length,
    membersMissing: Math.max(0, teamSize - members.length),
    perPersonBudget: teamSize > 0 ? r2(budget / teamSize) : 0,
    budgetUsedPct: budget > 0 ? Math.round((spent / budget) * 1000) / 10 : 0,
    categoryBudget: r2(categoryBudget),
    spent: r2(spent),
    remaining: r2(budget - spent),
    collected: r2(collected),
    fundSpent: r2(fundSpent),
    cashInHand: r2(cashInHand),
    perPersonShare: r2(share),
    billCount: expenses.reduce((s, e) => s + e.bills.length, 0),
    expensesWithoutBills: expenses.filter((e) => e.bills.length === 0).length,
    byCategory,
    byMember,
    settlements,
  };
}
