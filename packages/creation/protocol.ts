export const CHANNEL = "studio-moyin";
export const VERSION = 1;

export type Envelope = {
  channel: typeof CHANNEL;
  version: typeof VERSION;
  requestId: string;
  type:
    "PING" | "READY" | "IMPORT" | "LOADED" | "EXPORT" | "EXPORTED" | "ERROR";
  payload?: unknown;
};

export function isEnvelope(value: unknown): value is Envelope {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<Envelope>;
  return (
    v.channel === CHANNEL &&
    v.version === VERSION &&
    typeof v.requestId === "string" &&
    v.requestId.length <= 80 &&
    [
      "PING",
      "READY",
      "IMPORT",
      "LOADED",
      "EXPORT",
      "EXPORTED",
      "ERROR",
    ].includes(v.type ?? "")
  );
}

export function envelope(
  type: Envelope["type"],
  requestId: string,
  payload?: unknown,
): Envelope {
  return { channel: CHANNEL, version: VERSION, type, requestId, payload };
}

// The initial integration is a local-only browser tool, bound to loopback.
export function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      url.origin === origin &&
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}
