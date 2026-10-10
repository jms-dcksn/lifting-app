type IconProps = { size?: number };

function Svg({ size = 20, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function IconPlay({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M8 6.5v11l10-5.5-10-5.5Z" fill="currentColor" />
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

export function IconProgram({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M7 4h10v16H7z" stroke="currentColor" strokeWidth="1.75" />
      <path d="M10 8h4M10 12h4M10 16h2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
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

export function IconSwap({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path
        d="M7 7h10M17 7l-3-3M17 7l-3 3M17 17H7M7 17l3-3M7 17l3 3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

export function IconLastUsed({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path
        d="M7 7v4h4M8.5 16.5A6.5 6.5 0 1 0 7.2 11"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

export function IconCalendar({ size }: IconProps) {
  return (
    <Svg size={size}>
      <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M4 10h16M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </Svg>
  );
}

export function IconSearch({ size }: IconProps) {
  return (
    <Svg size={size}>
      <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.75" />
      <path d="M15.5 15.5 20 20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </Svg>
  );
}

export function IconChat({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path
        d="M11 5H7a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3v3l4-3h5a3 3 0 0 0 3-3v-3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m17 2 1.1 2.9L21 6l-2.9 1.1L17 10l-1.1-2.9L13 6l2.9-1.1L17 2Zm5-1 0.5 1.5L24 3l-1.5 0.5L22 5l-0.5-1.5L20 3l1.5-0.5L22 1Z"
        fill="currentColor"
      />
    </Svg>
  );
}

export function IconSend({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path
        d="M12 19V5M6 11l6-6 6 6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconPlus({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </Svg>
  );
}

export function IconMore({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M5 7h14M5 12h14M5 17h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </Svg>
  );
}

export function IconTrash({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path
        d="M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconDumbbell({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path
        d="M6 9v6M18 9v6M8 10.5v3M16 10.5v3M8 12h8M4.5 10v4M19.5 10v4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
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
    <svg className="text-muted" viewBox="0 0 64 24" width="64" height="24" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
