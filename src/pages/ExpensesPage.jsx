import ModuleShell from '../components/layout/ModuleShell'
import { useEffect, useMemo, useState } from 'react'
import { addExpense, deleteExpense, getExpenses } from '../services/financeService'
import { EXPENSE_CATEGORIES } from '../utils/constants'
import { formatCurrency, parseMoney } from '../utils/helpers'
import { createNotification } from '../services/notificationService'
import { useAuth } from '../hooks/useAuth'

export default function ExpensesPage() {
  const { user } = useAuth()
  const [expenses, setExpenses] = useState([])
  const [form, setForm] = useState({
    name: '',
    category: EXPENSE_CATEGORIES[0],
    amount: '',
    date: '',
    paidBy: 'Karim',
    notes: '',
  })

  async function loadExpenses() {
    const data = await getExpenses()
    setExpenses(data)
  }

  useEffect(() => {
    loadExpenses()
  }, [])

  const totalExpenses = useMemo(
    () => expenses.reduce((sum, item) => sum + parseMoney(item.amount), 0),
    [expenses],
  )

  async function submitExpense(event) {
    event.preventDefault()
    await addExpense({ ...form, amount: Number(form.amount) || 0 })

    await createNotification({
      userId: user?.uid,
      message: `Expense recorded: ${form.name} (${formatCurrency(form.amount)})`,
      date: new Date().toISOString(),
      status: 'unread',
    })

    if (parseMoney(form.amount) > 10000) {
      await createNotification({
        userId: user?.uid,
        message: `Budget low warning for ${form.category}: high expense detected`,
        date: new Date().toISOString(),
        status: 'unread',
      })
    }

    setForm({
      name: '',
      category: EXPENSE_CATEGORIES[0],
      amount: '',
      date: '',
      paidBy: 'Karim',
      notes: '',
    })
    await loadExpenses()
  }

  async function removeExpense(expenseId) {
    await deleteExpense(expenseId)
    await loadExpenses()
  }

  return (
    <ModuleShell
      title="Expenses"
      description="Record agency spending and deduct amounts from allocated balances."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={submitExpense} className="space-y-3 rounded-2xl border border-white/30 bg-white/80 p-4">
          <h4 className="font-bold text-slate-900">Add Expense</h4>
          <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Expense name" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
          <div className="grid gap-3 sm:grid-cols-2">
            <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {EXPENSE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <input type="number" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} placeholder="Amount" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
            <input value={form.paidBy} onChange={(event) => setForm((current) => ({ ...current, paidBy: event.target.value }))} placeholder="Paid by" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
          </div>
          <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" className="h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <button className="rounded-lg bg-[#8246f6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6f39e7]">Save Expense</button>
          <p className="text-xs text-slate-500">Total expenses: {formatCurrency(totalExpenses)}</p>
        </form>

        <div className="space-y-2 rounded-2xl border border-white/30 bg-white/80 p-4">
          <h4 className="font-bold text-slate-900">Expense Records</h4>
          {expenses.map((expense) => (
            <div key={expense.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2 text-sm">
              <p>{expense.name} • {expense.category} • {formatCurrency(expense.amount)}</p>
              <button type="button" onClick={() => removeExpense(expense.id)} className="rounded bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">Delete</button>
            </div>
          ))}
          {expenses.length === 0 ? <p className="text-sm text-slate-600">No expenses yet.</p> : null}
        </div>
      </div>
    </ModuleShell>
  )
}
