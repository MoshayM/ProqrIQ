import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, X, MessageSquare, Loader2, CheckCircle2 } from 'lucide-react';
import { api } from '../../../lib/api';
import { useQuoteContext } from '../../../contexts/QuoteContext';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import type { AIValueEngineering } from '@shared/types';

interface Assumption {
  id: string;
  param_name: string;
  value_used: string;
  source_tier: number;
  basis: string | null;
  status: 'pending' | 'confirmed' | 'overridden';
}

const TIER_CONFIG: Record<number, { label: string; className: string }> = {
  1: { label: 'KB', className: 'bg-green-100 text-green-800' },
  2: { label: 'User', className: 'bg-blue-100 text-blue-800' },
  3: { label: 'Std', className: 'bg-purple-100 text-purple-800' },
  4: { label: 'Bench', className: 'bg-amber-100 text-amber-800' },
  5: { label: 'Assumed', className: 'bg-red-100 text-red-800' },
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-gray-100 text-gray-700' },
  confirmed: { label: 'Confirmed', className: 'bg-green-100 text-green-800' },
  overridden: { label: 'Overridden', className: 'bg-amber-100 text-amber-800' },
};

interface QAItem {
  question: string;
  answer: string;
}

function veSavingsRange(ve: AIValueEngineering): string | null {
  if (ve.saving_eur != null) return `€${ve.saving_eur.toFixed(0)}`;
  if (ve.saving_pct != null) return `${ve.saving_pct}%`;
  return null;
}

