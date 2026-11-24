import { describe, expect, it } from "vitest";
import { classifyDue, groupDueItems } from "./deadlines";

describe("semáforo de vencimientos", () => {
  const today = "2026-11-24";
  it("clasifica por cercanía", () => {
    expect(classifyDue("2026-11-20", today, false)).toBe("overdue");
    expect(classifyDue("2026-11-24", today, false)).toBe("today");
    expect(classifyDue("2026-11-27", today, false)).toBe("next3");
    expect(classifyDue("2026-12-01", today, false)).toBe("week");
    expect(classifyDue("2026-12-15", today, false)).toBe("later");
    expect(classifyDue("2026-11-20", today, true)).toBe("paid");
  });
  it("agrupa en orden de urgencia con totales", () => {
    const groups = groupDueItems(
      [
        { id: "1", label: "EDES", amountCents: 100, dueDate: "2026-11-27", paid: false, kind: "bill" },
        { id: "2", label: "Personal", amountCents: 50, dueDate: "2026-11-20", paid: false, kind: "bill" },
        { id: "3", label: "BVC", amountCents: 70, dueDate: "2026-11-26", paid: false, kind: "bill" },
      ],
      today,
    );
    expect(groups.map((g) => g.bucket)).toEqual(["overdue", "next3"]);
    expect(groups[1].totalCents).toBe(170);
    expect(groups[1].items.map((i) => i.label)).toEqual(["BVC", "EDES"]);
  });
});
