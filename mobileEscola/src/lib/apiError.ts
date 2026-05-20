type ApiErrorPayload = {
  message?: string;
  errors?: Record<string, string[]>;
  body?: {
    message?: string;
    errors?: Record<string, string[]>;
  };
};

export function getApiErrorMessage(error: unknown, fallback: string): string {
  const err = error as { response?: { data?: ApiErrorPayload } };
  const data = err?.response?.data;
  const errors = data?.body?.errors ?? data?.errors;

  if (errors && typeof errors === 'object') {
    const messages = Object.values(errors).flat().filter(Boolean);
    if (messages.length > 0) {
      return messages.join(' ');
    }
  }

  return data?.body?.message ?? data?.message ?? fallback;
}
