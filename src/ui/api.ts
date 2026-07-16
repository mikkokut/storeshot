export async function request<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (typeof init?.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  const response = await fetch(url, { ...init, headers })
  if (!response.ok) {
    const value = (await response.json().catch(() => null)) as { error?: string; code?: string } | null
    throw new RequestError(value?.error ?? `Request failed with status ${response.status}`, response.status, value?.code)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export class RequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message)
  }
}

export function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong"
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
