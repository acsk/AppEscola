export type ApiEnvelope<T> = {
  type?: string;
  message?: string;
  body?: T;
  data?: T;
};

export function unwrapApi<T>(payload: ApiEnvelope<T> | T): T {
  const casted = payload as ApiEnvelope<T>;
  return (casted?.body ?? casted?.data ?? payload) as T;
}
