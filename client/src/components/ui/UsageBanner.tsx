import { useState } from 'react'
import { X, AlertTriangle, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useSubscription } from '../../hooks/useSubscription'

const VELOCITY_THRESHOLD = 5 // days

export function UsageBanner() {
  const { usage, limits, plan, predictedDaysRemaining } = useSubscription()
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null
  if (plan !== 'free') return null

  const quotesLimit = limits.quotes_per_month
  if (!quotesLimit || quotesLimit === 0) return null

  const quotaHit = usage.quotes_used >= quotesLimit
  const quotaPct = usage.quotes_used / quotesLimit
  const approaching80 = quotaPct >= 0.8
  const velocityNudge = predictedDaysRemaining !== null && predictedDaysRemaining < VELOCITY_THRESHOLD

  if (!quotaHit && !approaching80 && !velocityNudge) return null

  const isUrgent = quotaHit || (predictedDaysRemaining !== null && predictedDaysRemaining <= 2)
  const pct = Math.round(quotaPct * 100)

  let message: string
  if (quotaHit) {
    message = `Quote limit reached (${usage.quotes_used}/${quotesLimit}). Upgrade to continue.`
  } else if (velocityNudge && !approaching80) {
    message = `At this pace you'll reach your ${quotesLimit}-quote limit in ~${predictedDaysRemaining} day${predictedDaysRemaining === 1 ? '' : 's'}.`
  } else {
    message = `You've used ${pct}% of your monthly quotes.`
  }

  return (
    <div className={`mx-6 mt-4 flex items-center gap-3 px-4 py-3 rounded-xl text-sm border ${
      isUrgent ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
    }`}>
      {isUrgent
        ? <Zap className="w-4 h-4 text-red-500 flex-shrink-0" />
        : <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
      }
      <p className={`flex-1 ${isUrgent ? 'text-red-800' : 'text-amber-800'}`}>
        {message}{' '}
        <Link to="/pricing" className="font-semibold hover:underline">
          Upgrade your plan
        </Link>
        {!quotaHit && ' to get more.'}
      </p>
      {!quotaHit && (
        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded hover:bg-black/5 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5 text-amber-500" />
        </button>
      )}
    </div>
  )
}
