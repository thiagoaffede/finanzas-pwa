import { describe, expect, it } from "vitest";
import { buildDueAlert } from "./alerts";
import type { DueItem } from "@/lib/finance/deadlines";

const item = (id: string, dueDate: string, extra: Partial<DueItem> = {}): DueItem => ({ id, label: id, amountCents: 1_000_000, dueDate, paid: false, kind: "bill", ...extra });

describe("aviso de vencimientos", () => {
  it("avisa 3 días antes, el día anterior y el mismo día", () => {
    expect(buildDueAlert([item("Luz", "2026-11-27")], "2026-11-24")?.title).toBe("Luz vence en 3 días");
    expect(buildDueAlert([item("Luz", "2026-11-25")], "2026-11-24")?.title).toBe("Luz vence mañana");
    expect(buildDueAlert([item("Luz", "2026-11-24")], "2026-11-24")?.title).toBe("Luz vence hoy");
    expect(buildDueAlert([item("Luz", "2026-11-26")], "2026-11-24")).toBeNull();
  });

  it("ignora lo pagado y avisa una vez de lo vencido ayer (solo boletas)", () => {
    expect(buildDueAlert([item("Luz", "2026-11-24", { paid: true })], "2026-11-24")).toBeNull();
    expect(buildDueAlert([item("Gas", "2026-11-23")], "2026-11-24")?.title).toBe("Gas venció ayer");
    expect(buildDueAlert([item("Gas", "2026-11-22")], "2026-11-24")).toBeNull();
    expect(buildDueAlert([item("Cuotas", "2026-11-23", { kind: "card" })], "2026-11-24")).toBeNull();
  });

  it("junta varios en un solo aviso", () => {
    const a = buildDueAlert([item("Luz", "2026-11-24"), item("Gas", "2026-11-27"), item("Agua", "2026-12-10")], "2026-11-24")!;
    expect(a.title).toMatch(/^2 vencimientos para hoy/);
    expect(a.body.split("\n")).toHaveLength(2);
    expect(a.tag).toBe("vencimientos-2026-11-24");
  });
});
