import { expect, test } from "@playwright/test";
import { countByFilter, filterInvoices, invoiceDisplayStatus, monthsBetween, nextDueDate, summarizeInvoices } from "../utils/enrollmentInvoices";

/** Lógica pura (sem navegador): npx playwright test tests/enrollmentInvoices.spec.ts --project=chromium */

const TODAY = "2026-10-15";
const inv = (status: string, due_date: string, amount = "100.00") => ({ status, due_date, amount });

test.describe("cobranças da matrícula", () => {
  test("pendente com vencimento passado conta como vencida", () => {
    expect(invoiceDisplayStatus(inv("pending", "2026-10-10"), TODAY)).toBe("overdue");
    expect(invoiceDisplayStatus(inv("pending", "2026-10-15"), TODAY)).toBe("pending");
    expect(invoiceDisplayStatus(inv("overdue", "2026-11-10"), TODAY)).toBe("overdue");
  });

  test("filtros, contagens e totais", () => {
    const list = [inv("pending", "2026-10-10"), inv("pending", "2026-11-10"), inv("paid", "2026-09-10", "125.50"), inv("cancelled", "2026-12-10")];
    expect(filterInvoices(list, "vencidas", TODAY)).toHaveLength(1);
    expect(countByFilter(list, TODAY)).toEqual({ todas: 4, pendentes: 1, pagas: 1, vencidas: 1 });
    expect(summarizeInvoices(list, TODAY)).toEqual({ open: 100, paid: 125.5, overdue: 100, total: 325.5 });
    expect(nextDueDate(list, TODAY)).toBe("2026-11-10");
  });

  test("meses de vigência", () => {
    expect(monthsBetween("2026-10-06", "2026-11-30")).toBe(2);
    expect(monthsBetween("2026-10-06", null)).toBeNull();
  });
});
