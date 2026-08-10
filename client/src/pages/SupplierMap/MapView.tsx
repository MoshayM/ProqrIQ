import React, { useRef, useEffect } from 'react'
import L from 'leaflet'

interface Pin {
  code:     string
  coords:   [number, number]
  label:    string
  supplier: { name: string; specialisation: string; estimated_lead_time_days: number } | null
  selected: boolean
}

interface MapViewProps {
  pins:       Pin[]
  onPinClick: (code: string) => void
}

// Pure-Leaflet map — avoids react-leaflet v5's React 18 incompatibility
// ("r is not a function" in production Vite builds).
export default function MapView({ pins, onPinClick }: MapViewProps) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<L.Map | null>(null)
  const markersRef    = useRef<L.CircleMarker[]>([])
  const callbackRef   = useRef(onPinClick)

  // Keep callback ref in sync so the click handlers don't go stale
  useEffect(() => { callbackRef.current = onPinClick }, [onPinClick])

  // Initialise map once on mount
  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return

    const map = L.map(el, {
      center:           [30, 15],
      zoom:             2,
      scrollWheelZoom:  false,
      attributionControl: false,
      zoomControl:      true,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      markersRef.current = []
    }
  }, [])

  // Redraw markers whenever pins change
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    pins.forEach(pin => {
      const marker = L.circleMarker(pin.coords, {
        radius:      pin.selected ? 14 : 10,
        fillColor:   pin.selected ? '#e85c1a' : '#1e2d4e',
        fillOpacity: pin.selected ? 0.9 : 0.75,
        color:       pin.selected ? '#e85c1a' : '#1e2d4e',
        weight:      pin.selected ? 2 : 1,
        interactive: true,
      })

      const tooltipHtml = pin.supplier
        ? `<div style="font-size:11px;line-height:1.4"><strong>${pin.label}</strong></div>`
        : `<div style="font-size:11px"><strong>${pin.label}</strong></div>`

      marker.bindTooltip(tooltipHtml, { direction: 'top', offset: [0, -8], opacity: 0.95 })
      marker.on('click', () => callbackRef.current(pin.code))
      marker.addTo(map)
      markersRef.current.push(marker)
    })
  }, [pins])

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
}
