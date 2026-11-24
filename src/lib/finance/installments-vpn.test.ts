import { describe, expect, it } from "vitest";
import { compareCashVsInstallments, impliedRate, presentValue, rankInstallmentOptions } from "./installments-vpn";

describe("contado vs cuotas", () => {
  it("12 cuotas sin interés con 3 % de inflación mensual conviene en cuotas", () => {
    const r = compareCashVsInstallments({ listPriceCents: 12_000_000, option: { count: 12 }, monthlyInflation: 0.03 });
    expect(r.installments).toHaveLength(12);
    expect(r.installments[0]).toBe(1_000_000);
    expect(r.presentValueCents).toBe(9_954_004);
    expect(r.savingWithInstallmentsCents).toBe(2_045_996);
    expect(r.best).toBe("cuotas");
    expect(r.impliedMonthlyRate).toBeCloseTo(0, 6);
  });

  it("con recargo alto y descuento contado, conviene contado", () => {
    const r = compareCashVsInstallments({ listPriceCents: 10_000_000, cashDiscountRate: 0.15, option: { count: 6, surchargeRate: 0.2 }, monthlyInflation: 0.02 });
    expect(r.cashPriceCents).toBe(8_500_000);
    expect(r.nominalTotalCents).toBe(12_000_000);
    expect(r.best).toBe("contado");
    expect(r.impliedMonthlyRate!).toBeGreaterThan(0.02);
  });

  it("usa el mayor entre inflación y rendimiento alternativo", () => {
    const r = compareCashVsInstallments({ listPriceCents: 1_000_000, option: { count: 3 }, monthlyInflation: 0.02, monthlyAlternativeRate: 0.04 });
    expect(r.discountRate).toBe(0.04);
  });

  it("la TIR implícita iguala el VP al precio contado", () => {
    const payments = [550_000, 550_000];
    const irr = impliedRate(1_000_000, payments)!;
    expect(presentValue(payments, irr)).toBeCloseTo(1_000_000, 2);
  });

  it("ordena opciones de mejor a peor", () => {
    const ranked = rankInstallmentOptions({ listPriceCents: 6_000_000, monthlyInflation: 0.03 }, [
      { count: 3, surchargeRate: 0.1 },
      { count: 6 },
    ]);
    expect(ranked[0].option.count).toBe(6);
  });

  it("valida la cantidad de cuotas", () => {
    expect(() => compareCashVsInstallments({ listPriceCents: 100, option: { count: 0 }, monthlyInflation: 0 })).toThrow();
  });
});
