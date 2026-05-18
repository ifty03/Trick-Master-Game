const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:5000";

type GetToken = () => Promise<string | null>;

let getTokenFn: GetToken = async () => null;

export function setApiTokenGetter(fn: GetToken) {
  getTokenFn = fn;
}

export function getApiUrl(): string {
  return API_URL.replace(/\/$/, "");
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getTokenFn();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${getApiUrl()}/api${path}`, {
    ...options,
    headers,
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      (body as { error?: string }).error ?? res.statusText ?? "Request failed",
      res.status
    );
  }

  return body as T;
}
