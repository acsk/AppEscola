import { useState, useEffect } from "react";
import api from "../services/api";

export type DomainItem = { slug: string; label: string };

const cache: Record<string, DomainItem[]> = {};

export function useDomain(endpoint: string): DomainItem[] {
  const [data, setData] = useState<DomainItem[]>(cache[endpoint] ?? []);

  useEffect(() => {
    if (cache[endpoint]) {
      setData(cache[endpoint]);
      return;
    }
    api
      .get(endpoint)
      .then(({ data: res }) => {
        // normaliza: API pode retornar { slug, name } ou { slug, label }
        const normalized: DomainItem[] = (res as any[]).map((item) => ({
          slug: item.slug,
          label: item.label ?? item.name ?? item.slug,
        }));
        cache[endpoint] = normalized;
        setData(normalized);
      })
      .catch(() => {});
  }, [endpoint]);

  return data;
}

export const useStatuses = () => useDomain("/domains/statuses");
export const usePeriods = () => useDomain("/domains/periods");
export const useEnrollmentStatuses = () => useDomain("/domains/enrollment-statuses");
export const useInvoiceStatuses = () => useDomain("/domains/invoice-statuses");
export const usePaymentMethods = () => useDomain("/domains/payment-methods");
export const useGuardianRelationships = () => useDomain("/domains/guardian-relationships");
export const useBillingCycles = () => useDomain("/domains/billing-cycles");
export const useInvoiceTypes = () => useDomain("/domains/invoice-types");
export const useWeekdays = () => useDomain("/domains/weekdays");
export const useExamStatuses = () => useDomain("/exam-statuses");
export const useExamTypes = () => useDomain("/exam-types");

export function domainToOptions(items: DomainItem[]) {
  return items.map((d) => ({ value: d.slug, label: d.label }));
}
