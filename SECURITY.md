# Security policy and deployment gates

## ขอบเขตของรุ่นนี้

รุ่น `0.1.0` เป็นซอฟต์แวร์สำหรับการฝึกซ้อมเท่านั้น ไม่ได้รับการรับรองเป็นระบบ life-safety และไม่มีฟังก์ชันส่งเหตุเข้าตำรวจหรือหน่วยแพทย์อัตโนมัติ

## ข้อมูลอ่อนไหว

- ห้าม commit `.dev.vars`, OAuth secrets, VAPID private key หรือ bootstrap code
- ห้ามส่งรหัส commander ผ่านห้องแชต กลุ่มอีเมล หรือเอกสารที่ทุกคนเข้าถึงได้
- ห้ามเพิ่ม endpoint ที่ส่งออกรายชื่อ commander
- ห้ามบันทึก request body ของ `/api/commander/bootstrap` หรือ `/api/commander/redeem`
- จำกัดผู้ที่จัดการ Cloudflare account และ D1 production ให้น้อยที่สุดและเปิด MFA

## Production gates

ต้องผ่านทั้งหมดก่อนใช้งานนอกห้องทดลอง:

- [ ] แยก Cloudflare production account/project จาก development
- [ ] ใช้ custom domain และ HTTPS เท่านั้น
- [ ] ตั้ง `COOKIE_SECURE=true`
- [ ] Google OAuth app เป็น Internal และตรวจ `hd=hatyaiwit.ac.th`
- [ ] หมุน secrets หลังจบการติดตั้ง
- [ ] เปิด WAF และ rate limiting สำหรับ auth, report, subscribe และ commander endpoints
- [ ] ตรวจ dependency และทำ penetration test โดยบุคคลอิสระ
- [ ] ทดสอบ queue retry, dead-letter queue และ Cloudflare outage procedure
- [ ] ทดสอบพร้อมกันอย่างน้อย 4,000 subscriptions
- [ ] มีเสียงตามสาย วิทยุสื่อสาร และโทรศัพท์เป็นช่องทางสำรอง
- [ ] มี SOP ระบุผู้สั่งการ ข้อความมาตรฐาน การยุติเหตุ และการเก็บหลักฐาน
- [ ] ผ่านการพิจารณา PDPA และกำหนด retention ของ logs
- [ ] ผู้บริหารโรงเรียนและหน่วยฉุกเฉินในพื้นที่อนุมัติแผน

## เหตุการณ์ข้อมูลรั่วไหล

เมื่อสงสัยว่า secret หรือบัญชี commander ถูกเปิดเผย ให้หยุดการประกาศชั่วคราว ปิดบัญชี/อุปกรณ์ที่เกี่ยวข้อง หมุน OAuth, session, identity-HMAC และ VAPID keys ตามขอบเขตผลกระทบ และเก็บ Audit log ไว้เพื่อการตรวจสอบ ห้ามลบ log เพื่อปกปิดเหตุ
