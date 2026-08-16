# คู่มือ deploy และเตรียมข้อมูลสำหรับนำเสนอ

ทำตามลำดับนี้ ใช้เวลาราว 45–60 นาทีถ้าทุกอย่างราบรื่น

ตลอดคู่มือนี้แทนโดเมนของคุณด้วย `alert.example.ac.th` — เปลี่ยนเป็นของจริง

---

## ส่วนที่ 1 — เตรียมทรัพยากรบน Cloudflare

### 1.1 เข้าสู่ระบบ

```bash
cd ~/hatyaiwit-emergency-drill
npx wrangler login
```

### 1.2 สร้างฐานข้อมูลและคิว

```bash
npx wrangler d1 create hatyaiwit-emergency-drill
npx wrangler queues create hatyaiwit-alert-fanout
npx wrangler queues create hatyaiwit-alert-push
npx wrangler queues create hatyaiwit-alert-dlq
```

คำสั่งแรกจะพิมพ์ `database_id` ออกมา นำไปแทนที่ `REPLACE_WITH_D1_DATABASE_ID` ใน `wrangler.jsonc`

> ถ้า `queues create` ฟ้องว่าต้องอัปเกรด ให้ไปเปิด Workers Paid ($5/เดือน) ที่หน้า Dashboard → Workers & Pages → Plans
> Queues มีโควตาฟรี 10,000 operations/วัน แต่ **การสร้างคิวครั้งแรกอาจต้องมีแผนที่รองรับ** ตรวจดูตอนสร้างจริง

### 1.3 ตั้งโดเมน

เพิ่มบล็อกนี้ใน `wrangler.jsonc` ระดับบนสุด (ระดับเดียวกับ `"vars"`)

```jsonc
"routes": [
  { "pattern": "alert.example.ac.th", "custom_domain": true }
],
```

โดเมนต้องอยู่ภายใต้บัญชี Cloudflare เดียวกัน (ชี้ nameserver มาที่ Cloudflare แล้ว)
Cloudflare จะออกใบรับรอง HTTPS ให้อัตโนมัติภายในไม่กี่นาที

**ถ้ายังจัดการ DNS ไม่ได้** ข้ามข้อนี้ไปเลย — Cloudflare แถม `hatyaiwit-emergency-drill.<subdomain>.workers.dev`
มาให้ฟรีพร้อม HTTPS จริง ซึ่งเพียงพอสำหรับ PWA, Service Worker และ Web Push ทุกอย่าง
ใช้ URL นั้นแทนในทุกขั้นตอนถัดไป

### 1.4 แก้ค่าใน `wrangler.jsonc`

```jsonc
"PUBLIC_ORIGIN": "https://alert.example.ac.th",
"COOKIE_SECURE": "true"
```

**ข้อนี้พลาดบ่อยที่สุด** ถ้า `PUBLIC_ORIGIN` ไม่ตรงกับ URL จริง การเข้าสู่ระบบ Google จะล้มเหลวทันที

---

## ส่วนที่ 2 — Google OAuth

Google Cloud Console → APIs & Services → Credentials → OAuth client ID → **Web application**

เพิ่ม Authorized redirect URI **ทั้งสองอัน** (เก็บ localhost ไว้เพื่อพัฒนาต่อ):

```
https://alert.example.ac.th/auth/callback
http://localhost:8787/auth/callback
```

ที่ OAuth consent screen เลือก **Internal** ภายใต้ Workspace `hatyaiwit.ac.th`
scope ขอแค่ `openid email profile` เท่านั้น

---

