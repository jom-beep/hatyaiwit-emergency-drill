// สร้างผังห้องจริง 66 ห้อง (ม.1/1 – ม.6/11) พร้อมโซนอาคาร
const levels = [1,2,3,4,5,6], perLevel = 11;
const zoneOf = (lv) => lv <= 2 ? 'BUILDING_1' : lv <= 4 ? 'BUILDING_2' : 'BUILDING_3';
const rows = [];
for (const lv of levels) for (let r = 1; r <= perLevel; r++)
  rows.push(`  ('M${lv}-${String(r).padStart(2,'0')}', 'ม.${lv}/${r}', '${zoneOf(lv)}')`);
console.log(`-- ผังห้องจริง ${rows.length} ห้อง — แทนที่ห้องตัวอย่างใน migration 0002
DELETE FROM roll_calls WHERE room LIKE 'B_-%';
DELETE FROM rooms WHERE id LIKE 'B_-%';

INSERT OR REPLACE INTO rooms (id, name_th, zone) VALUES
${rows.join(',\n')};`);
