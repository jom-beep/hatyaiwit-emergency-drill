import { describe, expect, it } from "vitest";
import { isLoginErrorCode, mapAuthFailure } from "../src/login-errors";

describe("mapAuthFailure", () => {
  it("maps Google cancel to denied", () => {
    expect(mapAuthFailure({ googleError: "access_denied" })).toBe("denied");
  });

  it("maps other Google errors to generic without leaking the raw code", () => {
    expect(mapAuthFailure({ googleError: "invalid_client" })).toBe("generic");
  });

  it("maps wrong Workspace domain to domain", () => {
    expect(mapAuthFailure({ status: 403, message: "อนุญาตเฉพาะบัญชี @khanchai.ac.th" })).toBe("domain");
  });

  it("maps inactive account to disabled", () => {
    expect(mapAuthFailure({ status: 403, message: "บัญชีนี้ไม่สามารถใช้งานได้" })).toBe("disabled");
  });

  it("maps expired OAuth state to expired", () => {
    expect(mapAuthFailure({ status: 400, message: "OAuth state ไม่ถูกต้องหรือหมดอายุ" })).toBe("expired");
  });

  it("never treats unknown query values as valid codes", () => {
    expect(isLoginErrorCode("domain")).toBe(true);
    expect(isLoginErrorCode("<script>")).toBe(false);
    expect(isLoginErrorCode("access_denied")).toBe(false);
  });
});