## ส่วนที่ 3 — ใส่ secret

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
npx wrangler secret put IDENTITY_HMAC_SECRET
npx wrangler secret put BOOTSTRAP_CODE
npx wrangler secret put TEACHER_CODE
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
```

- `VAPID_SUBJECT` ใส่รูปแบบ `mailto:safety-admin@hatyaiwit.ac.th`
- คู่กุญแจ VAPID สร้างด้วย `npx web-push generate-vapid-keys` — **ต้องเป็นคู่เดียวกับที่ใช้ตอน dev** ไม่งั้นอุปกรณ์ที่ลงทะเบียนไว้แล้วจะใช้ไม่ได้
- `SESSION_SECRET`, `IDENTITY_HMAC_SECRET`, `BOOTSTRAP_CODE`, `TEACHER_CODE` สร้างด้วย `openssl rand -base64 32` **คนละค่ากันทั้งสี่**

> `IDENTITY_HMAC_SECRET` เปลี่ยนไม่ได้หลังมีคนลงทะเบียนแล้ว เพราะตัวตนทุกคนคำนวณจากค่านี้
> ถ้าเปลี่ยน ทุกคนจะกลายเป็นคนใหม่หมดและสิทธิ์ผู้ประกาศจะหาย

---

## ส่วนที่ 4 — ขึ้นระบบ

```bash
npx wrangler d1 migrations apply hatyaiwit-emergency-drill --remote
npx wrangler d1 execute hatyaiwit-emergency-drill --remote --file=./deploy/rooms-hatyaiwit.sql
npx wrangler deploy
```

ไฟล์ที่สองแทนที่ห้องตัวอย่าง 6 ห้องด้วย **ผังห้องจริง 66 ห้อง ม.1/1 ถึง ม.6/11**
แบ่งอาคารเป็น ม.1–2 อาคาร 1 · ม.3–4 อาคาร 2 · ม.5–6 อาคาร 3
ถ้าผังจริงไม่ตรงนี้ แก้ใน `deploy/gen-rooms.mjs` แล้วรัน `node deploy/gen-rooms.mjs > deploy/rooms-hatyaiwit.sql` ใหม่

### ตรวจว่าขึ้นแล้วจริง

```bash
curl https://alert.example.ac.th/api/health
```

ต้องได้ `{"ok":true,"mode":"DRILL"}`

---

## ส่วนที่ 5 — สร้างบัญชีผู้ใช้สำหรับทดสอบ

ระบบให้เข้าได้เฉพาะบัญชี `@hatyaiwit.ac.th` และ **สร้างผู้ใช้ปลอมที่ล็อกอินได้ไม่ได้** ตามการออกแบบ
สิ่งที่ทำได้คือให้บัญชีจริงของคุณมีบทบาทที่ต้องการ

### 5.1 เข้าสู่ระบบหนึ่งครั้งก่อน

เปิด `https://alert.example.ac.th` แล้วล็อกอินด้วยบัญชีโรงเรียนของคุณ
แค่ล็อกอินก็พอ ระบบจะสร้างแถวใน `users` ให้อัตโนมัติ

### 5.2 หา identity hash ของตัวเอง

```bash
npx wrangler d1 execute hatyaiwit-emergency-drill --remote \
  --command "SELECT identity_hash, role, last_login_at FROM users ORDER BY last_login_at DESC LIMIT 5"
```

แถวบนสุดคือคุณ คัดลอก `identity_hash` มา

### 5.3 ตั้งตัวเองเป็นผู้ประกาศ

```bash
npx wrangler d1 execute hatyaiwit-emergency-drill --remote \
  --command "UPDATE users SET role='commander', call_sign='CMD-DEMO1' WHERE identity_hash='<ค่าที่คัดลอกมา>'"
```

วิธีนี้ข้ามขั้นตอน bootstrap ไปเลย เร็วกว่าสำหรับการเตรียมนำเสนอ
ตอนใช้งานจริงให้ใช้ `POST /api/commander/bootstrap` ตามที่ `SECURITY.md` กำหนด

รีเฟรชหน้าเว็บ จะเห็นแผงสั่งการ กระดานสถานะ และแผงจัดการผู้ประกาศ

### 5.4 ผู้ร่วมทดสอบคนอื่น

ให้เพื่อนร่วมงานล็อกอินด้วยบัญชีโรงเรียนของเขา แล้ว:

- **ให้เป็นครู** — บอก `TEACHER_CODE` ให้เขากรอกในหน้าเว็บใต้ "มีรหัสเชิญสำหรับบทบาทพิเศษ"
- **ให้เป็นผู้ประกาศคนที่ 2** — คุณกดปุ่ม "ออกรหัสเชิญทดแทน" ในแผงจัดการผู้ประกาศ แล้วส่งรหัสให้เขาเป็นการส่วนตัว

**อย่างน้อยต้องมีผู้ประกาศ 2 คน** ไม่งั้นจะสาธิตการยุติการฝึกซ้อมไม่ได้ เพราะต้องอนุมัติ 2 คน

---

## ส่วนที่ 6 — เติมข้อมูลให้กระดานดูสมจริง

กระดานศูนย์ควบคุมที่มีอุปกรณ์ 3 เครื่องจะดูจืดมากตอนนำเสนอ
สคริปต์นี้เติมข้อมูลจำลอง 3,400 อุปกรณ์เข้าไปในเหตุการณ์ที่กำลังดำเนินอยู่

**ต้องเริ่มการฝึกซ้อมจากหน้าเว็บก่อน** เพราะสถานะเหตุอยู่ใน Durable Object ไม่ใช่ใน D1
สร้างจาก SQL อย่างเดียวกระดานจะไม่ขึ้น

### 6.1 เริ่มการฝึกซ้อมจากหน้าเว็บ

กดค้าง 3 วินาทีที่ปุ่ม DRILL แล้วหา incident id:

```bash
npx wrangler d1 execute hatyaiwit-emergency-drill --remote \
  --command "SELECT id, status, issued_at FROM incidents ORDER BY issued_at DESC LIMIT 1"
```

จะได้รูปแบบ `DRILL-20260815103000-a1b2c3d4`

### 6.2 สร้างและใส่ข้อมูลจำลอง

