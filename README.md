# Hatyaiwit Emergency Drill PWA

ต้นแบบระบบแจ้งเตือนการฝึกซ้อมเหตุฉุกเฉินสำหรับบัญชี `@hatyaiwit.ac.th` รองรับ PWA บน iOS และ Android โดยใช้บริการหลักบน Cloudflare

> **DRILL ONLY:** รุ่นนี้ปฏิเสธการประกาศเหตุจริงจากฝั่งเซิร์ฟเวอร์ ห้ามใช้แทนเสียงตามสาย วิทยุสื่อสาร โทรศัพท์ 191 หรือแผนฉุกเฉินของโรงเรียน

## สถาปัตยกรรม

- Workers Static Assets: หน้า PWA
- Cloudflare Worker: API, Google OIDC และการตรวจสิทธิ์
- Durable Object: สถานะเหตุหนึ่งเดียวและ WebSocket
- D1: ผู้ใช้ อุปกรณ์ รายงาน ประวัติเหตุ การตอบรับ และ Audit log
- Queues: fan-out และ Web Push พร้อม retry/dead-letter queue
- Web Push/VAPID: แจ้งเตือนเมื่อปิดหน้าเว็บ

รายชื่ออีเมลของผู้มีสิทธิ์ประกาศ 5 คนไม่ถูกฝังในโค้ด ผู้ใช้สิทธิ์พิเศษจะผูกผ่านรหัสเชิญครั้งเดียวกับ HMAC ของ Google `sub` และระบบจำกัดจำนวนไว้ที่ฐานข้อมูล

## สิ่งที่ต้องมี

- Cloudflare account ที่เปิด Workers Paid สำหรับ production
- โดเมนที่อยู่บน Cloudflare
- Google Cloud OAuth client ภายใต้ Google Workspace ของโรงเรียน
- Node.js 20 ขึ้นไป
- Wrangler CLI

## เริ่มพัฒนาในเครื่อง

1. ติดตั้ง dependency

   ```bash
   npm install
   ```

2. สร้างทรัพยากร Cloudflare

   ```bash
   npx wrangler d1 create hatyaiwit-emergency-drill
   npx wrangler queues create hatyaiwit-alert-fanout
   npx wrangler queues create hatyaiwit-alert-push
   npx wrangler queues create hatyaiwit-alert-dlq
   ```

3. นำ `database_id` ที่ได้ไปแทน `REPLACE_WITH_D1_DATABASE_ID` ใน `wrangler.jsonc`

4. คัดลอก `.dev.vars.example` เป็น `.dev.vars` แล้วใส่ค่าทดสอบ ห้าม commit ไฟล์นี้

5. สร้าง VAPID key

   ```bash
   npx web-push generate-vapid-keys
   ```

6. สร้างฐานข้อมูลท้องถิ่นและเปิดระบบ

   ```bash
   npx wrangler d1 migrations apply hatyaiwit-emergency-drill --local
   npm run dev
   ```

## ตั้งค่า Google Workspace OAuth

สร้าง OAuth 2.0 Client ประเภท Web application และกำหนด callback:

- Local: `http://localhost:8787/auth/callback`
- Production: `https://<domain>/auth/callback`

ขอ scope เฉพาะ `openid email profile` และตั้งแอปเป็น Internal สำหรับองค์กร `hatyaiwit.ac.th` จากนั้นใส่ Client ID/Secret ผ่าน Worker Secrets เท่านั้น

## Secret สำหรับ production

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
npx wrangler secret put IDENTITY_HMAC_SECRET
npx wrangler secret put BOOTSTRAP_CODE
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
```

`SESSION_SECRET`, `IDENTITY_HMAC_SECRET` และ `BOOTSTRAP_CODE` ต้องเป็นคนละค่าและสร้างด้วย CSPRNG อย่างน้อย 32 ไบต์

ก่อน deploy แก้ `PUBLIC_ORIGIN` เป็น HTTPS URL จริงและ `COOKIE_SECURE` เป็น `true`

## สร้างสิทธิ์ผู้ประกาศ 5 คน

1. ผู้ดูแลเริ่มต้นเข้าสู่ระบบด้วยบัญชี `@hatyaiwit.ac.th`
2. เรียก `POST /api/commander/bootstrap` พร้อม `BOOTSTRAP_CODE`
3. ระบบส่งรหัสสุ่ม 5 รหัสกลับมาเพียงครั้งเดียวและหมดอายุใน 72 ชั่วโมง
4. ส่งรหัสให้แต่ละคนผ่านช่องทางส่วนตัว คนละหนึ่งรหัส
5. แต่ละคนเข้าสู่ระบบและกรอกรหัสในหัวข้อ “บทบาทพิเศษ”

ระบบเก็บเพียง SHA-256 ของรหัสเชิญและ HMAC ของตัวตน Google ไม่เก็บรายชื่อผู้ประกาศเป็นข้อความธรรมดา ผู้ดูแลทั่วไปจะเห็นเพียงจำนวน ไม่เห็นรายชื่อ

## กลไกความปลอดภัยสำคัญ

- เซิร์ฟเวอร์ยอมรับเฉพาะ `mode=DRILL`
- เฉพาะบทบาท `commander` เริ่มประกาศได้
- ต้องขอ action token อายุ 60 วินาทีและกดค้าง 3 วินาที
- การยุติการฝึกต้องยืนยันจาก commander 2 คน
- จำกัด commander สูงสุด 5 คนด้วย SQLite trigger
- ทุกคำสั่งสำคัญถูกบันทึกใน append-only audit table
- ไม่อนุญาต iframe, camera, microphone หรือ geolocation
- POST API รับเฉพาะ JSON จาก same origin
- Push มี TTL และ client ปฏิเสธข้อความหมดอายุ
- ข้อความซ้ำถูกแทนที่ด้วย notification tag ตาม incident/version

## การทดสอบก่อนใช้งาน

1. 30–50 คนในศูนย์ควบคุม
2. หนึ่งอาคาร 300–500 เครื่อง
3. 1,000 เครื่อง
4. ครบ 3,500–4,000 เครื่องใน DRILL mode
5. ทดสอบ iOS/Android ทั้งหน้าจอเปิด ปิด ล็อกเครื่อง และเปลี่ยนเครือข่าย
6. ตรวจความพร้อมรายเครื่องและทดสอบเสียงตามสาย/โทรศัพท์สำรอง

ต้องมีการทบทวนจากผู้เชี่ยวชาญความปลอดภัย หน่วยงานกฎหมาย/PDPA และฝ่ายปฏิบัติการฉุกเฉินก่อนเปลี่ยนจากต้นแบบไปเป็นระบบจริง
