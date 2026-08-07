import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Save, X, Plus, Loader2, RotateCcw } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'
import { cn } from '../../lib/utils'

interface RegionalRate {
  id: string
  country_code: string
  country_name: string
  labour_rate_usd_hr: number
  machine_overhead_pct: number
  electricity_cost_kwh: number
  factory_space_usd_m2_yr: number
  effective_date: string
  updated_at: string
}

type EditMap = Record<string, Partial<RegionalRate>>

const EMPTY_NEW: Partial<RegionalRate> = {
  country_code: '',
  country_name: '',
  labour_rate_usd_hr: 0,
  machine_overhead_pct: 0,
  electricity_cost_kwh: 0,
  factory_space_usd_m2_yr: 0,
  effective_date: '',
}

function InlineCell({
  value,
  type = 'number',
  step,
  suffix,
  onChange,
  readOnly,
}: {
  value: number | string
  type?: string
  step?: string
  suffix?: string
  onChange: (v: string) => void
  readOnly: boolean
}) {
  const [editing, setEditing] = useState(false)

  if (readOnly) {
    return (
      <span className="font-mono text-[#0f1729]">
        {typeof value === 'number' ? value.toFixed(step === '0.001' ? 3 : step === '0.1' ? 1 : 2) : value}
        {suffix && <span className="text-[#9aa3b2] ml-0.5">{suffix}</span>}
      </span>
    )
  }

  if (editing) {
    return (
      <input
        autoFocus
        type={type}
        step={step}
        min="0"
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        className="w-24 border border-brand/40 rounded-lg px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand/20 bg-white"
      />
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="font-mono text-[#0f1729] hover:text-brand hover:bg-brand/5 px-2 py-0.5 rounded cursor-text text-left"
    >
      {typeof value === 'number' ? value.toFixed(step === '0.001' ? 3 : step === '0.1' ? 1 : 2) : value}
      {suffix && <span className="text-[#9aa3b2] ml-0.5">{suffix}</span>}
    </button>
  )
}

export default function RegionalRates() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = user?.role === 'admin'

  const [dirty, setDirty] = useState<EditMap>({})
  const [isSavingAll, setIsSavingAll] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newRate, setNewRate] = useState<Partial<RegionalRate>>(EMPTY_NEW)
  const [isAdding, setIsAdding] = useState(false)

  const { data: rates = [], isLoading, isError } = useQuery<RegionalRate[]>({
    queryKey: ['regional-rates'],
    queryFn: api.kb.rates,
  })

  const dirtyCount = Object.keys(dirty).length

  function setField(id: string, field: keyof RegionalRate, value: string | number) {
    setDirty(prev => ({
      ...prev,
      [id]: { ...(prev[id] ?? {}), [field]: typeof value === 'string' ? Number(value) || value : value },
    }))
  }

  function resetRow(id: string) {
    setDirty(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  async function handleSaveAll() {
    setIsSavingAll(true)
    try {
      await Promise.all(
        Object.entries(dirty).map(([id, changes]) => api.kb.updateRate(id, changes))
      )
      queryClient.invalidateQueries({ queryKey: ['regional-rates'] })
      toast.success(`${dirtyCount} rate${dirtyCount > 1 ? 's' : ''} saved`)
      setDirty({})
    } catch {
      toast.error('Failed to save some rates')
    } finally {
      setIsSavingAll(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newRate.country_code?.trim()) { toast.error('Country code is required'); return }
    if (!newRate.country_name?.trim()) { toast.error('Country name is required'); return }
    setIsAdding(true)
    try {
      await api.kb.createRate(newRate)
      queryClient.invalidateQueries({ queryKey: ['regional-rates'] })
      toast.success('Rate added')
      setShowAddForm(false)
      setNewRate(EMPTY_NEW)
    } catch {
      toast.error('Failed to add rate')
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0f1729]">Regional Rates</h1>
          <p className="text-sm text-[#9aa3b2] mt-1">Click any value to edit. Changes save together.</p>
        </div>
        {isAdmin && (
          <Button variant="primary" onClick={() => setShowAddForm(true)} iconLeft={<Plus className="w-4 h-4" />}>
            Add Rate
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} variant="line" height="36px" />)}
            </div>
          ) : isError ? (
            <div className="flex items-center justify-center py-16 text-red-500 gap-2 text-sm">
              Failed to load rates.
              <button onClick={() => queryClient.invalidateQueries({ queryKey: ['regional-rates'] })} className="underline">Retry</button>
            </div>
          ) : rates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#9aa3b2] gap-2">
              <p className="font-medium">No rates configured</p>
              {isAdmin && <p className="text-sm">Click "Add Rate" to create the first regional rate.</p>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e5e8ef] text-left">
                    <th className="px-4 py-3 text-[11px] font-semibold text-[#9aa3b2] uppercase tracking-wide">Code</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-[#9aa3b2] uppercase tracking-wide">Country</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-[#9aa3b2] uppercase tracking-wide">Labour (USD/hr)</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-[#9aa3b2] uppercase tracking-wide">Machine OH%</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-[#9aa3b2] uppercase tracking-wide">Electricity (/kWh)</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-[#9aa3b2] uppercase tracking-wide">Updated</th>
                    {isAdmin && <th className="px-4 py-3 text-[11px] font-semibold text-[#9aa3b2] uppercase tracking-wide w-10" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f3f7]">
                  {rates.map((rate) => {
                    const isDirty = !!dirty[rate.id]
                    const d = dirty[rate.id] ?? {}
                    return (
                      <tr
                        key={rate.id}
                        className={cn(
                          'transition-colors relative',
                          isDirty ? 'bg-amber-50/40' : 'hover:bg-surface-3',
                        )}
                      >
                        {/* Dirty indicator */}
                        {isDirty && (
                          <td colSpan={0} className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#e85c1a] rounded-full" aria-hidden />
                        )}
                        <td className="px-4 py-3 font-mono font-bold text-[#1e2d4e] text-sm">
                          {rate.country_code}
                        </td>
                        <td className="px-4 py-3 font-medium text-[#0f1729]">{rate.country_name}</td>
                        <td className="px-4 py-3">
                          <InlineCell
                            value={d.labour_rate_usd_hr ?? rate.labour_rate_usd_hr}
                            step="0.01"
                            onChange={v => setField(rate.id, 'labour_rate_usd_hr', v)}
                            readOnly={!isAdmin}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <InlineCell
                            value={d.machine_overhead_pct ?? rate.machine_overhead_pct}
                            step="0.1"
                            suffix="%"
                            onChange={v => setField(rate.id, 'machine_overhead_pct', v)}
                            readOnly={!isAdmin}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <InlineCell
                            value={d.electricity_cost_kwh ?? rate.electricity_cost_kwh}
                            step="0.001"
                            onChange={v => setField(rate.id, 'electricity_cost_kwh', v)}
                            readOnly={!isAdmin}
                          />
                        </td>
                        <td className="px-4 py-3 text-[#9aa3b2] text-xs whitespace-nowrap">
                          {format(new Date(rate.updated_at), 'dd MMM yyyy')}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3">
                            <AnimatePresence>
                              {isDirty && (
                                <motion.button
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.8 }}
                                  onClick={() => resetRow(rate.id)}
                                  className="p-1.5 rounded hover:bg-[#f1f3f7] text-[#9aa3b2] hover:text-[#4a5568] transition-colors"
                                  title="Discard row changes"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </motion.button>
                              )}
                            </AnimatePresence>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-[#9aa3b2] text-center">
        Rates are in USD. Exchange rates are applied separately during cost calculation.
      </p>

      {/* Floating save bar */}
      <AnimatePresence>
        {isAdmin && dirtyCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 bg-[#1e2d4e] text-white text-sm rounded-full shadow-2xl border border-white/10"
          >
            <span className="text-white/70">{dirtyCount} unsaved change{dirtyCount > 1 ? 's' : ''}</span>
            <button
              onClick={() => setDirty({})}
              className="flex items-center gap-1.5 text-white/60 hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Discard all
            </button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveAll}
              loading={isSavingAll}
              iconLeft={<Save className="w-3.5 h-3.5" />}
              className="rounded-full px-4"
            >
              Save all changes
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Rate Modal */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
            >
              <div className="flex items-center justify-between p-5 border-b border-[#e5e8ef]">
                <h2 className="text-lg font-semibold text-[#0f1729]">Add Regional Rate</h2>
                <button onClick={() => { setShowAddForm(false); setNewRate(EMPTY_NEW) }} className="p-1.5 rounded hover:bg-surface-3 text-[#9aa3b2]">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleAdd} className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#4a5568] mb-1.5">Country Code *</label>
                    <input
                      value={newRate.country_code ?? ''}
                      onChange={e => setNewRate(r => ({ ...r, country_code: e.target.value.toUpperCase().slice(0, 2) }))}
                      maxLength={2}
                      className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2.5 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-brand/20"
                      placeholder="DE"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-[#4a5568] mb-1.5">Country Name *</label>
                    <input
                      value={newRate.country_name ?? ''}
                      onChange={e => setNewRate(r => ({ ...r, country_name: e.target.value }))}
                      className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
                      placeholder="Germany"
                    />
                  </div>
                  {[
                    { key: 'labour_rate_usd_hr', label: 'Labour Rate (USD/hr)', step: '0.01' },
                    { key: 'machine_overhead_pct', label: 'Machine Overhead %', step: '0.1' },
                    { key: 'electricity_cost_kwh', label: 'Electricity (USD/kWh)', step: '0.001' },
                  ].map(({ key, label, step }) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-[#4a5568] mb-1.5">{label}</label>
                      <input
                        type="number"
                        step={step}
                        min="0"
                        value={(newRate as Record<string, unknown>)[key] as number ?? 0}
                        onChange={e => setNewRate(r => ({ ...r, [key]: Number(e.target.value) }))}
                        className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand/20"
                      />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-medium text-[#4a5568] mb-1.5">Effective Date</label>
                    <input
                      type="date"
                      value={newRate.effective_date ?? ''}
                      onChange={e => setNewRate(r => ({ ...r, effective_date: e.target.value }))}
                      className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  loading={isAdding}
                  iconLeft={<Plus className="w-4 h-4" />}
                >
                  Add Rate
                </Button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
