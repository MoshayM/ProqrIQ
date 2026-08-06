import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }

export function formatCost(value: number | null | undefined, currency = 'EUR', decimals = 2): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value)
}

export function formatPct(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${value.toFixed(1)}%`
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

export function getConfidenceLevel(score: number | null | undefined): 'high' | 'medium' | 'low' {
  if (score == null) return 'low'
  if (score >= 95) return 'high'
  if (score >= 70) return 'medium'
  return 'low'
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
