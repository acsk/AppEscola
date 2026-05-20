import { useState, useEffect } from "react";
import api from "../services/api";

export type DomainItem = { slug: string; label: string };

const cache: Record<string, DomainItem[]> = {};

function unwrapDomainList(res: unknown): unknown[] {
  if (Array.isArray(res)) return res;
  if (res && typeof res === "object") {
    const envelope = res as { body?: unknown; data?: unknown };
    if (Array.isArray(envelope.body)) return envelope.body;
    if (Array.isArray(envelope.data)) return envelope.data;
  }
  return [];
}

export function useDomain(endpoint: string): DomainItem[] {
  const [data, setData] = useState<DomainItem[]>(cache[endpoint] ?? []);

  useEffect(() => {
    let cancelled = false;

    api
      .get(endpoint)
      .then(({ data: res }) => {
        if (cancelled) return;

        const normalized: DomainItem[] = unwrapDomainList(res)
          .map((item: any) => ({
            slug: String(item?.slug ?? ""),
            label: String(item?.label ?? item?.name ?? item?.slug ?? ""),
          }))
          .filter((item) => item.slug !== "");

        cache[endpoint] = normalized;
        setData(normalized);
      })
      .catch(() => {
        if (!cancelled && cache[endpoint]) {
          setData(cache[endpoint]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  return data;
}

/** Limpa cache de domínios (ex.: após deploy que adiciona novos tipos). */
export function clearDomainCache(endpoint?: string): void {
  if (endpoint) {
    delete cache[endpoint];
    return;
  }
  Object.keys(cache).forEach((key) => delete cache[key]);
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
