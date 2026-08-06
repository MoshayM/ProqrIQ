import React, {
  createContext,
  useCallback,
  useContext,
  useState,
} from 'react'
import type { DrawingAnalysisResult, CostEstimateResult } from '@shared/types'

// ─── Step type ───────────────────────────────────────────────────────────────

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6
// Step 1 — Upload / Drawing
// Step 2 — Geometry Review
// Step 3 — Production Params
// Step 4 — AI Estimate
// Step 5 — Assumptions
// Step 6 — Review / Submit

// ─── Production params shape ─────────────────────────────────────────────────

export interface ProductionParams {
  supplier_country: string
  supplier_currency: string
  annual_volume: number
  lot_size: number
  lots_per_year: number
  shifts_per_day: number
  annual_production_hours: number
  procurement_type: string
  current_cart_price: number | null
  target_cart_price: number | null
}

// ─── Context shape ───────────────────────────────────────────────────────────

interface QuoteContextValue {
  // State
  currentStep: WizardStep
  quotationId: string | null
  partId: string | null
  drawingAnalysis: DrawingAnalysisResult | null
  drawingFile: File | null
  productionParams: Partial<ProductionParams>
  costEstimate: CostEstimateResult | null
  isLoading: boolean
  error: string | null

  // Actions
  setStep: (step: WizardStep) => void
  setQuotationId: (id: string | null) => void
  setPartId: (id: string | null) => void
  setDrawingAnalysis: (result: DrawingAnalysisResult | null) => void
  setDrawingFile: (file: File | null) => void
  setProductionParams: (params: Partial<ProductionParams>) => void
  setCostEstimate: (result: CostEstimateResult | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  resetWizard: () => void
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const defaultProductionParams: Partial<ProductionParams> = {}

const defaultState = {
  currentStep: 1 as WizardStep,
  quotationId: null,
  partId: null,
  drawingAnalysis: null,
  drawingFile: null,
  productionParams: defaultProductionParams,
  costEstimate: null,
  isLoading: false,
  error: null,
}

// ─── Context ─────────────────────────────────────────────────────────────────

const QuoteContext = createContext<QuoteContextValue | null>(null)

// ─── Provider ────────────────────────────────────────────────────────────────

export function QuoteProvider({ children }: { children: React.ReactNode }) {
  const [currentStep, setCurrentStep] = useState<WizardStep>(1)
  const [quotationId, setQuotationIdState] = useState<string | null>(null)
  const [partId, setPartIdState] = useState<string | null>(null)
  const [drawingAnalysis, setDrawingAnalysisState] =
    useState<DrawingAnalysisResult | null>(null)
  const [drawingFile, setDrawingFileState] = useState<File | null>(null)
  const [productionParams, setProductionParamsState] =
    useState<Partial<ProductionParams>>(defaultProductionParams)
  const [costEstimate, setCostEstimateState] =
    useState<CostEstimateResult | null>(null)
  const [isLoading, setIsLoadingState] = useState(false)
  const [error, setErrorState] = useState<string | null>(null)

  const setStep = useCallback((step: WizardStep) => setCurrentStep(step), [])
  const setQuotationId = useCallback((id: string | null) => setQuotationIdState(id), [])
  const setPartId = useCallback((id: string | null) => setPartIdState(id), [])
  const setDrawingAnalysis = useCallback(
    (result: DrawingAnalysisResult | null) => setDrawingAnalysisState(result),
    [],
  )
  const setDrawingFile = useCallback((file: File | null) => setDrawingFileState(file), [])
  const setProductionParams = useCallback(
    (params: Partial<ProductionParams>) =>
      setProductionParamsState((prev) => ({ ...prev, ...params })),
    [],
  )
  const setCostEstimate = useCallback(
    (result: CostEstimateResult | null) => setCostEstimateState(result),
    [],
  )
  const setLoading = useCallback((loading: boolean) => setIsLoadingState(loading), [])
  const setError = useCallback((err: string | null) => setErrorState(err), [])

  const resetWizard = useCallback(() => {
    setCurrentStep(defaultState.currentStep)
    setQuotationIdState(defaultState.quotationId)
    setPartIdState(defaultState.partId)
    setDrawingAnalysisState(defaultState.drawingAnalysis)
    setDrawingFileState(defaultState.drawingFile)
    setProductionParamsState(defaultState.productionParams)
    setCostEstimateState(defaultState.costEstimate)
    setIsLoadingState(defaultState.isLoading)
    setErrorState(defaultState.error)
  }, [])

  return (
    <QuoteContext.Provider
      value={{
        currentStep,
        quotationId,
        partId,
        drawingAnalysis,
        drawingFile,
        productionParams,
        costEstimate,
        isLoading,
        error,
        setStep,
        setQuotationId,
        setPartId,
        setDrawingAnalysis,
        setDrawingFile,
        setProductionParams,
        setCostEstimate,
        setLoading,
        setError,
        resetWizard,
      }}
    >
      {children}
    </QuoteContext.Provider>
  )
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useQuote(): QuoteContextValue {
  const ctx = useContext(QuoteContext)
  if (!ctx) throw new Error('useQuote must be used inside <QuoteProvider>')
  return ctx
}

// Alias used by wizard steps
export const useQuoteContext = useQuote
