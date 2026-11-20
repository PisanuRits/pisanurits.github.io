/* คำนวณพิกัด (มม. จากศูนย์ Support ตัวแรก / ปลายคานยื่น), การจบปลายเหล็ก, bar runs, ปลอก */
(function (BCL) {
  const P = s => s.project;

  BCL.lapLen = (state, bar) => {
    const l = P(state).lap, d = BCL.barD(bar);
    if (l.mode === 'table' && l.table[bar]) return l.table[bar];
    return Math.round(l.factor * d);
  };
  BCL.hookLen = (state, bar, which = 'main90') => {
    const h = P(state).hook[which], d = BCL.barD(bar);
    return Math.max(h.min || 0, Math.round(h.factor * d));
  };
  /* ปลายคานยื่น: งอฉากลงเต็มความลึก (หักระยะหุ้ม) */
  const freeHook = (state, sp) => Math.max(BCL.hookLen(state, 'DB12'), sp.h - 2 * P(state).cover);
  BCL.isFree = (state, k) => { const s = state.beam.supports[k]; return !!s && s.on === false && (k === 0 || k === state.beam.spans.length); };
  BCL.spanName = (state, i) => state.beam.spans[i].name || `B${i + 1}`;
  /* จำนวนเส้นแต่ละชั้นของกลุ่มเหล็กแกน (ไม่มี layers = ชั้นเดียว n เส้น) */
  BCL.layersOf = g => (Array.isArray(g.layers) && g.layers.length ? g.layers : [g.n]).map(v => Math.max(0, v | 0));
  BCL.totalN = g => BCL.layersOf(g).reduce((a, v) => a + v, 0);

  const KIND_T = { top: 'เหล็กบน', bot: 'เหล็กล่าง', web: 'เหล็กข้าง' };
  BCL.KIND_T = KIND_T;
  /* --- การจบปลายเหล็กแกนด้านหนึ่งของช่วงหนึ่ง --- */
  function resolveEnd(state, kind, i, side, warn) {
    const sps = state.beam.spans, sp = sps[i], grp = sp[kind], name = BCL.spanName(state, i);
    const user = grp[side] || { mode: 'auto' };
    const edge = (side === 'left' && i === 0) || (side === 'right' && i === sps.length - 1);
    const supIdx = side === 'left' ? i : i + 1, sup = state.beam.supports[supIdx], free = edge && BCL.isFree(state, supIdx);
    const nb = side === 'left' ? sps[i - 1] : sps[i + 1];
    const ed = P(state).endDefaults, d = BCL.barD(grp.bar), kindT = KIND_T[kind], sideT = side === 'left' ? 'ซ้าย' : 'ขวา';
    let r;
    if (user.mode !== 'auto') {
      r = { mode: user.mode, value: user.value, source: 'user' };
      if (free && (r.mode === 'continuous' || r.mode === 'extend')) { r.mode = 'hook'; r.value = null; warn(`${name} ${kindT} ปลาย${sideT}: ปลายคานยื่นต่อเนื่อง/ยื่นไม่ได้ → ใช้งอฉาก`); }
      else if (r.mode === 'continuous' && edge) { r.mode = 'hook'; r.value = null; warn(`${name} ${kindT} ปลาย${sideT}: Support ตัวริมต่อเนื่องไม่ได้ → ใช้งอฉาก`); }
      else if (r.mode === 'extend' && edge) warn(`${name} ${kindT} ปลาย${sideT}: ยื่นเลย Support ตัวริม (ถ้าเป็นคานยื่นให้ติ๊ก "ไม่มี Support")`);
    } else if (free) {
      r = { mode: 'hook', value: freeHook(state, sp), source: 'auto' };
    } else if (edge) {
      r = { mode: ed.edgeSupport.mode, value: null, source: 'auto' };
    } else if (kind === 'web' && !(nb.web && nb.web.on)) {
      r = { mode: 'hook', value: null, source: 'auto' };   // ช่วงถัดไปไม่มีเหล็กข้าง
    } else if ((nb[kind][side === 'left' ? 'right' : 'left'] || {}).mode !== 'auto' && nb[kind][side === 'left' ? 'right' : 'left'].mode !== 'continuous') {
      r = { mode: 'hook', value: null, source: 'auto' };   // อีกฝั่งถูกตั้งค่าไม่ต่อเนื่อง → ฝั่งนี้งอฉาก
    } else if (kind === 'top' || sp.h === nb.h) {
      r = { mode: ed.sameDepth.mode, value: null, source: 'auto' };
    } else if (sp.h < nb.h) {
      r = { mode: ed.shallowToDeep.mode, value: Math.round((ed.shallowToDeep.factorD || 40) * d), source: 'auto' };
    } else {
      r = { mode: ed.deepToShallow.mode, value: null, source: 'auto' };
    }
    if (r.mode === 'extend' && !(r.value > 0)) r.value = Math.round((ed.shallowToDeep.factorD || 40) * d);
    if (r.mode === 'hook' && !(r.value > 0)) r.value = free ? freeHook(state, sp) : BCL.hookLen(state, grp.bar);
    if (r.mode === 'stop' && !(r.value > 0)) r.value = free ? 0 : Math.max(0, Math.round(sup.width / 2 - P(state).cover));
    r.free = free;
    return r;
  }

  BCL.geometry = function (state) {
    const b = state.beam, cover = P(state).cover, warnings = [], nS = b.spans.length;
    const warn = m => { if (!warnings.includes(m)) warnings.push(m); };
    const name = i => BCL.spanName(state, i);

    // Support (ตัวริมที่ปิดอยู่ = ปลายคานยื่น กว้าง 0) และช่วง
    const supports = [], spans = [];
    let cx = 0;
    b.supports.forEach((s, k) => {
      const free = BCL.isFree(state, k), w = free ? 0 : Math.max(50, s.width || 0);
      supports.push({ k, cx, width: w, free, x0: cx - w / 2, x1: cx + w / 2 });
      if (k < nS) { const nf = BCL.isFree(state, k + 1), wn = nf ? 0 : Math.max(50, (b.supports[k + 1] || s).width || 0); cx += Math.max(b.spans[k].L || 0, w / 2 + wn / 2 + 300); }
    });
    b.spans.forEach((sp, i) => {
      const x0 = supports[i].x1, x1 = supports[i + 1].x0;
      spans.push({ i, name: name(i), L: sp.L, b: sp.b, h: sp.h, x0, x1, clear: x1 - x0, cx0: supports[i].cx, cx1: supports[i + 1].cx,
        freeL: supports[i].free, freeR: supports[i + 1].free, cantilever: supports[i].free || supports[i + 1].free });
      if (x1 - x0 < 300) warn(`${name(i)}: ช่วงสั้นผิดปกติ (clear ${x1 - x0} มม.)`);
    });
    const totalLen = supports[nS].x1 - supports[0].x0;

    // การจบปลาย + รวม runs (เหล็กบน / ล่าง / ข้าง)
    const ends = { top: [], bot: [], web: [] }, runs = { top: [], bot: [], web: [] };
    const active = (kind, i) => kind !== 'web' || !!b.spans[i].web.on;
    ['top', 'bot', 'web'].forEach(kind => {
      const kindT = KIND_T[kind];
      b.spans.forEach((sp, i) => ends[kind][i] = active(kind, i) ? { left: resolveEnd(state, kind, i, 'left', warn), right: resolveEnd(state, kind, i, 'right', warn) } : null);
      // ตรวจรอยต่อระหว่างช่วง: ต่อเนื่องได้เมื่อ ขนาดเหล็กเท่ากัน และระดับเท่ากัน (จำนวนต่างกันได้ — เส้นที่เกินจะจบที่หัวเสา)
      for (let i = 0; i < nS - 1; i++) {
        if (!ends[kind][i] || !ends[kind][i + 1]) continue;
        const R = ends[kind][i].right, Lf = ends[kind][i + 1].left, a = b.spans[i], c = b.spans[i + 1];
        if (R.mode === 'continuous' && Lf.mode === 'continuous') {
          const same = a[kind].bar === c[kind].bar && (kind === 'top' || a.h === c.h);
          if (!same) {
            warn(`${kindT} ${name(i)}–${name(i + 1)}: ต่อเนื่องไม่ได้ (${a[kind].bar}/h${a.h} กับ ${c[kind].bar}/h${c.h} ต่างกัน) → ใช้งอฉากทั้งสองฝั่ง`);
            R.mode = Lf.mode = 'hook'; R.value = BCL.hookLen(state, a[kind].bar); Lf.value = BCL.hookLen(state, c[kind].bar); R.forced = Lf.forced = true;
          }
        } else if (R.mode === 'continuous' || Lf.mode === 'continuous') {
          const side = R.mode === 'continuous' ? R : Lf, bar = R.mode === 'continuous' ? a[kind].bar : c[kind].bar;
          warn(`${kindT} ที่ Support ${i + 2}: ตั้งต่อเนื่องด้านเดียว → ใช้งอฉากแทน`);
          side.mode = 'hook'; side.value = BCL.hookLen(state, bar); side.forced = true;
        }
      }
      // แบ่งเป็นช่วงต่อเนื่อง (segment) แล้วแยกชั้นตามจำนวนเส้น: ฐาน = จำนวนน้อยสุด ต่อเนื่องตลอด, ส่วนเกินจบที่หัวเสาด้วยงอฉาก
      const pushRun = (i, j, n, sub, segI, segJ, layer) => {
        const sp = b.spans[i], g = sp[kind], bar = g.bar;
        const hookAt = () => ({ mode: 'hook', value: BCL.hookLen(state, bar), source: 'auto', derived: true });
        let st = i === segI ? ends[kind][i].left : hookAt(), en = j === segJ ? ends[kind][j].right : hookAt();
        if (st.mode === 'continuous') st = hookAt();   // ชั้นนี้ไม่มีเหล็กในช่วงข้างเคียง → จบด้วยงอฉาก
        if (en.mode === 'continuous') en = hookAt();
        const sL = supports[i], sR = supports[j + 1];
        let x0, x1, hookStart = 0, hookEnd = 0;
        if (st.mode === 'hook') { x0 = sL.x0 + cover; hookStart = st.value; }
        else if (st.mode === 'stop') { x0 = sL.free ? sL.cx + cover : sL.cx - st.value; }
        else { x0 = sL.x0 - st.value; }                       // extend
        if (en.mode === 'hook') { x1 = sR.x1 - cover; hookEnd = en.value; }
        else if (en.mode === 'stop') { x1 = sR.free ? sR.cx - cover : sR.cx + en.value; }
        else { x1 = sR.x1 + en.value; }
        runs[kind].push({ id: `${kind.toUpperCase()}-${runs[kind].length + 1}`, kind, bar, n, layer, sub, spans: Array.from({ length: j - i + 1 }, (_, k) => i + k),
          x0, x1, hookStart, hookEnd, start: st, end: en, length: Math.round(x1 - x0 + hookStart + hookEnd) });
      };
      const decompose = (i, j, counts, sub, segI, segJ, layer) => {
        const base = Math.min(...counts);
        if (base > 0) pushRun(i, j, base, sub, segI, segJ, layer);
        let k = 0;
        while (k < counts.length) {
          if (counts[k] - base <= 0) { k++; continue; }
          let m = k; while (m + 1 < counts.length && counts[m + 1] - base > 0) m++;
          decompose(i + k, i + m, counts.slice(k, m + 1).map(c => c - base), sub + 1, segI, segJ, layer);
          k = m + 1;
        }
      };
      // ชั้นเหล็ก (layer): เหล็กแกนบน/ล่างมีได้หลายชั้น แต่ละชั้นแยก run ของตัวเอง (เหล็กข้างมีชั้นเดียว)
      const layersOf = sp => BCL.layersOf(sp[kind]);
      const nLayers = Math.max(...b.spans.map(sp => active(kind, b.spans.indexOf(sp)) ? layersOf(sp).length : 0), 0);
      for (let layer = 0; layer < nLayers; layer++) {
        const cnt = i => active(kind, i) ? (layersOf(b.spans[i])[layer] || 0) : 0;
        let i = 0;
        while (i < nS) {
          if (!cnt(i)) { i++; continue; }
          let j = i;
          while (j < nS - 1 && cnt(j + 1) && ends[kind][j].right.mode === 'continuous') j++;
          decompose(i, j, b.spans.slice(i, j + 1).map((sp, k) => cnt(i + k)), 0, i, j, layer);
          i = j + 1;
        }
      }
    });

    // ตรวจจำนวนเส้นต่อชั้น (ระยะห่างขั้นต่ำ = max(25 มม., d))
    b.spans.forEach((sp, i) => {
      const ds = BCL.barD(sp.stir.bar);
      const cap = bar => { const d = BCL.barD(bar), smin = Math.max(25, d); return Math.max(1, Math.floor((sp.b - 2 * cover - 2 * ds + smin) / (d + smin))); };
      // ตรวจทีละชั้น: ชั้นแรกรวมเหล็กพิเศษ (เสริมอยู่ชั้นเดียวกับแกน)
      [['top', 'เหล็กบน', sp.extraTop], ['bot', 'เหล็กล่าง', sp.extraBot]].forEach(([k, t, ex]) => {
        const L = BCL.layersOf(sp[k]), c = cap(sp[k].bar);
        L.forEach((n, li) => { const tot = n + (li === 0 && ex.on ? ex.n : 0);
          if (tot > c) warn(`${name(i)} ${t}ชั้นที่ ${li + 1}: ${tot} เส้น${li === 0 && ex.on ? ' (รวมพิเศษ)' : ''} เกินที่เรียงได้ (${c} เส้นในคานกว้าง ${sp.b}) → เพิ่มชั้นหรือลดจำนวน`); });
      });
    });

    // เหล็กพิเศษบน (ต่อเนื่องข้าม Support; ช่วงคานยื่น = ยาวเต็มช่วงถึงปลาย + งอฉาก)
    const extraTop = [];
    supports.forEach((sup, k) => {
      if (sup.free) return;
      const Ls = b.spans[k - 1], Rs = b.spans[k], gL = spans[k - 1], gR = spans[k];
      const onL = Ls && Ls.extraTop.on, onR = Rs && Rs.extraTop.on;
      if (!onL && !onR) return;
      const fracLen = (sp, g) => g.cantilever ? g.clear : g.clear / ({ 'L/5': 5, 'L/4': 4, 'L/3': 3 }[sp.extraTop.frac] || 4);
      const extL = onL ? fracLen(Ls, gL) : 0, extR = onR ? fracLen(Rs, gR) : 0;
      let x0 = onL ? gL.x1 - extL : sup.x0 + cover, x1 = onR ? gR.x0 + extR : sup.x1 - cover;
      let hookStart = onL ? 0 : BCL.hookLen(state, Rs.extraTop.bar), hookEnd = onR ? 0 : BCL.hookLen(state, Ls.extraTop.bar);
      if (onL && gL.cantilever) { x0 = gL.x0 + cover; hookStart = freeHook(state, Ls); }
      if (onR && gR.cantilever) { x1 = gR.x1 - cover; hookEnd = freeHook(state, Rs); }
      const parts = [];
      if (onL) parts.push({ span: k - 1, n: Ls.extraTop.n, bar: Ls.extraTop.bar, frac: gL.cantilever ? 'เต็มช่วง' : Ls.extraTop.frac, x0, x1: sup.cx });
      if (onR) parts.push({ span: k, n: Rs.extraTop.n, bar: Rs.extraTop.bar, frac: gR.cantilever ? 'เต็มช่วง' : Rs.extraTop.frac, x0: sup.cx, x1 });
      const src = onL ? Ls : Rs;
      if (onL && onR && (Ls.extraTop.bar !== Rs.extraTop.bar || Ls.extraTop.n !== Rs.extraTop.n)) warn(`เหล็กพิเศษบนที่ Support ${k + 1}: ซ้าย-ขวาต่างขนาด/จำนวน (จะคิดแยกเส้นในขั้น bar schedule)`);
      extraTop.push({ support: k, x0, x1, bar: src.extraTop.bar, n: src.extraTop.n, parts, hookStart, hookEnd, length: Math.round(x1 - x0 + hookStart + hookEnd) });
    });

    // เหล็กพิเศษล่าง (กลางช่วง)
    const extraBot = [];
    b.spans.forEach((sp, i) => {
      if (!sp.extraBot.on) return;
      const g = spans[i], e = sp.extraBot, v = e.len.value;
      let len = e.len.mode === 'custom' || v === 'กำหนดเอง' ? e.len.custom : v === 'L/2' ? g.clear / 2 : v === '3L/5' ? g.clear * 3 / 5 : v === '2L/3' ? g.clear * 2 / 3 : g.clear;
      len = Math.min(Math.round(len), g.clear);
      const m = (g.x0 + g.x1) / 2;
      extraBot.push({ span: i, x0: m - len / 2, x1: m + len / 2, bar: e.bar, n: e.n, length: len });
    });

    // ปลอก: โซนหัวเสา (เฉพาะฝั่งที่มี Support และติ๊ก "หัวเสาถี่กว่า") + โซนปกติ
    const stirrups = b.spans.map((sp, i) => {
      const g = spans[i], st = sp.stir, first = P(state).stirrup.firstSpacing, s = st.s || 150;
      const endOn = !!st.endOn && st.sEnd > 0;
      const zL = endOn && !g.freeL ? Math.min(st.endLen, g.clear / 2) : 0, zR = endOn && !g.freeR ? Math.min(st.endLen, g.clear / 2) : 0;
      const left = [], right = [];
      for (let x = g.x0 + first; x <= g.x0 + zL + 1e-6; x += st.sEnd) left.push(x);
      for (let x = g.x1 - first; x >= g.x1 - zR - 1e-6; x -= st.sEnd) right.push(x);
      const mid = [];
      const startM = left.length ? left[left.length - 1] + s : g.x0 + first;
      const endM = right.length ? right[right.length - 1] : g.x1 - first + 1e-6;
      for (let x = startM; x < endM - 1e-6; x += s) mid.push(x);
      if (!right.length && mid.length && g.x1 - first - mid[mid.length - 1] > s / 2 + 1e-6) mid.push(g.x1 - first);   // ตัวสุดท้ายชิดปลาย
      const positions = [...left, ...mid, ...right.slice().reverse()];
      const zones = [];
      if (zL) zones.push({ x0: g.x0, x1: g.x0 + zL, s: st.sEnd, count: left.length, label: 'หัวเสาซ้าย' });
      zones.push({ x0: g.x0 + zL, x1: g.x1 - zR, s, count: mid.length, label: zL || zR ? 'กลางคาน' : 'ตลอดช่วง' });
      if (zR) zones.push({ x0: g.x1 - zR, x1: g.x1, s: st.sEnd, count: right.length, label: 'หัวเสาขวา' });
      const deg = +st.deg === 90 ? 90 : 135, hook = BCL.hookLen(state, st.bar, deg === 90 ? 'stirrup90' : 'stirrup135');
      const cut = 2 * (sp.b - 2 * cover) + 2 * (sp.h - 2 * cover) + 2 * hook;
      return { span: i, bar: st.bar, positions, zones, count: positions.length, cutLength: Math.round(cut), w: Math.round(sp.b - 2 * cover), h: Math.round(sp.h - 2 * cover), hook, deg };
    });

    return { cover, supports, spans, totalLen, ends, runs, extraTop, extraBot, stirrups, warnings };
  };
})(window.BCL);
