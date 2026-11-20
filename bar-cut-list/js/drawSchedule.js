/* วาดเหล็กทีละเส้นใต้รูปคาน ตามตำแหน่งจริง — คลิกตัวเลขบนรูปเพื่อแก้ (ช่วงตรง, ขอซ้าย/ขวา, จำนวน, ปลอก กว้าง/สูง/ขอ)
   แม่กุญแจ: ล็อก = ตรึงด้านนี้ (ไม่เลื่อนเมื่อแก้ช่วงตรง) / ปลดล็อก = ไม่ตรึง (คลิกเพื่อย้ายการตรึงมาด้านนี้) */
(function (BCL) {
  const NS = 'http://www.w3.org/2000/svg';
  const E = (t, a, tx) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (tx != null) e.textContent = tx; return e; };
  const ROWS = [
    { kind: 'top',   name: 'Top Bar',            th: 'เหล็กแกนบน',     color: '#d9480f' },
    { kind: 'exTop', name: 'Support Top Bar',    th: 'เสริมพิเศษบน',    color: '#e8590c' },
    { kind: 'bot',   name: 'Bottom Bar',         th: 'เหล็กแกนล่าง',    color: '#1864ab' },
    { kind: 'exBot', name: 'Support Bottom Bar', th: 'เสริมพิเศษล่าง',  color: '#1971c2' },
    { kind: 'web',   name: 'Web Bar',            th: 'เหล็กข้าง',       color: '#7048e8' },
    { kind: 'stir',  name: 'Links',              th: 'เหล็กปลอก',       color: '#2b8a3e' },
  ];
  const LANE = 76, RED = '#c92a2a', ED = '#e67700';

  /* แม่กุญแจ on = ล็อก (ทึบ ห่วงปิด) / off = ปลดล็อก (เส้นเทา ห่วงเปิด) */
  BCL.lockIcon = function (x, y, on) {
    const g = E('g', { transform: `translate(${x},${y})` }), c = on ? '#212529' : '#868e96';
    g.appendChild(E('rect', { x: -1, y: -2, width: 17, height: 17, fill: 'transparent' }));
    g.appendChild(E('rect', { x: 1.5, y: 5.5, width: 11, height: 8, rx: 1.5, fill: on ? c : '#fff', stroke: c, 'stroke-width': 1.6 }));
    g.appendChild(E('path', { d: on ? 'M4,5.5 V3.5 a3,3 0 0 1 6,0 V5.5' : 'M4,5.5 V1.5 a3,3 0 0 1 6,0 V2.5', fill: 'none', stroke: c, 'stroke-width': 1.6, 'stroke-linecap': 'round' }));
    if (on) g.appendChild(E('circle', { cx: 7, cy: 9.5, r: 1.2, fill: '#fff' }));
    return g;
  };

  /* hooks: { edit(it, row, field, mm|count), anchor(it, side), restore(it, row) } */
  BCL.drawSchedule = function (wrap, state, G, L, hooks = {}) {
    const sch = state.beam.schedule; if (!sch) { wrap.innerHTML = ''; return { issues: [] }; }
    const u = BCL.units(state), X = L.X, items = BCL.effectiveItems(state);
    const rowOf = {}; BCL.beamBarRows(state, state.beam).forEach(r => { rowOf[r.item.id] = r; });
    const svg = E('svg', {});
    let y = 10; const issues = [];
    const dimT = (x, yy, txt, it, r, field, anc, fs, ed) => {
      const t = E('text', { x, y: yy, 'font-size': fs || 11.5, 'text-anchor': anc || 'middle', class: 'dim' + (ed ? ' ed' : '') }, txt);
      t.addEventListener('click', () => editAt(t, it, r, field)); svg.appendChild(t); return t;
    };
    function editAt(t, it, r, field) {
      const bb = t.getBoundingClientRect(), wb = wrap.getBoundingClientRect();
      const inp = document.createElement('input'); inp.type = 'number'; inp.className = 'dimedit';
      inp.step = field === 'n' ? 1 : u.step(5); inp.min = field === 'n' ? 1 : 0;
      inp.value = field === 'n' ? r.qty : u.out(r.shape[field]);
      inp.style.left = (bb.left - wb.left + bb.width / 2) + 'px'; inp.style.top = (bb.top - wb.top + bb.height / 2) + 'px';
      wrap.appendChild(inp); inp.focus(); inp.select();
      let done = false;
      const commit = ok => { if (done) return; done = true;
        const raw = inp.value; inp.remove();
        if (!ok || raw === '' || !isFinite(+raw)) return;
        const v = field === 'n' ? Math.round(+raw) : Math.round(u.in(raw));
        if (v < (field === 'n' ? 1 : 0)) return;
        setTimeout(() => hooks.edit && hooks.edit(it, r, field, v)); };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') commit(true); if (e.key === 'Escape') commit(false); });
      inp.addEventListener('blur', () => commit(true));
    }
    // ป้ายหัว: [n]-BAR · ชื่อ ··· ตัด X ↺
    const header = (it, r, x0, x1, yy, color) => {
      const nStr = String(r.qty), edAny = r.isEd || r.qtyEd, cutTxt = `ตัด ${u.out(r.cut)}`;
      dimT(x0, yy, nStr, it, r, 'n', 'start', 12, r.qtyEd);
      const lab = `-${it.bar} · ${it.label}`, xl = x0 + nStr.length * 7 + 2;
      svg.appendChild(E('text', { x: xl, y: yy, 'font-size': 12, 'font-weight': 700, fill: color }, lab));
      const wide = x1 - x0 > 120 + lab.length * 6.2;
      const xc = wide ? x1 - (edAny ? 16 : 0) : xl + lab.length * 6.6 + 10;
      svg.appendChild(E('text', { x: xc, y: yy, 'font-size': 12, 'font-weight': 700, 'text-anchor': wide ? 'end' : 'start', fill: edAny ? ED : '#212529' }, cutTxt));
      if (edAny) {
        const rx = wide ? x1 : xc + cutTxt.length * 6.8 + 6;
        const b = E('text', { x: rx, y: yy, 'font-size': 13, 'text-anchor': wide ? 'end' : 'start', class: 'rst' }, '↺');
        b.appendChild(E('title', {}, 'คืนค่าที่โปรแกรมคำนวณ (ท่อนนี้)'));
        b.addEventListener('click', () => hooks.restore && hooks.restore(it, r)); svg.appendChild(b);
      }
    };

    ROWS.forEach(rw => {
      const its = items.filter(it => it.kind === rw.kind);
      if ((rw.kind === 'web' || rw.kind === 'exTop' || rw.kind === 'exBot') && !its.length) return;   // ไม่มีเหล็กชนิดนี้ → ไม่แสดงแถว
      const lanes = [];
      its.forEach(it => {
        if (it.kind === 'stir') { it.lane = 0; if (!lanes.length) lanes.push(-Infinity); return; }
        let l = lanes.findIndex(end => Math.min(it.ex0, it.ex1) > end + 1); if (l < 0) { l = lanes.length; lanes.push(-Infinity); } lanes[l] = Math.max(it.ex0, it.ex1); it.lane = l;
      });
      const nL = Math.max(1, lanes.length), y0 = y;
      svg.appendChild(E('line', { x1: 0, y1: y0 - 4, x2: L.W, y2: y0 - 4, stroke: '#e9ecef' }));
      svg.appendChild(E('text', { x: 16, y: y0 + 18, 'font-size': 12, 'font-weight': 600, fill: '#495057' }, rw.name));
      svg.appendChild(E('text', { x: 16, y: y0 + 32, 'font-size': 10, fill: '#868e96' }, rw.th));
      if (!its.length) svg.appendChild(E('text', { x: X(G.supports[0].cx), y: y0 + 24, 'font-size': 11, fill: '#adb5bd' }, '— ไม่มี —'));
      const laneY = l => y0 + 32 + l * LANE;
      let rowH = 32 + (nL - 1) * LANE + 52;

      its.forEach(it => {
        const r = rowOf[it.id]; if (!r) return;
        const yl = laneY(it.lane), xa = X(it.ex0), xb = X(it.ex1);
        const color = it.issues.some(m => !/^ทาบ/.test(m)) ? RED : rw.color;
        it.issues.forEach(m => issues.push(`${it.label}: ${m}`));
        if (it.kind === 'stir') {
          // โซนปลอก (เส้นบอกระยะ + ป้าย @) ด้านล่าง + รูปปลอกเล็กคลิกแก้ได้ ด้านบน
          const yb = yl + 92;
          (it.zones || []).forEach(z => {
            const a = X(z.x0), b = X(z.x1);
            svg.appendChild(E('line', { x1: a, y1: yb, x2: b, y2: yb, stroke: '#495057', 'stroke-width': 1 }));
            [a, b].forEach(xx => svg.appendChild(E('line', { x1: xx, y1: yb - 5, x2: xx, y2: yb + 5, stroke: '#495057' })));
            svg.appendChild(E('text', { x: (a + b) / 2, y: yb + 13, 'text-anchor': 'middle', 'font-size': 10, fill: '#495057' }, u.out(z.x1 - z.x0)));
            svg.appendChild(E('text', { x: (a + b) / 2, y: yb + 25, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: color }, `${z.count}-${it.bar}@${u.sp(z.s)} ${u.ab}`));
          });
          const sh = r.shape, ed = r.edited, cx = (xa + xb) / 2;
          const hP = 58, wP = Math.max(30, Math.min(60, hP * sh.w / Math.max(1, sh.h))), x = cx - wP - 38, yt = yl + 14, gp = 5, dx = 13, xr = x + wP;
          svg.appendChild(E('path', { d: `M${xr - dx},${yt + gp + dx} L${xr},${yt + gp} L${xr},${yt + hP} L${x},${yt + hP} L${x},${yt} L${xr - gp},${yt} L${xr - gp - dx},${yt + dx}`, fill: 'none', stroke: color, 'stroke-width': 3, 'stroke-linejoin': 'round' }));
          dimT(x + wP / 2, yt - 5, u.out(sh.w), it, r, 'w', 'middle', 11, ed.w);
          dimT(x - 5, yt + hP / 2 + 4, u.out(sh.h), it, r, 'h', 'end', 11, ed.h);
          dimT(xr - gp - dx - 2, yt + dx + 15, u.out(sh.hook), it, r, 'hook', 'end', 10.5, ed.hook);
          const tx = xr + 14, nStr = String(r.qty), edAny = r.isEd || r.qtyEd;
          dimT(tx, yt + 14, nStr, it, r, 'n', 'start', 12, r.qtyEd);
          svg.appendChild(E('text', { x: tx + nStr.length * 7 + 2, y: yt + 14, 'font-size': 12, 'font-weight': 700, fill: color }, `-${it.bar} · ${it.label}`));
          svg.appendChild(E('text', { x: tx, y: yt + 31, 'font-size': 11, fill: '#495057' }, 'ขอ 135°'));
          svg.appendChild(E('text', { x: tx, y: yt + 48, 'font-size': 12, 'font-weight': 700, fill: edAny ? ED : '#212529' }, `ตัด ${u.out(r.cut)}`));
          if (edAny) { const b = E('text', { x: tx + 78, y: yt + 48, 'font-size': 13, class: 'rst' }, '↺'); b.appendChild(E('title', {}, 'คืนค่าที่โปรแกรมคำนวณ')); b.addEventListener('click', () => hooks.restore && hooks.restore(it, r)); svg.appendChild(b); }
          rowH = 32 + 92 + 34;
          return;
        }
        const down = it.kind === 'top' || it.kind === 'exTop', hk = 14, sh = r.shape, ed = r.edited;
        let d = sh.leg ? `M${xa},${yl + (down ? hk : -hk)} L${xa},${yl}` : `M${xa},${yl}`;
        d += ` L${xb},${yl}` + (sh.leg2 ? ` L${xb},${yl + (down ? hk : -hk)}` : '');
        svg.appendChild(E('path', { d, fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
        const anchor = it.anchor || 'left';
        svg.appendChild(E('circle', { cx: anchor === 'right' ? xb : xa, cy: yl, r: 3.5, fill: color }));
        header(it, r, xa + 2, xb, yl - 9, color);
        dimT((xa + xb) / 2, yl + 14, u.out(sh.a), it, r, 'a', 'middle', 11.5, ed.a);
        if (sh.leg) dimT(xa - 4, yl + (down ? hk / 2 + 4 : -hk / 2 + 4), u.out(sh.leg), it, r, 'leg', 'end', 11, ed.leg);
        if (sh.leg2) dimT(xb + 4, yl + (down ? hk / 2 + 4 : -hk / 2 + 4), u.out(sh.leg2), it, r, 'leg2', 'start', 11, ed.leg2);
        // แม่กุญแจทั้งสองปลาย
        const ly = yl + (down ? 22 : 14);
        [['left', xa], ['right', xb]].forEach(([side, xe]) => {
          const on = anchor === side, ix = side === 'left' ? xe + 4 : xe - 18;
          const g = E('g', { class: 'anc' }); svg.appendChild(g);
          g.appendChild(BCL.lockIcon(ix, ly, on));
          if (on && xb - xa > 150) g.appendChild(E('text', { x: side === 'left' ? ix + 18 : ix - 3, y: ly + 12, 'font-size': 11.5, 'font-weight': 700, 'text-anchor': side === 'left' ? 'start' : 'end', fill: '#212529' }, 'ตรึงด้านนี้'));
          g.appendChild(E('title', {}, on ? 'ตรึงด้านนี้ — แก้ช่วงตรงแล้วปลายอีกด้านจะเลื่อน' : 'ไม่ตรึง — คลิกเพื่อตรึงด้านนี้'));
          if (!on) g.addEventListener('click', () => hooks.anchor && hooks.anchor(it, side, r));
        });
        // ระยะทาบกับท่อนก่อนหน้า (จากตำแหน่งจริง)
        if (it.lapPrevId != null) {
          const prev = items.find(p => p.id === it.lapPrevId), short = it.lapActual < it.lapReq;
          const lx0 = X(it.ex0), lx1 = X(prev.ex1), ly0 = Math.min(yl, laneY(prev.lane)), lh = Math.abs(yl - laneY(prev.lane));
          if (it.lapActual > 0) svg.appendChild(E('rect', { x: Math.min(lx0, lx1), y: ly0 - 4, width: Math.abs(lx1 - lx0), height: lh + 8, fill: short ? RED : rw.color, opacity: .12 }));
          svg.appendChild(E('text', { x: (lx0 + lx1) / 2, y: ly0 + lh + 44, 'text-anchor': 'middle', 'font-size': short ? 11 : 10, 'font-weight': short ? 700 : 400, fill: short ? RED : '#495057' },
            short ? `ทาบ ${u.out(it.lapActual)} < ${u.out(it.lapReq)} ไม่พอ!` : `ทาบ ${u.out(it.lapActual)}`));
        }
      });
      y = y0 + rowH;
    });
    svg.setAttribute('viewBox', `0 0 ${L.W} ${y}`); svg.setAttribute('width', L.W); svg.setAttribute('height', y);
    wrap.style.width = L.W + 'px'; wrap.style.height = y + 'px';
    wrap.innerHTML = ''; wrap.appendChild(svg);
    return { issues };
  };
})(window.BCL);
