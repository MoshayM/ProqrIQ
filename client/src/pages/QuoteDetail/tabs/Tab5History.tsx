import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Clock, User, X, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../lib/api';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
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
  } | null;
  kb_coverage_pct: number | null;
  ai_reasoning: string | null;
  routing_path: string[] | null;
  volume_sensitivity: Record<string, number> | null;
}

interface QuoteVersion {
  id: string;
  quotation_id: string;
  version_number: number;
  change_summary: string;
  snapshot: Record<string, unknown>;
  created_at: string;
  created_by: string;
}

interface TabProps {
  quotation: Quotation;
  quotationId: string;
}

// ─── Snapshot Modal ───────────────────────────────────────────────────────────

interface SnapshotModalProps {
  version: QuoteVersion;
  onClose: () => void;
}

function SnapshotModal({ version, onClose }: SnapshotModalProps) {
  const jsonString = React.useMemo(
    () => JSON.stringify(version.snapshot, null, 2),
    [version.snapshot],
  );

  function handleCopy() {
    navigator.clipboard
      .writeText(jsonString)
      .then(() => toast.success('Copied to clipboard'))
      .catch(() => toast.error('Failed to copy'));
  }

  // Close on backdrop click
  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  // Close on Escape
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[80vh] flex flex-col shadow-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900 text-base">
              Snapshot — v{version.version_number}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Created{' '}
              {format(new Date(version.created_at), 'MMM d, yyyy HH:mm')} by{' '}
              {version.created_by}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors rounded p-1 focus:outline-none focus:ring-2 focus:ring-gray-300"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4">
          <pre className="text-xs font-mono bg-gray-50 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap break-words text-gray-800 leading-relaxed">
            {jsonString}
          </pre>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 py-3 border-t border-gray-200 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            Copy to Clipboard
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton Timeline Items ──────────────────────────────────────────────────

function SkeletonTimeline() {
  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="relative pl-10">
            {/* Dot */}
            <div className="absolute left-2.5 top-1.5 w-3 h-3 rounded-full bg-gray-200" />
            {/* Card skeleton */}
            <div className="animate-pulse rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm space-y-2">
              <div className="flex gap-2">
                <div className="h-5 w-12 bg-gray-200 rounded-full" />
                <div className="h-5 w-32 bg-gray-200 rounded ml-auto" />
              </div>
              <div className="h-4 w-40 bg-gray-200 rounded" />
              <div className="h-4 w-3/4 bg-gray-200 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Tab5History({ quotation, quotationId }: TabProps) {
  const [selectedVersion, setSelectedVersion] = useState<QuoteVersion | null>(
    null,
  );

  const {
    data: versions,
    isLoading,
    isError,
  } = useQuery<QuoteVersion[]>({
    queryKey: ['versions', quotationId],
    queryFn: () => api.quotes.versions(quotationId),
    staleTime: 30_000,
  });

  const sortedVersions = React.useMemo(() => {
    if (!versions) return [];
    return [...versions].sort((a, b) => b.version_number - a.version_number);
  }, [versions]);

  // ── Error state ───────────────────────────────────────────────────────────
  if (isError) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-red-600">
          Failed to load version history. Please try again.
        </CardContent>
      </Card>
    );
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="px-1">
        <SkeletonTimeline />
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (sortedVersions.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
          <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
            <Clock className="h-6 w-6 text-gray-400" />
          </div>
          <div>
            <p className="font-medium text-gray-700">No version history yet</p>
            <p className="text-sm text-gray-500 mt-1">
              Versions are created when the quote is submitted or approved.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* ── Timeline ──────────────────────────────────────────────────────── */}
      <div className="relative px-1">
        {/* Vertical line */}
        <div className="absolute left-4 top-0 bottom-6 w-0.5 bg-gray-200" />

        <div className="space-y-6">
          {sortedVersions.map((version, index) => {
            const isLatest = index === 0;
            const dateLabel = (() => {
              try {
                return format(
                  new Date(version.created_at),
                  'MMM d, yyyy HH:mm',
                );
              } catch {
                return version.created_at;
              }
            })();

            return (
              <div key={version.id} className="relative pl-10 mb-6">
                {/* Circle dot */}
                <div
                  className={`absolute left-2.5 top-1.5 w-3 h-3 rounded-full ring-2 ring-white ${
                    isLatest ? 'bg-[#e85c1a]' : 'bg-gray-400'
                  }`}
                />

                {/* Content card */}
                <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
                  {/* Top row: version badge + date */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
                      style={{ backgroundColor: '#1e2d4e' }}
                    >
                      v{version.version_number}
                    </span>
                    {isLatest && (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-[#e85c1a]/10 text-[#e85c1a]">
                        Current
                      </span>
                    )}
                    <span className="ml-auto text-xs text-gray-500">
                      {dateLabel}
                    </span>
                  </div>

                  {/* Created by */}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <User className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-600">
                      {version.created_by}
                    </span>
                  </div>

                  {/* Change summary */}
                  <p className="text-sm text-gray-700 mt-1.5 leading-snug">
                    {version.change_summary}
                  </p>

                  {/* View snapshot button */}
                  <div className="mt-2.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1 text-gray-500 hover:text-gray-800"
                      onClick={() => setSelectedVersion(version)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View Snapshot
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Snapshot Modal ─────────────────────────────────────────────────── */}
      {selectedVersion && (
        <SnapshotModal
          version={selectedVersion}
          onClose={() => setSelectedVersion(null)}
        />
      )}
    </>
  );
}
