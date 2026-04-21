import ModuleShell from '../components/layout/ModuleShell'
import { useEffect, useMemo, useState } from 'react'
import { addExpense, deleteExpense, getExpenses, restoreExpense } from '../services/financeService'
import { EXPENSE_CATEGORIES } from '../utils/constants'
import { formatCurrency, parseMoney } from '../utils/helpers'
import { createNotification } from '../services/notificationService'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'

export default function ExpensesPage() {
  const { user, profile } = useAuth()
  const toast = useToast()
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

  const averageExpense = useMemo(
    () => (expenses.length ? totalExpenses / expenses.length : 0),
    [expenses.length, totalExpenses],
  )

  const topCategory = useMemo(() => {
    const byCategory = expenses.reduce((acc, item) => {
      const category = item.category || 'Uncategorized'
      acc[category] = (acc[category] || 0) + parseMoney(item.amount)
      return acc
    }, {})

    return Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0] || null
  }, [expenses])

  async function submitExpense(event) {
    event.preventDefault()
    await addExpense({ ...form, amount: Number(form.amount) || 0 })

    await createNotification({
      userId: user?.uid,
      type: 'expense',
      action: 'expense_created',
      message: `Expense recorded: ${form.name} (${formatCurrency(form.amount)})`,
      actorId: user?.uid || '',
      actorName: profile?.name || 'User',
      actorEmail: user?.email || '',
      actorPhotoURL: profile?.photoURL || '',
      date: new Date().toISOString(),
      status: 'unread',
      adminFeed: true,
    })

    if (parseMoney(form.amount) > 10000) {
      await createNotification({
        userId: user?.uid,
        type: 'system',
        action: 'high_expense_warning',
        message: `Budget low warning for ${form.category}: high expense detected`,
        actorId: user?.uid || '',
        actorName: profile?.name || 'User',
        actorEmail: user?.email || '',
        actorPhotoURL: profile?.photoURL || '',
        date: new Date().toISOString(),
        status: 'unread',
        adminFeed: true,
        source: 'system',
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
    const expense = expenses.find((item) => item.id === expenseId)
    if (!expense) return

    await deleteExpense(expenseId)
    await createNotification({
      userId: user?.uid,
      type: 'expense',
      action: 'expense_deleted',
      message: `Expense deleted: ${expense.name || 'Expense'}`,
      actorId: user?.uid || '',
      actorName: profile?.name || 'User',
      actorEmail: user?.email || '',
      actorPhotoURL: profile?.photoURL || '',
      date: new Date().toISOString(),
      status: 'unread',
      adminFeed: true,
    })
    await loadExpenses()

    toast.notify(`Deleted expense: ${expense.name || 'Expense'}`, {
      duration: 10000,
      actionLabel: 'Undo',
      onAction: async () => {
        await restoreExpense(expense)
        await loadExpenses()
        toast.success(`Restored expense: ${expense.name || 'Expense'}`)
      },
    })
  }

  return (
    <ModuleShell
      title="Expenses"
      description="Record agency spending and deduct amounts from allocated balances."
    >
      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="ip-stat-card">
          <p className="text-xs uppercase tracking-wider text-slate-500">Total Expenses</p>
          <p className="mt-1 break-words text-xl font-black text-rose-700 sm:text-2xl">{formatCurrency(totalExpenses)}</p>
        </div>
        <div className="ip-stat-card">
          <p className="text-xs uppercase tracking-wider text-slate-500">Records</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{expenses.length}</p>
        </div>
        <div className="ip-stat-card">
          <p className="text-xs uppercase tracking-wider text-slate-500">Average Expense</p>
          <p className="mt-1 break-words text-xl font-black text-sky-700 sm:text-2xl">{formatCurrency(averageExpense)}</p>
        </div>
        <div className="ip-stat-card">
          <p className="text-xs uppercase tracking-wider text-slate-500">Top Category</p>
          <p className="mt-1 text-sm font-black text-violet-700">{topCategory ? topCategory[0] : '-'}</p>
          <p className="text-xs text-slate-500">{topCategory ? formatCurrency(topCategory[1]) : ''}</p>
        </div>
      </section>

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
          <button className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#8246f6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6f39e7]">Save Expense</button>
          <p className="text-xs text-slate-500">Tracked total: {formatCurrency(totalExpenses)}</p>
        </form>

        <div className="space-y-2 rounded-2xl border border-white/30 bg-white/80 p-4">
          <h4 className="font-bold text-slate-900">Expense Records</h4>
          {expenses.map((expense) => (
            <div key={expense.id} className="rounded-lg border border-slate-200 bg-white p-2.5 text-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-semibold text-slate-900 break-words">{expense.name}</p>
                <button type="button" onClick={() => removeExpense(expense.id)} className="inline-flex min-h-9 w-fit items-center rounded bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">Delete</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{expense.category}</span>
                <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-700">{formatCurrency(expense.amount)}</span>
                <span className="rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-700">{expense.date || 'No date'}</span>
                <span className="rounded-full bg-violet-100 px-2 py-0.5 font-semibold text-violet-700">{expense.paidBy || 'Unknown payer'}</span>
              </div>
              {expense.notes ? <p className="mt-1 text-xs text-slate-600">{expense.notes}</p> : null}
            </div>
          ))}
          {expenses.length === 0 ? <p className="text-sm text-slate-600">No expenses yet.</p> : null}
        </div>
      </div>
    </ModuleShell>
  )
}
