export const circuitTemplates = [
  {
    id: "led",
    name: "Hello, LED",
    description: "A current-limiting resistor and a green LED. Your first complete circuit.",
    detail: "30 × 20 mm · 3 components",
    tag: "START HERE",
    source: `// A little light, written in TypeScript.
// Change the resistance, then watch the board update.
export default () => (
  <board width="30mm" height="20mm" autorouter="auto-local">
    <pinheader name="J1" pinCount={2} footprint="pinrow2"
      pcbX={-10} schX={-5} pinLabels={{ pin1: "VCC", pin2: "GND" }} />
    <resistor
      name="R1"
      resistance="330"
      footprint="0603"
      pcbX={-4}
      schX={-2}
    />
    <led
      name="D1"
      color="green"
      footprint="0603"
      pcbX={4}
      schX={2}
    />
    <trace from="net.VCC" to=".R1 > .pin1" />
    <trace from=".R1 > .pin2" to=".D1 > .pin1" />
    <trace from=".D1 > .pin2" to="net.GND" />
    <trace from=".J1 > .pin1" to="net.VCC" />
    <trace from=".J1 > .pin2" to="net.GND" />
  </board>
)
`,
  },
  {
    id: "divider",
    name: "Voltage divider",
    description: "Two resistors turn an input voltage into a useful reference.",
    detail: "32 × 24 mm · 3 components",
    tag: "FUNDAMENTALS",
    source: `// VOUT = VIN × R2 / (R1 + R2)
// With two 10k resistors, VOUT is half of VIN.
export default () => (
  <board width="32mm" height="24mm" autorouter="auto-local">
    <pinheader name="J1" pinCount={3} footprint="pinrow3"
      pcbX={-11} schX={-5} pinLabels={{ pin1: "VIN", pin2: "VOUT", pin3: "GND" }} />
    <resistor name="R1" resistance="10k" footprint="0805"
      pcbX={-4} schX={0} schY={2} schRotation={90} />
    <resistor name="R2" resistance="10k" footprint="0805"
      pcbX={4} schX={0} schY={-2} schRotation={90} />
    <trace from="net.VIN" to=".R1 > .pin1" />
    <trace from=".R1 > .pin2" to="net.VOUT" />
    <trace from="net.VOUT" to=".R2 > .pin1" />
    <trace from=".R2 > .pin2" to="net.GND" />
    <trace from=".J1 > .pin1" to="net.VIN" />
    <trace from=".J1 > .pin2" to="net.VOUT" />
    <trace from=".J1 > .pin3" to="net.GND" />
  </board>
)
`,
  },
  {
    id: "filter",
    name: "RC low-pass filter",
    description: "Explore a simple signal filter with a resistor and capacitor.",
    detail: "30 × 22 mm · 3 components",
    tag: "SIGNALS",
    source: `// Cutoff frequency: 1 / (2πRC) ≈ 1.59 kHz.
export default () => (
  <board width="30mm" height="22mm" autorouter="auto-local">
    <pinheader name="J1" pinCount={3} footprint="pinrow3"
      pcbX={-10} schX={-5} pinLabels={{ pin1: "IN", pin2: "OUT", pin3: "GND" }} />
    <resistor name="R1" resistance="1k" footprint="0603"
      pcbX={-4} schX={-2} />
    <capacitor name="C1" capacitance="100nF" footprint="0603"
      pcbX={4} schX={2} schRotation={90} />
    <trace from="net.IN" to=".R1 > .pin1" />
    <trace from=".R1 > .pin2" to="net.OUT" />
    <trace from="net.OUT" to=".C1 > .pin1" />
    <trace from=".C1 > .pin2" to="net.GND" />
    <trace from=".J1 > .pin1" to="net.IN" />
    <trace from=".J1 > .pin2" to="net.OUT" />
    <trace from=".J1 > .pin3" to="net.GND" />
  </board>
)
`,
  },
  {
    id: "blank",
    name: "Blank canvas",
    description: "An empty board, ready for your next idea.",
    detail: "40 × 30 mm · Your rules",
    tag: "FROM SCRATCH",
    source: `export default () => (
  <board width="40mm" height="30mm" autorouter="auto-local">
    {/* Add components here. Open the Library for snippets. */}
  </board>
)
`,
  },
] as const;

export type TemplateId = (typeof circuitTemplates)[number]["id"];

export const componentSnippets = [
  {
    name: "Resistor",
    prefix: "R",
    description: "10k · 0603",
    code: (name: string) =>
      `<resistor name="${name}" resistance="10k" footprint="0603" pcbX={0} pcbY={0} />`,
  },
  {
    name: "Capacitor",
    prefix: "C",
    description: "100nF · 0603",
    code: (name: string) =>
      `<capacitor name="${name}" capacitance="100nF" footprint="0603" pcbX={0} pcbY={3} />`,
  },
  {
    name: "LED",
    prefix: "D",
    description: "Green · 0603",
    code: (name: string) =>
      `<led name="${name}" color="green" footprint="0603" pcbX={0} pcbY={-3} />`,
  },
] as const;
