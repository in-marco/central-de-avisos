type ErrorWithCode = {
  code?: unknown;
  meta?: { target?: unknown };
};

function asErrorWithCode(error: unknown): ErrorWithCode | null {
  return typeof error === "object" && error !== null
    ? (error as ErrorWithCode)
    : null;
}

export function isUniqueViolation(error: unknown): boolean {
  return asErrorWithCode(error)?.code === "P2002";
}

export function isMissingRecord(error: unknown): boolean {
  return asErrorWithCode(error)?.code === "P2025";
}

export function uniqueViolationTarget(error: unknown): string[] {
  const target = asErrorWithCode(error)?.meta?.target;

  if (Array.isArray(target)) {
    return target.filter((value): value is string => typeof value === "string");
  }

  if (typeof target === "string") {
    return [target];
  }

  return [];
}
