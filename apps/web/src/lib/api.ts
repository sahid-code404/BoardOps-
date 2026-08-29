export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = { success: false; error: string };

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!response.ok || !body.success) {
    throw new Error("error" in body ? body.error : `Request failed (${response.status})`);
  }
  return body.data;
}
