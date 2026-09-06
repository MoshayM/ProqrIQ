import React, { useRef, useEffect } from 'react'
import type { Map as LMap, TileLayer, CircleMarker } from 'leaflet'

export type TileStyle = 'light' | 'dark' | 'satellite'

interface Pin {
  code:     string
  coords:   [number, number]
  label:    string
  supplier: { name: string; specialisation: string; estimated_lead_time_days: number } | null
  selected: boolean
}

interface MapViewProps {
  pins:             Pin[]
  onPinClick:       (code: string) => void
  tileStyle?:       TileStyle
  scrollWheelZoom?: boolean
}

const TILE_URLS: Record<TileStyle, string> = {
  light:     'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  dark:      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
}

// Pure-Leaflet map — avoids react-leaflet v5's React 18 incompatibility.
// Leaflet is imported dynamically inside useEffect to avoid the "r is not a
// function" module-evaluation error in Vite production builds.
export default function MapView({ pins, onPinClick, tileStyle = 'light', scrollWheelZoom = false }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<LMap | null>(null)
  const markersRef   = useRef<CircleMarker[]>([])
  const tileRef      = useRef<TileLayer | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef         = useRef<any>(null)
  const callbackRef  = useRef(onPinClick)

  useEffect(() => { callbackRef.current = onPinClick }, [onPinClick])

  // Initialise map once — dynamic import keeps Leaflet out of the module
  // evaluation critical path so it never throws before the DOM is ready.
  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return

    let active = true
    import('leaflet').then(({ default: L }) => {
      if (!active || !el || mapRef.current) return

      LRef.current = L

      const map = L.map(el, {
        center:             [30, 15],
        zoom:               2,
        scrollWheelZoom:    false,
        attributionControl: false,
        zoomControl:        true,
      })

      const tile = L.tileLayer(TILE_URLS[tileStyle], {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map)

      tileRef.current = tile
      mapRef.current  = map
    }).catch(() => { /* Leaflet unavailable — error boundary handles the UI */ })

    return () => {
      active = false
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current     = null
        tileRef.current    = null
        LRef.current       = null
        markersRef.current = []
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Swap tile layer when style changes
  useEffect(() => {
    if (!tileRef.current) return
    tileRef.current.setUrl(TILE_URLS[tileStyle])
  }, [tileStyle])

  // Toggle scroll-wheel zoom
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (scrollWheelZoom) map.scrollWheelZoom.enable()
    else map.scrollWheelZoom.disable()
  }, [scrollWheelZoom])

  // Redraw markers whenever pins change
  useEffect(() => {
    const map = mapRef.current
    const L   = LRef.current
    if (!map || !L) return

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    pins.forEach(pin => {
      const isSelected = pin.selected
      const marker: CircleMarker = L.circleMarker(pin.coords, {
        radius:      isSelected ? 14 : 9,
        fillColor:   isSelected ? '#e85c1a' : '#1e2d4e',
        fillOpacity: isSelected ? 0.95 : 0.72,
        color:       '#fff',
        weight:      isSelected ? 2.5 : 1.5,
        interactive: true,
      })

      marker.bindTooltip(
        `<div style="font-size:11px;line-height:1.4"><strong>${pin.label}</strong></div>`,
        { direction: 'top', offset: [0, -8], opacity: 0.97 }
      )
      marker.on('click', () => callbackRef.current(pin.code))
      marker.addTo(map)
      markersRef.current.push(marker)
    })
  }, [pins])

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
}
