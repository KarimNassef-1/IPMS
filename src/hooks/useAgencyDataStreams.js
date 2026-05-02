import { useEffect, useMemo, useState } from 'react'
import {
  getExpenses,
  getTransactions,
  subscribeExpenses,
  subscribeTransactions,
} from '../services/financeService'
import {
  getAllServices,
  getProjects,
  getProjectsByIds,
  getServicesByCategories,
  subscribeAllServices,
  subscribeProjects,
  subscribeServicesByCategories,
} from '../services/projectService'
import { getTasks, subscribeTasks } from '../services/taskService'
import { getAgencyOverviewSummary, subscribeAgencyOverviewSummary } from '../services/summaryService'

export function useAgencyDataStreams({ authLoading, userId, hasFullFinancialAccess, allowedCategorySet, monthsBack = 18 }) {
  const [transactions, setTransactions] = useState([])
  const [expenses, setExpenses] = useState([])
  const [projects, setProjects] = useState([])
  const [services, setServices] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [summaryOverview, setSummaryOverview] = useState(null)

  const categoryList = useMemo(() => Array.from(allowedCategorySet || []), [allowedCategorySet])

  useEffect(() => {
    if (authLoading || !userId) return undefined

    let unsubscribers = []

    async function initialize() {
      setLoading(true)
      setError('')
      const sinceDate = new Date(new Date().setMonth(new Date().getMonth() - monthsBack)).toISOString()

      try {
        const [tx, ex, ta] = await Promise.all([
          getTransactions({ sinceDate }),
          getExpenses({ sinceDate }),
          getTasks(),
        ])

        const summary = await getAgencyOverviewSummary().catch(() => null)

        let initialServices = []
        let initialProjects = []

        if (hasFullFinancialAccess) {
          ;[initialServices, initialProjects] = await Promise.all([getAllServices(), getProjects()])
        } else {
          initialServices = await getServicesByCategories(categoryList)
          initialProjects = await getProjectsByIds(
            initialServices.map((service) => service.projectId).filter(Boolean),
          )
        }

        setTransactions(tx)
        setExpenses(ex)
        setProjects(initialProjects)
        setServices(initialServices)
        setTasks(ta)
        setSummaryOverview(summary)
        setLastUpdated(new Date().toISOString())

        const handleStreamError = (streamError) => {
          setError(streamError?.message || 'Unable to keep data streams connected.')
        }

        unsubscribers = [
          subscribeTransactions((items) => {
            setTransactions(items)
            setLastUpdated(new Date().toISOString())
          }, handleStreamError),
          subscribeExpenses((items) => {
            setExpenses(items)
            setLastUpdated(new Date().toISOString())
          }, handleStreamError),
          ...(hasFullFinancialAccess
            ? [
                subscribeProjects((items) => {
                  setProjects(items)
                  setLastUpdated(new Date().toISOString())
                }, handleStreamError),
                subscribeAllServices((items) => {
                  setServices(items)
                  setLastUpdated(new Date().toISOString())
                }, handleStreamError),
              ]
            : [
                subscribeServicesByCategories(categoryList, async (items) => {
                  setServices(items)
                  const scopedProjects = await getProjectsByIds(
                    items.map((service) => service.projectId).filter(Boolean),
                  )
                  setProjects(scopedProjects)
                  setLastUpdated(new Date().toISOString())
                }, handleStreamError),
              ]),
          subscribeTasks((items) => {
            setTasks(items)
            setLastUpdated(new Date().toISOString())
          }, handleStreamError),
          subscribeAgencyOverviewSummary((item) => {
            setSummaryOverview(item)
            setLastUpdated(new Date().toISOString())
          }, handleStreamError),
        ]
      } catch (loadError) {
        setError(loadError?.message || 'Failed to load data.')
      } finally {
        setLoading(false)
      }
    }

    initialize()

    return () => {
      unsubscribers.forEach((unsubscribe) => {
        if (typeof unsubscribe === 'function') unsubscribe()
      })
    }
  }, [authLoading, userId, hasFullFinancialAccess, categoryList, monthsBack])

  return { transactions, expenses, projects, services, tasks, summaryOverview, loading, error, lastUpdated }
}