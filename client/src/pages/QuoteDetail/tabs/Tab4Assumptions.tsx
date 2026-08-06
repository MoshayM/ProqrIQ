import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, CheckCircle2, Info, Loader2, Send } from 'lucide-react';
import { api } from '../../../lib/api';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Quotation {
  id: string;
  status: string;
  quote_type: string;
  confidence_score: number | null;
  cost_eur: number | null;
  final_price_eur: number | null;
  margin_pct: number | null;
  one_time_cost_eur: number | null;
  created_at: string;
  part: {
    id: string;
    name: string;
    part_number: string | null;
    commodity_type: string;
    material: string | null;
    primary_process: string | null;
    dimensions: Record<string, number> | null;
    weight_kg: number | null;
  };
  kb_coverage_pct: number | null;
  ai_reasoning: string | null;
  routing_path: string[] | null;
  volume_sensitivity: Record<string, number> | null;
}

interface Assumption {
  id: string;
  quotation_id: string;
  param_name: string;
  value_used: string;
  source_tier: number;
  basis: string | null;
  status: 'pending' | 'confirmed' | 'overridden';
}

interface TabProps {
  quotation: Quotation;
  quotationId: string;
}

interface QaItem {
  q: string;
  a: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<number, { bg: string; text: string; label: string }> =
  {
    1: { bg: 'bg-green-100', text: 'text-green-800', label: 'KB' },
    2: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'User' },
    3: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Std' },
    4: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Bench' },
    5: { bg: 'bg-red-100', text: 'text-red-800', label: 'Assumed' },
  };

const STATUS_CONFIG: Record<
  Assumption['status'],
  { bg: string; text: string; label: string }
> = {
  pending: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Pending' },
  confirmed: {
    bg: 'bg-green-100',
    text: 'text-green-700',
    label: 'Confirmed',
  },
  overridden: {
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    label: 'Overridden',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: number }) {
  const cfg = TIER_CONFIG[tier] ?? {
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    label: String(tier),
  };
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: Assumption['status'] }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  );
}

// ─── Assumptions Section ──────────────────────────────────────────────────────

function AssumptionsSection({ quotationId }: { quotationId: string }) {
  const queryClient = useQueryClient();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const {
    data: assumptions,
    isLoading,
    isError,
  } = useQuery<Assumption[]>({
    queryKey: ['assumptions', quotationId],
    queryFn: () => api.assumptions.list(quotationId),
    staleTime: 30_000,
  });

  const allConfirmed =
    assumptions != null &&
    assumptions.length > 0 &&
    assumptions.every((a) => a.status !== 'pending');

  async function handleConfirm(id: string) {
    setConfirmingId(id);
    try {
      await api.assumptions.confirm(id);
      await queryClient.invalidateQueries({
        queryKey: ['assumptions', quotationId],
      });
      toast.success('Assumption confirmed');
    } catch (err) {
      toast.error('Failed to confirm assumption. Please try again.');
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold text-gray-900">Assumptions</h3>
      </CardHeader>
      <CardContent className="p-0">
        {/* All confirmed banner */}
        {allConfirmed && (
          <div className="mx-4 mb-4 mt-2 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
            <span className="text-sm font-medium text-green-800">
              All assumptions confirmed
            </span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-2 font-medium text-gray-600">
                  Param Name
                </th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">
                  Value Used
                </th>
                <th className="px-4 py-2 font-medium text-gray-600">
                  Source Tier
                </th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">
                  Basis
                </th>
                <th className="px-4 py-2 font-medium text-gray-600">Status</th>
                <th className="px-4 py-2 font-medium text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse border-t border-gray-100">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-2">
                        <div className="h-4 bg-gray-200 rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-red-600"
                  >
                    Failed to load assumptions. Please try again.
                  </td>
                </tr>
              ) : !assumptions || assumptions.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-gray-500"
                  >
                    No assumptions recorded for this quote.
                  </td>
                </tr>
              ) : (
                assumptions.map((a) => (
                  <tr
                    key={a.id}
                    className="border-t border-gray-100 hover:bg-gray-50/50"
                  >
                    <td className="px-4 py-2 font-medium text-gray-800">
                      {a.param_name}
                    </td>
                    <td className="px-4 py-2 font-mono text-gray-700 text-xs">
                      {a.value_used}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <TierBadge tier={a.source_tier} />
                    </td>
                    <td className="px-4 py-2 text-gray-500 text-xs">
                      {a.basis ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="px-4 py-2 text-center">
                      {a.status === 'pending' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleConfirm(a.id)}
                          disabled={confirmingId === a.id}
                          className="h-7 px-2 text-xs gap-1"
                        >
                          {confirmingId === a.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                          Confirm
                        </Button>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Value Engineering Section ────────────────────────────────────────────────

function ValueEngineeringSection() {
  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold text-gray-900">
          Value Engineering Opportunities
        </h3>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3 rounded-lg bg-gray-50 border border-gray-200 px-4 py-4">
          <Info className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-gray-600">
            Value engineering opportunities are generated during the AI
            estimation step and are shown in the quote wizard. Re-run the AI
            estimate to generate new suggestions.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── NL Query Section ─────────────────────────────────────────────────────────

function NlQuerySection({ quotationId }: { quotationId: string }) {
  const [question, setQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [qaHistory, setQaHistory] = useState<QaItem[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || isAsking) return;

    setIsAsking(true);
    try {
      const result = await api.ai.query({ quotation_id: quotationId, question: trimmed });
      setQaHistory((prev) => [{ q: trimmed, a: result.answer }, ...prev]);
      setQuestion('');
    } catch {
      toast.error('Failed to get AI response. Please try again.');
    } finally {
      setIsAsking(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold text-gray-900">
          Ask AI About This Quote
        </h3>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#e85c1a] focus:border-transparent"
            rows={3}
            placeholder="Ask anything about this quote — cost drivers, assumptions, alternative materials, lead time…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={isAsking}
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={question.trim() === '' || isAsking}
              className="bg-[#e85c1a] hover:bg-[#cc4f14] text-white gap-2"
            >
              {isAsking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {isAsking ? 'Thinking…' : 'Ask AI'}
            </Button>
          </div>
        </form>

        {/* QA History */}
        {qaHistory.length > 0 && (
          <div className="space-y-3 pt-2 border-t border-gray-100">
            {qaHistory.map((item, idx) => (
              <div key={idx} className="space-y-2">
                {/* Question */}
                <div className="rounded-lg bg-gray-100 px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      You
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-800">
                    {item.q}
                  </p>
                </div>
                {/* Answer */}
                <div className="rounded-lg bg-white border border-gray-200 px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold text-white"
                      style={{ backgroundColor: '#e85c1a' }}
                    >
                      AI
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">
                    {item.a}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Tab4Assumptions({ quotation, quotationId }: TabProps) {
  return (
    <div className="space-y-6">
      <AssumptionsSection quotationId={quotationId} />
      <ValueEngineeringSection />
      <NlQuerySection quotationId={quotationId} />
    </div>
  );
}
