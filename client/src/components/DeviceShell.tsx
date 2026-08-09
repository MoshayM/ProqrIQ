import React from 'react'

type DeviceType = 'mobile' | 'tablet' | 'desktop'

interface DeviceShellProps {
  type: DeviceType
  width: number
  height: number
  children: React.ReactNode
  scale?: number
}

function PhoneShell({ width, height, children, scale = 1 }: { width: number; height: number; children: React.ReactNode; scale?: number }) {
  const bezelH = 16
  const bezelV = 20
  const radius = 44
  const outer_w = width + bezelH * 2
  const outer_h = height + bezelV * 2
  // Unique mask id so multiple shells on the same page don't conflict
  const maskId = `phone-screen-mask-${width}-${height}`

  return (
    <div
      style={{
        width: outer_w * scale,
        height: outer_h * scale,
        transform: `scale(${scale})`,
        transformOrigin: 'top center',
        flexShrink: 0,
      }}
    >
      <div
        style={{ width: outer_w, height: outer_h, transformOrigin: 'top center' }}
        className="relative"
      >
        {/* iframe area — rendered first so SVG frame paints on top */}
        <div
          style={{
            position: 'absolute',
            top: bezelV,
            left: bezelH,
            width,
            height,
            overflow: 'hidden',
            borderRadius: 4,
            zIndex: 1,
          }}
        >
          {children}
        </div>

        {/* Phone frame SVG — sits on top, but the screen area is masked out
            so the iframe beneath shows through. */}
        <svg
          width={outer_w}
          height={outer_h}
          viewBox={`0 0 ${outer_w} ${outer_h}`}
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 2 }}
        >
          <defs>
            {/* White = visible, black = cut out (transparent) */}
            <mask id={maskId}>
              <rect x="0" y="0" width={outer_w} height={outer_h} fill="white" />
              <rect x={bezelH} y={bezelV} width={width} height={height} rx="4" ry="4" fill="black" />
            </mask>
          </defs>

          {/* Phone body — dark bezel only, screen area is transparent via mask */}
          <rect x="0" y="0" width={outer_w} height={outer_h} rx={radius} ry={radius}
            fill="#1e2d4e" mask={`url(#${maskId})`} />
          {/* Dynamic island */}
          <rect x={outer_w / 2 - 40} y="8" width="80" height="12" rx="6" ry="6"
            fill="#0a1120" />
          {/* Home indicator */}
          <rect x={outer_w / 2 - 50} y={outer_h - 10} width="100" height="4" rx="2" ry="2"
            fill="white" opacity="0.3" />
          {/* Side buttons */}
          <rect x="-3" y={outer_h * 0.3} width="3" height="32" rx="2" fill="#162040" />
          <rect x="-3" y={outer_h * 0.3 + 44} width="3" height="32" rx="2" fill="#162040" />
          <rect x={outer_w} y={outer_h * 0.38} width="3" height="52" rx="2" fill="#162040" />
        </svg>
      </div>
    </div>
  )
}

function TabletShell({ width, height, children, scale = 1 }: { width: number; height: number; children: React.ReactNode; scale?: number }) {
  const bezelH = 24
  const bezelV = 28
  const outer_w = width + bezelH * 2
  const outer_h = height + bezelV * 2
  const radius = 28
  const maskId = `tablet-screen-mask-${width}-${height}`

  return (
    <div
      style={{
        width: outer_w * scale,
        height: outer_h * scale,
        transform: `scale(${scale})`,
        transformOrigin: 'top center',
        flexShrink: 0,
      }}
    >
      <div style={{ width: outer_w, height: outer_h }} className="relative">
        {/* iframe area */}
        <div style={{ position: 'absolute', top: bezelV, left: bezelH, width, height, overflow: 'hidden', borderRadius: 4, zIndex: 1 }}>
          {children}
        </div>

        {/* Tablet frame SVG with transparent screen cutout */}
        <svg width={outer_w} height={outer_h} viewBox={`0 0 ${outer_w} ${outer_h}`}
          className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }}>
          <defs>
            <mask id={maskId}>
              <rect x="0" y="0" width={outer_w} height={outer_h} fill="white" />
              <rect x={bezelH} y={bezelV} width={width} height={height} rx="4" ry="4" fill="black" />
            </mask>
          </defs>
          <rect x="0" y="0" width={outer_w} height={outer_h} rx={radius} ry={radius}
            fill="#1e2d4e" mask={`url(#${maskId})`} />
          {/* Home button */}
          <circle cx={outer_w / 2} cy={outer_h - 14} r="6" fill="none" stroke="white" strokeOpacity="0.3" strokeWidth="1.5" />
          {/* Front camera */}
          <circle cx={outer_w / 2} cy="14" r="3" fill="#0a1120" />
        </svg>
      </div>
    </div>
  )
}

function DesktopShell({ width, height, children, scale = 1 }: { width: number; height: number; children: React.ReactNode; scale?: number }) {
  const chromeH = 36
  const outer_w = width
  const outer_h = height + chromeH

  return (
    <div
      style={{
        width: outer_w * scale,
        height: outer_h * scale,
        transform: `scale(${scale})`,
        transformOrigin: 'top center',
        flexShrink: 0,
      }}
    >
      <div style={{ width: outer_w, height: outer_h }} className="relative shadow-2xl rounded-xl overflow-hidden border border-[#e5e8ef]">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 px-4 bg-[#f1f3f7] border-b border-[#e5e8ef]" style={{ height: chromeH }}>
          <div className="w-3 h-3 rounded-full bg-[#ef4444]" />
          <div className="w-3 h-3 rounded-full bg-[#f59e0b]" />
          <div className="w-3 h-3 rounded-full bg-[#22c55e]" />
          <div className="flex-1 mx-3 h-6 rounded-full bg-white border border-[#e5e8ef] flex items-center px-3">
            <span className="text-[10px] text-[#9aa3b2] truncate">proqriq.vercel.app</span>
          </div>
        </div>
        {/* Content */}
        <div style={{ width, height, overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

export function DeviceShell({ type, width, height, children, scale = 1 }: DeviceShellProps) {
  if (type === 'mobile') return <PhoneShell width={width} height={height} scale={scale}>{children}</PhoneShell>
  if (type === 'tablet') return <TabletShell width={width} height={height} scale={scale}>{children}</TabletShell>
  return <DesktopShell width={width} height={height} scale={scale}>{children}</DesktopShell>
}
