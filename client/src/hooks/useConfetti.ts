import { useCallback } from 'react'

export function useConfetti() {
  const burst = useCallback(async () => {
    const confetti = (await import('canvas-confetti')).default
    const end = Date.now() + 2000
    const colors = ['#e85c1a', '#1e2d4e', '#22c55e', '#f59e0b', '#ffffff']

    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.6 },
        colors,
      })
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.6 },
        colors,
      })
      if (Date.now() < end) requestAnimationFrame(frame)
    }
    frame()
  }, [])

  return burst
}
