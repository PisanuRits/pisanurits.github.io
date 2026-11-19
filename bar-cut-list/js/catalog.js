/* ตารางเหล็กมาตรฐาน */
window.BCL = window.BCL || {};
(function (BCL) {
  BCL.BARS = [
    { name: 'RB6',  d: 6,  type: 'RB', w: 0.222 },
    { name: 'RB9',  d: 9,  type: 'RB', w: 0.499 },
    { name: 'DB10', d: 10, type: 'DB', w: 0.617 },
    { name: 'DB12', d: 12, type: 'DB', w: 0.888 },
    { name: 'DB16', d: 16, type: 'DB', w: 1.578 },
    { name: 'DB20', d: 20, type: 'DB', w: 2.466 },
    { name: 'DB25', d: 25, type: 'DB', w: 3.853 },
  ];
  BCL.BAR_NAMES = BCL.BARS.map(b => b.name);
  BCL.STIRRUP_BARS = ['RB6', 'RB9', 'DB10', 'DB12'];
  BCL.bar = name => BCL.BARS.find(b => b.name === name) || BCL.BARS[3];
  BCL.barD = name => BCL.bar(name).d;

  BCL.END_MODES = [
    { v: 'auto',       t: 'อัตโนมัติ' },
    { v: 'continuous', t: 'ต่อเนื่อง' },
    { v: 'extend',     t: 'ยื่นเข้าช่วงถัดไป' },
    { v: 'hook',       t: 'งอฉาก' },
    { v: 'stop',       t: 'หยุดใน Support' },
  ];
  /* หน่วยแสดงผล (ค่าภายในเก็บเป็น มม. เสมอ) */
  BCL.UNITS = { mm: { f: 1, dec: 0, t: 'มม.', ab: 'mm.' }, cm: { f: 10, dec: 1, t: 'ซม.', ab: 'cm.' }, m: { f: 1000, dec: 3, t: 'ม.', ab: 'm.' } };
  BCL.units = state => {
    const u = BCL.UNITS[state.project.units] || BCL.UNITS.mm;
    return { ...u, key: state.project.units || 'mm',
      out: mm => mm == null || mm === '' ? '' : String(+(mm / u.f).toFixed(u.dec)),   // มม. → ค่าแสดงผล
      in: v => v == null || v === '' || !isFinite(+v) ? null : Math.round(+v * u.f),  // ค่าที่กรอก → มม.
      step: mm => String(+(mm / u.f).toFixed(u.dec)),
      sp: mm => u.f === 1000 ? (mm / 1000).toFixed(2) : String(+(mm / u.f).toFixed(u.dec)) };   // ระยะปลอก เช่น 0.10 m.
  };
  /* ค่าหักการงอ (มม.) — bends = { 90: n, 135: n, 180: n } */
  BCL.bendDeduct = (state, bar, bends) => {
    const b = state.project.bend || {}; if (b.on === false || !bends) return 0;
    const d = BCL.barD(bar);
    return Math.round(((bends[90] || 0) * (b.f90 ?? 2) + (bends[135] || 0) * (b.f135 ?? 3) + (bends[180] || 0) * (b.f180 ?? 4)) * d);
  };
  BCL.EXTRA_TOP_FRAC = ['L/5', 'L/4', 'L/3'];
  BCL.EXTRA_BOT_LEN  = ['L/2', '3L/5', '2L/3', 'L', 'กำหนดเอง'];
})(window.BCL);
