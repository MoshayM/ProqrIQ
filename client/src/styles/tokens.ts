export const colors = {
  navy: { 50:'#f0f3f8', 700:'#1e2d4e', 800:'#162240' },
  brand: { 500:'#e85c1a', 600:'#d04f12' },
  tier: {
    1: { bg:'bg-green-100',  text:'text-green-800',  label:'KB' },
    2: { bg:'bg-blue-100',   text:'text-blue-800',   label:'User' },
    3: { bg:'bg-purple-100', text:'text-purple-800', label:'Std' },
    4: { bg:'bg-amber-100',  text:'text-amber-800',  label:'Bench' },
    5: { bg:'bg-red-100',    text:'text-red-800',    label:'Assumed' },
  },
  confidence: {
    high:   { bg:'bg-green-100', text:'text-green-800', range:'≥95%' },
    medium: { bg:'bg-amber-100', text:'text-amber-800', range:'70–94%' },
    low:    { bg:'bg-red-100',   text:'text-red-800',   range:'<70%' },
  },
  status: {
    draft:            'bg-gray-100 text-gray-700',
    in_review:        'bg-blue-100 text-blue-700',
    pending_approval: 'bg-amber-100 text-amber-700',
    approved:         'bg-green-100 text-green-700',
    archived:         'bg-red-100 text-red-700',
  },
}
export const font = { mono: 'font-mono text-sm tabular-nums' }
