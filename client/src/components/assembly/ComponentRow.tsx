import { Plus, Trash2, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ConfidenceBadge } from '../common/ConfidenceBadge'
import { StatusBadge } from '../common/StatusBadge'
import { CostNumber } from '../common/CostNumber'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import type { AssemblyComponentExpanded } from '@shared/types'

export interface ComponentRowProps {
  component: AssemblyComponentExpanded
  /** 0-based nesting depth (max 2 = level 3) */
  depth?: number
  onAddChild?: (componentId: string) => void
  onRemove?: (componentId: string) => void
  currency?: string
}

export function ComponentRow({
  component,
  depth = 0,
  onAddChild,
  onRemove,
  currency = 'EUR',
}: ComponentRowProps) {
  const navigate = useNavigate()
  const isPurchased = component.is_purchased_standard
  const quote       = component.component_quotation
  const part        = component.part

  const unitCost  = isPurchased
    ? component.purchased_unit_cost_eur
    : quote?.overall_cost_eur ?? null

  const rolledUp  = unitCost != null ? unitCost * component.quantity : null
  const indentPx  = depth * 24

  return (
    <tr
      className={cn(
        'border-t border-gray-100 group',
        isPurchased ? 'bg-gray-50/60' : 'bg-white',
        depth > 0 && 'bg-blue-50/20',
      )}
    >
      {/* Part name — indented */}
      <td className="px-4 py-2.5" style={{ paddingLeft: `${16 + indentPx}px` }}>
        <div className="flex items-center gap-2">
          {/* Depth connector line indicator */}
          {depth > 0 && (
            <span className="text-gray-300 select-none shrink-0">{'└'}</span>
          )}
          <span
            className={cn(
              'text-sm font-medium',
              isPurchased ? 'italic text-gray-500' : 'text-gray-800',
            )}
          >
            {part?.part_name ?? component.purchased_part_number ?? 'Unknown part'}
          </span>
          {isPurchased && (
            <span className="text-[10px] text-gray-400 border border-gray-300 rounded px-1">
              Purchased
            </span>
          )}
          {part?.part_number && (
            <span className="text-xs text-gray-400 font-mono">{part.part_number}</span>
          )}
        </div>
        {component.notes && (
          <p className="text-xs text-gray-400 mt-0.5 ml-0 pl-0 truncate max-w-xs">
            {component.notes}
          </p>
        )}
      </td>

      {/* Quantity */}
      <td className="px-4 py-2.5 text-center font-mono text-sm tabular-nums text-gray-700">
        ×{component.quantity}
      </td>

      {/* Unit cost */}
      <td className="px-4 py-2.5 text-right">
        {isPurchased ? (
          <CostNumber value={component.purchased_unit_cost_eur} currency={currency} />
        ) : (
          <CostNumber value={quote?.overall_cost_eur ?? null} currency={currency} />
        )}
      </td>

      {/* Rolled-up cost */}
      <td className="px-4 py-2.5 text-right">
        <CostNumber value={rolledUp} currency={currency} />
      </td>

      {/* Confidence */}
      <td className="px-4 py-2.5 text-center">
        {isPurchased ? (
          <span className="text-xs text-gray-400 italic">N/A</span>
        ) : (
          <ConfidenceBadge score={quote?.confidence_score ?? null} />
        )}
      </td>

      {/* Status */}
      <td className="px-4 py-2.5 text-center">
        {isPurchased ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
            Std
          </span>
        ) : (
          <StatusBadge status={quote?.status ?? null} />
        )}
      </td>

      {/* Supplier (purchased only) */}
      <td className="px-4 py-2.5 text-xs text-gray-500">
        {isPurchased ? (component.purchased_supplier ?? '—') : '—'}
      </td>

      {/* Actions */}
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
          {/* Open quote */}
          {!isPurchased && quote?.id && (
            <button
              onClick={() => navigate(`/quotes/${quote.id}`)}
              className="p-1 rounded hover:bg-blue-50 text-blue-500 transition-colors"
              title="Open quote"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
          {/* Add child (max depth 2) */}
          {depth < 2 && onAddChild && (
            <button
              onClick={() => onAddChild(component.id)}
              className="p-1 rounded hover:bg-green-50 text-green-600 transition-colors"
              title="Add sub-component"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          {/* Remove */}
          {onRemove && (
            <button
              onClick={() => onRemove(component.id)}
              className="p-1 rounded hover:bg-red-50 text-red-500 transition-colors"
              title="Remove component"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
