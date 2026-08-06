import {
  useState,
  useCallback,
  useRef,
  DragEvent,
  ChangeEvent,
} from 'react'
import { UploadCloud, X, FileText, AlertCircle } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select } from '../ui/select'
import { cn } from '../../lib/utils'

const ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
const ACCEPTED_EXTS  = ['.pdf', '.png', '.jpg', '.jpeg', '.webp']
const MAX_FILES      = 50
const MAX_SIZE_MB    = 50
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

interface FileEntry {
  file: File
  error?: string
}

interface SharedParams {
  supplier_country: string
  supplier_currency: string
  annual_volume: string
  lot_size: string
  lots_per_year: string
  shifts_per_day: string
  annual_production_hours: string
  procurement_type: string
  exchange_rate: string
}

interface Props {
  onSubmit: (files: File[], params: Record<string, string | number>) => Promise<void>
  isSubmitting?: boolean
}

const DEFAULT_PARAMS: SharedParams = {
  supplier_country:        '',
  supplier_currency:       'EUR',
  annual_volume:           '',
  lot_size:                '',
  lots_per_year:           '',
  shifts_per_day:          '2',
  annual_production_hours: '3840',
  procurement_type:        'in_house',
  exchange_rate:           '1',
}

function validateFile(file: File): string | undefined {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return `Unsupported type: ${file.type || 'unknown'}`
  }
  if (file.size > MAX_SIZE_BYTES) {
    return `File exceeds ${MAX_SIZE_MB} MB`
  }
  return undefined
}

