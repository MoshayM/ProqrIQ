import React from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ChevronLeft } from 'lucide-react'
import { useQuoteContext, QuoteProvider } from '../../contexts/QuoteContext'
import { Button } from '../../components/ui/button'
import { Logo } from '../../components/ui/logo'
import Step1 from './steps/Step1'
import Step2 from './steps/Step2'
import Step3 from './steps/Step3'
import Step4 from './steps/Step4'
import Step5 from './steps/Step5'
import Step6 from './steps/Step6'
import { cn } from '../../lib/utils'

const STEPS = [
  { number: 1, label: 'Drawing' },
  { number: 2, label: 'Geometry' },
  { number: 3, label: 'Production' },
  { number: 4, label: 'Estimate' },
  { number: 5, label: 'Assumptions' },
  { number: 6, label: 'Review' },
]

function NewQuoteInner() {
  const { currentStep, setStep } = useQuoteContext()
  const navigate = useNavigate()

  const renderStep = () => {
    switch (currentStep) {
      case 1: return <Step1 />
      case 2: return <Step2 />
      case 3: return <Step3 />
      case 4: return <Step4 />
      case 5: return <Step5 />
      case 6: return <Step6 />
      default: return <Step1 />
    }
  }

  const progress = ((currentStep - 1) / (STEPS.length - 1)) * 100

  return (
    <div className="min-h-screen bg-surface-2 pb-24">
      {/* Top stepper bar */}
      <div className="bg-white border-b border-[#e5e8ef] shadow-xs sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-8 py-4">
          {/* Brand + progress label row */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/quotes')}
                className="p-1.5 rounded-lg hover:bg-surface-3 text-[#9aa3b2] hover:text-[#4a5568] transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <Logo size="sm" />
            </div>
            <span className="text-sm text-[#9aa3b2] font-medium">
              Step {currentStep} of {STEPS.length}
            </span>
          </div>

          {/* Step indicators */}
          <div className="flex items-center">
            {STEPS.map((step, index) => {
              const isCompleted = step.number < currentStep
              const isActive    = step.number === currentStep
              const isFuture    = step.number > currentStep

              return (
                <React.Fragment key={step.number}>
                  <div className="flex flex-col items-center">
                    <motion.div
                      animate={{
                        scale: isActive ? 1.1 : 1,
                        backgroundColor: isCompleted ? '#1e2d4e' : isActive ? '#e85c1a' : '#f1f3f7',
                        borderColor: isCompleted ? '#1e2d4e' : isActive ? '#e85c1a' : '#e5e8ef',
                      }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors',
                        isFuture && 'text-[#9aa3b2]',
                        (isCompleted || isActive) && 'text-white',
                      )}
                    >
                      {isCompleted ? (
                        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500 }}>
                          <Check className="w-3.5 h-3.5" />
                        </motion.span>
                      ) : step.number}
                    </motion.div>
                    <span className={cn(
                      'mt-1.5 text-xs whitespace-nowrap font-medium',
                      isActive    && 'text-brand',
                      isCompleted && 'text-navy',
                      isFuture    && 'text-[#9aa3b2]',
                    )}>
                      {step.label}
                    </span>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div className="flex-1 mx-2 mb-5 h-0.5 rounded-full overflow-hidden bg-[#e5e8ef]">
                      <motion.div
                        className="h-full bg-navy rounded-full"
                        animate={{ width: step.number < currentStep ? '100%' : '0%' }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                      />
                    </div>
                  )}
                </React.Fragment>
              )
            })}
          </div>

          {/* Overall progress bar */}
          <div className="mt-3 h-1 rounded-full bg-[#e5e8ef] overflow-hidden">
            <motion.div
              className="h-full bg-brand rounded-full"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom nav bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#e5e8ef] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] px-8 py-4 flex justify-between items-center z-20">
        <Button
          variant="secondary"
          onClick={() => setStep((currentStep - 1) as 1 | 2 | 3 | 4 | 5 | 6)}
          disabled={currentStep === 1}
          iconLeft={<ChevronLeft className="w-4 h-4" />}
        >
          Back
        </Button>
        <div className="flex items-center gap-2">
          {STEPS.map(s => (
            <div
              key={s.number}
              className={cn(
                'w-1.5 h-1.5 rounded-full transition-all duration-300',
                s.number < currentStep ? 'bg-navy' : s.number === currentStep ? 'bg-brand w-4' : 'bg-[#e5e8ef]',
              )}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function NewQuote() {
  return (
    <QuoteProvider>
      <NewQuoteInner />
    </QuoteProvider>
  )
}
