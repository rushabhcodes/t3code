import type { SVGProps } from "react";

export function T3Wordmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 64 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <text
        x="0"
        y="23"
        fill="currentColor"
        fontFamily="Geist, sans-serif"
        fontWeight="600"
        fontSize="28"
        letterSpacing="-1"
      >
        TSCI
      </text>
    </svg>
  );
}
