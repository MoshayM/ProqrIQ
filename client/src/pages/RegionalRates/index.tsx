import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Edit2, Save, X, Plus, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../components/ui/card';

interface RegionalRate {
  id: string;
  country_code: string;
  country_name: string;
  labour_rate_usd_hr: number;
  machine_overhead_pct: number;
  electricity_cost_kwh: number;
  factory_space_usd_m2_yr: number;
  effective_date: string;
  updated_at: string;
}

interface NewRateForm {
  country_code: string;
  country_name: string;
  labour_rate_usd_hr: number;
  machine_overhead_pct: number;
  electricity_cost_kwh: number;
  factory_space_usd_m2_yr: number;
  effective_date: string;
}

const EMPTY_NEW_RATE: NewRateForm = {
  country_code: '',
  country_name: '',
  labour_rate_usd_hr: 0,
  machine_overhead_pct: 0,
  electricity_cost_kwh: 0,
  factory_space_usd_m2_yr: 0,
  effective_date: '',
};

export default function RegionalRates() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<RegionalRate>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRate, setNewRate] = useState<NewRateForm>(EMPTY_NEW_RATE);
  const [isSaving, setIsSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const isAdmin = user?.role === 'admin';

  const { data: rates = [], isLoading, isError } = useQuery<RegionalRate[]>({
    queryKey: ['regional-rates'],
    queryFn: api.kb.rates,
  });

  function startEdit(rate: RegionalRate) {
    setEditingId(rate.id);
    setEditValues({
      labour_rate_usd_hr: rate.labour_rate_usd_hr,
      machine_overhead_pct: rate.machine_overhead_pct,
      electricity_cost_kwh: rate.electricity_cost_kwh,
      factory_space_usd_m2_yr: rate.factory_space_usd_m2_yr,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValues({});
  }

  async function handleSave() {
    if (!editingId) return;
    setIsSaving(true);
    try {
      await api.kb.updateRate(editingId, editValues);
      queryClient.invalidateQueries({ queryKey: ['regional-rates'] });
      toast.success('Rate updated successfully');
      setEditingId(null);
      setEditValues({});
    } catch {
      toast.error('Failed to update rate');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newRate.country_code.trim()) { toast.error('Country code is required'); return; }
    if (!newRate.country_name.trim()) { toast.error('Country name is required'); return; }
    setIsAdding(true);
    try {
      await api.kb.createRate(newRate);
      queryClient.invalidateQueries({ queryKey: ['regional-rates'] });
      toast.success('Rate added successfully');
      setShowAddForm(false);
      setNewRate(EMPTY_NEW_RATE);
    } catch {
      toast.error('Failed to add rate');
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1e2d4e]">Regional Rates</h1>
          <p className="text-sm text-gray-500 mt-1">Manufacturing cost rates by country</p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => setShowAddForm(true)}
            className="bg-[#e85c1a] hover:bg-[#d04e14] text-white flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Rate
          </Button>
        )}
      </div>

      {/* Table Card */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-[#e85c1a]" />
            </div>
          ) : isError ? (
            <div className="flex items-center justify-center py-16 text-red-500 gap-2">
              <span>Failed to load rates.</span>
              <button
                onClick={() => queryClient.invalidateQueries({ queryKey: ['regional-rates'] })}
                className="underline text-sm"
              >
                Retry
              </button>
            </div>
          ) : rates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
              <p className="text-lg font-medium">No rates configured</p>
              {isAdmin && (
                <p className="text-sm">Click "Add Rate" to create the first regional rate.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3 font-medium">Code</th>
                    <th className="px-4 py-3 font-medium">Country</th>
                    <th className="px-4 py-3 font-medium">Labour Rate (USD/hr)</th>
                    <th className="px-4 py-3 font-medium">Machine Overhead %</th>
                    <th className="px-4 py-3 font-medium">Electricity (kWh)</th>
                    <th className="px-4 py-3 font-medium">Last Updated</th>
                    {isAdmin && <th className="px-4 py-3 font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rates.map((rate) => {
                    const isEditing = editingId === rate.id;
                    return (
                      <tr key={rate.id} className={`hover:bg-gray-50 ${isEditing ? 'bg-blue-50/40' : ''}`}>
                        <td className="px-4 py-3 font-mono font-bold text-[#1e2d4e] text-sm">
                          {rate.country_code}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-800">{rate.country_name}</td>

                        {isEditing ? (
                          <>
                            <td className="px-4 py-2">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={editValues.labour_rate_usd_hr ?? ''}
                                onChange={(e) =>
                                  setEditValues((v) => ({ ...v, labour_rate_usd_hr: Number(e.target.value) }))
                                }
                                className="w-28 border border-blue-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                              />
                            </td>
                            <td className="px-4 py-2">
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                value={editValues.machine_overhead_pct ?? ''}
                                onChange={(e) =>
                                  setEditValues((v) => ({ ...v, machine_overhead_pct: Number(e.target.value) }))
                                }
                                className="w-20 border border-blue-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                              />
                            </td>
                            <td className="px-4 py-2">
                              <input
                                type="number"
                                step="0.001"
                                min="0"
                                value={editValues.electricity_cost_kwh ?? ''}
                                onChange={(e) =>
                                  setEditValues((v) => ({ ...v, electricity_cost_kwh: Number(e.target.value) }))
                                }
                                className="w-24 border border-blue-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                              />
                            </td>
                            <td className="px-4 py-2 text-gray-300 text-xs">—</td>
                            {isAdmin && (
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="p-1.5 rounded hover:bg-green-50 text-green-600 transition-colors"
                                    title="Save"
                                  >
                                    {isSaving ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Save className="w-4 h-4" />
                                    )}
                                  </button>
                                  <button
                                    onClick={cancelEdit}
                                    disabled={isSaving}
                                    className="p-1.5 rounded hover:bg-gray-100 text-gray-400 transition-colors"
                                    title="Cancel"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            )}
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 text-gray-700 tabular-nums">
                              {rate.labour_rate_usd_hr?.toFixed(2) ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-gray-700 tabular-nums">
                              {rate.machine_overhead_pct?.toFixed(1) ?? '—'}%
                            </td>
                            <td className="px-4 py-3 text-gray-700 tabular-nums">
                              {rate.electricity_cost_kwh?.toFixed(3) ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                              {format(new Date(rate.updated_at), 'dd MMM yyyy')}
                            </td>
                            {isAdmin && (
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => startEdit(rate)}
                                  className="p-1.5 rounded hover:bg-blue-50 text-blue-500 transition-colors"
                                  title="Edit"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              </td>
                            )}
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Note */}
      <p className="text-xs text-gray-400 text-center">
        Rates are in EUR per hour. Exchange rates are applied separately during cost calculation.
      </p>

      {/* Add Rate Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-[#1e2d4e]">Add Regional Rate</h2>
              <button
                onClick={() => { setShowAddForm(false); setNewRate(EMPTY_NEW_RATE); }}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAdd} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Country Code *</label>
                  <input
                    value={newRate.country_code}
                    onChange={(e) =>
                      setNewRate((r) => ({ ...r, country_code: e.target.value.toUpperCase().slice(0, 2) }))
                    }
                    maxLength={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[#e85c1a]/40"
                    placeholder="DE"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Country Name *</label>
                  <input
                    value={newRate.country_name}
                    onChange={(e) => setNewRate((r) => ({ ...r, country_name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a]/40"
                    placeholder="Germany"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Labour Rate (USD/hr)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newRate.labour_rate_usd_hr}
                    onChange={(e) =>
                      setNewRate((r) => ({ ...r, labour_rate_usd_hr: Number(e.target.value) }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a]/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Machine Overhead %</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={newRate.machine_overhead_pct}
                    onChange={(e) =>
                      setNewRate((r) => ({ ...r, machine_overhead_pct: Number(e.target.value) }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a]/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Electricity (kWh)</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={newRate.electricity_cost_kwh}
                    onChange={(e) =>
                      setNewRate((r) => ({ ...r, electricity_cost_kwh: Number(e.target.value) }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a]/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Effective Date</label>
                  <input
                    type="date"
                    value={newRate.effective_date}
                    onChange={(e) => setNewRate((r) => ({ ...r, effective_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a]/40"
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={isAdding}
                className="w-full bg-[#e85c1a] hover:bg-[#d04e14] text-white font-semibold py-2.5 flex items-center justify-center gap-2"
              >
                {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Rate
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
