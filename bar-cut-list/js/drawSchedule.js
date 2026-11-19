/* วาดเหล็กทีละเส้นใต้รูปคาน ตำแหน่งจริง + ช่องแก้ความยาว/จำนวน */
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
  const LANE = 46, PAD = 8, RED = '#c92a2a';

  /* opts.svgOnly = true: วาดเฉพาะเส้น (ตอนกำลังพิมพ์) ไม่สร้างช่องกรอกใหม่ */
  BCL.drawSchedule = function (wrap, state, G, L, opts = {}) {
    const sch = state.beam.schedule; if (!sch) { wrap.innerHTML = ''; return { issues: [] }; }
    const u = BCL.units(state), X = L.X, items = BCL.effectiveItems(state);
    const svg = E('svg', {});
    let y = 10; const placed = [], issues = [];
    ROWS.forEach(r => {
      const its = items.filter(it => it.kind === r.kind);
      if (r.kind === 'web' && !its.length) return;   // ไม่มีเหล็กข้าง → ไม่แสดงแถว
      // จัดชั้น: ท่อนที่ซ้อนกัน (เช่น ช่วงทาบ) ลงคนละชั้น / ปลอก: ซ้าย-กลาง-ขวา คนละชั้น
      const lanes = [];
      its.forEach(it => {
        if (it.kind === 'stir') { it.lane = 0; if (!lanes.length) lanes.push(-Infinity); return; }
        let l = lanes.findIndex(end => Math.min(it.ex0, it.ex1) > end + 1); if (l < 0) { l = lanes.length; lanes.push(-Infinity); } lanes[l] = Math.max(it.ex0, it.ex1); it.lane = l;
      });
      const nL = Math.max(1, lanes.length), y0 = y;
      svg.appendChild(E('line', { x1: 0, y1: y0 - 4, x2: L.W, y2: y0 - 4, stroke: '#e9ecef' }));
      svg.appendChild(E('text', { x: 16, y: y0 + 18, 'font-size': 12, 'font-weight': 600, fill: '#495057' }, r.name));
      svg.appendChild(E('text', { x: 16, y: y0 + 32, 'font-size': 10, fill: '#868e96' }, r.th));
      if (!its.length) svg.appendChild(E('text', { x: X(G.supports[0].cx), y: y0 + 24, 'font-size': 11, fill: '#adb5bd' }, '— ไม่มี —'));
      const laneY = l => y0 + PAD + 28 + l * LANE;
      its.forEach(it => {
        const yl = laneY(it.lane), xa = X(it.ex0), xb = X(it.ex1), bad = it.issues.length > 0;
        const color = it.issues.some(m => !/^ทาบ/.test(m)) ? RED : r.color;   // เส้นแดงเฉพาะปัญหาความยาว; ระยะทาบไม่พอแสดงเป็นตัวหนังสือแดง
        it.issues.forEach(m => issues.push(`${it.label}: ${m}`));
        if (it.kind === 'stir') {
          // ปลอกเรียงตลอดช่วง + เส้นบอกระยะโซน + ป้าย "10-RB6@0.10 m." ต่อโซน
          const yb = yl + 4;   // ไม่วาดขีดปลอก แสดงเฉพาะเส้นบอกระยะโซน + ป้าย
          (it.zones || []).forEach(z => {
            const a = X(z.x0), b = X(z.x1);
            svg.appendChild(E('line', { x1: a, y1: yb, x2: b, y2: yb, stroke: '#495057', 'stroke-width': 1 }));
            [a, b].forEach(xx => svg.appendChild(E('line', { x1: xx, y1: yb - 5, x2: xx, y2: yb + 5, stroke: '#495057' })));
            svg.appendChild(E('text', { x: (a + b) / 2, y: yb + 13, 'text-anchor': 'middle', 'font-size': 10, fill: '#495057' }, u.out(z.x1 - z.x0)));
            svg.appendChild(E('text', { x: (a + b) / 2, y: yb + 25, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: color }, `${z.count}-${it.bar}@${u.sp(z.s)} ${u.ab}`));
          });
        } else {
          const down = it.kind === 'top' || it.kind === 'exTop';
          svg.appendChild(E('line', { x1: xa, y1: yl, x2: xb, y2: yl, stroke: color, 'stroke-width': 2.5 }));
          if (it.hookStart) svg.appendChild(E('line', { x1: xa, y1: yl, x2: xa, y2: yl + (down ? 10 : -10), stroke: color, 'stroke-width': 2.5 }));
          if (it.hookEnd) svg.appendChild(E('line', { x1: xb, y1: yl, x2: xb, y2: yl + (down ? 10 : -10), stroke: color, 'stroke-width': 2.5 }));
          [xa, xb].forEach(xx => svg.appendChild(E('line', { x1: xx, y1: yl - 4, x2: xx, y2: yl + 4, stroke: color, 'stroke-width': 1 })));
          // สัญลักษณ์ด้านที่ตรึง
          const ax = (it.anchor || 'left') === 'right' ? xb : xa;
          svg.appendChild(E('path', { d: `M${ax - 4},${yl + (down ? -6 : 6)} l4,${down ? -5 : 5} l4,${down ? 5 : -5} z`, fill: color }));
          // ระยะทาบกับท่อนก่อนหน้า (จากตำแหน่งจริง)
          if (it.lapPrevId != null) {
            const prev = items.find(p => p.id === it.lapPrevId), short = it.lapActual < it.lapReq;
            const lx0 = X(it.ex0), lx1 = X(prev.ex1), ly = Math.min(yl, laneY(prev.lane)), lh = Math.abs(yl - laneY(prev.lane));
            if (it.lapActual > 0) svg.appendChild(E('rect', { x: Math.min(lx0, lx1), y: ly - 4, width: Math.abs(lx1 - lx0), height: lh + 8, fill: short ? RED : r.color, opacity: .15 }));
            svg.appendChild(E('text', { x: (lx0 + lx1) / 2, y: ly + lh + 16, 'text-anchor': 'middle', 'font-size': short ? 11 : 9, 'font-weight': short ? 700 : 400, fill: short ? RED : r.color },
              short ? `ทาบ ${u.out(it.lapActual)} < ${u.out(it.lapReq)} ไม่พอ!` : `ทาบ ${u.out(it.lapActual)}`));
          }
        }
        placed.push({ it, x: (xa + xb) / 2, y: it.kind === 'stir' ? yl - 30 : yl - 22, color: r.color, bad });
      });
      y = y0 + PAD + 28 + (nL - 1) * LANE + 26 + (r.kind === 'stir' ? 18 : 0);
    });
    svg.setAttribute('viewBox', `0 0 ${L.W} ${y}`); svg.setAttribute('width', L.W); svg.setAttribute('height', y);
    wrap.style.width = L.W + 'px'; wrap.style.height = y + 'px';

    if (opts.svgOnly && wrap.querySelector('svg')) {
      wrap.replaceChild(svg, wrap.querySelector('svg'));
      placed.forEach(({ it, x, y, bad }) => { const d = wrap.querySelector(`.sitem[data-id="${it.id}"]`); if (d) { d.style.left = x + 'px'; d.style.top = y + 'px'; d.classList.toggle('bad', bad); d.title = it.label + (it.issues.length ? ' — ' + it.issues.join(', ') : ''); } });
      return { issues };
    }
    wrap.innerHTML = ''; wrap.appendChild(svg);
    placed.forEach(({ it, x, y, color, bad }) => {
      const d = document.createElement('div'); d.className = 'sitem' + (bad ? ' bad' : '') + (it.userLength != null || it.userN != null ? ' edited' : '');
      d.dataset.id = it.id; d.style.left = x + 'px'; d.style.top = y + 'px'; d.style.borderColor = color; if (it.kind === 'stir') d.classList.add('stir');
      d.title = it.label + (it.issues.length ? ' — ' + it.issues.join(', ') : '');
      const spacing = '';
      const anchorBtn = it.kind === 'stir' ? '' : `<button class="anc" data-anc="${it.id}" title="ด้านที่ตรึง (คลิกสลับ): ${(it.anchor || 'left') === 'right' ? 'ขวา' : 'ซ้าย'}">${(it.anchor || 'left') === 'right' ? '⇥' : '⇤'}</button>`;
      d.innerHTML = `${anchorBtn}<input type="number" class="n" min="1" data-sid="${it.id}" data-f="userN" value="${it.userN ?? it.n}" title="จำนวน (คำนวณ ${it.n})">
        <b style="color:${color}">-${it.bar}${spacing}</b> <span class="lab">L=</span>
        <input type="number" class="len" step="${u.step(10)}" min="0" data-sid="${it.id}" data-f="userLength" value="${u.out(it.userLength ?? it.cutLength)}" title="ความยาวตัด ${u.t} (คำนวณ ${u.out(it.cutLength)})">`;
      wrap.appendChild(d);
    });
    return { issues };
  };
})(window.BCL);
