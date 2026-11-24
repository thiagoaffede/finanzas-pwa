import { describe, expect, it } from "vitest";
import { daysWorkedInMonth, easterSunday, isBusinessDay, nthBusinessDay, sacPayment, salaryPayment } from "./payroll-calendar";

describe("días hábiles", () => {
  it("Pascua y feriados", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(isBusinessDay("2026-04-03")).toBe(false); // Viernes Santo
    expect(isBusinessDay("2026-02-16")).toBe(false); // Carnaval
    expect(isBusinessDay("2026-12-25")).toBe(false);
    expect(isBusinessDay("2026-11-28")).toBe(false); // sábado
  });

  it("tercer día hábil", () => {
    expect(nthBusinessDay("2026-12", 3)).toBe("2026-12-03"); // mar 1, mié 2, jue 3
    expect(nthBusinessDay("2027-01", 3)).toBe("2027-01-06"); // 1 feriado, sáb/dom
    expect(nthBusinessDay("2026-05", 3)).toBe("2026-05-06"); // 1 feriado (vie)
    expect(nthBusinessDay("2026-11", 3)).toBe("2026-11-04");
  });
});

describe("sueldo proporcional", () => {
  const input = { monthlyNetCents: 1_000_000_00, hireDate: "2026-11-18" };
  it("días trabajados en el mes de ingreso (mes de 30)", () => {
    expect(daysWorkedInMonth("2026-11", "2026-11-18")).toBe(13);
    expect(daysWorkedInMonth("2026-11", "2026-11-01")).toBe(30);
    expect(daysWorkedInMonth("2026-10", "2026-11-18")).toBe(0);
    expect(daysWorkedInMonth("2026-12", "2026-11-18")).toBe(30);
    expect(daysWorkedInMonth("2026-12", null)).toBe(30);
  });

  it("el sueldo de noviembre entra en diciembre, proporcional", () => {
    const p = salaryPayment("2026-12", input);
    expect(p).toMatchObject({ date: "2026-12-03", accrualMonth: "2026-11", days: 13, amountCents: 433_333_33 });
    expect(salaryPayment("2026-11", input).amountCents).toBe(0);
    expect(salaryPayment("2027-01", input).amountCents).toBe(1_000_000_00);
  });
});

describe("aguinaldo", () => {
  it("proporcional a los días trabajados del semestre", () => {
    const sac = sacPayment("2026-12", { monthlyNetCents: 1_000_000_00, hireDate: "2026-11-18" })!;
    expect(sac.daysWorked).toBe(44);
    expect(sac.semesterDays).toBe(184);
    expect(sac.date).toBe("2026-12-18");
    expect(sac.amountCents).toBe(Math.round((500_000_00 * 44) / 184));
  });

  it("semestre completo es medio sueldo; fuera de junio/diciembre no hay", () => {
    expect(sacPayment("2027-06", { monthlyNetCents: 1_000_000_00, hireDate: "2026-11-18" })!.amountCents).toBe(500_000_00);
    expect(sacPayment("2027-03", { monthlyNetCents: 1_000_000_00 })).toBeNull();
    expect(sacPayment("2026-06", { monthlyNetCents: 1_000_000_00, hireDate: "2026-11-18" })).toBeNull();
  });
});
