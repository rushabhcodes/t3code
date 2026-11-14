import { useEffect, useEffectEvent, useRef } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { Annotation, EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { indentWithTab } from "@codemirror/commands";
import { autocompletion, completeFromList } from "@codemirror/autocomplete";
import { basicSetup } from "codemirror";

const circuitCompletions = [
  {
    label: "board",
    type: "type",
    detail: "Circuit board",
    apply: 'board width="30mm" height="20mm"',
  },
  {
    label: "resistor",
    type: "type",
    detail: "Resistor",
    apply: 'resistor name="R1" resistance="10k" footprint="0603"',
  },
  {
    label: "capacitor",
    type: "type",
    detail: "Capacitor",
    apply: 'capacitor name="C1" capacitance="100nF" footprint="0603"',
  },
  {
    label: "led",
    type: "type",
    detail: "Light-emitting diode",
    apply: 'led name="D1" color="green" footprint="0603"',
  },
  {
    label: "trace",
    type: "type",
    detail: "Electrical connection",
    apply: 'trace from=".R1 > .pin2" to=".D1 > .pin1"',
  },
  ...["pcbX", "pcbY", "schX", "schY", "footprint", "resistance", "capacitance", "name"].map(
    (label) => ({ label, type: "property" }),
  ),
];
const externalChange = Annotation.define<boolean>();

export function CodeEditor({
  value,
  onChange,
  onCursorChange,
  filename,
  theme,
}: {
  value: string;
  onChange: (value: string) => void;
  onCursorChange: (line: number, column: number) => void;
  filename: string;
  theme: "dark" | "light";
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const changed = useEffectEvent(onChange);
  const cursorChanged = useEffectEvent(onCursorChange);
  const readValue = useEffectEvent(() => value);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- CodeMirror owns a DOM editor and must be created and disposed with its host.
  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: readValue(),
        extensions: [
          basicSetup,
          javascript({ jsx: /[jt]sx$/.test(filename), typescript: /tsx?$/.test(filename) }),
          keymap.of([indentWithTab]),
          autocompletion({ override: [completeFromList(circuitCompletions)] }),
          EditorView.contentAttributes.of({
            "aria-label": `${filename} source editor`,
            spellcheck: "false",
          }),
          EditorView.theme(
            {
              "&": {
                height: "100%",
                background: "var(--tsci-editor)",
                color: "var(--tsci-text)",
                fontSize: "12px",
              },
              ".cm-scroller": {
                fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
                lineHeight: "1.9",
              },
              ".cm-content": { padding: "22px 0 80px", caretColor: "var(--tsci-accent)" },
              ".cm-line": { padding: "0 24px 0 10px" },
              ".cm-gutters": {
                background: "var(--tsci-editor)",
                color: "var(--tsci-faint)",
                border: "0",
                paddingLeft: "12px",
              },
              ".cm-gutterElement": { paddingTop: "0" },
              ".cm-activeLine, .cm-activeLineGutter": { background: "var(--tsci-hover)" },
              ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
                background: "var(--tsci-selection)",
              },
              ".cm-cursor": { borderLeftColor: "var(--tsci-accent)" },
              ".cm-tooltip": {
                background: "var(--tsci-panel)",
                color: "var(--tsci-text)",
                borderColor: "var(--tsci-border)",
              },
              ".cm-panels": { background: "var(--tsci-panel)", color: "var(--tsci-text)" },
              "&.cm-focused": { outline: "none" },
            },
            { dark: theme === "dark" },
          ),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.some((transaction) => transaction.annotation(externalChange))
            )
              changed(update.state.doc.toString());
            if (update.selectionSet || update.docChanged) {
              const cursor = update.state.selection.main.head;
              const line = update.state.doc.lineAt(cursor);
              cursorChanged(line.number, cursor - line.from + 1);
            }
          }),
        ],
      }),
    });
    editor.current = view;
    return () => {
      view.destroy();
      editor.current = null;
    };
  }, [filename, theme]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- External file and snippet changes are applied to CodeMirror's separate document model.
  useEffect(() => {
    const view = editor.current;
    if (view && view.state.doc.toString() !== value)
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        annotations: externalChange.of(true),
      });
  }, [value]);

  return <div className="tsci-code-editor" ref={host} />;
}
