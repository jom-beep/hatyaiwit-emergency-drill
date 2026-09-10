/** รหัสข้อผิดพลาดหน้าเข้าสู่ระบบ — ส่งใน query เท่านั้น ไม่ใส่ข้อความดิบจาก Google */
export const LOGIN_ERROR_CODES = ["domain", "expired", "denied", "disabled", "generic"] as const;
export type LoginErrorCode = (typeof LOGIN_ERROR_CODES)[number];

export const LOGIN_ERROR_MESSAGES: Record<LoginErrorCode, string> = {
  domain: "บัญชีนี้ไม่ใช่โดเมนที่โรงเรียนอนุญาต กรุณาใช้บัญชี Google Workspace ของโรงเรียน",
  expired: "การเข้าสู่ระบบหมดเวลาหรือไม่สมบูรณ์ กรุณากดเข้าสู่ระบบอีกครั้ง",
  denied: "ยกเลิกการเข้าสู่ระบบแล้ว กดปุ่มด้านล่างเมื่อพร้อม",
  disabled: "บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อผู้ดูแลของโรงเรียน",
  generic: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่ หากยังไม่ได้ให้ผู้ดูแลตรวจค่า OAuth",
};

export function isLoginErrorCode(value: string | null | undefined): value is LoginErrorCode {
  return Boolean(value && (LOGIN_ERROR_CODES as readonly string[]).includes(value));
}

export function mapAuthFailure(options: {
  status?: number;
  message?: string;
  googleError?: string | null;
}): LoginErrorCode {
  if (options.googleError === "access_denied") return "denied";
  if (options.googleError) return "generic";
  if (options.status === 403 && options.message?.includes("อนุญาตเฉพาะบัญชี")) return "domain";
  if (options.status === 403) return "disabled";
  if (options.status === 400) return "expired";
  return "generic";
}
