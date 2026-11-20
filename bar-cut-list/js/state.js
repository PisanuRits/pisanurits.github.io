/* โครงสร้างข้อมูล (ตาม docs/data-model.md) + โหลด/บันทึก */
(function (BCL) {
  const clone = o => JSON.parse(JSON.stringify(o));
  BCL.clone = clone;

  BCL.defaultProject = () => ({
    name: 'โครงการใหม่',
    units: 'mm',                // หน่วยแสดงผล: mm | cm | m (ค่าภายในเป็น มม.)
    cover: 25,
    stock: { lengths: [10000, 12000], default: 10000, bySize: {} },
    lap: { mode: 'factor', factor: 40, table: {} },
    hook: {
      main90:     { mode: 'factor', factor: 12, min: 150 },
      stirrup135: { mode: 'factor', factor: 6,  min: 75 },
      stirrup90:  { mode: 'factor', factor: 6,  min: 50 },
    },
    splice: {
      top:    { zone: 'midspan', fraction: 0.333 },
      bottom: { zone: 'support', fraction: 0.25 },
      stagger: true, staggerFactor: 1.3,
    },
    stirrup: { firstSpacing: 50, legs: 2, deg: 135 },   // deg = มุมขอปลอกเริ่มต้นของช่วงใหม่
    cut: { kerf: 0, minOffcut: 1000 },        // เผื่อรอยตัด / เศษสั้นสุดที่ถือว่าใช้ต่อได้ (มม.)
    bend: { on: true, f90: 2, f135: 3, f180: 4 },   // ค่าหักการงอ = n × d ต่อการงอ 1 ครั้ง (ความยาวตัด = รวมระยะนอก–นอก − ค่าหัก)
    endDefaults: {
      edgeSupport:   { mode: 'hook' },
      sameDepth:     { mode: 'continuous' },
      shallowToDeep: { mode: 'extend', factorD: 40 },
      deepToShallow: { mode: 'hook' },
    },
  });

  const end = () => ({ mode: 'auto', value: null });
  BCL.defaultSpan = (i = 0) => ({
    name: `B${i + 1}`,
    L: 4000, b: 200, h: 400,
    top: { n: 2, bar: 'DB12', left: end(), right: end() },
    bot: { n: 2, bar: 'DB12', left: end(), right: end() },
    web: { on: false, n: 2, bar: 'DB12', left: end(), right: end() },   // เหล็กข้าง (skin/web bar) จำนวนรวมทั้งสองข้าง
    extraTop: { on: false, n: 2, bar: 'DB12', frac: 'L/4' },
    extraBot: { on: false, n: 2, bar: 'DB12', len: { mode: 'frac', value: 'L/2', custom: 2000 } },
    stir: { bar: 'RB6', s: 150, endOn: false, sEnd: 100, endLen: 1000, deg: 135 },   // endOn = หัวเสาเสริมถี่กว่า
  });
  BCL.defaultSupport = () => ({ width: 200, on: true });

  /* ฐานราก (หน่วยภายใน มม., ระดับ lvTop/lvCol เป็น ม.) */
  const mesh = (bar, val) => ({ bar, mode: 's', val });   // mode: 's' = ระยะ @ (มม.), 'n' = จำนวนเส้น
  BCL.defaultFooting = () => ({
    name: 'F1', count: 1, type: 'pile', shape: 'rect',
    pile: { nx: 2, ny: 2, d: 220, s: 750, emb: 50, edge: 225 },
    B: 1200, L: 1200, t: 500, cover: 75,
    ped: { b: 250, l: 250, lvTop: -1.5, lvCol: -0.2, cover: 40, bar: 'DB16', n: 4, emb: 'hook', leg: 300, top: 'lap', lap: 640 },
    tie: { bar: 'RB6', s: 150, hook: 135, leg: 75 },
    bx: mesh('DB16', 150), by: mesh('DB16', 150), botLeg: 200, botLip: 0,
    tri: { bar: 'DB16', n: 5 }, tm: mesh('DB12', 200),
    top: { on: false, x: mesh('DB12', 200), y: mesh('DB12', 200), leg: 150, lip: 0 },
    side: { on: true, bar: 'DB12', n: 1, pos: 'out', leg: 300 },
    ovr: {},
  });                    // on=false ที่ตัวริม = คานยื่น

  BCL.defaultState = (n = 2) => {
    const s = { version: 3, project: BCL.defaultProject(), members: [], footing: BCL.defaultFooting(), beam: { name: 'B1', supports: [], spans: [], spliceOverrides: [] } };
    for (let i = 0; i < n; i++) s.beam.spans.push(BCL.defaultSpan(i));
    for (let i = 0; i <= n; i++) s.beam.supports.push(BCL.defaultSupport());
    return s;
  };

  /* ปรับจำนวนช่วง (คงค่าเดิม, ช่วงใหม่คัดลอกจากช่วงสุดท้าย) */
  BCL.setSpanCount = (state, n) => {
    n = Math.max(1, Math.min(6, n | 0));
    const b = state.beam;
    while (b.spans.length < n) { const c = clone(b.spans[b.spans.length - 1] || BCL.defaultSpan()); c.name = `B${b.spans.length + 1}`; c.stir.deg = +(state.project.stirrup && state.project.stirrup.deg) || c.stir.deg || 135; b.spans.push(c); }
    b.spans.length = n;
    if (b.supports.length > n + 1) b.supports.length = n + 1;
    if (b.supports.length === n + 1 && b.supports[n]) b.supports[n].on = b.supports[n].on !== false;   // ตัวริมใหม่ให้มี Support
    while (b.supports.length < n + 1) b.supports.push(clone(b.supports[b.supports.length - 1] || BCL.defaultSupport()));
    b.supports.length = n + 1;
  };

  /* เติม field ที่ขาดให้ state เก่า/ไฟล์ที่โหลดเข้ามา */
  BCL.normalize = (state) => {
    const d = BCL.defaultState(1);
    const merge = (dst, src) => { for (const k in src) { if (dst[k] === undefined) dst[k] = clone(src[k]); else if (typeof src[k] === 'object' && src[k] && !Array.isArray(src[k]) && typeof dst[k] === 'object') merge(dst[k], src[k]); } return dst; };
    state.project = merge(state.project || {}, d.project);
    state.beam = state.beam || {};
    state.beam.name = state.beam.name || 'B1';
    state.beam.spans = (state.beam.spans || []).map((sp, i) => {
      // แปลงปลอกรูปแบบเก่า {sEnd,endLen,sMid} → {s,endOn,sEnd,endLen}
      if (sp.stir && sp.stir.s === undefined && sp.stir.sMid !== undefined) { sp.stir.s = sp.stir.sMid; sp.stir.endOn = sp.stir.sEnd !== sp.stir.sMid; delete sp.stir.sMid; }
      return merge(sp, BCL.defaultSpan(i));
    });
    if (!state.beam.spans.length) state.beam.spans.push(BCL.defaultSpan(0));
    state.beam.supports = (state.beam.supports || []).map(s => merge(s, BCL.defaultSupport()));
    state.beam.spliceOverrides = state.beam.spliceOverrides || [];
    state.members = (state.members || []).map(m => ({ type: 'beam', ...m }));
    state.footing = merge(state.footing || {}, BCL.defaultFooting());
    BCL.setSpanCount(state, state.beam.spans.length);
    state.version = 3;
    return state;
  };

  const KEY = 'bcl_state_v1';   // คงคีย์เดิมเพื่อโหลดข้อมูลที่เคยบันทึกไว้ (normalize แปลงให้)
  BCL.save = state => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };
  BCL.load = () => { try { const s = localStorage.getItem(KEY); return s ? BCL.normalize(JSON.parse(s)) : null; } catch (e) { return null; } };

  BCL.exportJSON = state => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = (state.project.name || 'bar-cut-list').replace(/[\\/:*?"<>|]/g, '_') + '.json'; a.click(); URL.revokeObjectURL(a.href);
  };
  BCL.importJSON = (file, cb) => {
    const r = new FileReader();
    r.onload = () => { try { cb(null, BCL.normalize(JSON.parse(r.result))); } catch (e) { cb(e); } };
    r.readAsText(file);
  };
})(window.BCL);
