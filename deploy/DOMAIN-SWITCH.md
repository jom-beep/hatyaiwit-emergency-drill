# ทดลองบน khanchai.ac.th แล้วส่งมอบให้ hatyaiwit.ac.th

สถานการณ์: คุณเป็นแอดมิน Google Workspace ของ `khanchai.ac.th` แต่ระบบปลายทางคือ `hatyaiwit.ac.th`

**นี่เป็นวิธีที่ถูกต้องที่สุดแล้ว** ระบบออกแบบมาให้โดเมนเป็นค่าตั้งค่า ไม่ใช่ค่าที่ฝังในโค้ด
คุณจึงพัฒนาและสาธิตบนโดเมนตัวเองได้ทั้งหมด แล้วสลับตอนส่งมอบ

ข้อดีที่ได้เพิ่ม: เมื่อสร้าง OAuth client ในโปรเจกต์ที่อยู่ใต้ Workspace ของตัวเอง คุณเลือก
consent screen เป็น **Internal** ได้ ซึ่งแปลว่า**ไม่ต้องใส่รายชื่อผู้ทดสอบทีละคน**
ทุกบัญชี `@khanchai.ac.th` ล็อกอินได้ทันที เชิญเพื่อนครูมาช่วยทดสอบได้เลย

---

## ตอนนี้ — ตั้งค่าสำหรับทดลอง

### 1. `wrangler.jsonc`

```jsonc
"vars": {
  "ALLOWED_GOOGLE_DOMAIN": "khanchai.ac.th",
  "DEPLOYMENT_MODE": "DRILL",
  "SCHOOL_NAME": "โรงเรียนหาดใหญ่วิทยาลัย (ระบบทดลอง)",
  "PUBLIC_ORIGIN": "https://hatyaiwit-emergency-drill.<subdomain>.workers.dev",
  "COOKIE_SECURE": "true",
  ...
}
```

**เรื่อง `SCHOOL_NAME`** ผมแนะนำให้คงชื่อโรงเรียนหาดใหญ่วิทยาลัยไว้ แต่ต่อท้ายว่า "(ระบบทดลอง)"
เพราะตอนนำเสนอ ผู้ฟังจะเห็นชื่อโรงเรียนตัวเองที่หัวจอ ซึ่งช่วยให้เห็นภาพ
แต่คำว่าระบบทดลองจะกันการเข้าใจผิดว่าใช้งานได้จริงแล้ว

ค่านี้เป็นแค่ข้อความบนหน้าจอ ไม่เกี่ยวกับการยืนยันตัวตนเลย

### 2. Google Cloud

สร้างโปรเจกต์**ด้วยบัญชี `@khanchai.ac.th` ของคุณ** → APIs & Services → Credentials
→ OAuth client ID → Web application

- consent screen เลือก **Internal**
- Authorized redirect URI ใส่ทั้งสองอัน:
  - `https://hatyaiwit-emergency-drill.<subdomain>.workers.dev/auth/callback`
  - `http://localhost:8787/auth/callback`
- scope ขอแค่ `openid email profile`

เพราะคุณเป็นแอดมินของ Workspace นี้ จึงไม่ติดปัญหา API controls ที่ผมเตือนไว้รอบก่อน

### 3. แก้ข้อความบนหน้าล็อกอิน

หน้าเว็บฝังคำว่า `@hatyaiwit.ac.th` ไว้ตรง ๆ หนึ่งจุด ถ้าไม่แก้ ตอนสาธิตจะขึ้นว่า
"รองรับเฉพาะบัญชี @hatyaiwit.ac.th" แต่คุณล็อกอินด้วย khanchai ซึ่งจะทำให้คนดูงง

patch เล็ก ๆ ที่แนบมาแก้ให้ดึงค่าจากเซิร์ฟเวอร์แทน หลังจากนี้ข้อความจะเปลี่ยนตาม
`ALLOWED_GOOGLE_DOMAIN` อัตโนมัติ ตอนสลับกลับไป hatyaiwit ก็ไม่ต้องแก้อะไรอีก

```bash
cd ~/hatyaiwit-emergency-drill
patch -p1 < deploy/show-allowed-domain.patch
```

---

## ตอนส่งมอบ — สลับเป็น hatyaiwit.ac.th

### สิ่งที่ต้องเปลี่ยน

| รายการ | ทำอะไร |
|---|---|
| `ALLOWED_GOOGLE_DOMAIN` | เปลี่ยนเป็น `hatyaiwit.ac.th` |
| `SCHOOL_NAME` | ตัดคำว่า "(ระบบทดลอง)" ออก |
| OAuth client | **สร้างใหม่** ในโปรเจกต์ที่อยู่ใต้ Workspace ของหาดใหญ่วิทยาลัย แล้ว `wrangler secret put` ทับค่าเดิม |
| `PUBLIC_ORIGIN` | เปลี่ยนเป็นโดเมนจริงของโรงเรียน |
| redirect URI | เพิ่มของโดเมนใหม่ |
| `VAPID_SUBJECT` | เปลี่ยนเป็นอีเมลผู้ดูแลของหาดใหญ่วิทยาลัย |

### สิ่งที่ต้อง **ไม่** เปลี่ยน

