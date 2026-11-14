import { describe, expect, it } from "vitest";
import { isSameOrigin, isSecureRequest } from "./origin";

function request(headers: Record<string, string>, url = "http://localhost:3000/api/auth/login") {
  return new Request(url, { method: "POST", headers });
}

describe("isSameOrigin", () => {
  it("acepta el mismo origen", () => {
    expect(
      isSameOrigin(request({ origin: "http://localhost:3000" })),
    ).toBe(true);
  });

  it("acepta peticiones sin cabecera Origin", () => {
    expect(isSameOrigin(request({}))).toBe(true);
  });

  it("rechaza otro origen", () => {
    expect(
      isSameOrigin(request({ origin: "https://evil.example" })),
    ).toBe(false);
    expect(
      isSameOrigin(request({ origin: "http://localhost:3001" })),
    ).toBe(false);
  });

  it("rechaza Origin malformado o null", () => {
    expect(isSameOrigin(request({ origin: "no-es-una-url" }))).toBe(false);
    expect(isSameOrigin(request({ origin: "null" }))).toBe(false);
  });

  it("usa x-forwarded-host y x-forwarded-proto detrás de un proxy", () => {
    expect(
      isSameOrigin(
        request({
          origin: "https://central.example.com",
          "x-forwarded-host": "central.example.com",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toBe(true);
  });
});

describe("isSecureRequest", () => {
  it("detecta HTTPS por la URL o por x-forwarded-proto", () => {
    expect(isSecureRequest(request({}, "https://central.example.com/x"))).toBe(
      true,
    );
    expect(
      isSecureRequest(
        request({ "x-forwarded-proto": "https" }, "http://localhost:3000/x"),
      ),
    ).toBe(true);
    expect(isSecureRequest(request({}))).toBe(false);
    expect(
      isSecureRequest(
        request({ "x-forwarded-proto": "http" }, "https://central.example.com"),
      ),
    ).toBe(false);
  });
});
