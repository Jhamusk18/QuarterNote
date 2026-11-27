export function LogoTile({ size = 44, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-label="QuarterNote logo">
      <defs>
        <linearGradient id="fn-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0FA36F" />
          <stop offset="1" stopColor="#075B43" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#fn-g)" />
      <text x="9" y="30" fontFamily="Inter, Arial" fontWeight="900" fontSize="22" fill="#fff" letterSpacing="-0.5">QN</text>
      <path d="M10 42 C 26 40, 40 34, 54 18" stroke="#3BE39A" strokeWidth="3" fill="none" strokeLinecap="round" />
      <g fill="#3BE39A">
        <rect x="12" y="47" width="6" height="7" rx="1" />
        <rect x="21" y="44" width="6" height="10" rx="1" />
        <rect x="30" y="40" width="6" height="14" rx="1" />
        <rect x="39" y="34" width="6" height="20" rx="1" />
        <rect x="48" y="27" width="6" height="27" rx="1" />
      </g>
    </svg>
  )
}

export function BrandRow({ subtitle = 'Investment Intelligence', right = null }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <LogoTile size={40} />
        <div className="leading-tight">
          <div className="text-[19px] font-extrabold tracking-tight text-navy">QuarterNote</div>
          <div className="text-[12px] text-slate2">{subtitle}</div>
        </div>
      </div>
      {right}
    </div>
  )
}