**`IDENTITY_HMAC_SECRET` ห้ามเปลี่ยน** ถ้าเปลี่ยน ตัวตนของทุกคนที่ลงทะเบียนไว้จะกลายเป็นคนใหม่หมด
สิทธิ์ผู้ประกาศจะหาย และข้อมูลเก่าจะโยงกับใครไม่ได้อีก

**คู่กุญแจ VAPID ห้ามเปลี่ยน** ถ้าเปลี่ยน อุปกรณ์ที่ลงทะเบียนไว้แล้วทั้งหมดจะรับ push ไม่ได้
และต้องให้ทุกคนลงทะเบียนใหม่

### ⚠️ ต้องล้างบัญชีทดลองก่อนส่งมอบ

ข้อนี้สำคัญและพลาดกันบ่อย **บัญชี khanchai ที่คุณตั้งเป็นผู้ประกาศตอนทดลอง จะยังกินโควตาผู้ประกาศ 5 คนอยู่**
ถ้าไม่ล้าง ทางหาดใหญ่วิทยาลัยจะตั้งผู้ประกาศได้ไม่ครบ 5 คน

รันตามลำดับนี้ก่อนส่งมอบ:

```bash
# 1. ล้างข้อมูลจำลองที่ใช้ตอนนำเสนอ
npx wrangler d1 execute hatyaiwit-emergency-drill --remote --file=./deploy/demo-reset.sql

# 2. ดูว่าเหลือใครบ้าง — ควรเหลือแต่บัญชีทดลองของคุณกับ system:maintenance
npx wrangler d1 execute hatyaiwit-emergency-drill --remote \
  --command "SELECT identity_hash, role, call_sign FROM users WHERE active = 1"

# 3. ปลดสิทธิ์ผู้ประกาศทั้งหมดและปิดบัญชีทดลอง (เว้นบัญชีระบบไว้)
npx wrangler d1 execute hatyaiwit-emergency-drill --remote \
  --command "UPDATE users SET role='member', call_sign=NULL, active=0 WHERE identity_hash <> 'system:maintenance'"

# 4. ล้างรหัสเชิญและอุปกรณ์ที่ค้างจากช่วงทดลอง
npx wrangler d1 execute hatyaiwit-emergency-drill --remote \
  --command "DELETE FROM commander_invites; DELETE FROM commander_revocations; UPDATE push_subscriptions SET active=0"

# 5. เปิดให้ bootstrap ใหม่ได้อีกครั้ง
npx wrangler d1 execute hatyaiwit-emergency-drill --remote \
  --command "UPDATE system_flags SET value='false' WHERE key='commander_invites_created'"
```

`audit_log` จะไม่ถูกลบ (ฐานข้อมูลปฏิเสธการลบ) ซึ่งถูกต้องแล้ว — ประวัติช่วงทดลองควรเก็บไว้เป็นหลักฐานว่าระบบผ่านการทดสอบอะไรมาบ้าง

### หมุน secret ใหม่ทั้งหมดตอนส่งมอบ

```bash
npx wrangler secret put BOOTSTRAP_CODE      # ค่าใหม่ ส่งให้ผู้บริหารหาดใหญ่วิทยาลัย
npx wrangler secret put TEACHER_CODE        # ค่าใหม่
npx wrangler secret put SESSION_SECRET      # ค่าใหม่ ทุกคนต้องล็อกอินใหม่ ซึ่งถูกต้อง
```

`SESSION_SECRET` ที่เปลี่ยนจะทำให้ session ทั้งหมดที่ออกในช่วงทดลองใช้ไม่ได้ทันที
นั่นคือสิ่งที่ต้องการ — ไม่ควรมีใครจากช่วงทดลองยังค้างอยู่ในระบบของโรงเรียนปลายทาง

---

## คำแนะนำเรื่องบัญชี Cloudflare

ถ้าเป็นไปได้ ตอนส่งมอบควร**ย้ายไปอยู่บัญชี Cloudflare ของโรงเรียนหาดใหญ่วิทยาลัยเอง** ไม่ใช่ค้างอยู่ในบัญชีคุณ
เพราะถ้าวันหนึ่งคุณย้ายงานหรือติดต่อไม่ได้ โรงเรียนจะเข้าถึงระบบความปลอดภัยของตัวเองไม่ได้เลย

ทางที่สะอาดที่สุดคือ deploy ใหม่ทั้งชุดในบัญชีของโรงเรียนปลายทาง แล้วใช้ระบบเดิมของคุณเป็นสภาพแวดล้อมพัฒนาต่อไป
ซึ่งตรงกับ production gate ข้อแรกใน `SECURITY.md` ที่เขียนว่าให้แยก account ระหว่าง development กับ production อยู่แล้ว

---

## สรุปสิ่งที่ต้องทำวันนี้

- [ ] `patch -p1 < deploy/show-allowed-domain.patch`
- [ ] แก้ `ALLOWED_GOOGLE_DOMAIN` เป็น `khanchai.ac.th` และ `SCHOOL_NAME` เติม "(ระบบทดลอง)"
- [ ] สร้าง OAuth client ในโปรเจกต์ใต้ Workspace khanchai แบบ **Internal**
- [ ] `npm run dev` แล้วลองล็อกอินด้วยบัญชี khanchai ของตัวเอง
- [ ] ผ่านแล้วค่อยเดินตาม `README-DEPLOY.md` ตั้งแต่ส่วนที่ 1
