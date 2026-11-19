/* วาดรูปตัดตามยาว (Elevation) เป็น SVG ภาพเดียวต่อเนื่อง — ช่องกรอก (ชื่อ, L, b×h, Support) ซ้อนทับโดย ui.js */
(function (BCL) {
  const NS = 'http://www.w3.org/2000/svg';
  const E = (t, a, tx) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (tx != null) e.textContent = tx; return e; };
  const C = { top: '#d9480f', bot: '#1864ab', web: '#7048e8', exTop: '#e8590c', exBot: '#1971c2', stir: '#2b8a3e', stirMid: '#8cc9a0', conc: '#f4f7fb', sup: '#e2e5ea', ink: '#343a40', muted: '#6b7482' };
  BCL.COLORS = C;
  const LEFT = 150;

  BCL.drawElevation = function (svg, state, G) {
    svg.innerHTML = '';
    const u = BCL.units(state);
    const minL = Math.min(...G.spans.map(s => s.L));
    const SC = Math.max(0.08, 330 / minL);                      // px ต่อ มม. (แนวนอน)
    const hmax = Math.max(...G.spans.map(s => s.h));
    const hs = 150 / hmax;                                       // px ต่อ มม. (แนวตั้ง)
    const top = 70, cov = G.cover * hs;
    const X = mm => LEFT + (mm - G.supports[0].x0) * SC;
    const yDim = top + hmax * hs + 52;                           // เส้นบอกระยะ
    const lay = { top, yName: top - 30, yDim, ySize: yDim + 22, ySup: yDim + 50, yCant: yDim + 50 };
    const W = X(G.supports[G.supports.length - 1].x1) + 60, H = lay.ySup + 44;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H);

    // ---- Support / ปลายคานยื่น ----
    const supH = hmax * hs + 42;
    G.supports.forEach(s => {
      if (s.free) {
        svg.appendChild(E('text', { x: X(s.cx), y: top - 28, 'text-anchor': 'middle', 'font-size': 10, fill: '#868e96' }, 'ปลายยื่น'));
        return;
      }
      const x0 = X(s.x0), w = s.width * SC;
      svg.appendChild(E('rect', { x: x0, y: top - 18, width: w, height: supH, fill: C.sup, stroke: '#495057' }));
      for (let k = 0; k < supH; k += 7) svg.appendChild(E('line', { x1: x0, y1: top - 18 + k, x2: x0 + w, y2: top - 11 + k, stroke: '#b4bac2', 'stroke-width': .6 }));
      svg.appendChild(E('line', { x1: X(s.cx), y1: top - 24, x2: X(s.cx), y2: top - 18 + supH, stroke: '#495057', 'stroke-dasharray': '4 3', 'stroke-width': .8 }));
      svg.appendChild(E('text', { x: X(s.cx), y: top - 28, 'text-anchor': 'middle', 'font-size': 10, fill: '#495057' }, 'Support'));
    });

    // ---- คาน + ปลอก + เส้นบอกระยะ ----
    G.spans.forEach((g, i) => {
      const sp = state.beam.spans[i], x0 = X(g.x0), x1 = X(g.x1), hp = g.h * hs;
      svg.appendChild(E('rect', { x: x0, y: top, width: x1 - x0, height: hp, fill: C.conc, stroke: C.ink, 'stroke-width': 1.3 }));
      if (g.freeL) svg.appendChild(E('line', { x1: x0, y1: top - 6, x2: x0, y2: top + hp + 6, stroke: C.ink, 'stroke-width': 2 }));
      if (g.freeR) svg.appendChild(E('line', { x1: x1, y1: top - 6, x2: x1, y2: top + hp + 6, stroke: C.ink, 'stroke-width': 2 }));
      // ปลอก
      const st = G.stirrups[i];
      st.positions.forEach(xm => svg.appendChild(E('line', { x1: X(xm), y1: top + cov, x2: X(xm), y2: top + hp - cov, stroke: C.stir, 'stroke-width': 1, opacity: .8 })));
      const yz = top + hp + 9;
      st.zones.forEach(z => {
        const end = /หัวเสา/.test(z.label);
        svg.appendChild(E('line', { x1: X(z.x0), y1: yz, x2: X(z.x1), y2: yz, stroke: end ? C.stir : C.stirMid, 'stroke-width': 3 }));
        svg.appendChild(E('text', { x: X((z.x0 + z.x1) / 2), y: yz + 12, 'text-anchor': 'middle', 'font-size': 10, fill: C.stir }, `${st.bar}@${u.sp(z.s)}`));
      });
      // เส้นบอกระยะ (c–c หรือ ถึงปลายยื่น) — ตัวเลขเป็นช่องกรอกซ้อนทับ
      const a = X(g.cx0), b = X(g.cx1);
      svg.appendChild(E('line', { x1: a, y1: yDim, x2: b, y2: yDim, stroke: C.ink }));
      [a, b].forEach(xx => svg.appendChild(E('line', { x1: xx, y1: yDim - 6, x2: xx, y2: yDim + 6, stroke: C.ink })));
    });

    // ---- เหล็กแกน (runs) ----
    const hookMark = (x, y, dir, len, color) => svg.appendChild(E('line', { x1: x, y1: y, x2: x, y2: y + dir * Math.max(10, len * hs), stroke: color, 'stroke-width': 2.5 }));
    ['top', 'bot', 'web'].forEach(kind => {
      G.runs[kind].forEach(run => {
        const h = G.spans[run.spans[0]].h, d = BCL.barD(run.bar);
        const off = (run.layer || 0) * Math.max(8, (d + 25) * hs) + (run.sub || 0) * 3;   // ชั้นถัดไปห่าง d + 25 มม. (ตามสัดส่วน) + เหลื่อมเล็กน้อยสำหรับ run ย่อย
        const y = kind === 'top' ? top + cov + 3 + off : kind === 'bot' ? top + h * hs - cov - 3 - off : top + h * hs / 2 + off;
        const dir = kind === 'bot' ? -1 : 1, color = C[kind];
        svg.appendChild(E('line', { x1: X(run.x0), y1: y, x2: X(run.x1), y2: y, stroke: color, 'stroke-width': 2.5, 'stroke-dasharray': kind === 'web' ? '10 3 2 3' : 'none' }));
        if (run.hookStart) hookMark(X(run.x0), y, dir, run.hookStart, color);
        if (run.hookEnd) hookMark(X(run.x1), y, dir, run.hookEnd, color);
        [[run.x0, run.start], [run.x1, run.end]].forEach(([xm, en]) => {
          if (en.mode === 'extend' || en.mode === 'stop') svg.appendChild(E('circle', { cx: X(xm), cy: y, r: 2.5, fill: color }));
        });
      });
      // ป้ายต่อช่วง (จำนวนรวมของช่วงนั้น)
      G.spans.forEach((g, i) => {
        const sp = state.beam.spans[i], grp = sp[kind]; if (kind === 'web' && !grp.on) return;
        const y = kind === 'top' ? top + cov - 2 : kind === 'bot' ? top + g.h * hs - cov + 10 : top + g.h * hs / 2 - 4;
        const L = BCL.layersOf(grp), lab = L.length > 1 ? `${L.join('+')}-${grp.bar} (${L.length} ชั้น)` : `${grp.n}-${grp.bar}`;
        svg.appendChild(E('text', { x: X((g.x0 + g.x1) / 2), y, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: C[kind] }, `${lab}${kind === 'web' ? ' (ข้าง)' : ''}`));
      });
    });

    // ---- เหล็กพิเศษบน ----
    G.extraTop.forEach(e => {
      const y = top + cov + 10;
      svg.appendChild(E('line', { x1: X(e.x0), y1: y, x2: X(e.x1), y2: y, stroke: C.exTop, 'stroke-width': 2, 'stroke-dasharray': '5 3' }));
      if (e.hookStart) hookMark(X(e.x0), y, 1, e.hookStart, C.exTop);
      if (e.hookEnd) hookMark(X(e.x1), y, 1, e.hookEnd, C.exTop);
      e.parts.forEach(p => svg.appendChild(E('text', { x: X((p.x0 + p.x1) / 2), y: y + 12, 'text-anchor': 'middle', 'font-size': 10, fill: C.exTop }, `${p.n}-${p.bar} (${p.frac})`)));
    });
    // ---- เหล็กพิเศษล่าง ----
    G.extraBot.forEach(e => {
      const g = G.spans[e.span], y = top + g.h * hs - cov - 10;
      svg.appendChild(E('line', { x1: X(e.x0), y1: y, x2: X(e.x1), y2: y, stroke: C.exBot, 'stroke-width': 2, 'stroke-dasharray': '5 3' }));
      svg.appendChild(E('text', { x: X((e.x0 + e.x1) / 2), y: y - 4, 'text-anchor': 'middle', 'font-size': 10, fill: C.exBot }, `${e.n}-${e.bar} (ยาว ${u.out(e.length)})`));
    });

    svg.appendChild(E('text', { x: 16, y: top + 70, 'font-size': 13, 'font-weight': 600 }, 'Beam Elevation'));
    svg.appendChild(E('text', { x: 16, y: yDim + 4, 'font-size': 11, fill: C.muted }, `L c–c (${u.t})`));
    svg.appendChild(E('text', { x: 16, y: lay.ySize + 4, 'font-size': 11, fill: C.muted }, `b × h (${u.t})`));
    svg.appendChild(E('text', { x: 16, y: lay.ySup + 4, 'font-size': 11, fill: C.muted }, `Support (${u.t})`));
    return { SC, X, W, H, left: LEFT, lay };
  };
})(window.BCL);
