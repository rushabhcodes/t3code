import type { SVGProps } from "react";

export function T3Wordmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 164 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <text
        x="0"
        y="27"
        fill="currentColor"
        fontFamily="Inter, sans-serif"
        fontWeight="600"
        fontSize="28"
        letterSpacing="-1"
      >
        TSCI{" "}
        <tspan fontWeight="300" fontSize="22">
          Code
        </tspan>
      </text>
    </svg>
  );
}
