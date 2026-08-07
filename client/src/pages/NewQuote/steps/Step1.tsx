import React, { useState, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, FileText, X, Box, CheckCircle } from 'lucide-react'
import { api } from '../../../lib/api'
import { useQuoteContext } from '../../../contexts/QuoteContext'
import { Button } from '../../../components/ui/button'
import { Card, CardContent } from '../../../components/ui/card'
import { ProgressBar } from '../../../components/ui/progress-bar'
import { cn } from '../../../lib/utils'
import type { DrawingAnalysisResult } from '@shared/types'

const commodityLabels: Record<string, string> = {
  sheet_metal:        'Sheet Metal',
  cnc_machining:      'CNC Machining',
  pcb_rigid:          'PCB (Rigid)',
  pcb_flex:           'PCB (Flex)',
  injection_moulding: 'Injection Moulding',
  stamping:           'Stamping',
  die_casting:        'Die Casting',
  extrusion:          'Extrusion',
  forging:            'Forging',
  turning:            'Turning',
  grinding:           'Grinding',
  welding_assembly:   'Welding Assembly',
  other:              'Other',
}

const ACCEPTED_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.step', '.stp', '.iges', '.igs', '.dxf']
const ACCEPT_ATTR   = ACCEPTED_EXTS.join(',')

const IS_3D_EXT: Record<string, boolean> = {
  '.step': true, '.stp': true, '.iges': true, '.igs': true, '.dxf': true,
}

