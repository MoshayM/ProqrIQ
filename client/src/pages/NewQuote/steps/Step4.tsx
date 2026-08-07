import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Zap, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, Loader2, X, Timer } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../../../lib/api';
import { useQuoteContext } from '../../../contexts/QuoteContext';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import type { CostEstimateResult, AIValueEngineering } from '@shared/types';

const CATEGORY_LABELS: Record<string, string> = {
  material: 'Material',
  manufacturing: 'Manufacturing',
  special_direct: 'Special Direct',
  overheads: 'Overheads',
  assembly: 'Assembly',
  component: 'Components',
};

const TIER_CONFIG: Record<number, { label: string; className: string }> = {
  1: { label: 'KB', className: 'bg-green-100 text-green-800' },
  2: { label: 'User', className: 'bg-blue-100 text-blue-800' },
  3: { label: 'Std', className: 'bg-purple-100 text-purple-800' },
  4: { label: 'Bench', className: 'bg-amber-100 text-amber-800' },
  5: { label: 'Assumed', className: 'bg-red-100 text-red-800' },
};

const PROGRESS_MESSAGES = [
  'Searching knowledge base...',
  'Matching historical data...',
  'Calculating material costs...',
  'Estimating cycle times...',
  'Running overhead calculations...',
  'Finalising estimate...',
];

const formatEur = (value: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);

function veSavingsRange(ve: AIValueEngineering): string | null {
  if (ve.saving_eur != null) return `€${ve.saving_eur.toFixed(0)}`;
  if (ve.saving_pct != null) return `${ve.saving_pct}%`;
  return null;
}

