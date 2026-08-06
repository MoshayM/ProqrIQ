import { Fragment } from 'react'
import { Plus } from 'lucide-react'
import { ComponentRow } from './ComponentRow'
import { CostNumber } from '../common/CostNumber'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import type { AssemblyComponentExpanded } from '@shared/types'

interface BOMNode extends AssemblyComponentExpanded {
  children?: BOMNode[]
}

interface Props {
  components: AssemblyComponentExpanded[]
  /** Optionally pre-built nested tree. If omitted, a flat list is rendered. */
  tree?: BOMNode[]
  totalRolledUpCost?: number | null
  currency?: string
  onAddComponent?: (parentComponentId?: string) => void
  onRemoveComponent?: (componentId: string) => void
}

/**
 * Renders a flat list of AssemblyComponents as a BOM table.
 * For nested rendering, pass a pre-built `tree` prop with children arrays.
 * Indentation max = 3 levels (depth 0, 1, 2).
 */
export function BOMTree({
  components,
  tree,
  totalRolledUpCost,
  currency = 'EUR',
  onAddComponent,
  onRemoveComponent,
}: Props) {
  // Build a flat ordered list from tree (DFS) or fall back to flat components list
  const flattenTree = (nodes: BOMNode[], depth = 0): Array<{ node: BOMNode; depth: number }> =>
    nodes.flatMap((node) => [
      { node, depth },
      ...(node.children ? flattenTree(node.children, depth + 1) : []),
    ])

  const rows = tree
    ? flattenTree(tree)
    : components.map((c) => ({ node: c as BOMNode, depth: 0 }))

  if (components.length === 0 && !tree?.length) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center space-y-3">
        <div className="text-4xl">📦</div>
        <p className="text-gray-600 font-medium">No components yet</p>
        <p className="text-sm text-gray-400">Add components to build your BOM</p>
        {onAddComponent && (
          <Button variant="primary" size="sm" onClick={() => onAddComponent()}>
            <Plus className="w-4 h-4" />
            Add First Component
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#1e2d4e] text-white">
              <th className="px-4 py-3 text-left font-semibold">Component</th>
              <th className="px-4 py-3 text-center font-semibold w-16">Qty</th>
              <th className="px-4 py-3 text-right font-semibold">Unit Cost</th>
              <th className="px-4 py-3 text-right font-semibold">Rolled-up Cost</th>
              <th className="px-4 py-3 text-center font-semibold">Confidence</th>
              <th className="px-4 py-3 text-center font-semibold">Status</th>
              <th className="px-4 py-3 text-left font-semibold">Supplier</th>
              <th className="px-4 py-3 w-24" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ node, depth }) => (
              <Fragment key={node.id}>
                <ComponentRow
                  component={node}
                  depth={depth}
                  currency={currency}
                  onAddChild={
                    depth < 2 && onAddComponent
                      ? (id) => onAddComponent(id)
                      : undefined
                  }
                  onRemove={onRemoveComponent}
                />
              </Fragment>
            ))}
          </tbody>

          {/* Totals footer */}
          <tfoot>
            <tr className="bg-[#e85c1a] text-white font-bold">
              <td colSpan={3} className="px-4 py-3 text-sm">
                TOTAL (rolled-up)
              </td>
              <td className="px-4 py-3 text-right">
                <CostNumber
                  value={totalRolledUpCost}
                  currency={currency}
                  className="text-white font-bold"
                />
              </td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Add component button below the table */}
      {onAddComponent && (
        <div className="flex justify-start">
          <Button variant="secondary" size="sm" onClick={() => onAddComponent()}>
            <Plus className="w-4 h-4" />
            Add Component
          </Button>
        </div>
      )}
    </div>
  )
}
