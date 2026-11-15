import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerLoginAttempt: vi.fn(),
  clearLoginAttemptsOnSuccess: vi.fn(),
  authenticateCredentials: vi.fn(),
}));

vi.mock("@/db/client", () => ({ getDb: () => ({}) }));

vi.mock("@/lib/auth/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/rate-limit")>();
  return {
    ...actual,
    registerLoginAttempt: mocks.registerLoginAttempt,
    clearLoginAttemptsOnSuccess: mocks.clearLoginAttemptsOnSuccess,
  };
});

vi.mock("@/lib/auth/session", () => ({
  authenticateCredentials: mocks.authenticateCredentials,
}));

const { POST } = await import("./route");

function loginRequest(fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  return new NextRequest("http://localhost:3107/api/auth/login", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "http://localhost:3107",
      "x-forwarded-for": "203.0.113.9",
    },
  });
}

function locationOf(response: Response): URL {
  return new URL(response.headers.get("location") ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.clearLoginAttemptsOnSuccess.mockResolvedValue(undefined);
});

describe("POST /api/auth/login con límite de intentos", () => {
  it("bloqueado: 303 a error=bloqueado sin cookie ni scrypt", async () => {
    mocks.registerLoginAttempt.mockResolvedValue({
      bloqueado: true,
      intentosEmail: 6,
      intentosIp: 6,
    });

    const response = await POST(
      loginRequest({ email: "tecnico@demo.local", password: "x", next: "/panel/avisos" }),
    );

    expect(response.status).toBe(303);
    const location = locationOf(response);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("bloqueado");
    expect(location.searchParams.get("next")).toBe("/panel/avisos");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.authenticateCredentials).not.toHaveBeenCalled();
  });

  it("registra el intento con claves de email e IP en hash", async () => {
    mocks.registerLoginAttempt.mockResolvedValue({
      bloqueado: false,
      intentosEmail: 1,
      intentosIp: 1,
    });
    mocks.authenticateCredentials.mockResolvedValue({ ok: false });

    await POST(loginRequest({ email: "Nadie@Demo.invalid", password: "x" }));

    const [, keys, windowSeconds] = mocks.registerLoginAttempt.mock.calls[0];
    expect(keys.email).toMatch(/^email:[0-9a-f]{64}$/);
    expect(keys.ip).toMatch(/^ip:[0-9a-f]{64}$/);
    expect(windowSeconds).toBe(900);
  });

  it("también cuenta un envío sin email", async () => {
    mocks.registerLoginAttempt.mockResolvedValue({
      bloqueado: false,
      intentosEmail: 1,
      intentosIp: 1,
    });

    const response = await POST(loginRequest({ password: "x" }));

    expect(mocks.registerLoginAttempt).toHaveBeenCalledTimes(1);
    expect(locationOf(response).searchParams.get("error")).toBe("credenciales");
    expect(mocks.authenticateCredentials).not.toHaveBeenCalled();
  });

  it("falla cerrado con error=servicio si el limitador falla", async () => {
    mocks.registerLoginAttempt.mockRejectedValue(new Error("db caída"));

    const response = await POST(
      loginRequest({ email: "admin@demo.local", password: "correcta" }),
    );

    expect(response.status).toBe(303);
    expect(locationOf(response).searchParams.get("error")).toBe("servicio");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.authenticateCredentials).not.toHaveBeenCalled();
  });

  it("login correcto limpia el contador y entrega la cookie", async () => {
    mocks.registerLoginAttempt.mockResolvedValue({
      bloqueado: false,
      intentosEmail: 3,
      intentosIp: 3,
    });
    mocks.authenticateCredentials.mockResolvedValue({ ok: true, token: "tok" });

    const response = await POST(
      loginRequest({ email: "admin@demo.local", password: "correcta" }),
    );

    expect(response.status).toBe(303);
    expect(locationOf(response).pathname).toBe("/panel");
    expect(response.headers.get("set-cookie")).toContain("central_sesion=tok");
    expect(mocks.clearLoginAttemptsOnSuccess).toHaveBeenCalledTimes(1);
  });

  it("un fallo al limpiar el contador no invalida la sesión", async () => {
    mocks.registerLoginAttempt.mockResolvedValue({
      bloqueado: false,
      intentosEmail: 1,
      intentosIp: 1,
    });
    mocks.authenticateCredentials.mockResolvedValue({ ok: true, token: "tok" });
    mocks.clearLoginAttemptsOnSuccess.mockRejectedValue(new Error("db"));

    const response = await POST(
      loginRequest({ email: "admin@demo.local", password: "correcta" }),
    );

    expect(locationOf(response).pathname).toBe("/panel");
    expect(response.headers.get("set-cookie")).toContain("central_sesion=tok");
  });

  it("un origen ajeno sigue respondiendo 403 sin registrar intento", async () => {
    const request = new NextRequest("http://localhost:3107/api/auth/login", {
      method: "POST",
      body: new URLSearchParams({ email: "a@b.es", password: "x" }),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://evil.example",
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(mocks.registerLoginAttempt).not.toHaveBeenCalled();
  });
});
