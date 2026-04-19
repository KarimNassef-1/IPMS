export const ROLES = {
  ADMIN: 'admin',
  PARTNER: 'partner',
}

export function formatCurrency(amount, currency = 'EGP') {
  return new Intl.NumberFormat('en-EG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 20,
  }).format(Number(amount) || 0)
}

export function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-GB')
}

export function isToday(value) {
  const date = new Date(value)
  const now = new Date()

  return (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  )
}

export function assertRequiredFields(payload, fields) {
  for (const field of fields) {
    if (!payload?.[field]) {
      throw new Error(`${field} is required`)
    }
  }
}
