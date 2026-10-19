import React from "react";
import {
  ArrowRight,
  Circle,
  Image,
  Pencil,
  RectangleHorizontal,
  Square,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import type { DocumentHighlight } from "../../../src/core/types";
import { type AnnotationTool, toolLabel } from "./EpubAnnotationTools";

type Point = { x: number; y: number };
type DrawingTool = "draw" | "rectangle" | "circle" | "arrow" | "area";
export type SketchShape =
  | { tool: DrawingTool; points: Point[]; color: string; width: number }
  | { tool: "image"; src: string };
export type SketchData = { version: 1; shapes: SketchShape[] };
export interface EpubAnnotation extends DocumentHighlight {
  content?: Record<string, unknown> & {
    text?: string;
    note?: string;
    tool?: AnnotationTool;
    sketch?: SketchData;
  };
}

export function SketchPreview({
  sketch,
  children,
  ...props
}: { sketch: SketchData } & React.SVGProps<SVGSVGElement>) {
  const markerId = React.useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 1000 600"
      role="img"
      aria-label="Passage sketch"
      {...props}
    >
      <defs>
        <marker
          id={markerId}
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 8 4 L 0 8 Z" fill="context-stroke" />
        </marker>
      </defs>
      {sketch.shapes.map((shape, i) => {
        if (shape.tool === "image")
          return (
            <image
              key={i}
              href={shape.src}
              x="50"
              y="30"
              width="900"
              height="540"
              preserveAspectRatio="xMidYMid meet"
            />
          );
        const a = shape.points[0],
          b = shape.points[shape.points.length - 1];
        if (!a || !b) return null;
        const common = {
          stroke: shape.color,
          strokeWidth: shape.width,
          fill: "none",
          strokeLinecap: "round" as const,
          strokeLinejoin: "round" as const,
        };
        if (shape.tool === "rectangle" || shape.tool === "area")
          return (
            <rect
              key={i}
              {...common}
              x={Math.min(a.x, b.x)}
              y={Math.min(a.y, b.y)}
              width={Math.abs(b.x - a.x)}
              height={Math.abs(b.y - a.y)}
              fill={shape.tool === "area" ? shape.color : "none"}
              fillOpacity={shape.tool === "area" ? 0.22 : 1}
            />
          );
        if (shape.tool === "circle")
          return (
            <ellipse
              key={i}
              {...common}
              cx={(a.x + b.x) / 2}
              cy={(a.y + b.y) / 2}
              rx={Math.abs(b.x - a.x) / 2}
              ry={Math.abs(b.y - a.y) / 2}
            />
          );
        if (shape.tool === "arrow")
          return (
            <line
              key={i}
              {...common}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              markerEnd={`url(#${markerId})`}
            />
          );
        return (
          <path
            key={i}
            {...common}
            d={shape.points
              .map((p, j) => `${j ? "L" : "M"}${p.x},${p.y}`)
              .join(" ")}
          />
        );
      })}
      {children}
    </svg>
  );
}

