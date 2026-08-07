import React from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { cn } from '../../lib/utils'

// Fix default marker icon path broken by Vite bundling
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

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

export default function MapView({ pins, onPinClick }: MapViewProps) {
  return (
    <MapContainer
      center={[30, 15]}
      zoom={2}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom={false}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
      />
      {pins.map((pin) => (
        <CircleMarker
          key={pin.code}
          center={pin.coords}
          radius={pin.selected ? 14 : 10}
          pathOptions={{
            fillColor:   pin.selected ? '#e85c1a' : '#1e2d4e',
            fillOpacity: pin.selected ? 0.9 : 0.75,
            color:       pin.selected ? '#e85c1a' : '#1e2d4e',
            weight:      pin.selected ? 2 : 1,
          }}
          eventHandlers={{ click: () => onPinClick(pin.code) }}
        >
          <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
            <div className="text-xs">
              <p className="font-semibold">{pin.label}</p>
              {pin.supplier && (
                <>
                  <p>{pin.supplier.name}</p>
                  <p className="text-[#9aa3b2]">{pin.supplier.specialisation} · {pin.supplier.estimated_lead_time_days}d</p>
                </>
              )}
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
