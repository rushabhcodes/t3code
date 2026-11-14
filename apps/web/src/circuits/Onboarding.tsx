import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Code2,
  CircuitBoard,
  FolderOpen,
  Layers3,
  Zap,
} from "lucide-react";
import { circuitTemplates, type TemplateId } from "./templates";
import { StudioDialog } from "./Dialog";

export function Onboarding({
  onCreate,
  onOpen,
  onClose,
  mode = "onboarding",
}: {
  onCreate: (template: TemplateId, name: string) => void;
  onOpen: () => void;
  onClose?: (() => void) | undefined;
  mode?: "onboarding" | "new";
}) {
  const [step, setStep] = useState(mode === "new" ? 1 : 0);
  const [template, setTemplate] = useState<TemplateId>("led");
  const [name, setName] = useState("");
  const selected = circuitTemplates.find((item) => item.id === template) ?? circuitTemplates[0];
  return (
    <StudioDialog
      title={mode === "new" ? "New circuit project" : "Welcome to TSCI Code"}
      onClose={onClose}
      className="tsci-onboarding"
    >
      <div className="tsci-onboard-art">
        <img src="/tsci-logo.svg" alt="" />
        <span className="tsci-wordmark">
          TSCI<span>CODE</span>
        </span>
        <div className="tsci-art-traces">
          <i />
          <i />
          <i />
        </div>
        <div className="tsci-onboard-caption">
          <span>THE CIRCUIT IS THE CODE.</span>
          <p>
            From a thought
            <br />
            to a board.
          </p>
          <small>Powered by tscircuit. Built on T3 Code.</small>
        </div>
      </div>
      <div className="tsci-onboard-body">
        <div className="tsci-step-label">
          {mode === "new" ? "NEW PROJECT" : `GET STARTED · ${step + 1} OF 3`}
        </div>
        {step === 0 ? (
          <>
            <h1>
              A new kind of
              <br />
              circuit workspace.
            </h1>
            <p className="tsci-lead">
              Design electronics with TypeScript. See every connection come together as you write.
            </p>
            <div className="tsci-workflow-list">
              <div>
                <Code2 />
                <span>
                  <strong>Write your circuit</strong>
                  <small>Components and connections, expressed in TSX.</small>
                </span>
              </div>
              <div>
                <Layers3 />
                <span>
                  <strong>See the whole picture</strong>
                  <small>Schematic, routed PCB, and a 3D board.</small>
                </span>
              </div>
              <div>
                <Zap />
                <span>
                  <strong>Make it real</strong>
                  <small>Export source, Gerbers, and a bill of materials.</small>
                </span>
              </div>
            </div>
            <p className="tsci-local-note">
              <span className="tsci-status-dot" /> Local drafts. No account needed.
            </p>
          </>
        ) : step === 1 ? (
          <>
            <h1>Start with a spark.</h1>
            <p className="tsci-lead">Pick a starting point. Every template is yours to change.</p>
            <div className="tsci-template-grid">
              {circuitTemplates.map((item) => (
                <button
                  type="button"
                  className={`tsci-template-card ${template === item.id ? "selected" : ""}`}
                  key={item.id}
                  onClick={() => setTemplate(item.id)}
                  aria-pressed={template === item.id}
                >
                  <div>
                    <CircuitBoard size={20} />
                    {template === item.id ? <Check size={15} /> : null}
                  </div>
                  <small>{item.tag}</small>
                  <strong>{item.name}</strong>
                  <p>{item.description}</p>
                  <span>{item.detail}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <h1>Give your idea a name.</h1>
            <p className="tsci-lead">
              Your workspace saves drafts on this device as you work. Save a project file whenever
              you want a portable copy.
            </p>
            <label className="tsci-field">
              Project name
              <input
                autoFocus
                maxLength={80}
                placeholder={selected.name}
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onCreate(template, name.trim() || selected.name);
                }}
              />
            </label>
            <div className="tsci-project-summary">
              <CircuitBoard size={24} />
              <div>
                <strong>{selected.name}</strong>
                <small>main.tsx · {selected.detail}</small>
              </div>
              <span>TSX</span>
            </div>
            <div className="tsci-next-steps">
              <strong>Your first five minutes</strong>
              <ol>
                <li>Change a value in the source editor.</li>
                <li>Explore the PCB, schematic, and 3D views.</li>
                <li>Check Problems, then export your design.</li>
              </ol>
            </div>
          </>
        )}
        <div className="tsci-onboard-actions">
          <button
            type="button"
            className="tsci-button ghost"
            onClick={step > (mode === "new" ? 1 : 0) ? () => setStep(step - 1) : onOpen}
          >
            {step > (mode === "new" ? 1 : 0) ? (
              <>
                <ArrowLeft size={15} /> Back
              </>
            ) : (
              <>
                <FolderOpen size={15} /> Open existing
              </>
            )}
          </button>
          <button
            type="button"
            className="tsci-button primary"
            onClick={
              step < 2
                ? () => setStep(step + 1)
                : () => onCreate(template, name.trim() || selected.name)
            }
          >
            {step === 2 ? "Create circuit" : step === 0 ? "Let’s build something" : "Continue"}
            <ArrowRight size={16} />
          </button>
        </div>
        {mode === "onboarding" ? (
          <div className="tsci-step-dots" aria-label={`Step ${step + 1} of 3`}>
            {[0, 1, 2].map((index) => (
              <span key={index} className={step === index ? "active" : ""} />
            ))}
          </div>
        ) : null}
      </div>
    </StudioDialog>
  );
}