```bash
node deploy/gen-demo-data.mjs "DRILL-20260815103000-a1b2c3d4" 3400 > /tmp/demo-data.sql
npx wrangler d1 execute hatyaiwit-emergency-drill --remote --file=/tmp/demo-data.sql
```

รีเฟรชกระดาน จะเห็น: อุปกรณ์พร้อม 3,400 · ส่งสำเร็จ 3,376 · รับทราบ 2,108 · ขอความช่วยเหลือ 7 · ห้องที่รายงาน 42/66
พร้อมกระดานห้องที่มีทั้งสีเขียว ส้ม แดง และเทา

> ไฟล์ SQL ที่ 3,400 เครื่องมีขนาดราว 1.5 MB ถ้า `d1 execute` ปฏิเสธเพราะไฟล์ใหญ่เกิน ให้ลดจำนวนลง
> `node deploy/gen-demo-data.mjs "<id>" 1200` ได้ไฟล์ 528 KB และกระดานยังดูดีอยู่

### 6.3 ⚠️ ล้างข้อมูลจำลองก่อนซ้อมรอบใหม่ทุกครั้ง

```bash
npx wrangler d1 execute hatyaiwit-emergency-drill --remote --file=./deploy/demo-reset.sql
```

**สำคัญมาก** ถ้าไม่ล้างแล้วกดเริ่มการฝึกซ้อมรอบใหม่ ระบบจะพยายามส่ง push ไปยังอุปกรณ์ปลอม 3,400 เครื่อง
ปลายทางจะตอบ 404 ระบบจะปิดใช้งานอุปกรณ์เหล่านั้นเองและไม่ retry วนซ้ำ (จึงไม่พัง)
แต่จะกิน Queues ไปราว 10,000 operations ซึ่งเท่ากับโควตาฟรีทั้งวัน

`demo-reset.sql` ลบเฉพาะแถวที่ขึ้นต้นด้วย `demo` เท่านั้น **ผู้ใช้จริง ผังห้อง และ audit log ไม่ถูกแตะ**

---

## รายการตรวจก่อนวันนำเสนอ

- [ ] `curl /api/health` ตอบ `{"ok":true,"mode":"DRILL"}`
- [ ] ล็อกอินด้วยบัญชีโรงเรียนได้ และเห็นแผงผู้ประกาศ
- [ ] **มือถือจริงอย่างน้อย 2 เครื่อง** ลงทะเบียนแล้วและได้รับ push จริง (ดูส่วนที่ 7)
- [ ] มีผู้ประกาศ 2 คน เพื่อสาธิตการยุติการฝึกซ้อม
- [ ] มีบัญชีบทบาทครู 1 คน เพื่อสาธิตการเช็กชื่อ
- [ ] ใส่ข้อมูลจำลองแล้ว กระดานดูสมจริง
- [ ] ทดสอบซ้อมเต็มรอบหนึ่งครั้งก่อนวันจริง อย่าเดโมสด ๆ โดยไม่ซ้อม

---

## ส่วนที่ 7 — smoke test push บนมือถือจริง

ข้อนี้สำคัญที่สุดในทั้งคู่มือ เพราะเป็นข้อที่ผมยังยืนยันไม่ได้ว่า `web-push` ส่งออกจาก Cloudflare Workers ได้จริง
ส่วนเข้ารหัสผมทดสอบแล้วว่าทำงานได้ แต่การส่งออกจริงยังไม่มีใครพิสูจน์

**iPhone/iPad:** เปิดใน Safari → กดปุ่มแชร์ → **เพิ่มไปยังหน้าจอโฮม** → เปิดจากไอคอนที่ติดตั้ง → กดอนุญาตการแจ้งเตือน
ถ้าเปิดใน Safari ธรรมดาจะไม่ได้รับ push เด็ดขาด นี่คือข้อจำกัดของ iOS ไม่ใช่บั๊ก

**Android:** เปิดใน Chrome → อนุญาตการแจ้งเตือน (จะเพิ่มลงหน้าจอโฮมด้วยก็ได้)

จากนั้นยิง DRILL แล้วตรวจ:

```bash
npx wrangler d1 execute hatyaiwit-emergency-drill --remote \
  --command "SELECT status, http_status, COUNT(*) AS n FROM delivery_log GROUP BY 1,2"
```

ต้องเห็น `SENT` พร้อม `http_status` 201 และเครื่องต้องเด้งจริง

**ถ้าไม่ผ่าน** ดู log สด ๆ ด้วย `npx wrangler tail` แล้วส่งข้อความ error มาให้ผม
กรณีที่เป็นไปได้มากที่สุดคือ `web-push` เรียก `node:https` ไม่สำเร็จบน Workers
ซึ่งแก้ได้โดยเขียนการส่ง Web Push ด้วย `fetch` + WebCrypto เอง — ผมเขียนให้ได้ถ้าเจอปัญหานี้
