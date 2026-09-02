interface Step {
  key: string;
  label: string;
}

interface StepperProps {
  steps: Step[];
  current: string;
  doneKeys?: string[];
}

export default function Stepper({ steps, current, doneKeys = [] }: StepperProps) {
  return (
    <div className="stepper">
      {steps.map((step, idx) => {
        const isActive = step.key === current;
        const isDone = doneKeys.includes(step.key) && !isActive;
        return (
          <div key={step.key} className={`step ${isActive ? "active" : ""} ${isDone ? "done" : ""}`}>
            <div className="step-dot" />
            <span>{step.label}</span>
            {idx < steps.length - 1 && (
              <div className={`step-line ${isDone ? "done" : ""}`} style={{ marginLeft: 8 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
