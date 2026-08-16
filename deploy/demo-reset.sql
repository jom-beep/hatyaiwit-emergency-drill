-- ลบข้อมูลจำลองทั้งหมด — รันก่อนเริ่มการฝึกซ้อมรอบใหม่ทุกครั้ง
DELETE FROM delivery_log     WHERE subscription_id LIKE 'demo%';
DELETE FROM acknowledgements WHERE identity_hash   LIKE 'demo:%';
DELETE FROM roll_calls       WHERE reporter_identity_hash LIKE 'demo:%';
DELETE FROM push_subscriptions WHERE id LIKE 'demo%';
DELETE FROM users            WHERE identity_hash  LIKE 'demo:%';
