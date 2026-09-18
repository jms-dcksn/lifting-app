// THROW AWAY. Inline glyphs for the UX prototype only.

type IconProps = { size?: number; title?: string };

function Svg({ size = 20, title, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function IconBarbell({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </Svg>
  );
}

export function IconPlay({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M8 6.5v11l10-5.5-10-5.5Z" fill="currentColor" />
    </Svg>
  );
}

export function IconPin({ size, filled }: IconProps & { filled?: boolean }) {
  return (
    <Svg size={size}>
      <path
        d="M8 4h8l-1 5 3 3v1H6v-1l3-3-1-5Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M12 13v7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </Svg>
  );
}

export function IconSwap({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M7 7h10M17 7l-3-3M17 7l-3 3M17 17H7M7 17l3-3M7 17l3 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconHistory({ size }: IconProps) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="13" r="7" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 10v3.5l2 1.5M9 5h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </Svg>
  );
}

export function IconInfo({ size }: IconProps) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 11v6M12 8v.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </Svg>
  );
}

export function IconUser({ size }: IconProps) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.75" />
      <path d="M5.5 19c1.2-3 3.6-4.5 6.5-4.5s5.3 1.5 6.5 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </Svg>
  );
}

export function IconGrid({ size }: IconProps) {
  return (
    <Svg size={size}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.25" stroke="currentColor" strokeWidth="1.75" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.25" stroke="currentColor" strokeWidth="1.75" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.25" stroke="currentColor" strokeWidth="1.75" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.25" stroke="currentColor" strokeWidth="1.75" />
    </Svg>
  );
}

export function IconCalendar({ size }: IconProps) {
  return (
    <Svg size={size}>
      <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M4 10h16M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </Svg>
  );
}

export function IconScale({ size }: IconProps) {
  return (
    <Svg size={size}>
      <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M9 10V8a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.75" />
    </Svg>
  );
}

export function IconMenu({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M5 7h14M5 12h14M5 17h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </Svg>
  );
}

export function IconCheck({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M5 12.5 10 17l9-10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconClose({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </Svg>
  );
}

export function IconSpark({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M12 3l1.6 6.2L20 11l-6.4 1.8L12 19l-1.6-6.2L4 11l6.4-1.8L12 3Z" fill="currentColor" />
    </Svg>
  );
}

export function IconProgram({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M7 4h10v16H7z" stroke="currentColor" strokeWidth="1.75" />
      <path d="M10 8h4M10 12h4M10 16h2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </Svg>
  );
}

export function IconFeed({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M5 7h14M5 12h10M5 17h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </Svg>
  );
}

export function Sparkline({
  values,
  color = "currentColor",
}: {
  values: number[];
  color?: string;
}) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((value, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * 64;
      const y = 22 - ((value - min) / span) * 18;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg className="spark" viewBox="0 0 64 24" width="64" height="24" aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
