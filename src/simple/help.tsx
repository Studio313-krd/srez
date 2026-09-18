import { cloneElement, useEffect, useId, useRef, useState } from "react";
import type { ReactElement } from "react";
import { CircleHelp } from "lucide-react";

/** The native popover stays above a modal and inside the viewport. */
export function Hint({
  label,
  text,
  id: providedId,
}: {
  label: string;
  text: string;
  id?: string;
}) {
  const generatedId = useId(),
    id = providedId || generatedId;
  const trigger = useRef<HTMLButtonElement>(null),
    bubble = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const show = () => {
    clearTimeout(timer.current);
    document.dispatchEvent(new CustomEvent("srez-hint-open", { detail: id }));
    setOpen(true);
  };
  const leave = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (document.activeElement !== trigger.current) setOpen(false);
    }, 180);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const other = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) {
        clearTimeout(timer.current);
        setOpen(false);
      }
    };
    document.addEventListener("srez-hint-open", other);
    return () => document.removeEventListener("srez-hint-open", other);
  }, [id]);
  useEffect(() => {
    const tip = bubble.current,
      button = trigger.current;
    if (!tip || !button) return;
    if (!open) {
      tip.hidePopover();
      return;
    }
    tip.showPopover();
    function position() {
      const rect = button!.getBoundingClientRect(),
        box = tip!.getBoundingClientRect();
      const viewportWidth = Math.min(
        window.innerWidth,
        document.documentElement.clientWidth,
        document.body.clientWidth,
        window.visualViewport?.width ?? Infinity,
      );
      tip!.style.left =
        Math.max(8, Math.min(rect.left, viewportWidth - box.width - 8)) + "px";
      tip!.style.top =
        Math.max(
          8,
          rect.bottom + box.height + 8 < window.innerHeight
            ? rect.bottom + 6
            : rect.top - box.height - 6,
        ) + "px";
    }
    position();
    const outside = (e: PointerEvent) => {
      if (!button.contains(e.target as Node) && !tip.contains(e.target as Node))
        setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      if (tip.isConnected && tip.matches(":popover-open")) tip.hidePopover();
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);
  return (
    <span className="s-hint">
      <button
        ref={trigger}
        type="button"
        className="s-hint-trigger"
        aria-label={"Подсказка: " + label}
        aria-describedby={id}
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={leave}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onClick={show}
      >
        <CircleHelp size={17} />
      </button>
      <span
        ref={bubble}
        id={id}
        className="s-tooltip"
        role="tooltip"
        popover="manual"
        onMouseEnter={show}
        onMouseLeave={leave}
      >
        {text}
      </span>
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: ReactElement<{ id?: string; "aria-describedby"?: string }>;
}) {
  const id = useId(),
    description = id + "-hint";
  return (
    <div className="s-field">
      <div className="s-field-caption">
        <label htmlFor={id}>{label}</label>
        <Hint label={label} text={hint} id={description} />
      </div>
      {cloneElement(children, { id, "aria-describedby": description })}
    </div>
  );
}
