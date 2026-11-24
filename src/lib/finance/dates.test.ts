import { describe, expect, it } from "vitest";
import { addDays, addMonths, addMonthsToDate, daysInMonth, diffDays, monthRange, todayAR } from "./dates";

describe("dates", () => {
  it("suma meses cruzando año", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
  it("recorta al fin de mes", () => {
    expect(addMonthsToDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsToDate("2024-01-31", 1)).toBe("2024-02-29");
  });
  it("calcula diferencias de días", () => {
    expect(diffDays("2026-02-28", "2026-03-01")).toBe(1);
    expect(diffDays("2026-03-01", "2026-02-28")).toBe(-1);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("días del mes y rangos", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(monthRange("2026-11", 3)).toEqual(["2026-11", "2026-12", "2027-01"]);
  });
  it("hoy en Argentina (UTC-3)", () => {
    expect(todayAR(new Date("2026-11-25T02:00:00Z"))).toBe("2026-11-24");
    expect(todayAR(new Date("2026-11-25T03:00:00Z"))).toBe("2026-11-25");
  });
});
