import { describe, expect, it } from "vitest";
import { computeBudgets, pendingBudgetAlerts } from "./budget";
import { cardInstallmentDue } from "./card";

describe("presupuesto por categoría", () => {
  const limits = { Comida: 200_000_00, Salidas: 50_000_00, Ropa: 0 };
  const expenses = [
    { category: "Comida", amountCents: 150_000_00 },
    { category: "Comida", amountCents: 20_000_00, owedCents: 5_000_00 },
    { category: "Salidas", amountCents: 60_000_00 },
    { category: "Ropa", amountCents: 30_000_00 },
  ];

  it("suma por categoría, descuenta lo que te deben y marca el estado", () => {
    const b = computeBudgets(limits, expenses, "2026-11-15");
    const comida = b.rows.find((r) => r.category === "Comida")!;
    expect(comida.spentCents).toBe(165_000_00);
    expect(comida.status).toBe("warn"); // 82,5 %
    expect(comida.perDayCents).toBe(Math.floor(35_000_00 / 16));
    expect(comida.projectedCents).toBe(330_000_00);
    expect(b.rows[0].category).toBe("Salidas"); // la más pasada primero
    expect(b.rows[0].status).toBe("over");
    expect(b.unbudgeted).toEqual([{ category: "Ropa", spentCents: 30_000_00 }]);
    expect(b.totalLimitCents).toBe(250_000_00);
  });

  it("avisa una sola vez por nivel y por mes", () => {
    const { rows } = computeBudgets(limits, expenses, "2026-11-15");
    const first = pendingBudgetAlerts(rows, "2026-11", {});
    expect(first.map((a) => [a.row.category, a.level])).toEqual([["Salidas", 100], ["Comida", 80]]);
    const sent = Object.fromEntries(first.map((a) => [a.key, a.level]));
    expect(pendingBudgetAlerts(rows, "2026-11", sent)).toEqual([]);
    expect(pendingBudgetAlerts(rows, "2026-11", { "2026-11:Salidas": 80 }).map((a) => a.row.category)).toEqual(["Salidas", "Comida"]);
  });
});

describe("vencimiento de cuotas de tarjeta", () => {
  const visa = { closingDay: 20, dueDay: 5 };
  it("antes del cierre entra en el resumen del mes siguiente; después, en el otro", () => {
    expect(cardInstallmentDue("2026-11-18", 1, visa)).toBe("2026-12-05");
    expect(cardInstallmentDue("2026-11-24", 1, visa)).toBe("2027-01-05");
    expect(cardInstallmentDue("2026-11-24", 3, visa)).toBe("2027-03-05");
  });
  it("sin datos de la tarjeta, mismo día del mes siguiente", () => {
    expect(cardInstallmentDue("2026-01-31", 1)).toBe("2026-02-28");
    expect(cardInstallmentDue("2026-11-24", 2, null)).toBe("2027-01-24");
  });
});