export function BatchUploader({ onSubmit, isSubmitting = false }: Props) {
  const [entries, setEntries]     = useState<FileEntry[]>([])
  const [params, setParams]       = useState<SharedParams>(DEFAULT_PARAMS)
  const [isDragging, setIsDragging] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── File management ─────────────────────────────────────────────────────────

  const addFiles = useCallback((incoming: File[]) => {
    setGlobalError(null)
    setEntries((prev) => {
      const existing = new Set(prev.map((e) => `${e.file.name}-${e.file.size}`))
      const fresh: FileEntry[] = []

      for (const file of incoming) {
        const key = `${file.name}-${file.size}`
        if (existing.has(key)) continue
        fresh.push({ file, error: validateFile(file) })
      }

      const combined = [...prev, ...fresh]
      if (combined.length > MAX_FILES) {
        setGlobalError(`Maximum ${MAX_FILES} files allowed`)
        return combined.slice(0, MAX_FILES)
      }
      return combined
    })
  }, [])

  const removeFile = (index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index))
  }

  // ── Drag-and-drop handlers ──────────────────────────────────────────────────

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }
  const onDragLeave = () => setIsDragging(false)
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    addFiles(files)
  }

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    addFiles(files)
    // Reset so the same file can be re-added after removal
    e.target.value = ''
  }

  // ── Param helpers ───────────────────────────────────────────────────────────

  const setParam = (key: keyof SharedParams, value: string) => {
    setParams((prev) => ({ ...prev, [key]: value }))
  }

  // ── Validation for submit ───────────────────────────────────────────────────

  const validFiles    = entries.filter((e) => !e.error)
  const hasFiles      = validFiles.length > 0
  const paramsValid   =
    params.supplier_country.trim() !== '' &&
    params.supplier_currency.trim() !== '' &&
    params.annual_volume.trim() !== '' &&
    params.lot_size.trim() !== ''
  const canSubmit     = hasFiles && paramsValid && !isSubmitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    const numericParams: Record<string, string | number> = {
      supplier_country:        params.supplier_country,
      supplier_currency:       params.supplier_currency,
      annual_volume:           Number(params.annual_volume),
      lot_size:                Number(params.lot_size),
      lots_per_year:           Number(params.lots_per_year),
      shifts_per_day:          Number(params.shifts_per_day),
      annual_production_hours: Number(params.annual_production_hours),
      procurement_type:        params.procurement_type,
      exchange_rate:           Number(params.exchange_rate),
    }
    await onSubmit(validFiles.map((e) => e.file), numericParams)
  }

  return (
    <div className="space-y-6">
      {/* ── Drop zone ──────────────────────────────────────────────────────── */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        aria-label="Upload files"
        className={cn(
          'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 cursor-pointer transition-colors',
          isDragging
            ? 'border-[#e85c1a] bg-orange-50'
            : 'border-gray-300 bg-gray-50 hover:border-[#e85c1a] hover:bg-orange-50',
        )}
      >
        <UploadCloud
          className={cn(
            'w-10 h-10 transition-colors',
            isDragging ? 'text-[#e85c1a]' : 'text-gray-400',
          )}
        />
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700">
            Drop files here, or{' '}
            <span className="text-[#e85c1a] underline underline-offset-2">browse</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">
            PDF, PNG, JPG, WEBP — max {MAX_SIZE_MB} MB each, up to {MAX_FILES} files
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTS.join(',')}
          className="hidden"
          onChange={onInputChange}
        />
      </div>

      {/* Global error */}
      {globalError && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {globalError}
        </div>
      )}

      {/* ── File list ──────────────────────────────────────────────────────── */}
      {entries.length > 0 && (
        <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          <div className="px-4 py-2 bg-[#1e2d4e] text-white text-xs font-semibold uppercase tracking-wide">
            Selected files ({validFiles.length} valid / {entries.length} total)
          </div>
          {entries.map((entry, i) => (
            <div
              key={`${entry.file.name}-${i}`}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5',
                entry.error ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50',
              )}
            >
              <FileText
                className={cn(
                  'w-4 h-4 shrink-0',
                  entry.error ? 'text-red-400' : 'text-gray-400',
                )}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 truncate">{entry.file.name}</p>
                {entry.error ? (
                  <p className="text-xs text-red-600">{entry.error}</p>
                ) : (
                  <p className="text-xs text-gray-400">
                    {(entry.file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                )}
              </div>
              <button
                onClick={() => removeFile(i)}
                className="p-1 rounded hover:bg-gray-200 transition-colors shrink-0"
                aria-label={`Remove ${entry.file.name}`}
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Shared production params ───────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Shared Production Parameters</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="bu-country">Supplier Country *</Label>
            <Input
              id="bu-country"
              placeholder="e.g. China"
              value={params.supplier_country}
              onChange={(e) => setParam('supplier_country', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="bu-currency">Currency *</Label>
            <Select
              id="bu-currency"
              value={params.supplier_currency}
              onChange={(e) => setParam('supplier_currency', e.target.value)}
            >
              {['EUR', 'USD', 'GBP', 'CNY', 'INR', 'JPY'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="bu-vol">Annual Volume *</Label>
            <Input
              id="bu-vol"
              type="number"
              min={1}
              placeholder="e.g. 10000"
              value={params.annual_volume}
              onChange={(e) => setParam('annual_volume', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="bu-lot">Lot Size *</Label>
            <Input
              id="bu-lot"
              type="number"
              min={1}
              placeholder="e.g. 500"
              value={params.lot_size}
              onChange={(e) => setParam('lot_size', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="bu-lots-yr">Lots per Year</Label>
            <Input
              id="bu-lots-yr"
              type="number"
              min={1}
              placeholder="e.g. 20"
              value={params.lots_per_year}
              onChange={(e) => setParam('lots_per_year', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="bu-shifts">Shifts per Day</Label>
            <Select
              id="bu-shifts"
              value={params.shifts_per_day}
              onChange={(e) => setParam('shifts_per_day', e.target.value)}
            >
              <option value="1">1 shift</option>
              <option value="2">2 shifts</option>
              <option value="3">3 shifts</option>
            </Select>
          </div>

          <div>
            <Label htmlFor="bu-hours">Annual Production Hours</Label>
            <Input
              id="bu-hours"
              type="number"
              min={1}
              value={params.annual_production_hours}
              onChange={(e) => setParam('annual_production_hours', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="bu-proc">Procurement Type</Label>
            <Select
              id="bu-proc"
              value={params.procurement_type}
              onChange={(e) => setParam('procurement_type', e.target.value)}
            >
              <option value="in_house">In-house</option>
              <option value="purchased">Purchased</option>
              <option value="sub_contracted">Sub-contracted</option>
            </Select>
          </div>

          <div>
            <Label htmlFor="bu-fx">Exchange Rate (to EUR)</Label>
            <Input
              id="bu-fx"
              type="number"
              min={0.0001}
              step={0.0001}
              value={params.exchange_rate}
              onChange={(e) => setParam('exchange_rate', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Submit ─────────────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <Button
          variant="primary"
          size="lg"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {isSubmitting ? 'Uploading…' : `Submit ${validFiles.length} File${validFiles.length !== 1 ? 's' : ''}`}
        </Button>
      </div>
    </div>
  )
}
