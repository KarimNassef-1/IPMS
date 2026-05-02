import { collection, doc, getDoc, getDocs, onSnapshot, setDoc } from 'firebase/firestore'
import { ensureFirebaseReady } from './firebase'
import { calculateRecognizedPaidRevenue } from '../utils/calculations'
import { parseMoney } from '../utils/helpers'
import { serviceAgencyShareValue } from '../utils/serviceFinance'

const SUMMARY_COLLECTION = 'analytics_summaries'
const AGENCY_OVERVIEW_DOC = 'agency_overview'

function safeRows(snapshot) {
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function refreshAgencyOverviewSummary() {
  const firestore = ensureFirebaseReady()

  const [projectsSnap, servicesSnap, tasksSnap, txSnap, expenseSnap, ticketsSnap] = await Promise.all([
    getDocs(collection(firestore, 'projects')),
    getDocs(collection(firestore, 'services')),
    getDocs(collection(firestore, 'tasks')),
    getDocs(collection(firestore, 'transactions')),
    getDocs(collection(firestore, 'expenses')),
    getDocs(collection(firestore, 'client_tickets')),
  ])

  const projects = safeRows(projectsSnap)
  const services = safeRows(servicesSnap)
  const tasks = safeRows(tasksSnap)
  const transactions = safeRows(txSnap)
  const expenses = safeRows(expenseSnap)
  const tickets = safeRows(ticketsSnap)

  const paidServices = services.filter((service) => service.chargeType !== 'free')
  const recognizedPaid = paidServices.reduce(
    (sum, service) => sum + Math.max(calculateRecognizedPaidRevenue(service), 0),
    0,
  )
  const totalAgencyShare = paidServices.reduce(
    (sum, service) => sum + Math.max(serviceAgencyShareValue(service), 0),
    0,
  )

  const completedTasks = tasks.filter(
    (item) => String(item.status || '').toLowerCase() === 'completed',
  ).length

  const summary = {
    id: AGENCY_OVERVIEW_DOC,
    totals: {
      projects: projects.length,
      services: services.length,
      tickets: tickets.length,
      tasks: tasks.length,
      completedTasks,
      taskCompletionRate: tasks.length ? Number(((completedTasks / tasks.length) * 100).toFixed(2)) : 0,
      recognizedPaid,
      totalAgencyShare,
      pendingShare: Math.max(totalAgencyShare - recognizedPaid, 0),
      cashIn: transactions.reduce((sum, item) => sum + parseMoney(item.totalAmount), 0),
      cashOut: expenses.reduce((sum, item) => sum + parseMoney(item.amount), 0),
    },
    byStatus: {
      projects: projects.reduce((acc, item) => {
        const key = String(item.status || 'unknown').trim().toLowerCase() || 'unknown'
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {}),
      tickets: tickets.reduce((acc, item) => {
        const key = String(item.status || 'open').trim().toLowerCase() || 'open'
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {}),
    },
    generatedAt: new Date().toISOString(),
  }

  summary.totals.cashPosition = summary.totals.cashIn - summary.totals.cashOut

  await setDoc(doc(firestore, SUMMARY_COLLECTION, AGENCY_OVERVIEW_DOC), summary, { merge: true })
  return summary
}

export async function getAgencyOverviewSummary() {
  const firestore = ensureFirebaseReady()
  const snapshot = await getDoc(doc(firestore, SUMMARY_COLLECTION, AGENCY_OVERVIEW_DOC))
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
}

export function subscribeAgencyOverviewSummary(onData, onError) {
  const firestore = ensureFirebaseReady()
  return onSnapshot(
    doc(firestore, SUMMARY_COLLECTION, AGENCY_OVERVIEW_DOC),
    (snapshot) => {
      onData(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null)
    },
    onError,
  )
}
