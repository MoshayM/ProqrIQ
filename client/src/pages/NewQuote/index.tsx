import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useQuoteContext, QuoteProvider } from '../../contexts/QuoteContext';
import { Button } from '../../components/ui/button';
import Step1 from './steps/Step1';
import Step2 from './steps/Step2';
import Step3 from './steps/Step3';
import Step4 from './steps/Step4';
import Step5 from './steps/Step5';
import Step6 from './steps/Step6';

const STEPS = [
  { number: 1, label: 'Drawing' },
  { number: 2, label: 'Geometry' },
  { number: 3, label: 'Production' },
  { number: 4, label: 'Estimate' },
  { number: 5, label: 'Assumptions' },
  { number: 6, label: 'Review' },
];

function NewQuoteInner() {
  const { currentStep, setStep } = useQuoteContext();
  const navigate = useNavigate();

  const renderStep = () => {
    switch (currentStep) {
      case 1: return <Step1 />;
      case 2: return <Step2 />;
      case 3: return <Step3 />;
      case 4: return <Step4 />;
      case 5: return <Step5 />;
      case 6: return <Step6 />;
      default: return <Step1 />;
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen pb-24">
      {/* Top stepper bar */}
      <div className="bg-white border-b px-8 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center">
            {STEPS.map((step, index) => {
              const isCompleted = step.number < currentStep;
              const isActive = step.number === currentStep;
              const isFuture = step.number > currentStep;

              return (
                <React.Fragment key={step.number}>
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all
                        ${isCompleted ? 'bg-[#1e2d4e] text-white' : ''}
                        ${isActive ? 'border-2 border-[#e85c1a] bg-[#e85c1a] text-white' : ''}
                        ${isFuture ? 'border-2 border-gray-300 bg-white text-gray-400' : ''}
                      `}
                    >
                      {isCompleted ? <Check className="w-4 h-4" /> : step.number}
                    </div>
                    <span
                      className={`mt-1.5 text-xs whitespace-nowrap
                        ${isActive ? 'text-[#e85c1a] font-semibold' : ''}
                        ${isCompleted ? 'text-[#1e2d4e]' : ''}
                        ${isFuture ? 'text-gray-400' : ''}
                      `}
                    >
                      {step.label}
                    </span>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-2 mb-5 transition-all
                        ${step.number < currentStep ? 'bg-[#1e2d4e]' : 'bg-gray-200'}
                      `}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {renderStep()}
      </div>

      {/* Bottom nav bar */}
      <div className="fixed bottom-0 w-full bg-white border-t px-8 py-4 flex justify-between items-center z-10">
        <Button
          variant="outline"
          onClick={() => setStep((currentStep - 1) as 1 | 2 | 3 | 4 | 5 | 6)}
          disabled={currentStep === 1}
          className="disabled:opacity-40"
        >
          Back
        </Button>
        <span className="text-sm text-gray-500">Step {currentStep} of 6</span>
      </div>
    </div>
  );
}

export default function NewQuote() {
  return (
    <QuoteProvider>
      <NewQuoteInner />
    </QuoteProvider>
  );
}
