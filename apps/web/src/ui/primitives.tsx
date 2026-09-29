// Small UI building blocks: icons from the brand sprite, modal plates on <dialog>, menus,
// popovers, switches, segmented controls and steppers. All keyboard accessible.
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Controller } from "../app/controller";

export const ControllerContext = createContext<Controller | null>(null);
export function useController(): Controller {
  const c = useContext(ControllerContext);
  if (!c) throw new Error("ControllerContext missing");
  return c;
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export type IconName =
  | "sound"
  | "sound-off"
  | "sun"
  | "moon"
  | "full"
  | "full-exit"
  | "export"
  | "image"
  | "team"
  | "weight"
  | "eye-off"
  | "grip"
  | "check"
  | "alert"
  | "redo"
  | "palette"
  | "play"
  | "mystery"
  | "qr"
  | "drawer"
  | "shuffle"
  | "sort"
  | "dedupe"
  | "import"
  | "undo"
  | "more"
  | "share"
  | "saved"
  | "seal"
  | "pencil"
  | "receipt"
  | "remove"
  | "again"
  | "timer"
  | "x"
  | "copy"
  | "link"
  | "plus";

export function Icon({ name, size, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={`icon${className ? ` ${className}` : ""}`} width={size} height={size} aria-hidden="true" focusable="false">
      <use href={`#i-${name}`} />
    </svg>
  );
}

/* --------------------------------------------------------------------- modal */

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  className?: string;
  labelledBy?: string;
  label?: string;
  children: ReactNode;
  /** Selector (inside the dialog) to focus on open; defaults to the first [data-autofocus]. */
  initialFocus?: string;
  /** Delay before focusing (the winner plate focuses at +280 ms, SPEC §7.3). */
  focusDelay?: number;
  /** Where focus goes on close (default: the element focused when it opened). */
  returnFocus?: () => HTMLElement | null;
}

/**
 * A modal plate on <dialog>.showModal(): focus moves in, Tab is trapped by the platform, Esc
 * closes, focus returns to the opener and the page behind is inert (ACCEPTANCE L3).
 */
export function Modal({ open, onClose, className, labelledBy, label, children, initialFocus, focusDelay = 0, returnFocus }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useIsoLayoutEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      opener.current = document.activeElement;
      try {
        dlg.showModal();
      } catch {
        dlg.setAttribute("open", "");
      }
      const focus = () => {
        const target = (initialFocus ? dlg.querySelector(initialFocus) : dlg.querySelector("[data-autofocus]")) as HTMLElement | null;
        (target ?? dlg).focus({ preventScroll: true });
      };
      if (focusDelay) setTimeout(focus, focusDelay);
      else focus();
    } else if (!open && dlg.open) {
      dlg.close();
      const o = (returnFocus?.() ?? opener.current) as HTMLElement | null;
      const refocus = () => {
        if (o && typeof o.focus === "function" && document.contains(o)) o.focus({ preventScroll: true });
      };
      refocus();
      // The platform may restore focus itself after close; make sure ours wins.
      requestAnimationFrame(refocus);
    }
  }, [open]);
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      closeRef.current();
    };
    const onClick = (e: MouseEvent) => {
      // A click on the backdrop (outside the plate's box) closes it.
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeRef.current();
    };
    dlg.addEventListener("cancel", onCancel);
    dlg.addEventListener("click", onClick);
    return () => {
      dlg.removeEventListener("cancel", onCancel);
      dlg.removeEventListener("click", onClick);
    };
  }, []);
  return (
    <dialog ref={ref} className={className} aria-labelledby={labelledBy} aria-label={label} tabIndex={-1}>
      {open ? children : null}
    </dialog>
  );
}

