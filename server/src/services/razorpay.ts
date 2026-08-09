import Razorpay from 'razorpay'
import crypto from 'crypto'

export function isRazorpayConfigured(): boolean {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
}

export function getRazorpayClient(): Razorpay {
  const key_id     = process.env.RAZORPAY_KEY_ID
  const key_secret = process.env.RAZORPAY_KEY_SECRET
  if (!key_id || !key_secret) throw new Error('Razorpay not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET')
  return new Razorpay({ key_id, key_secret })
}

// Verify payment signature after client-side checkout completes
export function verifyPaymentSignature(paymentId: string, subscriptionId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET
  if (!secret) return false
  const expected = crypto.createHmac('sha256', secret)
    .update(`${paymentId}|${subscriptionId}`)
    .digest('hex')
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

// Verify webhook signature
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}