function is3DFile(filename: string) {
  const ext = '.' + filename.split('.').pop()?.toLowerCase()
  return IS_3D_EXT[ext] ?? false
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const formatDimensions = (dims: DrawingAnalysisResult['dimensions_json']) => {
  if (!dims) return '—'
  const parts: string[] = []
  if (dims.l_mm)         parts.push(`L: ${dims.l_mm}mm`)
  if (dims.w_mm)         parts.push(`W: ${dims.w_mm}mm`)
  if (dims.h_mm)         parts.push(`H: ${dims.h_mm}mm`)
  if (dims.thickness_mm) parts.push(`T: ${dims.thickness_mm}mm`)
  if (dims.diameter_mm)  parts.push(`Ø: ${dims.diameter_mm}mm`)
  if (dims.depth_mm)     parts.push(`D: ${dims.depth_mm}mm`)
  return parts.join(', ') || '—'
}

interface ManualFormState {
  name: string
  part_number: string
  material: string
  primary_process: string
}

const INPUT_CLS = 'w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-sm text-[#0f1729] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors'
const LABEL_CLS = 'block text-sm font-medium text-[#4a5568] mb-1'

export default function Step1() {
  const context = useQuoteContext()
  const [mode, setMode] = useState<'upload' | 'manual'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isAnalysing, setIsAnalysing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<DrawingAnalysisResult | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [selectedCommodity, setSelectedCommodity] = useState<string | null>(null)
  const [manualForm, setManualForm] = useState<ManualFormState>({ name: '', part_number: '', material: '', primary_process: '' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback((f: File) => {
    if (f.size > 50 * 1024 * 1024) { toast.error('File size exceeds 50MB limit'); return }
    setFile(f)
    setAnalysisResult(null)
  }, [])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) handleFileChange(dropped)
  }

  const handleAnalyse = async () => {
    if (!file) return
    setIsAnalysing(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const result = await api.ai.analyseDrawing(formData)
      setAnalysisResult(result)
      context.setDrawingFile(file)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to analyse drawing. Please try again.')
    } finally {
      setIsAnalysing(false)
    }
  }

  const handleCreateFromAnalysis = async () => {
    if (!analysisResult) return
    setIsCreating(true)
    try {
      const part = await api.parts.create({
        part_name:             analysisResult.part_name,
        part_number:           analysisResult.part_number,
        commodity_type:        analysisResult.commodity_type,
        material_grade:        analysisResult.material_grade,
        manufacturing_process: analysisResult.manufacturing_process,
        dimensions_json:       analysisResult.dimensions_json,
        net_weight_g:          analysisResult.net_weight_g,
        surface_finish:        analysisResult.surface_finish,
        tolerance_class:       analysisResult.tolerance_class,
      })
      const quote = await api.quotes.create({ part_id: part.id, quote_type: 'individual' })
      context.setPartId(part.id)
      context.setQuotationId(quote.id)
      context.setDrawingAnalysis(analysisResult)
      toast.success('Drawing analysed! Moving to geometry review.')
      context.setStep(2)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create quote draft.')
    } finally {
      setIsCreating(false)
    }
  }

  const handleCreateManual = async () => {
    if (!selectedCommodity || !manualForm.name.trim()) { toast.error('Please enter a part name.'); return }
    setIsCreating(true)
    try {
      const part = await api.parts.create({
        part_name:             manualForm.name,
        part_number:           manualForm.part_number || undefined,
        commodity_type:        selectedCommodity,
        material_grade:        manualForm.material || undefined,
        manufacturing_process: manualForm.primary_process || undefined,
      })
      const quote = await api.quotes.create({ part_id: part.id, quote_type: 'individual' })
      context.setPartId(part.id)
      context.setQuotationId(quote.id)
      context.setStep(2)
      toast.success('Quote draft created!')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create quote draft.')
    } finally {
      setIsCreating(false)
    }
  }

  const is3D = file ? is3DFile(file.name) : false
  const TABS = [
    { id: 'upload' as const, label: 'Upload Drawing / 3D Model' },
    { id: 'manual' as const, label: 'Enter Manually' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#0f1729]">New Quote</h2>
        <p className="text-[#9aa3b2] mt-1">Upload an engineering drawing or 3D model, or enter part details manually.</p>
      </div>

      {/* Mode tabs */}
      <div className="flex border-b border-[#e5e8ef] relative">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setMode(tab.id)}
            className={cn(
              'relative px-6 py-3 text-sm font-medium transition-colors',
              mode === tab.id ? 'text-brand' : 'text-[#9aa3b2] hover:text-[#4a5568]',
            )}
          >
            {tab.label}
            {mode === tab.id && (
              <motion.div
                layoutId="step1-tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-full"
                transition={{ type: 'spring', stiffness: 380, damping: 35 }}
              />
            )}
          </button>
        ))}
      </div>

      {mode === 'upload' && (
        <div className="space-y-4">
          {/* Upload zone */}
          {!file && !isAnalysing && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all',
                isDragging ? 'border-brand bg-brand/5' : 'border-[#c8cdd8] hover:border-brand hover:bg-brand/5 bg-white',
              )}
            >
              <div className="flex items-center justify-center gap-4 mb-4">
                <Upload className="w-10 h-10 text-[#c8cdd8]" />
                <Box className="w-10 h-10 text-[#c8cdd8]" />
              </div>
              <p className="text-[#4a5568] font-medium mb-1">Drop your drawing or 3D model here</p>
              <p className="text-brand text-sm mb-3">or click to browse</p>
              <div className="flex flex-wrap justify-center gap-2 text-xs text-[#9aa3b2]">
                {['PDF', 'PNG', 'JPG', 'WEBP'].map(ext => (
                  <span key={ext} className="bg-surface-3 px-2 py-0.5 rounded">{ext}</span>
                ))}
                <span className="text-[#c8cdd8]">·</span>
                {['STEP', 'IGES', 'DXF'].map(ext => (
                  <span key={ext} className="bg-brand/10 text-brand px-2 py-0.5 rounded font-medium">{ext}</span>
                ))}
              </div>
              <p className="text-xs text-[#9aa3b2] mt-2">Max 50 MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_ATTR}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileChange(f) }}
                className="hidden"
              />
            </motion.div>
          )}

          {/* File selected */}
          {file && !isAnalysing && !analysisResult && (
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    {is3D ? (
                      <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0">
                        <Box className="w-5 h-5 text-brand" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-navy/10 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-navy" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-[#0f1729] truncate">{file.name}</p>
                        {is3D && (
                          <span className="flex-shrink-0 text-xs bg-brand/10 text-brand px-1.5 py-0.5 rounded font-medium">3D Model</span>
                        )}
                      </div>
                      <p className="text-sm text-[#9aa3b2]">{formatFileSize(file.size)}</p>
                    </div>
                    <button onClick={() => setFile(null)} className="p-1.5 rounded-lg hover:bg-surface-3 text-[#9aa3b2] transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {is3D && (
                    <div className="mb-4 p-3 bg-brand/5 rounded-lg border border-brand/15 text-sm text-[#4a5568]">
                      <span className="font-medium text-brand">3D Model detected.</span>{' '}
                      AI will extract geometry, tolerances, and process steps directly from the CAD file.
                    </div>
                  )}
                  <Button variant="primary" onClick={handleAnalyse} className="w-full" size="lg">
                    Analyse {is3D ? '3D Model' : 'Drawing'}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Loading state */}
          {isAnalysing && (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center">
                  {is3D ? <Box className="w-8 h-8 text-brand" /> : <FileText className="w-8 h-8 text-brand" />}
                </div>
                <div className="absolute inset-0 rounded-2xl ring-2 ring-brand ring-offset-2 animate-ping opacity-20" />
              </div>
              <p className="text-[#4a5568] font-medium">Analysing {is3D ? '3D model' : 'drawing'} with AI…</p>
              <p className="text-[#9aa3b2] text-sm">This may take a few seconds</p>
            </div>
          )}

          {/* Analysis result */}
          {analysisResult && !isAnalysing && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
                    <div>
                      <h3 className="text-xl font-bold text-[#0f1729]">{analysisResult.part_name}</h3>
                      {analysisResult.part_number && (
                        <p className="text-[#9aa3b2] text-sm mt-0.5">#{analysisResult.part_number}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-3 py-1 bg-navy text-white text-xs rounded-full font-medium">
                        {(analysisResult.commodity_type ? commodityLabels[analysisResult.commodity_type] : null) ?? analysisResult.commodity_type ?? '—'}
                      </span>
                      <span className={cn(
                        'px-3 py-1 text-xs rounded-full font-medium',
                        analysisResult.confidence_score >= 80 ? 'bg-green-50 text-green-700' :
                        analysisResult.confidence_score >= 60 ? 'bg-amber-50 text-amber-700' :
                        'bg-red-50 text-red-700',
                      )}>
                        {analysisResult.confidence_score}% confidence
                      </span>
                    </div>
                  </div>

                  {/* Confidence bar */}
                  <div className="mb-4">
                    <ProgressBar
                      value={analysisResult.confidence_score}
                      variant={analysisResult.confidence_score >= 80 ? 'success' : analysisResult.confidence_score >= 60 ? 'warning' : 'danger'}
                      size="sm"
                    />
                  </div>

                  <table className="w-full text-sm mb-4">
                    <tbody className="divide-y divide-[#e5e8ef]">
                      <tr>
                        <td className="py-2 text-[#9aa3b2] w-1/3">Material</td>
                        <td className="py-2 font-medium text-[#0f1729]">{analysisResult.material_grade || '—'}</td>
                      </tr>
                      <tr>
                        <td className="py-2 text-[#9aa3b2]">Primary Process</td>
                        <td className="py-2 font-medium text-[#0f1729]">{analysisResult.manufacturing_process || '—'}</td>
                      </tr>
                      <tr>
                        <td className="py-2 text-[#9aa3b2]">Dimensions</td>
                        <td className="py-2 font-medium text-[#0f1729] font-mono text-xs">{formatDimensions(analysisResult.dimensions_json)}</td>
                      </tr>
                      {analysisResult.surface_finish && (
                        <tr>
                          <td className="py-2 text-[#9aa3b2]">Surface Finish</td>
                          <td className="py-2 font-medium text-[#0f1729]">{analysisResult.surface_finish}</td>
                        </tr>
                      )}
                      {analysisResult.net_weight_g != null && (
                        <tr>
                          <td className="py-2 text-[#9aa3b2]">Weight</td>
                          <td className="py-2 font-medium text-[#0f1729] font-mono text-xs">{(analysisResult.net_weight_g / 1000).toFixed(3)} kg</td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {analysisResult.inferred_process_steps.length > 0 && (
                    <div className="mb-4">
                      <p className="text-sm font-semibold text-[#4a5568] mb-2">Process Steps</p>
                      <ol className="space-y-1.5">
                        {analysisResult.inferred_process_steps.map((step) => (
                          <li key={step.step_number} className="flex items-start gap-2 text-sm">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-navy text-white text-xs flex items-center justify-center mt-0.5 font-medium">
                              {step.step_number}
                            </span>
                            <span className="text-[#4a5568]">
                              <span className="font-medium text-[#0f1729]">{step.process_name}</span>
                              {step.machine_model && <span className="text-[#9aa3b2]"> — {step.machine_model}</span>}
                              {step.notes && <span className="text-[#9aa3b2] italic"> ({step.notes})</span>}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  <Button variant="primary" size="lg" onClick={handleCreateFromAnalysis} loading={isCreating} className="w-full">
                    Create Draft Quote
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      )}

      {mode === 'manual' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          <h3 className="text-lg font-semibold text-[#0f1729]">Select Commodity Type</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(commodityLabels).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSelectedCommodity(key)}
                className={cn(
                  'p-4 rounded-xl border-2 text-center transition-all hover:border-brand hover:bg-brand/5',
                  selectedCommodity === key ? 'border-brand bg-brand/5' : 'border-[#e5e8ef] bg-white',
                )}
              >
                <p className={cn('text-xs font-medium leading-tight', selectedCommodity === key ? 'text-brand' : 'text-[#4a5568]')}>
                  {label}
                </p>
                {selectedCommodity === key && (
                  <CheckCircle className="w-3.5 h-3.5 text-brand mx-auto mt-1.5" />
                )}
              </button>
            ))}
          </div>

          <AnimatePresence>
            {selectedCommodity && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
                <Card>
                  <CardContent className="pt-6 space-y-4">
                    <h4 className="font-semibold text-[#0f1729]">
                      {commodityLabels[selectedCommodity]} — Part Details
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={LABEL_CLS}>Part Name <span className="text-red-500">*</span></label>
                        <input type="text" value={manualForm.name}
                          onChange={(e) => setManualForm(f => ({ ...f, name: e.target.value }))}
                          placeholder="e.g. Bracket Assembly" className={INPUT_CLS} />
                      </div>
                      <div>
                        <label className={LABEL_CLS}>Part Number</label>
                        <input type="text" value={manualForm.part_number}
                          onChange={(e) => setManualForm(f => ({ ...f, part_number: e.target.value }))}
                          placeholder="e.g. PN-10042" className={INPUT_CLS} />
                      </div>
                      <div>
                        <label className={LABEL_CLS}>Material</label>
                        <input type="text" value={manualForm.material}
                          onChange={(e) => setManualForm(f => ({ ...f, material: e.target.value }))}
                          placeholder="e.g. Stainless Steel 304" className={INPUT_CLS} />
                      </div>
                      <div>
                        <label className={LABEL_CLS}>Primary Process</label>
                        <input type="text" value={manualForm.primary_process}
                          onChange={(e) => setManualForm(f => ({ ...f, primary_process: e.target.value }))}
                          placeholder="e.g. Laser Cutting" className={INPUT_CLS} />
                      </div>
                    </div>
                    <Button variant="primary" size="lg" onClick={handleCreateManual}
                      loading={isCreating} disabled={!manualForm.name.trim()} className="w-full">
                      Create Draft Quote
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  )
}
