import type { SVGProps } from "react";

export type IconName =
  | "check"
  | "lock"
  | "search"
  | "arrow"
  | "external"
  | "pin"
  | "pix"
  | "wallet"
  | "file"
  | "refresh"
  | "copy"
  | "close"
  | "plug"
  | "shield"
  | "webhook"
  | "users"
  | "chart"
  | "key"
  | "book"
  | "alert";

const paths: Record<IconName, string[]> = {
  check: ["M5 12.5l4.2 4.2L19 7"],
  lock: ["M7 10V7.5a5 5 0 0 1 10 0V10", "M6 10h12v10H6z"],
  search: ["M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M20 20l-4.2-4.2"],
  arrow: ["M5 12h14", "M13 6l6 6-6 6"],
  external: ["M14 4h6v6", "M20 4l-9 9", "M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"],
  pin: ["M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z", "M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"],
  pix: ["M12 3l4.5 4.5L12 12 7.5 7.5z", "M21 12l-4.5 4.5L12 12l4.5-4.5z", "M12 21l-4.5-4.5L12 12l4.5 4.5z", "M3 12l4.5-4.5L12 12l-4.5 4.5z"],
  wallet: ["M3 7.5A1.5 1.5 0 0 1 4.5 6H18v3", "M3 7.5v10A1.5 1.5 0 0 0 4.5 19H20a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H4.5"],
  file: ["M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z", "M14 3v5h5", "M9 13h6", "M9 17h6"],
  refresh: ["M20 11a8 8 0 0 0-14.6-4.5L4 8", "M4 4v4h4", "M4 13a8 8 0 0 0 14.6 4.5L20 16", "M20 20v-4h-4"],
  copy: ["M9 9h10v11H9z", "M5 15V5h10"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  plug: ["M9 3v5", "M15 3v5", "M6 8h12v3a6 6 0 0 1-12 0z", "M12 17v4"],
  shield: ["M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z", "M9 12l2 2 4-4"],
  webhook: ["M8 16a4 4 0 1 1 3.5-6", "M14 8l-2 6", "M16 17a4 4 0 1 1-3.5-6", "M15.5 11.5h4a4 4 0 1 1-3.5 6"],
  users: ["M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M3 20c.6-3.3 3-5 6-5s5.4 1.7 6 5", "M16 4.5a3.5 3.5 0 0 1 0 7", "M18 15c1.8.6 3 2.4 3 5"],
  chart: ["M4 20V4", "M4 20h16", "M8 16v-4", "M12 16V8", "M16 16v-6"],
  key: ["M14.5 9.5a4 4 0 1 1-3.4-3.9", "M12 13l-7 7", "M5 18l2 2", "M7 16l2 2"],
  book: ["M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z", "M4 5v16", "M9 8h6"],
  alert: ["M12 4l9 16H3z", "M12 10v4", "M12 17h.01"],
};

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {paths[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
