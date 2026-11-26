"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, Plus, Square, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { send } from "@/lib/client-api";
import { todayAR } from "@/lib/finance/dates";
import { cn } from "@/lib/utils";

type Phase = "focus" | "break";
interface TimerState {
  phase: Phase;
  /** Momento (ms) en que termina la fase si está corriendo. */
  endsAt: number | null;
  /** Lo que falta si está en pausa. */
  leftMs: number;
  courseId: string;
  focusMin: number;
  breakMin: number;
  /** Pomodoros completos de esta tanda. */
  done: number;
}

const KEY = "estudio.pomodoro.v1";
const PRESETS = [
  { focus: 25, rest: 5 },
  { focus: 50, rest: 10 },
  { focus: 90, rest: 15 },
];

function load(courseId: string): TimerState {
  const fresh: TimerState = { phase: "focus", endsAt: null, leftMs: 25 * 60_000, courseId, focusMin: 25, breakMin: 5, done: 0 };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh, ...(JSON.parse(raw) as Partial<TimerState>) };
  } catch {}
  return fresh;
}

function save(s: TimerState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

async function notify(title: string, body: string) {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.8);
  } catch {}
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      const reg = await navigator.serviceWorker?.ready;
      if (reg) await reg.showNotification(title, { body, tag: "pomodoro", icon: "/icons/icon-192.png" });
      else new Notification(title, { body });
    }
  } catch {}
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Pomodoro: cuenta con la hora real (sigue bien aunque cierres la pestaña), guarda el estado en
 * el dispositivo y suma los minutos de cada pomodoro terminado al curso elegido.
 */
