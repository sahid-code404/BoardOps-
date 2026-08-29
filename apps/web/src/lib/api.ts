export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = { success: false; error: string };

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    throw new Error("Expected a JSON API response");
  }

  const body = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!response.ok || !body.success) {
    throw new Error("error" in body ? body.error : `Request failed (${response.status})`);
  }
  return body.data;
}
