import { describe, expect, it } from "vitest";
import { parseIndexText } from "./index-text";

describe("parseIndexText", () => {
  it("lee ICL con distintos separadores", () => {
    const r = parseIndexText("Fecha;ICL\n01/11/2026;27,1234\n2026-11-02\t27.2\n03/11/2026 27,3", "ICL");
    expect(r.points).toEqual([
      { date: "2026-11-01", value: 27.1234 },
      { date: "2026-11-02", value: 27.2 },
      { date: "2026-11-03", value: 27.3 },
    ]);
    expect(r.errors).toEqual([]);
  });
  it("lee IPC mensual en % y lo pasa a fracción", () => {
    const r = parseIndexText("10/2026;2,7\nNoviembre 2026;2.4%", "IPC");
    expect(r.points[0]).toEqual({ date: "2026-10-01", value: 0.027 });
    expect(r.points[1].date).toBe("2026-11-01");
    expect(r.points[1].value).toBeCloseTo(0.024, 10);
  });
  it("informa líneas ilegibles", () => {
    const r = parseIndexText("cualquier cosa sin número\n99/99/2026;3", "ICL");
    expect(r.points).toHaveLength(0);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