export function EpubSketchEditor({
  annotation,
  onSave,
  onCancel,
}: {
  annotation: EpubAnnotation;
  onSave: (annotation: EpubAnnotation) => void;
  onCancel: () => void;
}) {
  const initialTool = annotation.content?.tool || "note";
  const isNote = initialTool === "note";
  const [note, setNote] = React.useState(annotation.content?.note || "");
  const [shapes, setShapes] = React.useState<SketchShape[]>(
    annotation.content?.sketch?.shapes || [],
  );
  const [tool, setTool] = React.useState<DrawingTool>(
    ["rectangle", "circle", "arrow", "area"].includes(initialTool)
      ? (initialTool as DrawingTool)
      : "draw",
  );
  const [color, setColor] = React.useState(
    initialTool === "area" ? "#e8b327" : "#4f46c7",
  );
  const [width, setWidth] = React.useState(4);
  const [draft, setDraft] = React.useState<SketchShape | null>(null);
  const [error, setError] = React.useState("");
  const pending = React.useRef<Extract<
    SketchShape,
    { points: Point[] }
  > | null>(null);
  const dialog = React.useRef<HTMLDialogElement>(null);
  const imageInput = React.useRef<HTMLInputElement>(null);
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    dialog.current?.showModal();
    if (initialTool === "image" && !annotation.content?.sketch)
      imageInput.current?.focus();
    return () => {
      mounted.current = false;
    };
  }, []);
  const point = (event: React.PointerEvent<SVGSVGElement>): Point => {
    const matrix = event.currentTarget.getScreenCTM();
    const p = matrix
      ? new DOMPoint(event.clientX, event.clientY).matrixTransform(
          matrix.inverse(),
        )
      : new DOMPoint();
    return {
      x: Math.max(0, Math.min(1000, p.x)),
      y: Math.max(0, Math.min(600, p.y)),
    };
  };
  const cancelStroke = () => {
    pending.current = null;
    setDraft(null);
  };
  return (
    <dialog
      ref={dialog}
      className="epub-annotation-dialog"
      aria-labelledby="epub-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!note.trim() && !shapes.length) return;
          onSave({
            ...annotation,
            content: {
              ...annotation.content,
              note: note.trim(),
              sketch: !isNote ? { version: 1, shapes } : undefined,
            },
          });
        }}
      >
        <div className="epub-panel-heading">
          <h2 id="epub-editor-title">
            {isNote
              ? "Passage note"
              : `${toolLabel(initialTool)} · passage sketch`}
          </h2>
          <button
            type="button"
            className="epub-icon"
            aria-label="Cancel annotation"
            onClick={onCancel}
          >
            <X size={20} />
          </button>
        </div>
        <p className="epub-muted">
          {isNote
            ? "Add a note to this passage."
            : "Your sketch stays linked to this passage when the book reflows."}
        </p>
        <blockquote>{annotation.content?.text}</blockquote>
        {!isNote && (
          <>
            <div
              className="epub-sketch-toolbar"
              role="group"
              aria-label="Sketch tools"
            >
              {(
                [
                  ["draw", Pencil, "Freehand"],
                  ["rectangle", RectangleHorizontal, "Rectangle"],
                  ["circle", Circle, "Circle"],
                  ["arrow", ArrowRight, "Arrow"],
                  ["area", Square, "Area highlight"],
                ] as const
              ).map(([id, Icon, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-label={label}
                  title={label}
                  aria-pressed={tool === id}
                  onClick={() => setTool(id)}
                >
                  <Icon size={18} />
                </button>
              ))}
              <label className="epub-ink-color" title="Ink color">
                <span className="epub-sr-only">Ink color</span>
                <input
                  aria-label="Ink color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </label>
              <label>
                Width{" "}
                <select
                  aria-label="Ink width"
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                >
                  <option value={2}>Thin</option>
                  <option value={4}>Medium</option>
                  <option value={8}>Thick</option>
                </select>
              </label>
              <button
                type="button"
                aria-label="Undo sketch action"
                disabled={!shapes.length}
                onClick={() => setShapes((items) => items.slice(0, -1))}
              >
                <Undo2 size={18} />
              </button>
              <button
                type="button"
                aria-label="Clear sketch"
                disabled={!shapes.length}
                onClick={() => setShapes([])}
              >
                <Trash2 size={18} />
              </button>
            </div>
            <SketchPreview
              className="epub-sketch-canvas"
              sketch={{
                version: 1,
                shapes: draft ? [...shapes, draft] : shapes,
              }}
              aria-label="Draw passage sketch"
              tabIndex={0}
              onPointerDown={(event) => {
                if (event.button !== 0 || pending.current) return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                const p = point(event);
                pending.current = { tool, color, width, points: [p, p] };
                setDraft(pending.current);
              }}
              onPointerMove={(event) => {
                const current = pending.current;
                if (!current) return;
                const p = point(event);
                pending.current = {
                  ...current,
                  points:
                    current.tool === "draw"
                      ? [...current.points, p]
                      : [current.points[0], p],
                };
                setDraft(pending.current);
              }}
              onPointerUp={(event) => {
                const current = pending.current;
                if (!current) return;
                const p = point(event);
                const completed = {
                  ...current,
                  points:
                    current.tool === "draw"
                      ? [...current.points, p]
                      : [current.points[0], p],
                };
                if (
                  Math.hypot(
                    p.x - current.points[0].x,
                    p.y - current.points[0].y,
                  ) > 2 ||
                  current.points.length > 3
                )
                  setShapes((items) => [...items, completed]);
                cancelStroke();
              }}
              onPointerCancel={cancelStroke}
              onLostPointerCapture={cancelStroke}
            />
            <div className="epub-sketch-actions">
              <button
                type="button"
                className="epub-button"
                onClick={() => imageInput.current?.click()}
              >
                <Image size={16} />
                Add image
              </button>
              {tool !== "draw" && (
                <button
                  type="button"
                  className="epub-button"
                  onClick={() =>
                    setShapes((items) => [
                      ...items,
                      {
                        tool,
                        color,
                        width,
                        points: [
                          { x: 250, y: 150 },
                          { x: 750, y: 450 },
                        ],
                      },
                    ])
                  }
                >
                  Insert {tool === "area" ? "area highlight" : tool}
                </button>
              )}
              <span className="epub-muted">
                {shapes.length} sketch elements
              </span>
            </div>
            <input
              className="epub-file-input"
              ref={imageInput}
              aria-label="Choose sketch image"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                if (
                  !["image/png", "image/jpeg", "image/webp"].includes(
                    file.type,
                  ) ||
                  file.size > 5 * 1024 * 1024
                ) {
                  setError("Choose a PNG, JPEG, or WebP image under 5 MB.");
                  return;
                }
                try {
                  const src = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result));
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                  });
                  if (!mounted.current) return;
                  setShapes((items) => [...items, { tool: "image", src }]);
                  setError("");
                } catch {
                  if (mounted.current)
                    setError("Could not read that image. Try another file.");
                }
              }}
            />
          </>
        )}
        <label className="epub-note-label">
          {isNote ? "Your note" : "Caption (optional)"}
          <textarea
            aria-label={isNote ? "Your note" : "Sketch caption"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            autoFocus={isNote}
            placeholder={
              isNote ? "Write your thoughts…" : "Describe your sketch…"
            }
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="epub-editor-footer">
          <button type="button" className="epub-button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            className="epub-button epub-primary"
            disabled={!note.trim() && !shapes.length}
          >
            Save annotation
          </button>
        </div>
      </form>
    </dialog>
  );
}
