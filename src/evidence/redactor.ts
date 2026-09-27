const SENSITIVE_KEY = /(api[-_]?key|token|secret|password|authorization|private[-_]?key|credential)/i;

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[REDACTED_OPENAI_KEY]"],
  [/\bgh[pousr]_[A-Za-z0-9_]{16,}\b/g, "[REDACTED_GITHUB_TOKEN]"],
  [/\bAIza[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_GOOGLE_KEY]"],
  [/\bjv_live_[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_TYPESAFE_KEY]"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/gi, "Bearer [REDACTED]"],
];

export function redactString(value: string): string {
  return SECRET_PATTERNS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value);
}

export function redactValue(value: unknown, keyHint?: string): unknown {
  if (keyHint !== undefined && SENSITIVE_KEY.test(keyHint) && typeof value === "string" && value !== "") {
    return "[REDACTED]";
  }
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, redactValue(nested, key)]),
    );
  }
  return value;
}