export function Pomodoro({ courses, canSave }: { courses: { id: string; name: string }[]; canSave: boolean }) {
  const router = useRouter();
  const [s, setS] = useState<TimerState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [msg, setMsg] = useState<string | null>(null);
  const finishing = useRef(false);

  // El estado vive en el dispositivo: se lee después de montar (en el servidor no existe).
  const firstCourse = courses[0]?.id ?? "";
  useEffect(() => {
    const id = requestAnimationFrame(() => setS(load(firstCourse)));
    return () => cancelAnimationFrame(id);
  }, [firstCourse]);

  const update = useCallback((next: TimerState) => {
    save(next);
    setS(next);
  }, []);

  const record = useCallback(
    async (minutes: number, courseId: string) => {
      if (!canSave || minutes < 1) return;
      const r = await send("/api/study/sessions", "POST", { courseId: courseId || null, date: todayAR(), minutes, source: "pomodoro" });
      setMsg(r.ok ? `Sumaste ${minutes} min de estudio.` : r.error);
      if (r.ok) router.refresh();
    },
    [canSave, router],
  );

  // Reloj: cuando termina una fase pasa a la otra.
  useEffect(() => {
    if (!s?.endsAt) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (s.endsAt && t >= s.endsAt && !finishing.current) {
        finishing.current = true;
        if (s.phase === "focus") {
          void record(s.focusMin, s.courseId);
          void notify("¡Pomodoro terminado!", `Sumaste ${s.focusMin} min. Tomate ${s.breakMin} min de descanso.`);
          update({ ...s, phase: "break", endsAt: s.endsAt + s.breakMin * 60_000, leftMs: s.breakMin * 60_000, done: s.done + 1 });
        } else {
          void notify("Fin del descanso", "A estudiar de nuevo.");
          update({ ...s, phase: "focus", endsAt: null, leftMs: s.focusMin * 60_000 });
        }
        finishing.current = false;
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [s, record, update]);

  if (!s) return <Card className="h-40" />;

  const running = s.endsAt !== null;
  const left = running ? s.endsAt! - now : s.leftMs;
  const total = (s.phase === "focus" ? s.focusMin : s.breakMin) * 60_000;
  const pristine = !running && s.leftMs === total;

  function start() {
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
    update({ ...s!, endsAt: Date.now() + s!.leftMs });
  }
  function pause() {
    update({ ...s!, endsAt: null, leftMs: Math.max(0, s!.endsAt! - Date.now()) });
  }
  /** Corta el pomodoro: si estabas estudiando, guarda los minutos que hiciste. */
  function stop() {
    if (s!.phase === "focus") {
      const studied = Math.floor((total - left) / 60_000);
      void record(studied, s!.courseId);
      if (studied < 1) setMsg("Menos de un minuto: no se guardó.");
    }
    update({ ...s!, phase: "focus", endsAt: null, leftMs: s!.focusMin * 60_000 });
  }
  function preset(focus: number, rest: number) {
    update({ ...s!, focusMin: focus, breakMin: rest, phase: "focus", endsAt: null, leftMs: focus * 60_000 });
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-accent" /> Pomodoro
          </CardTitle>
          <CardDescription>{s.phase === "focus" ? "Estudio sin distracciones. Al terminar, se suma el tiempo." : "Descanso: pará, tomá agua, estirá."}</CardDescription>
        </div>
        <ManualTime courses={courses} canSave={canSave} />
      </CardHeader>

      <div className="flex flex-col items-center gap-4">
        <p className={cn("num text-5xl font-semibold tracking-tight", s.phase === "break" && "text-good")} aria-live="polite">
          {mmss(left)}
        </p>
        <div className="grid w-full grid-cols-2 gap-3">
          <Field label="Curso">
            <Select value={s.courseId} disabled={running && s.phase === "focus"} onChange={(e) => update({ ...s, courseId: e.target.value })}>
              <option value="">General</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Duración">
            <Select
              value={`${s.focusMin}/${s.breakMin}`}
              disabled={running}
              onChange={(e) => {
                const [f, r] = e.target.value.split("/").map(Number);
                preset(f, r);
              }}
            >
              {PRESETS.map((p) => (
                <option key={p.focus} value={`${p.focus}/${p.rest}`}>
                  {p.focus} + {p.rest} min
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex w-full gap-2">
          {running ? (
            <Button className="flex-1" variant="outline" onClick={pause}>
              <Pause className="h-4 w-4" /> Pausa
            </Button>
          ) : (
            <Button className="flex-1" variant="accent" onClick={start}>
              <Play className="h-4 w-4" /> {pristine ? (s.phase === "focus" ? "Empezar" : "Empezar descanso") : "Seguir"}
            </Button>
          )}
          {!pristine && (
            <Button variant="ghost" onClick={stop} title={s.phase === "focus" ? "Terminar y guardar lo que estudiaste" : "Saltear el descanso"}>
              <Square className="h-4 w-4" /> {s.phase === "focus" ? "Terminar" : "Saltear"}
            </Button>
          )}
        </div>
        <p className="text-[11px] text-ink-3">
          {s.done > 0 ? `${s.done} pomodoro${s.done === 1 ? "" : "s"} en esta tanda · ` : ""}
          {canSave ? "Dejá la app abierta para el aviso con sonido." : "Conectá la base de datos para guardar el tiempo."}
        </p>
        {msg && <p className="text-xs text-ink-2">{msg}</p>}
      </div>
    </Card>
  );
}

function ManualTime({ courses, canSave }: { courses: { id: string; name: string }[]; canSave: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [minutes, setMinutes] = useState("60");
  const [date, setDate] = useState(() => todayAR());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canSave) return null;

  async function saveTime() {
    const m = Math.round(Number(minutes));
    if (!m || m < 1 || m > 600) return setError("Entre 1 y 600 minutos.");
    setBusy(true);
    setError(null);
    const r = await send("/api/study/sessions", "POST", { courseId: courseId || null, date, minutes: m, source: "manual" });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} title="Cargar tiempo que estudiaste sin el pomodoro">
        <Plus className="h-3.5 w-3.5" /> Tiempo
      </Button>
      {open && (
        <Dialog title="Cargar tiempo de estudio" onClose={() => setOpen(false)}>
          <div className="grid gap-3">
            <Field label="Curso">
              <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                <option value="">General</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Minutos">
                <Input type="number" inputMode="numeric" min={1} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
              </Field>
              <Field label="Día">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>
          </div>
          {error && <p className="mt-3 text-xs text-bad">{error}</p>}
          <Button className="mt-5" disabled={busy} onClick={saveTime}>
            Guardar
          </Button>
        </Dialog>
      )}
    </>
  );
}
