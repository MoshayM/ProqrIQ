import { useEffect } from 'react'

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} — ProqrIQ` : 'ProqrIQ'
    return () => { document.title = 'ProqrIQ' }
  }, [title])
}
