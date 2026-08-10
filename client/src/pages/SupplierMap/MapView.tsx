import React, { useRef, useEffect } from 'react'
import L from 'leaflet'

export type TileStyle = 'light' | 'dark' | 'satellite'

interface Pin {
  code:     string
  coords:   [number, number]
  label:    string
  supplier: { name: string; specialisation: string; estimated_lead_time_days: number } | null
  selected: boolean
}

interface MapViewProps {
  pins:            Pin[]
  onPinClick:      (code: string) => void
  tileStyle?:      TileStyle
  scrollWheelZoom?: boolean
}

const TILE_URLS: Record<TileStyle, string> = {
  light:     'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark:      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
}

// Pure-Leaflet map — avoids react-leaflet v5's React 18 incompatibility.
export default function MapView({ pins, onPinClick, tileStyle = 'light', scrollWheelZoom = false }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<L.Map | null>(null)
  const markersRef   = useRef<L.CircleMarker[]>([])
  const tileRef      = useRef<L.TileLayer | null>(null)
  const callbackRef  = useRef(onPinClick)

  useEffect(() => { callbackRef.current = onPinClick }, [onPinClick])

  // Initialise map once
  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return

    const map = L.map(el, {
      center:             [30, 15],
      zoom:               2,
      scrollWheelZoom:    false,
      attributionControl: false,
      zoomControl:        true,
    })

    const tile = L.tileLayer(TILE_URLS.light, {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    }).addTo(map)

    tileRef.current  = tile
    mapRef.current   = map

    return () => {
      map.remove()
      mapRef.current  = null
      tileRef.current = null
      markersRef.current = []
    }
  }, [])

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
    if (!map) return

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    pins.forEach(pin => {
      const isSelected = pin.selected
      const marker = L.circleMarker(pin.coords, {
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
