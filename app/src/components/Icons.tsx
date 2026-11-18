import type { SVGProps } from "react";

const paths: Record<string, React.ReactNode> = {
  desk: (
    <>
      <path d="M4 11.5L12 4l8 7.5" />
      <path d="M6 10.5V20h12v-9.5" />
      <path d="M10 20v-5.5h4V20" />
    </>
  ),
  radar: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 12l6-6" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  journal: (
    <>
      <path d="M5 4.5h11a2.5 2.5 0 012.5 2.5v13H7.5A2.5 2.5 0 015 17.5z" />
      <path d="M5 17.5A2.5 2.5 0 017.5 15h11" />
      <path d="M9 8h6M9 11h4" />
    </>
  ),
  bell: (
    <>
      <path d="M6.5 9.5a5.5 5.5 0 0111 0c0 4 1.5 5.5 1.5 5.5H5S6.5 13.5 6.5 9.5z" />
      <path d="M10 18.5a2.2 2.2 0 004 0" />
    </>
  ),
  sliders: (
    <>
      <path d="M5 7h14M5 12h14M5 17h14" />
      <circle cx="9" cy="7" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
  back: <path d="M14.5 5.5L8 12l6.5 6.5" />,
  forward: <path d="M9.5 5.5L16 12l-6.5 6.5" />,
  chevron: <path d="M9.5 6l6 6-6 6" />,
  star: <path d="M12 3.8l2.55 5.17 5.7.83-4.12 4.02.97 5.68L12 16.82l-5.1 2.68.97-5.68L3.75 9.8l5.7-.83z" />,
  play: <path d="M8 5.5l10 6.5-10 6.5z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="7" y="5.5" width="3.4" height="13" rx="1.2" fill="currentColor" stroke="none" />
      <rect x="13.6" y="5.5" width="3.4" height="13" rx="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  stepBack: (
    <>
      <path d="M17 5.5l-8 6.5 8 6.5z" fill="currentColor" stroke="none" />
      <path d="M6.5 5.5v13" />
    </>
  ),
  stepForward: (
    <>
      <path d="M7 5.5l8 6.5-8 6.5z" fill="currentColor" stroke="none" />
      <path d="M17.5 5.5v13" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  trash: (
    <>
      <path d="M4.5 7h15" />
      <path d="M9 7V4.5h6V7" />
      <path d="M6.5 7l1 12.5h9l1-12.5" />
      <path d="M10.5 11v5M13.5 11v5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 10-2.5 5.8" />
      <path d="M20 5.5V11h-5.5" />
    </>
  ),
  external: (
    <>
      <path d="M13 5h6v6" />
      <path d="M19 5l-8 8" />
      <path d="M18.5 14.5V19H5V5.5h4.5" />
    </>
  ),
  check: <path d="M4.5 12.5l5 5 10-11" />,
  alert: (
    <>
      <path d="M12 4.5L2.8 20h18.4z" />
      <path d="M12 9.5v4.5" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5l7 2.6v5.6c0 4.4-3 7.6-7 8.8-4-1.2-7-4.4-7-8.8V6.1z" />
      <path d="M8.8 12.2l2.2 2.2 4.2-4.4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.2 2" />
    </>
  ),
  zap: <path d="M13.2 3L5.5 13.5h5l-1 7.5 8-11h-5.2z" />,
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="M15.5 15.5L20.5 20.5" />
    </>
  ),
  chart: (
    <>
      <path d="M4 19.5V4.5" />
      <path d="M4 19.5h16" />
      <path d="M7.5 15.5l3.5-4 3 2.5 4.5-6" />
    </>
  ),
  wifi: (
    <>
      <path d="M4 9.2a12 12 0 0116 0" />
      <path d="M7 12.6a8 8 0 0110 0" />
      <path d="M9.8 16a4.2 4.2 0 014.4 0" />
      <circle cx="12" cy="19" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v10" />
      <path d="M8 10.5l4 4 4-4" />
      <path d="M5 19.5h14" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3.5l1.5 4.2L17.8 9.2l-4.3 1.5L12 15l-1.5-4.3L6.2 9.2l4.3-1.5z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3.5l8.5 4.7-8.5 4.7-8.5-4.7z" />
      <path d="M3.5 12.5l8.5 4.7 8.5-4.7" />
      <path d="M3.5 16.8l8.5 4.7 8.5-4.7" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12s3.6-6.5 9.5-6.5S21.5 12 21.5 12s-3.6 6.5-9.5 6.5S2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.4" />
      <path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" />
    </>
  ),
  scale: (
    <>
      <path d="M12 4v16" />
      <path d="M6 8h12" />
      <path d="M6 8l-3 6h6zM18 8l-3 6h6z" />
      <path d="M8.5 20h7" />
    </>
  ),
};

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 20,
  filled = false,
  ...rest
}: { name: IconName; size?: number; filled?: boolean } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}

export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <div className="brand-mark" style={{ width: size, height: size, borderRadius: size * 0.32 }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 34 34" fill="none" aria-hidden="true">
        <path
          d="M5 24.5L12.5 16.5L18.5 21L29 8.5"
          stroke="#6ee7b7"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M23.5 8.5H29V14" stroke="#6ee7b7" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 29H29" stroke="rgba(255,255,255,0.28)" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
