import { Skeleton } from '../ui/skeleton'

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      {/* Fake header */}
      <div className="bg-[#1e2d4e] px-4 py-3">
        <Skeleton className="h-4 w-48 bg-white/20" />
      </div>
      {/* Fake rows */}
      <div className="divide-y divide-gray-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
            <div className="flex gap-4 px-4 py-3">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