export default function Step4() {
  const context = useQuoteContext();
  const estimate = context.costEstimate;

  const [isRunning, setIsRunning] = useState(false);
  const [progressIndex, setProgressIndex] = useState(0);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [regenerateInstructions, setRegenerateInstructions] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);
  const [diffSummary, setDiffSummary] = useState<string | null>(null);
  const [estimationTime, setEstimationTime] = useState<number | null>(null);
  const estimationStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setProgressIndex((prev) => (prev + 1) % PROGRESS_MESSAGES.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [isRunning]);

  const handleRunEstimate = async () => {
    if (!context.quotationId) {
      toast.error('No quotation ID found. Please restart the wizard.');
      return;
    }
    setIsRunning(true);
    setProgressIndex(0);
    estimationStartRef.current = performance.now();
    try {
      const result = await api.ai.estimateCost({
        quotation_id: context.quotationId,
        ...context.productionParams,
      });
      if (estimationStartRef.current !== null) {
        setEstimationTime((performance.now() - estimationStartRef.current) / 1000);
      }
      context.setCostEstimate(result);
      await api.quotes.update(context.quotationId, {
        confidence_score: result.confidence_score,
        kb_coverage_pct: result.kb_coverage_pct,
        overall_cost_eur: result.overall_cost_eur,
      });
      toast.success('AI estimate complete!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to run cost estimate.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleRegenerate = async () => {
    if (!context.quotationId) return;
    setIsRegenerating(true);
    const regenStart = performance.now();
    try {
      const result = await api.ai.regenerate({
        quotation_id: context.quotationId,
        instructions: regenerateInstructions,
      });
      setEstimationTime((performance.now() - regenStart) / 1000);
      context.setCostEstimate(result.estimate);
      if (result.diff_summary) {
        setDiffSummary(result.diff_summary);
      }
      setShowRegenerateModal(false);
      setRegenerateInstructions('');
      toast.success('Estimate regenerated!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to regenerate estimate.');
    } finally {
      setIsRegenerating(false);
    }
  };

  // Group cost lines by category
  const groupedLines = estimate?.cost_lines.reduce<Record<string, typeof estimate.cost_lines>>(
    (acc, line) => {
      const cat = line.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(line);
      return acc;
    },
    {}
  ) ?? {};

  if (isRunning) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[420px] space-y-8 py-12">
        {/* Animated rings */}
        <div className="relative w-24 h-24">
          <span className="absolute inset-0 rounded-full border-4 border-[#e85c1a]/20 animate-ping" style={{ animationDuration: '1.8s' }} />
          <span className="absolute inset-2 rounded-full border-4 border-[#e85c1a]/40 animate-ping" style={{ animationDuration: '1.4s', animationDelay: '0.3s' }} />
          <div className="absolute inset-4 rounded-full bg-[#e85c1a]/10 flex items-center justify-center">
            <Zap className="w-8 h-8 text-[#e85c1a]" />
          </div>
        </div>
        <div className="text-center max-w-xs">
          <p className="text-xl font-bold text-[#1e2d4e]">AI Engine Running</p>
          <p className="text-[#9aa3b2] mt-2 text-sm min-h-[20px] transition-all duration-500">{PROGRESS_MESSAGES[progressIndex]}</p>
        </div>
        {/* Step pills */}
        <div className="flex flex-wrap justify-center gap-2 max-w-sm">
          {PROGRESS_MESSAGES.map((msg, i) => (
            <span
              key={i}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-300 ${
                i < progressIndex
                  ? 'bg-[#1e2d4e] text-white'
                  : i === progressIndex
                  ? 'bg-[#e85c1a] text-white scale-105'
                  : 'bg-[#f1f3f7] text-[#9aa3b2]'
              }`}
            >
              {msg}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (!estimate) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-[#1e2d4e]">AI Cost Estimate</h2>
          <p className="text-gray-500 mt-1">Run the AI engine to generate a cost estimate for this part.</p>
        </div>
        <div className="flex flex-col items-center justify-center min-h-[300px] space-y-4">
          <div className="w-20 h-20 rounded-full bg-orange-50 flex items-center justify-center">
            <Zap className="w-10 h-10 text-[#e85c1a]" />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-gray-800">Ready to Estimate</p>
            <p className="text-gray-500 text-sm mt-1">The AI will analyse your part and production parameters</p>
          </div>
          <Button
            onClick={handleRunEstimate}
            className="bg-[#e85c1a] hover:bg-[#d14e0f] text-white px-8 h-12 text-base font-semibold"
          >
            <Zap className="w-5 h-5 mr-2" />
            Run AI Estimate
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#1e2d4e]">AI Cost Estimate</h2>
          <p className="text-gray-500 mt-1">Review the AI-generated cost breakdown below.</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2 text-sm">
            <span className={`px-3 py-1 rounded-full font-medium ${
              estimate.confidence_score >= 80
                ? 'bg-green-100 text-green-800'
                : estimate.confidence_score >= 70
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-red-100 text-red-800'
            }`}>
              {estimate.confidence_score}% confident
            </span>
            <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">
              {estimate.kb_coverage_pct}% KB coverage
            </span>
          </div>
          <AnimatePresence>
            {estimationTime !== null && (
              <motion.span
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1 text-xs text-[#9aa3b2]"
              >
                <Timer className="w-3 h-3" />
                Estimate generated in {estimationTime.toFixed(1)}s
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Low confidence alert */}
      {estimate.confidence_score < 70 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-yellow-800">
                Estimate needs clarification (confidence: {estimate.confidence_score}%)
              </p>
              {estimate.clarification_questions && estimate.clarification_questions.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {estimate.clarification_questions.map((q, i) => (
                    <li key={i} className="text-sm text-yellow-700 flex items-start gap-2">
                      <span className="text-yellow-500 mt-0.5">•</span>
                      {q}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-sm text-yellow-700 mt-2 italic">
                Answer these questions to improve confidence
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Diff summary */}
      {diffSummary && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-blue-800 mb-1">Regeneration Summary</p>
          <p className="text-sm text-blue-700">{diffSummary}</p>
          <button onClick={() => setDiffSummary(null)} className="text-xs text-blue-500 mt-1 underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Cost breakdown */}
      <Card>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-3 px-3 text-left text-gray-500 font-medium">Description</th>
                  <th className="py-3 px-3 text-right text-gray-500 font-medium">Cost (EUR)</th>
                  <th className="py-3 px-3 text-center text-gray-500 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(groupedLines).map(([category, lines]) => (
                  <React.Fragment key={category}>
                    <tr className="bg-gray-50">
                      <td colSpan={3} className="py-2 px-3 font-semibold text-gray-700 text-xs uppercase tracking-wide">
                        {CATEGORY_LABELS[category] || category}
                      </td>
                    </tr>
                    {lines.map((line, idx) => {
                      const tier = TIER_CONFIG[line.source_tier] || { label: `T${line.source_tier}`, className: 'bg-gray-100 text-gray-700' };
                      return (
                        <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="py-2 px-3 text-gray-700">
                            {line.label}
                            {line.notes && (
                              <span className="text-gray-400 text-xs ml-1 italic">({line.notes})</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-mono">{formatEur(line.value_eur)}</td>
                          <td className="py-2 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${tier.className}`}>
                              {tier.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
                <tr className="border-t-2 border-gray-300 bg-gray-50">
                  <td className="py-3 px-3 font-bold text-[#1e2d4e] text-base">Total</td>
                  <td className="py-3 px-3 text-right font-bold font-mono text-[#1e2d4e] text-base">
                    {formatEur(estimate.overall_cost_eur)}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Value Engineering */}
      {estimate.value_engineering.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="font-semibold text-[#1e2d4e] mb-3">Value Engineering Opportunities</h3>
            <div className="space-y-3">
              {estimate.value_engineering.map((ve, idx) => {
                const savingsRange = veSavingsRange(ve);
                return (
                  <div key={idx} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-1">
                      <p className="font-medium text-gray-900">{ve.suggestion}</p>
                      {savingsRange && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full ml-2 flex-shrink-0">
                          {savingsRange}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-1">{ve.notes ?? ''}</p>
                    <p className="text-sm text-gray-500 italic">{ve.effort ?? ''}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Reasoning */}
      <Card>
        <CardContent className="pt-6">
          <button
            onClick={() => setShowReasoning((v) => !v)}
            className="flex items-center justify-between w-full text-left"
          >
            <h3 className="font-semibold text-[#1e2d4e]">AI Reasoning</h3>
            {showReasoning ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>
          {showReasoning && (
            <pre className="mt-3 text-sm text-gray-600 whitespace-pre-wrap font-sans leading-relaxed">
              {estimate.ai_reasoning}
            </pre>
          )}
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => setShowRegenerateModal(true)}
          className="flex-1"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Regenerate
        </Button>
        <Button
          onClick={() => context.setStep(5)}
          className="flex-1 bg-[#e85c1a] hover:bg-[#d14e0f] text-white font-semibold"
        >
          Confirm & Continue
        </Button>
      </div>

      {/* Regenerate Modal */}
      {showRegenerateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-semibold text-[#1e2d4e]">Regenerate Estimate</h3>
              <button
                onClick={() => setShowRegenerateModal(false)}
                className="p-1 rounded hover:bg-gray-100 text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Additional Instructions
                </label>
                <textarea
                  rows={4}
                  value={regenerateInstructions}
                  onChange={(e) => setRegenerateInstructions(e.target.value)}
                  placeholder="e.g. Use aluminium instead of steel. Add extra 15% overhead for complex tooling."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a] focus:border-transparent resize-none"
                />
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowRegenerateModal(false)}
                  className="flex-1"
                  disabled={isRegenerating}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRegenerate}
                  disabled={isRegenerating}
                  className="flex-1 bg-[#e85c1a] hover:bg-[#d14e0f] text-white font-semibold"
                >
                  {isRegenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Regenerating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Regenerate
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
