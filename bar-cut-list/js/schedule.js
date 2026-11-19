/* แตกเหล็กทีละเส้น (bar schedule): ตัด run ที่ยาวเกินเหล็กเส้นมาตรฐาน โดยวางจุดต่อในโซนที่อนุญาต + บวกระยะทาบ */
(function (BCL) {
  const stockLen = (state, bar) => state.project.stock.bySize[bar] || state.project.stock.default;

  /* โซนที่อนุญาตให้ต่อ (ช่วง x เป็น มม.) */
  function spliceZones(state, G, kind) {
    const z = [];
    if (kind === 'web') { G.spans.forEach(g => { if (!g.cantilever) z.push([g.x0, g.x1]); }); return z; }   // เหล็กข้างต่อได้ทั้งช่วง
    const rule = kind === 'top' ? state.project.splice.top : state.project.splice.bottom;
    G.spans.forEach(g => {
      if (g.cantilever) return;                                 // ห้ามต่อเหล็กในช่วงคานยื่น
      const w = rule.fraction * g.clear;
      if (rule.zone === 'midspan') { const m = (g.x0 + g.x1) / 2; z.push([m - w / 2, m + w / 2]); }
      else { z.push([g.x0, g.x0 + w]); z.push([g.x1 - w, g.x1]); }
    });
    // อนุญาตให้ต่อภายใน Support ด้วย (กรณีโซน support)
    if (rule.zone === 'support') G.supports.forEach(s => { if (!s.free) z.push([s.x0, s.x1]); });
    return z.sort((a, b) => a[0] - b[0]);
  }

  /* ตัด run หนึ่งเส้นเป็นท่อน */
  function splitRun(state, G, run) {
    const stock = stockLen(state, run.bar), lap = BCL.lapLen(state, run.bar), zones = spliceZones(state, G, run.kind);
    const pieces = [];
    let a = run.x0, hookA = run.hookStart, idx = 1;
    while (true) {
      const remain = run.x1 - a + hookA + run.hookEnd;
      if (remain <= stock) {                                   // ท่อนสุดท้าย
        pieces.push({ x0: a, x1: run.x1, hookStart: hookA, hookEnd: run.hookEnd, lap: 0, cutLength: Math.round(remain), forced: false, idx });
        break;
      }
      const reach = a + stock - hookA - lap;                   // จุดต่อไกลสุดที่ท่อนนี้ไปถึงได้ (เผื่อทาบ)
      let best = null;
      zones.forEach(([z0, z1]) => { if (z0 <= reach && z1 > a + lap) best = Math.max(best ?? -Infinity, Math.min(z1, reach)); });
      let forced = false;
      if (best == null || best <= a + lap) { best = reach; forced = true; }
      pieces.push({ x0: a, x1: best + lap, hookStart: hookA, hookEnd: 0, lap, cutLength: Math.round(best - a + hookA + lap), forced, idx });   // x1 = ปลายจริง (รวมทาบ)
      a = best; hookA = 0; idx++;
      if (idx > 20) break;
    }
    return pieces;
  }

  BCL.generateSchedule = function (state) {
    const G = BCL.geometry(state), items = [], warnings = [...G.warnings];
    const push = o => { o.id = `${o.kind}:${items.filter(x => x.kind === o.kind).length + 1}`; items.push(o); };

    ['top', 'bot', 'web'].forEach(kind => G.runs[kind].forEach(run => {
      const ps = splitRun(state, G, run);
      ps.forEach(p => {
        if (p.forced) warnings.push(`${run.id}: หาโซนต่อไม่ได้ → ต่อที่ ${Math.round(p.x1)} มม. (ตรวจสอบ)`);
        push({ kind, bar: run.bar, n: run.n, x0: p.x0, x1: p.x1, hookStart: p.hookStart, hookEnd: p.hookEnd, lap: p.lap, cutLength: p.cutLength,
          forced: p.forced, runId: run.id, piece: p.idx, of: ps.length, anchor: ps.length > 1 && p.idx === ps.length ? 'right' : 'left',
          lapReq: p.idx > 1 ? BCL.lapLen(state, run.bar) : 0, label: (run.layer ? `${run.id} ชั้น ${run.layer + 1}` : run.id) + (ps.length > 1 ? ` ท่อน ${p.idx}/${ps.length}` : ''), layer: run.layer || 0 });
      });
    }));

    G.extraTop.forEach((e, k) => {
      if (e.length > stockLen(state, e.bar)) warnings.push(`เหล็กพิเศษบน Support ${e.support + 1}: ยาว ${e.length} เกินเหล็กเส้น`);
      push({ kind: 'exTop', bar: e.bar, n: e.n, x0: e.x0, x1: e.x1, hookStart: e.hookStart, hookEnd: e.hookEnd, lap: 0, cutLength: e.length, label: `พิเศษบน Support ${e.support + 1}` });
    });
    G.extraBot.forEach(e => push({ kind: 'exBot', bar: e.bar, n: e.n, x0: e.x0, x1: e.x1, hookStart: 0, hookEnd: 0, lap: 0, cutLength: e.length, label: `พิเศษล่าง ${G.spans[e.span].name}` }));

    // ปลอก: 1 รายการต่อช่วง (ความยาวตัดเท่ากันทั้งช่วง) แยกโซนไว้สำหรับแสดงผล
    G.stirrups.forEach((st, i) => {
      const g = G.spans[i];
      push({ kind: 'stir', bar: st.bar, n: st.count, x0: g.x0, x1: g.x1, hookStart: 0, hookEnd: 0, lap: 0, cutLength: st.cutLength, positions: st.positions,
        zones: st.zones.map(z => ({ x0: z.x0, x1: z.x1, s: z.s, count: z.count, label: z.label })), label: `ปลอก ${g.name}` });
    });

    // คง override ความยาว/จำนวนที่ user เคยแก้ไว้ (จับคู่ด้วย id)
    const old = (state.beam.schedule && state.beam.schedule.items) || [];
    items.forEach(it => { const o = old.find(x => x.id === it.id && x.bar === it.bar); it.userLength = o && o.userLength != null && o.cutLength === it.cutLength ? o.userLength : null; it.userN = o && o.userN != null && o.n === it.n ? o.userN : null; if (o && o.anchor && o.cutLength === it.cutLength) it.anchor = o.anchor; });

    state.beam.schedule = { generatedAt: Date.now(), stale: false, items, warnings };
    return state.beam.schedule;
  };

  /* ตำแหน่งจริงหลังผู้ใช้แก้ความยาว: ปลายด้านที่ตรึง (anchor) อยู่กับที่ อีกด้านเลื่อน → ระยะทาบเปลี่ยนตาม */
  BCL.effectiveItems = function (state) {
    const sch = state.beam.schedule; if (!sch) return [];
    const stock = bar => stockLen(state, bar);
    const eff = sch.items.map(it => {
      const len = it.userLength ?? it.cutLength, body = len - it.hookStart - it.hookEnd;
      const e = { ...it, len, ex0: it.x0, ex1: it.x1, issues: [] };
      if (it.kind !== 'stir') { if ((it.anchor || 'left') === 'right') e.ex0 = it.x1 - body; else e.ex1 = it.x0 + body; }
      if (len > stock(it.bar)) e.issues.push(`ยาว ${len} เกินเหล็กเส้น ${stock(it.bar)}`);
      if (body <= 0) e.issues.push('ความยาวน้อยกว่าระยะงอ');
      return e;
    });
    eff.forEach(e => {
      if (!e.runId || e.piece <= 1) return;
      const prev = eff.find(x => x.runId === e.runId && x.piece === e.piece - 1); if (!prev) return;
      e.lapActual = Math.round(prev.ex1 - e.ex0); e.lapPrevId = prev.id;
      if (e.lapActual < e.lapReq) e.issues.push(`ทาบ ${e.lapActual} น้อยกว่ากำหนด ${e.lapReq}`);
    });
    return eff;
  };

  /* สรุปรายการสำหรับขั้น cut list (ใช้ตอนส่งชุดคานเข้ารายการ) */
  BCL.scheduleRows = state => (state.beam.schedule?.items || []).map(it => ({ id: it.id, bar: it.bar, qty: it.userN ?? it.n, length: it.userLength ?? it.cutLength, label: it.label }));
})(window.BCL);