export default function Step5() {
  const context = useQuoteContext();
  const queryClient = useQueryClient();
  const estimate = context.costEstimate;

  // VE status keyed by array index (as string)
  const [veStatus, setVeStatus] = useState<Record<number, 'accepted' | 'rejected' | null>>({});
  const [nlQuestion, setNlQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [currentAnswer, setCurrentAnswer] = useState<string | null>(null);
  const [qaHistory, setQaHistory] = useState<QAItem[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const { data: assumptions, isLoading: isLoadingAssumptions } = useQuery<Assumption[]>({
    queryKey: ['assumptions', context.quotationId],
    queryFn: () => api.assumptions.list(context.quotationId!),
    enabled: !!context.quotationId,
  });

  const allConfirmed =
    assumptions && assumptions.length > 0 && assumptions.every((a) => a.status !== 'pending');

  const handleConfirmAssumption = async (id: string) => {
    setConfirmingId(id);
    try {
      await api.assumptions.confirm(id);
      queryClient.invalidateQueries({ queryKey: ['assumptions', context.quotationId] });
      toast.success('Assumption confirmed');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to confirm assumption.');
    } finally {
      setConfirmingId(null);
    }
  };

  const handleAskQuestion = async () => {
    if (!nlQuestion.trim() || !context.quotationId) return;
    setIsAsking(true);
    setCurrentAnswer(null);
    try {
      const result = await api.ai.query({ quotation_id: context.quotationId, question: nlQuestion });
      setCurrentAnswer(result.answer);
      setQaHistory((prev) => [{ question: nlQuestion, answer: result.answer }, ...prev]);
      setNlQuestion('');
      toast.success('Answer received');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to get answer.');
    } finally {
      setIsAsking(false);
    }
  };

  const veItems: AIValueEngineering[] = estimate?.value_engineering ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#1e2d4e]">Assumptions & Value Engineering</h2>
        <p className="text-gray-500 mt-1">Confirm AI assumptions and explore cost-saving opportunities.</p>
      </div>

      {/* Assumptions */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold text-[#1e2d4e] mb-4">AI Assumptions</h3>

          {isLoadingAssumptions && (
            <div className="flex items-center gap-2 text-gray-500 py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading assumptions...
            </div>
          )}

          {!isLoadingAssumptions && (!assumptions || assumptions.length === 0) && (
            <p className="text-gray-400 text-sm py-4 text-center">No assumptions recorded for this quote.</p>
          )}

          {!isLoadingAssumptions && assumptions && assumptions.length > 0 && (
            <>
              {allConfirmed && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-semibold text-green-800">All assumptions confirmed ✓</span>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="py-2 px-3 text-left text-gray-500 font-medium">Parameter</th>
                      <th className="py-2 px-3 text-left text-gray-500 font-medium">Value Used</th>
                      <th className="py-2 px-3 text-center text-gray-500 font-medium">Tier</th>
                      <th className="py-2 px-3 text-left text-gray-500 font-medium">Basis</th>
                      <th className="py-2 px-3 text-center text-gray-500 font-medium">Status</th>
                      <th className="py-2 px-3 text-center text-gray-500 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {assumptions.map((a) => {
                      const tier = TIER_CONFIG[a.source_tier] || { label: `T${a.source_tier}`, className: 'bg-gray-100 text-gray-700' };
                      const status = STATUS_CONFIG[a.status] || { label: a.status, className: 'bg-gray-100 text-gray-700' };
                      return (
                        <tr key={a.id} className="hover:bg-gray-50/50">
                          <td className="py-2.5 px-3 font-medium text-gray-800">{a.param_name}</td>
                          <td className="py-2.5 px-3 text-gray-700 font-mono text-xs">{a.value_used}</td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${tier.className}`}>
                              {tier.label}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-gray-500 text-xs">{a.basis || '—'}</td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${status.className}`}>
                              {status.label}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {a.status === 'pending' && (
                              <button
                                onClick={() => handleConfirmAssumption(a.id)}
                                disabled={confirmingId === a.id}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium transition-colors disabled:opacity-50"
                              >
                                {confirmingId === a.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Check className="w-3 h-3" />
                                )}
                                Confirm
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Value Engineering */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold text-[#1e2d4e] mb-4">Value Engineering Opportunities</h3>

          {veItems.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">
              No value engineering opportunities for this quote.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {veItems.map((ve, idx) => {
                const status = veStatus[idx];
                const savingsRange = veSavingsRange(ve);
                const title = ve.suggestion;
                const description = ve.notes ?? '';
                const recommendation = ve.effort ?? '';
                return (
                  <div
                    key={idx}
                    className={`border-2 rounded-xl p-4 transition-all ${
                      status === 'accepted'
                        ? 'border-green-400 bg-green-50'
                        : status === 'rejected'
                        ? 'border-gray-200 bg-gray-50 opacity-60'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <p className={`font-medium text-gray-900 ${status === 'rejected' ? 'line-through text-gray-400' : ''}`}>
                        {title}
                      </p>
                      {status === 'accepted' ? (
                        <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full ml-2 flex-shrink-0 font-medium">
                          Accepted
                        </span>
                      ) : (
                        savingsRange && (
                          <span className="px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full ml-2 flex-shrink-0">
                            {savingsRange}
                          </span>
                        )
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{description}</p>
                    <p className="text-sm text-gray-500 italic mb-3">{recommendation}</p>

                    {!status && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setVeStatus((prev) => ({ ...prev, [idx]: 'accepted' }))}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 text-xs font-medium transition-colors"
                        >
                          <Check className="w-3 h-3" />
                          Accept
                        </button>
                        <button
                          onClick={() => setVeStatus((prev) => ({ ...prev, [idx]: 'rejected' }))}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium transition-colors"
                        >
                          <X className="w-3 h-3" />
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* NL Query */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold text-[#1e2d4e] mb-1">Ask AI About This Quote</h3>
          <p className="text-sm text-gray-500 mb-4">
            Ask questions about the estimate methodology, cost drivers, or what-if scenarios.
          </p>

          {/* Previous Q&A history */}
          {qaHistory.length > 0 && (
            <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
              {qaHistory.map((item, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-gray-800 mb-1">{item.question}</p>
                  <div className="bg-white rounded border border-gray-200 p-2.5">
                    <p className="text-xs text-gray-500 font-semibold mb-1">AI Response</p>
                    <p className="text-sm text-gray-700">{item.answer}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            <textarea
              rows={3}
              value={nlQuestion}
              onChange={(e) => setNlQuestion(e.target.value)}
              placeholder="e.g. Why is the material cost high? What if we use a different alloy?"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a] focus:border-transparent resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleAskQuestion();
                }
              }}
            />
            <Button
              onClick={handleAskQuestion}
              disabled={isAsking || !nlQuestion.trim()}
              className="bg-[#e85c1a] hover:bg-[#d14e0f] text-white font-semibold disabled:opacity-50"
            >
              {isAsking ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Thinking...
                </>
              ) : (
                <>
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Ask
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={() => context.setStep(6)}
        className="w-full bg-[#e85c1a] hover:bg-[#d14e0f] text-white h-12 text-base font-semibold"
      >
        Continue to Review
      </Button>
    </div>
  );
}