export function PlateHead({ id, title, onClose }: { id: string; title: ReactNode; onClose: () => void }) {
  return (
    <div className="plate-head">
      <h2 id={id} className="plate-title">
        {title}
      </h2>
      <button type="button" className="ibtn" onClick={onClose} aria-label="Close">
        <Icon name="x" />
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------- menu */

export interface MenuItem {
  label: string;
  icon?: IconName;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  href?: string;
  hint?: string;
}

export function Menu({ label, icon = "more", items, className, buttonClass = "ibtn", text, align = "end" }: { label: string; icon?: IconName; items: (MenuItem | "sep")[]; className?: string; buttonClass?: string; text?: string; align?: "start" | "end" }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    const first = list.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])');
    first?.focus();
    const onDown = (e: PointerEvent) => {
      if (!list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, close]);
  const onKey = (e: React.KeyboardEvent) => {
    const els = [...(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])];
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      els[(i + 1) % els.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      els[(i - 1 + els.length) % els.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      els[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      els[els.length - 1]?.focus();
    } else if (e.key === "Tab") close(false);
  };
  return (
    <div className={`menu-wrap${className ? ` ${className}` : ""}`}>
      <button ref={btn} type="button" className={buttonClass} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} aria-label={text ? undefined : label} onClick={() => setOpen((o) => !o)}>
        <Icon name={icon} />
        {text ? <span>{text}</span> : null}
      </button>
      {open ? (
        <div ref={list} id={id} role="menu" aria-label={label} className={`menu menu-${align}`} onKeyDown={onKey}>
          {items.map((it, i) =>
            it === "sep" ? (
              <div key={`s${i}`} role="separator" className="menu-sep" />
            ) : it.href ? (
              <a key={it.label} role="menuitem" className="menu-item" href={it.href} tabIndex={-1} onClick={() => close(false)}>
                {it.icon ? <Icon name={it.icon} /> : <span className="menu-icon-gap" />}
                <span>{it.label}</span>
                {it.hint ? <kbd className="menu-hint">{it.hint}</kbd> : null}
              </a>
            ) : (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className={`menu-item${it.danger ? " danger" : ""}`}
                tabIndex={-1}
                aria-disabled={it.disabled || undefined}
                onClick={() => {
                  if (it.disabled) return;
                  close();
                  it.onSelect();
                }}
              >
                {it.icon ? <Icon name={it.icon} /> : <span className="menu-icon-gap" />}
                <span>{it.label}</span>
                {it.hint ? <kbd className="menu-hint">{it.hint}</kbd> : null}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ controls */

export function Switch({ checked, onChange, label, sub, id, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; sub?: ReactNode; id?: string; disabled?: boolean }) {
  const auto = useId();
  const sid = id ?? auto;
  return (
    <div className="switch-row">
      <label htmlFor={sid} className="switch-label">
        <span id={`${sid}-l`}>{label}</span>
        {sub ? <small>{sub}</small> : null}
      </label>
      <button id={sid} type="button" role="switch" aria-checked={checked} aria-labelledby={`${sid}-l`} className="switch" disabled={disabled} onClick={() => onChange(!checked)}>
        <span className="switch-knob" />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label, className }: { value: T | null; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = Math.max(0, options.findIndex((o) => o.value === value));
    const n = options[(i + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length]!;
    onChange(n.value);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>(`[data-v="${n.value}"]`)?.focus());
  };
  return (
    <div ref={ref} className={`seg${className ? ` ${className}` : ""}`} role="radiogroup" aria-label={label} onKeyDown={onKey} style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          data-v={o.value}
          aria-checked={o.value === value}
          tabIndex={o.value === value || (value === null && o === options[0]) ? 0 : -1}
          className={o.value === value ? "on" : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, min, max, onChange, label, suffix }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string; suffix?: string }) {
  const id = useId();
  return (
    <div className="stepper">
      <label htmlFor={id} className="stepper-label">
        {label}
      </label>
      <div className="stepper-box">
        <button type="button" className="step" aria-label={`Fewer: ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
          −
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const v = Math.round(Number(e.target.value));
            if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
          }}
        />
        <button type="button" className="step" aria-label={`More: ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
          +
        </button>
        {suffix ? <span className="stepper-suffix">{suffix}</span> : null}
      </div>
    </div>
  );
}

/** A non-modal popover anchored under its trigger; Esc or an outside click closes it. */
export function Popover({ trigger, children, label, className }: { trigger: (p: { open: boolean; toggle: () => void; ref: React.RefObject<HTMLButtonElement | null> }) => ReactNode; children: (close: () => void) => ReactNode; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    ref.current?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLElement>("input, button, select, textarea")?.focus();
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node) && !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);
  return (
    <div className="pop-wrap">
      {trigger({ open, toggle: () => setOpen((o) => !o), ref })}
      {open ? (
        <div
          ref={box}
          role="dialog"
          aria-label={label}
          className={`popover${className ? ` ${className}` : ""}`}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
        >
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}

export function Keycap({ children }: { children: ReactNode }) {
  return <span className="key">{children}</span>;
}

/** Hidden file input + trigger. */
export function useFilePicker(accept: string, onFile: (f: File) => void) {
  const input = useRef<HTMLInputElement>(null);
  const el = (
    <input
      ref={input}
      type="file"
      accept={accept}
      hidden
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onFile(f);
        e.target.value = "";
      }}
    />
  );
  return { el, open: () => input.current?.click() };
}

export function useMedia(query: string, ssr = false): boolean {
  const [m, setM] = useState(ssr);
  useEffect(() => {
    const mq = matchMedia(query);
    setM(mq.matches);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return m;
}
