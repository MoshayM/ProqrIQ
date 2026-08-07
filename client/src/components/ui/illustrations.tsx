// Unique per-context SVG illustrations for empty states (7D.8)

export function QuoteEmptyIllustration() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Shadow */}
      <ellipse cx="48" cy="86" rx="24" ry="4" fill="#e8ebf2" />
      {/* Document body */}
      <rect x="20" y="14" width="44" height="58" rx="6" fill="#f8f9fb" stroke="#e5e8ef" strokeWidth="1.5" />
      {/* Folded corner */}
      <path d="M50 14 L64 28 L50 28 Z" fill="#e5e8ef" />
      <path d="M50 14 L64 28" stroke="#d0d5df" strokeWidth="1.5" />
      {/* Lines */}
      <rect x="28" y="36" width="28" height="3" rx="1.5" fill="#e0e3ea" />
      <rect x="28" y="44" width="20" height="3" rx="1.5" fill="#e0e3ea" />
      <rect x="28" y="52" width="24" height="3" rx="1.5" fill="#e0e3ea" />
      {/* AI sparkle badge */}
      <circle cx="68" cy="26" r="12" fill="#1e2d4e" />
      <path d="M68 20 L69.2 24.8 L74 26 L69.2 27.2 L68 32 L66.8 27.2 L62 26 L66.8 24.8 Z" fill="#e85c1a" />
      <circle cx="74" cy="19" r="2.5" fill="#e85c1a" opacity="0.5" />
      <circle cx="62" cy="33" r="1.5" fill="#e85c1a" opacity="0.4" />
    </svg>
  )
}

export function SupplierEmptyIllustration() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Globe outline */}
      <circle cx="48" cy="50" r="30" stroke="#e5e8ef" strokeWidth="1.5" fill="#f8f9fb" />
      {/* Latitude lines */}
      <ellipse cx="48" cy="50" rx="16" ry="30" stroke="#e5e8ef" strokeWidth="1" fill="none" />
      <path d="M19 50 Q48 38 77 50" stroke="#e5e8ef" strokeWidth="1" fill="none" />
      <path d="M19 50 Q48 62 77 50" stroke="#e5e8ef" strokeWidth="1" fill="none" />
      {/* Map pin */}
      <path d="M48 14 C42 14 36 19.5 36 26 C36 35 48 46 48 46 C48 46 60 35 60 26 C60 19.5 54 14 48 14Z" fill="#e85c1a" />
      <circle cx="48" cy="26" r="5" fill="white" />
    </svg>
  )
}

export function NotificationsEmptyIllustration() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Bell */}
      <path d="M48 16 C38 16 30 24 30 36 L30 54 L22 62 L74 62 L66 54 L66 36 C66 24 58 16 48 16 Z" fill="#e8ebf2" stroke="#d0d5df" strokeWidth="1.5" />
      <path d="M42 62 C42 65.3 44.7 68 48 68 C51.3 68 54 65.3 54 62" stroke="#c8cdd8" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* Zzz sleeping text */}
      <text x="58" y="34" fill="#c8cdd8" fontSize="10" fontWeight="700" fontFamily="system-ui">z</text>
      <text x="64" y="26" fill="#c8cdd8" fontSize="8" fontWeight="700" fontFamily="system-ui">z</text>
      <text x="69" y="19" fill="#c8cdd8" fontSize="6" fontWeight="700" fontFamily="system-ui">z</text>
      {/* Moon */}
      <path d="M30 28 C30 22 35 18 40 18 C36 21 34 26 35 31 C29 30 30 28 30 28Z" fill="#c8cdd8" />
    </svg>
  )
}

