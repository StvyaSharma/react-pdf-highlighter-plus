import React from "react";
import {
  ArrowRight,
  Circle,
  Highlighter,
  Image,
  Minimize2,
  Pencil,
  PenTool,
  Plus,
  RectangleHorizontal,
  Square,
  StickyNote,
  Underline,
  X,
} from "lucide-react";

export const annotationTools = [
  { id: "highlight", label: "Highlight", icon: Highlighter },
  { id: "underline", label: "Underline", icon: Underline },
  { id: "note", label: "Add note", icon: StickyNote },
  { id: "area", label: "Area highlight", icon: Square },
  { id: "draw", label: "Draw", icon: Pencil },
  { id: "rectangle", label: "Rectangle", icon: RectangleHorizontal },
  { id: "circle", label: "Circle", icon: Circle },
  { id: "arrow", label: "Arrow", icon: ArrowRight },
  { id: "image", label: "Add image", icon: Image },
  { id: "signature", label: "Add signature", icon: PenTool },
  { id: "mark", label: "Mark passage", icon: StickyNote },
] as const;
export type AnnotationTool = (typeof annotationTools)[number]["id"];
export const toolLabel = (tool: string) =>
  annotationTools.find((item) => item.id === tool)?.label || tool;

export function EpubAnnotationTools({
  tool,
  onChange,
  compact,
  onCompactChange,
  disabled,
}: {
  tool: AnnotationTool;
  onChange: (tool: AnnotationTool) => void;
  compact: boolean;
  onCompactChange: () => void;
  disabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const root = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        root.current
          ?.querySelector<HTMLButtonElement>(".epub-fab-toggle")
          ?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="epub-fab" ref={root}>
      {open && (
        <div
          id="epub-annotation-tools"
          className="epub-fab-panel"
          role="group"
          aria-label="Annotation tools"
        >
          <h2>Annotate a passage</h2>
          <p>Choose a tool, then select text in the book.</p>
          <div className="epub-tool-grid">
            {annotationTools.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                disabled={disabled}
                aria-pressed={tool === id}
                onClick={() => {
                  onChange(id);
                  setOpen(false);
                }}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <button
            className="epub-compact-toggle"
            aria-pressed={compact}
            onClick={onCompactChange}
          >
            <Minimize2 size={16} />
            Compact notes
          </button>
        </div>
      )}
      <button
        className="epub-fab-toggle"
        aria-label={open ? "Close annotation tools" : "Open annotation tools"}
        aria-expanded={open}
        aria-controls="epub-annotation-tools"
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={24} /> : <Plus size={26} />}
      </button>
    </div>
  );
}