export function BatchEmptyIllustration() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Table/grid outline */}
      <rect x="14" y="22" width="54" height="52" rx="6" fill="#f8f9fb" stroke="#e5e8ef" strokeWidth="1.5" />
      {/* Header row */}
      <rect x="14" y="22" width="54" height="14" rx="6" fill="#e8ebf2" />
      <rect x="20" y="27" width="16" height="4" rx="2" fill="#c8cdd8" />
      <rect x="42" y="27" width="10" height="4" rx="2" fill="#c8cdd8" />
      {/* Empty rows */}
      <rect x="20" y="44" width="28" height="3" rx="1.5" fill="#f0f1f5" />
      <rect x="20" y="53" width="22" height="3" rx="1.5" fill="#f0f1f5" />
      <rect x="20" y="62" width="26" height="3" rx="1.5" fill="#f0f1f5" />
      {/* Upload/plus badge */}
      <circle cx="74" cy="26" r="12" fill="#1e2d4e" />
      <line x1="74" y1="20" x2="74" y2="32" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="68" y1="26" x2="80" y2="26" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export function KBDocEmptyIllustration() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Open book */}
      <path d="M48 24 L20 30 L20 72 L48 66 Z" fill="#f0f1f5" stroke="#e5e8ef" strokeWidth="1.5" />
      <path d="M48 24 L76 30 L76 72 L48 66 Z" fill="#e8ebf2" stroke="#e5e8ef" strokeWidth="1.5" />
      {/* Book spine */}
      <line x1="48" y1="24" x2="48" y2="66" stroke="#d0d5df" strokeWidth="1.5" />
      {/* Lines on left page */}
      <line x1="28" y1="40" x2="44" y2="38" stroke="#c8cdd8" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="28" y1="48" x2="44" y2="46" stroke="#c8cdd8" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="28" y1="56" x2="38" y2="55" stroke="#c8cdd8" strokeWidth="1.5" strokeLinecap="round" />
      {/* Upload arrow badge */}
      <circle cx="72" cy="22" r="13" fill="#e85c1a" />
      <path d="M72 29 L72 17" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <path d="M67 22 L72 17 L77 22" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function KBEntryEmptyIllustration() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Database cylinder */}
      <ellipse cx="48" cy="26" rx="24" ry="8" fill="#e8ebf2" stroke="#d0d5df" strokeWidth="1.5" />
      <rect x="24" y="26" width="48" height="28" fill="#f0f1f5" />
      <ellipse cx="48" cy="54" rx="24" ry="8" fill="#e8ebf2" stroke="#d0d5df" strokeWidth="1.5" />
      <line x1="24" y1="36" x2="72" y2="36" stroke="#d0d5df" strokeWidth="1" />
      <line x1="24" y1="44" x2="72" y2="44" stroke="#d0d5df" strokeWidth="1" />
      <rect x="24" y="26" width="48" height="28" stroke="#d0d5df" strokeWidth="1.5" fill="none" />
      {/* Plus badge */}
      <circle cx="72" cy="22" r="12" fill="#1e2d4e" />
      <line x1="72" y1="16" x2="72" y2="28" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="66" y1="22" x2="78" y2="22" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export function AssemblyEmptyIllustration() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Root node */}
      <rect x="34" y="10" width="28" height="18" rx="5" fill="#1e2d4e" />
      <rect x="39" y="15" width="18" height="3" rx="1.5" fill="white" opacity="0.5" />
      <rect x="39" y="20" width="12" height="3" rx="1.5" fill="white" opacity="0.3" />
      {/* Connector lines */}
      <line x1="48" y1="28" x2="48" y2="38" stroke="#c8cdd8" strokeWidth="1.5" />
      <line x1="22" y1="38" x2="74" y2="38" stroke="#c8cdd8" strokeWidth="1.5" />
      <line x1="22" y1="38" x2="22" y2="48" stroke="#c8cdd8" strokeWidth="1.5" />
      <line x1="48" y1="38" x2="48" y2="48" stroke="#c8cdd8" strokeWidth="1.5" />
      <line x1="74" y1="38" x2="74" y2="48" stroke="#c8cdd8" strokeWidth="1.5" />
      {/* Child nodes */}
      <rect x="8" y="48" width="28" height="16" rx="4" fill="#e8ebf2" stroke="#d0d5df" strokeWidth="1.5" />
      <rect x="34" y="48" width="28" height="16" rx="4" fill="#e8ebf2" stroke="#d0d5df" strokeWidth="1.5" />
      <rect x="60" y="48" width="28" height="16" rx="4" fill="#e8ebf2" stroke="#d0d5df" strokeWidth="1.5" />
      {/* Lines in child nodes */}
      <rect x="13" y="53" width="18" height="2.5" rx="1.25" fill="#c8cdd8" />
      <rect x="13" y="58" width="12" height="2.5" rx="1.25" fill="#c8cdd8" />
      <rect x="39" y="53" width="18" height="2.5" rx="1.25" fill="#c8cdd8" />
      <rect x="39" y="58" width="12" height="2.5" rx="1.25" fill="#c8cdd8" />
      <rect x="65" y="53" width="18" height="2.5" rx="1.25" fill="#c8cdd8" />
      <rect x="65" y="58" width="12" height="2.5" rx="1.25" fill="#c8cdd8" />
      {/* Dashed add hints */}
      <rect x="8" y="72" width="28" height="14" rx="4" fill="none" stroke="#e5e8ef" strokeWidth="1.5" strokeDasharray="3 2" />
      <line x1="16" y1="79" x2="28" y2="79" stroke="#e5e8ef" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="22" y1="73" x2="22" y2="85" stroke="#e5e8ef" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function ComponentsEmptyIllustration() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Puzzle piece style */}
      <rect x="14" y="14" width="32" height="32" rx="5" fill="#e8ebf2" stroke="#d0d5df" strokeWidth="1.5" />
      <rect x="50" y="14" width="32" height="32" rx="5" fill="#e8ebf2" stroke="#d0d5df" strokeWidth="1.5" />
      <rect x="14" y="50" width="32" height="32" rx="5" fill="#e8ebf2" stroke="#d0d5df" strokeWidth="1.5" />
      {/* Empty dashed placeholder */}
      <rect x="50" y="50" width="32" height="32" rx="5" fill="none" stroke="#e85c1a" strokeWidth="1.5" strokeDasharray="4 2" />
      <line x1="60" y1="66" x2="72" y2="66" stroke="#e85c1a" strokeWidth="2" strokeLinecap="round" />
      <line x1="66" y1="60" x2="66" y2="72" stroke="#e85c1a" strokeWidth="2" strokeLinecap="round" />
      {/* Content hint lines */}
      <rect x="20" y="22" width="20" height="3" rx="1.5" fill="#c8cdd8" />
      <rect x="20" y="28" width="14" height="3" rx="1.5" fill="#c8cdd8" />
      <rect x="56" y="22" width="20" height="3" rx="1.5" fill="#c8cdd8" />
      <rect x="56" y="28" width="14" height="3" rx="1.5" fill="#c8cdd8" />
      <rect x="20" y="58" width="20" height="3" rx="1.5" fill="#c8cdd8" />
      <rect x="20" y="64" width="14" height="3" rx="1.5" fill="#c8cdd8" />
    </svg>
  )
}

export function AssemblyOpsEmptyIllustration() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Gear/cog */}
      <circle cx="40" cy="44" r="16" fill="#f0f1f5" stroke="#e5e8ef" strokeWidth="1.5" />
      <circle cx="40" cy="44" r="8" fill="#e8ebf2" stroke="#d0d5df" strokeWidth="1.5" />
      {/* Gear teeth */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
        const rad = (deg * Math.PI) / 180
        const x1 = 40 + 16 * Math.cos(rad)
        const y1 = 44 + 16 * Math.sin(rad)
        const x2 = 40 + 20 * Math.cos(rad)
        const y2 = 44 + 20 * Math.sin(rad)
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#c8cdd8" strokeWidth="3" strokeLinecap="round" />
      })}
      {/* AI sparkle badge */}
      <circle cx="64" cy="28" r="14" fill="#1e2d4e" />
      <path d="M64 21 L65.4 26.6 L71 28 L65.4 29.4 L64 35 L62.6 29.4 L57 28 L62.6 26.6 Z" fill="#e85c1a" />
    </svg>
  )
}
