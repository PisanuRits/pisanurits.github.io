/* ฐานราก: คำนวณรายการเหล็ก (มม.) + หน้ากรอก/รูปแปลน/รูปตัด/รายการเหล็ก + แก้ระยะบนรูปทรง */
(function (BCL) {
  const NS = 'http://www.w3.org/2000/svg';
  const E = (t, a, tx) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (tx != null) e.textContent = tx; return e; };
  const D = bar => BCL.barD(bar);
  const RED = '#c92a2a';

  /* ---------- รูปทรง ---------- */
  // k: C (ตะแกรง ขางอ + พับปลาย) | L (งอฉาก 1 ด้าน) | I (ตรง) | S (ปลอก ขอ 90/135) | R (รัดรอบ ขาที่มุม)
  const legsOf = sh => [sh.leg || 0, sh.leg2 != null ? sh.leg2 : (sh.leg || 0)];
  BCL.fLenOf = sh => sh.k === 'C' ? sh.a + legsOf(sh).reduce((a, l) => a + l + (l ? sh.lip || 0 : 0), 0) : sh.k === 'L' ? sh.a + sh.leg : (sh.k === 'S' || sh.k === 'R') ? 2 * (sh.w + sh.h) + 2 * sh.hook : sh.a;
  BCL.fBendsOf = sh => {
    if (sh.k === 'C') return { 90: legsOf(sh).reduce((a, l) => a + (l ? 1 + (sh.lip ? 1 : 0) : 0), 0) };
    if (sh.k === 'L') return { 90: 1 };
    if (sh.k === 'S' && sh.deg === 135) return { 90: 3, 135: 2 };
    if (sh.k === 'S' || sh.k === 'R') return { 90: 5 };
    return {};
  };
  BCL.fCode = sh => sh.k === 'C' ? (n => n === 0 ? 'L0' : sh.lip ? 'C' : n === 1 ? 'L1' : 'L2')(legsOf(sh).filter(Boolean).length) : sh.k === 'L' ? 'L1' : sh.k === 'I' ? 'L0' : sh.k === 'R' ? 'R1' : sh.deg === 90 ? 'S2' : 'S1';
  BCL.fBendText = bends => [135, 90, 180].filter(a => bends[a]).map(a => `${a}°×${bends[a]}`).join(' + ');

  /* วาดรูปทรง (ไม่ scale, ระยะนอก–นอก). editable → ตัวเลขเป็น text.dim คลิกแก้ได้ */
  BCL.fShapeSVG = function (sh, u, edited = {}, W = 240) {
    const H = 88, svg = E('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }), ox = (W - 240) / 2;
    const g = E('g', { transform: `translate(${ox},0)` }); svg.appendChild(g);
    const ln = d => g.appendChild(E('path', { d, fill: 'none', stroke: RED, 'stroke-width': 3.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    const tx = (x, y, f, anc = 'middle') => g.appendChild(E('text', { x, y, 'font-size': 11.5, 'font-weight': 700, 'text-anchor': anc, class: 'dim' + (edited[f] != null ? ' ed' : ''), 'data-f': f }, u.out(sh[f])));
    if (sh.k === 'C') {
      const up = sh.up !== false, d = up ? -1 : 1, y = up ? 60 : 18, x0 = 40, x1 = 190, [lL, lR] = legsOf(sh);
      const lp = l => l ? Math.max(14, Math.min(36, 10 + l / 20)) : 0, pL = lp(lL), pR = lp(lR);
      const lipP = sh.lip ? Math.max(10, Math.min(30, 8 + sh.lip / 20)) : 0, qL = pL ? lipP : 0, qR = pR ? lipP : 0;
      let p = pL ? (qL ? `M${x0 + qL},${y + d * pL} L${x0},${y + d * pL} ` : `M${x0},${y + d * pL} `) + `L${x0},${y}` : `M${x0},${y}`;
      p += ` L${x1},${y}` + (pR ? ` L${x1},${y + d * pR}` + (qR ? ` L${x1 - qR},${y + d * pR}` : '') : '');
      ln(p); tx(115, up ? y + 15 : y - 6, 'a');
      if (pL) tx(x0 - 5, y + d * pL / 2 + 4, 'leg', 'end');
      if (pR) tx(x1 + 5, y + d * pR / 2 + 4, sh.leg2 != null ? 'leg2' : 'leg', 'start');
      if (qL) tx(x0 + qL / 2, y + d * pL + (up ? -5 : 14), 'lip');
      if (qR) tx(x1 - qR / 2, y + d * pR + (up ? -5 : 14), 'lip');
    } else if (sh.k === 'L') {
      const lg = Math.max(16, Math.min(60, sh.leg / 10)); ln(`M70,8 L70,60 L${70 + lg},60`); tx(62, 36, 'a', 'end'); tx(70 + lg / 2, 74, 'leg');
    } else if (sh.k === 'I') { ln('M30,42 L200,42'); tx(115, 34, 'a'); }
    else if (sh.k === 'S' || sh.k === 'R') {   // วงปิด ปลายทั้งสองงอที่มุมขวาบน (เส้นต่อเนื่อง)
      const ring = sh.k === 'R', deg = ring ? 90 : sh.deg;
      const r = Math.max(.5, Math.min(2.4, sh.w / sh.h)), h = 54, w = Math.max(58, Math.min(ring ? 140 : 110, h * r)), x = 100 - w / 2, y = 18, gp = 6;
      const hk = Math.max(16, Math.min(26, 12 + sh.hook / (ring ? 30 : 10))), xr = x + w;
      if (deg === 135) {   // ขอ 135° สองปลาย ขนานกันเฉียงเข้าแกน
        const dx = hk * .72;
        ln(`M${xr - dx},${y + gp + dx} L${xr},${y + gp} L${xr},${y + h} L${x},${y + h} L${x},${y} L${xr - gp},${y} L${xr - gp - dx},${y + dx}`);
        tx(xr - gp - dx - 3, y + dx + 4, 'hook', 'end'); tx(xr - dx + 4, y + gp + dx + 13, 'hook', 'start');
      } else {             // ขอ 90°: ปลายหนึ่งพับแนวนอน อีกปลายพับแนวตั้ง
        ln(`M${xr - hk},${y + gp} L${xr},${y + gp} L${xr},${y + h} L${x},${y + h} L${x},${y} L${xr - gp},${y} L${xr - gp},${y + hk}`);
        tx(xr - hk - 3, y + gp + 12, 'hook', 'end'); tx(xr - gp, y + hk + 13, 'hook');
      }
      tx(x + w / 2, y - 6, 'w'); tx(x - 6, y + h / 2 + 4, 'h', 'end');
    }
    return svg;
  };

  /* ---------- คำนวณ ---------- */
  function meshOf(m, span) {
    let n, s;
    if (m.mode === 'n') { n = Math.max(2, Math.round(m.val || 2)); s = span / (n - 1); }
    else { s = Math.max(50, m.val || 150); n = Math.floor(span / s + 1e-6) + 1; }
    return { n, s, bar: m.bar };
  }
  BCL.footingCalc = function (state) {
    const f = state.footing, pile = f.type === 'pile', tri = pile && f.shape === 'tri';
    const B = f.B, L = tri ? f.B : f.L, t = f.t, cov = f.cover, pd = f.ped;
    const colH = Math.round((pd.lvCol - pd.lvTop) * 1000);
    const sideOn = f.side.on && !tri, sdOut = f.side.pos === 'out', dSd = sideOn && sdOut ? D(f.side.bar) : 0;
    const botCov = pile ? Math.max(cov, f.pile.emb) : cov;                 // ฐานเข็ม: ตะแกรงล่างวางเหนือหัวเข็ม
    const inB = B - 2 * cov - 2 * dSd, inL = L - 2 * cov - 2 * dSd;
    const mx = tri ? { n: f.tri.n, s: 0, bar: f.tri.bar } : meshOf(f.bx, inL), my = tri ? meshOf(f.tm, inB * .75) : meshOf(f.by, inB);
    const legB = Math.max(0, Math.min(f.botLeg, t - botCov - cov)), lipB = legB ? f.botLip : 0;
    const topOn = f.top.on && !tri;
    const tx = topOn ? meshOf(f.top.x, inL) : null, ty = topOn ? meshOf(f.top.y, inB) : null;
    const legT = topOn ? Math.max(0, Math.min(f.top.leg, t - botCov - cov)) : 0, lipT = legT ? f.top.lip : 0;
    const dX = D(mx.bar), dY = D(my.bar), dC = D(pd.bar);
    const bendDepth = t - botCov - dX - dY - dC / 2;                      // หลังฐาน → จุดงอเหล็กยืน
    const tieZone = colH + bendDepth;
    const nTie = Math.max(1, Math.floor((tieZone - 50) / Math.max(25, f.tie.s)) + 1);
    const lap = pd.top === 'lap' ? pd.lap : 0, legC = pd.emb === 'hook' ? pd.leg : 0;
    const nC = Math.max(4, pd.n | 0);
    const rows = [];
    const C = (a, leg, lip, up = true) => leg ? { k: 'C', a: Math.round(a), leg: Math.round(leg), lip: Math.round(lip || 0), up } : { k: 'I', a: Math.round(a) };
    const add = (label, note, bar, shape, qty) => rows.push({ key: label + '|' + bar, label, note, bar, calcShape: shape, qty });
    if (tri) {
      add('ล่าง ชุดตามด้าน', '3 ด้าน', mx.bar, C(inB * .9, legB, lipB), f.tri.n * 3);
      add('ล่าง ตะแกรงเสริม', 'สองทาง', my.bar, C(inB * .75, legB, lipB), my.n * 2);
    } else {
      add('ล่าง แนว X', '', mx.bar, C(inB, legB, lipB), mx.n);
      add('ล่าง แนว Y', '', my.bar, C(inL, legB, lipB), my.n);
      if (topOn) { add('บน แนว X', '', tx.bar, C(inB, legT, lipT, false), tx.n); add('บน แนว Y', '', ty.bar, C(inL, legT, lipT, false), ty.n); }
    }
    if (sideOn) {
      const dm = D(mx.bar), w = sdOut ? B - 2 * cov : B - 2 * cov - 2 * dm, h = sdOut ? L - 2 * cov : L - 2 * cov - 2 * dm;
      add('รัดรอบฐาน', sdOut ? 'ด้านนอกเหล็กหลัก' : 'ด้านในเหล็กหลัก', f.side.bar, { k: 'R', w: Math.round(w), h: Math.round(h), hook: f.side.leg }, Math.max(1, f.side.n | 0));
    }
    const vert = colH + t - botCov - dX - dY + lap;
    add('ตอม่อ เหล็กยืน', pd.emb === 'hook' ? 'งอฉากในฐาน' : 'ฝังตรง', pd.bar, legC ? { k: 'L', a: Math.round(vert), leg: legC } : { k: 'I', a: Math.round(vert) }, nC);
    add('ตอม่อ ปลอก', `ขอ ${f.tie.hook}°`, f.tie.bar,
      { k: 'S', w: pd.b - 2 * pd.cover, h: pd.l - 2 * pd.cover, hook: f.tie.leg, deg: +f.tie.hook }, nTie);
    rows.forEach(r => {
      const o = (f.ovr || {})[r.key] || {};
      r.edited = o; r.isEd = Object.keys(o).length > 0;
      r.shape = { ...r.calcShape, ...o };
      r.sum = Math.round(BCL.fLenOf(r.shape)); r.calcSum = Math.round(BCL.fLenOf(r.calcShape));
      r.bends = BCL.fBendsOf(r.shape); r.deduct = BCL.bendDeduct(state, r.bar, r.bends);
      r.cut = r.sum - r.deduct; r.code = BCL.fCode(r.shape);
      r.weight = r.qty * r.cut / 1000 * BCL.bar(r.bar).w;
    });
    return { tri, pile, B, L, t, cov, botCov, colH, inB, inL, mx, my, tx, ty, legB, lipB, legT, lipT, bendDepth, tieZone, nTie, lap, legC, nC, sideOn, sdOut, dSd, rows };
  };
  BCL.footingDesc = (f, u) => {
    const m = mm => (mm / 1000).toFixed(2);
    const n = f.type === 'pile' ? (f.shape === 'tri' ? 3 : f.pile.nx * f.pile.ny) : 0;
    const body = f.type !== 'pile' ? `ฐานแผ่ ${m(f.B)}×${m(f.L)}×${m(f.t)} ม.` : f.shape === 'tri' ? `ฐานเข็มสามเหลี่ยม 3 ต้น ด้านละ ${m(f.B)} หนา ${m(f.t)} ม.` : `ฐานเข็มสี่เหลี่ยม ${n} ต้น ${m(f.B)}×${m(f.L)}×${m(f.t)} ม.`;
    return `${body} + ตอม่อ ${m(f.ped.b)}×${m(f.ped.l)}`;
  };

  /* ---------- หน้ากรอก ---------- */
  const barOpts = (v, list = BCL.BAR_NAMES) => list.map(b => `<option ${b === v ? 'selected' : ''}>${b}</option>`).join('');
  const get = (o, p) => p.split('.').reduce((a, k) => a[k], o);
  const set = (o, p, v) => { const ks = p.split('.'), last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };

  function panelHTML(state) {
    const f = state.footing, u = BCL.units(state), pile = f.type === 'pile', tri = pile && f.shape === 'tri';
    const L = mm => u.out(mm);
    const num = (label, k, o = {}) => `<label class="${o.full ? 'full' : ''}${o.cls ? ' ' + o.cls : ''}">${label}${o.len !== false ? ` (${u.t})` : ''}<input type="number" data-k="${k}" ${o.len !== false ? 'data-len' : ''} ${o.int ? 'data-int' : ''} value="${o.len !== false ? L(get(f, k)) : get(f, k)}" step="${o.step || (o.len !== false ? u.step(5) : 1)}" ${o.min != null ? `min="${o.min}"` : ''} ${o.max != null ? `max="${o.max}"` : ''}></label>`;
    const sel = (k, opts, labels, style = '') => `<select data-k="${k}" ${style}>${opts.map((v, i) => `<option value="${v}" ${String(get(f, k)) === String(v) ? 'selected' : ''}>${labels[i]}</option>`).join('')}</select>`;
    const bar = (k, list) => `<select data-k="${k}">${barOpts(get(f, k), list)}</select>`;
    const inp = (k, o = {}) => `<input type="number" data-k="${k}" ${o.len !== false ? 'data-len' : ''} ${o.int ? 'data-int' : ''} value="${o.len !== false ? L(get(f, k)) : get(f, k)}" step="${o.len !== false ? u.step(5) : 1}" ${o.title ? `title="${o.title}"` : ''} ${o.dis ? 'disabled' : ''}>`;
    const meshRow = (lab, k, id) => { const m = get(f, k); return `<div class="row5"><span>${lab}</span>${bar(k + '.bar')}${sel(k + '.mode', ['s', 'n'], ['@', 'จำนวน'])}${inp(k + '.val', { len: m.mode !== 'n', int: m.mode === 'n' })}<em id="${id}"></em></div>`; };
    return `
      <div class="fcard">
        <h2>ฐานราก <span class="unitsel">หน่วย <select id="fUnit">${['mm', 'cm', 'm'].map(k => `<option value="${k}" ${state.project.units === k ? 'selected' : ''}>${BCL.UNITS[k].t}</option>`).join('')}</select></span></h2>
        <div class="f" style="margin-bottom:10px">
          <label>ชื่อฐาน<input type="text" data-k="name" value="${f.name}"></label>
          ${num('จำนวนฐาน (แบบเดียวกัน)', 'count', { len: false, int: true, min: 1 })}
        </div>
        <div class="seg" data-seg="type"><button data-v="pile" class="${pile ? 'on' : ''}">ฐานเข็ม</button><button data-v="spread" class="${!pile ? 'on' : ''}">ฐานแผ่</button></div>
        ${pile ? `<div class="seg" data-seg="shape"><button data-v="rect" class="${!tri ? 'on' : ''}">สี่เหลี่ยม</button><button data-v="tri" class="${tri ? 'on' : ''}">สามเหลี่ยม (3 ต้น)</button></div>
        <div class="f">
          ${tri ? '' : num('จำนวนเข็ม แนว X', 'pile.nx', { len: false, int: true, min: 1, max: 4 }) + num('จำนวนเข็ม แนว Y', 'pile.ny', { len: false, int: true, min: 1, max: 4 })}
          ${num('ขนาดเข็ม', 'pile.d')}${num('ระยะห่างเข็ม c–c', 'pile.s')}
          ${num('ระยะฝังหัวเข็มในฐาน', 'pile.emb')}${num('ระยะขอบถึงศูนย์เข็ม', 'pile.edge')}
        </div>` : ''}
        <div class="sec">ขนาดฐาน</div>
        <div class="f">
          ${num(tri ? 'ความยาวด้านสามเหลี่ยม' : 'กว้าง B', 'B')}${tri ? '' : num('ยาว L', 'L')}
          ${num('หนา t', 't')}${num('หุ้มคอนกรีต', 'cover')}
        </div>
        <div class="sec">ตอม่อ</div>
        <div class="f">
          ${num('กว้าง', 'ped.b')}${num('ยาว', 'ped.l')}
          ${num('ระดับหลังฐาน (ม.)', 'ped.lvTop', { len: false, step: 0.05 })}${num('ระดับหลังตอม่อ / ใต้คานคอดิน (ม.)', 'ped.lvCol', { len: false, step: 0.05 })}
          <div class="full" style="color:#1f3a8a;font-size:12px">→ ความสูงตอม่อ = <b id="fColH"></b> ม.</div>
        </div>
      </div>
      <div class="fcard">
        <h2>เหล็กเสริม <small>ระยะเป็น ${u.t}</small></h2>
        <div class="sec c1" style="margin-top:0;border:none;padding:0">ตะแกรงล่าง (Bottom)</div>
        ${tri ? `<div class="row5"><span>ชุดตามด้าน</span>${bar('tri.bar')}<i>จำนวน</i>${inp('tri.n', { len: false, int: true })}<em>× 3 ด้าน</em></div>${meshRow('ตะแกรงเสริม', 'tm', 'hTm')}`
        : meshRow('แนว X', 'bx', 'hBx') + meshRow('แนว Y', 'by', 'hBy')}
        <div class="row5"><span>ปลาย</span><i>ขางอขึ้น</i>${inp('botLeg', { title: '0 = ไม่งอ' })}<i>พับเข้า</i>${inp('botLip', { title: '0 = ไม่พับ' })}</div>
        ${tri ? '' : `<label class="chk" style="margin-top:8px"><input type="checkbox" data-k="top.on" ${f.top.on ? 'checked' : ''}> <b style="color:var(--rb2)">ตะแกรงบน (Top)</b></label>
        ${f.top.on ? `${meshRow('แนว X', 'top.x', 'hTx')}${meshRow('แนว Y', 'top.y', 'hTy')}
          <div class="row5"><span>ปลาย</span><i>ขางอลง</i>${inp('top.leg', { title: '0 = ไม่งอ' })}<i>พับเข้า</i>${inp('top.lip', { title: '0 = ไม่พับ' })}</div>` : ''}
        <label class="chk" style="margin-top:8px"><input type="checkbox" data-k="side.on" ${f.side.on ? 'checked' : ''}> <b style="color:#7048e8">เหล็กรัดรอบฐาน</b></label>
        ${f.side.on ? `<div class="row5"><span>รัดรอบ</span>${bar('side.bar')}<i>จำนวน</i>${inp('side.n', { len: false, int: true })}<em>รอบ</em></div>
          <div class="row5"><span>ตำแหน่ง</span>${sel('side.pos', ['out', 'in'], ['ด้านนอกเหล็กหลัก', 'ด้านในเหล็กหลัก'], 'style="grid-column:2/5"')}</div>
          <div class="row5"><span>ขาที่มุม</span><i></i>${inp('side.leg')}<em>× 2 ปลาย</em></div>
          <p class="hint2">1 รอบ = อยู่บนสุด (ระดับปลายขางอเหล็กหลัก) · หลายรอบ = เฉลี่ยลงมาด้านล่าง</p>` : ''}`}
        <div class="sec c3">ตอม่อ</div>
        <div class="row5"><span>เหล็กยืน</span>${bar('ped.bar')}<i>จำนวน</i>${inp('ped.n', { len: false, int: true })}<em>เส้น</em></div>
        <div class="row5"><span>ฝังในฐาน</span>${sel('ped.emb', ['hook', 'str'], ['งอฉาก', 'ตรง'])}<i>ขาวาง</i>${inp('ped.leg', { dis: f.ped.emb !== 'hook' })}</div>
        <div class="row5"><span>ต่อขึ้นไป</span>${sel('ped.top', ['lap', 'flush'], ['เหลือทาบ', 'ตัดเสมอ'])}<i>ทาบ</i>${inp('ped.lap', { dis: f.ped.top !== 'lap' })}</div>
        <div class="row5"><span>ปลอก</span>${bar('tie.bar', BCL.STIRRUP_BARS)}<i>@</i>${inp('tie.s')}<em id="hTie"></em></div>
        <div class="row5"><span>หุ้มตอม่อ</span><i></i>${inp('ped.cover')}</div>
        <div class="row5"><span>ขอปลอก</span>${sel('tie.hook', [135, 90], ['135°', '90°'])}<i>ขา</i>${inp('tie.leg')}</div>
        <p class="hint2">ปลอกตัวแรกสูงจากจุดงอของเหล็กยืน (ในฐาน) ${u.out(50)} ${u.t} แล้วเรียงตามระยะ @ ขึ้นไปจนถึงหลังตอม่อ</p>
      </div>`;
  }

  /* ---------- รูปแปลน + รูปตัด ---------- */
  function drawPlan(svg, state, c) {
    const f = state.footing, u = BCL.units(state), m = u.out, UT = u.t; svg.innerHTML = '';
    const P = svg, W = 420, H = 380, sc = Math.min(300 / c.B, 300 / c.L), cx = W / 2, cy = H / 2 - 5;
    const add = el => P.appendChild(el);
    if (c.tri) {
      const s = c.B * sc, h = s * Math.sqrt(3) / 2, pts = [[cx, cy - h * 2 / 3], [cx - s / 2, cy + h / 3], [cx + s / 2, cy + h / 3]];
      add(E('polygon', { points: pts.map(p => p.join(',')).join(' '), fill: 'var(--conc)', stroke: '#343a40', 'stroke-width': 1.5 }));
      const r = f.pile.s * sc / Math.sqrt(3), pdp = f.pile.d * sc;
      const piles = [0, 1, 2].map(k => { const a = -Math.PI / 2 + k * 2 * Math.PI / 3; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
      piles.forEach(p => add(E('rect', { x: p[0] - pdp / 2, y: p[1] - pdp / 2, width: pdp, height: pdp, fill: 'var(--pile)', stroke: '#495057' })));
      const nT = f.tri.n;
      for (let k = 0; k < 3; k++) { const a = piles[k], b = piles[(k + 1) % 3]; for (let j = 0; j < nT; j++) { const nx = -(b[1] - a[1]), ny = b[0] - a[0], l = Math.hypot(nx, ny), o = (j - (nT - 1) / 2) * 3;
        add(E('line', { x1: a[0] + nx / l * o - (b[0] - a[0]) * .25, y1: a[1] + ny / l * o - (b[1] - a[1]) * .25, x2: b[0] + nx / l * o + (b[0] - a[0]) * .25, y2: b[1] + ny / l * o + (b[1] - a[1]) * .25, stroke: 'var(--rb1)', 'stroke-width': 1.3 })); } }
      add(E('text', { x: cx, y: cy + h / 3 + 22, 'text-anchor': 'middle', 'font-size': 12 }, `ด้านละ ${m(c.B)} ${UT}`));
      add(E('text', { x: cx, y: cy + h / 3 + 38, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--rb1)' }, `${nT}-${c.mx.bar} × 3 ด้าน + ${c.my.n}-${c.my.bar} สองทาง`));
    } else {
      const bw = c.B * sc, bl = c.L * sc, x0 = cx - bw / 2, y0 = cy - bl / 2, cc = (c.cov + c.dSd) * sc;
      add(E('rect', { x: x0, y: y0, width: bw, height: bl, fill: 'var(--conc)', stroke: '#343a40', 'stroke-width': 1.5 }));
      for (let k = 0; k < c.mx.n; k++) { const y = y0 + cc + k * c.mx.s * sc; add(E('line', { x1: x0 + cc, y1: y, x2: x0 + bw - cc, y2: y, stroke: 'var(--rb1)', 'stroke-width': 1.2 })); }
      for (let k = 0; k < c.my.n; k++) { const x = x0 + cc + k * c.my.s * sc; add(E('line', { x1: x, y1: y0 + cc, x2: x, y2: y0 + bl - cc, stroke: 'var(--rb1)', 'stroke-width': 1.2 })); }
      if (c.tx) for (let k = 0; k < c.tx.n; k++) { const y = y0 + cc + k * c.tx.s * sc; add(E('line', { x1: x0 + cc, y1: y, x2: x0 + bw - cc, y2: y, stroke: 'var(--rb2)', 'stroke-width': 1, 'stroke-dasharray': '4 2' })); }
      if (c.sideOn) { const o = (c.sdOut ? c.cov : c.cov + D(c.mx.bar)) * sc, lp = Math.min(f.side.leg * sc, bw / 2);
        add(E('rect', { x: x0 + o, y: y0 + o, width: bw - 2 * o, height: bl - 2 * o, fill: 'none', stroke: '#7048e8', 'stroke-width': 1.6, 'stroke-dasharray': '6 3' }));
        const xr = x0 + bw - o, yt = y0 + o; add(E('path', { d: `M${xr - lp},${yt + 4} L${xr - 4},${yt + 4} M${xr - 4},${yt} L${xr - 4},${yt + lp}`, stroke: '#7048e8', 'stroke-width': 2.2, fill: 'none' }));
        add(E('text', { x: xr - lp / 2, y: yt + 16, 'text-anchor': 'middle', 'font-size': 9.5, fill: '#7048e8' }, `ขามุม ${m(f.side.leg)}`)); }
      if (c.pile) { const nx = f.pile.nx, ny = f.pile.ny, ps = f.pile.s * sc, pdp = f.pile.d * sc;
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const px = cx + (i - (nx - 1) / 2) * ps, py = cy + (j - (ny - 1) / 2) * ps; add(E('rect', { x: px - pdp / 2, y: py - pdp / 2, width: pdp, height: pdp, fill: 'var(--pile)', stroke: '#495057', opacity: .85 })); } }
      add(E('line', { x1: x0, y1: y0 + bl + 16, x2: x0 + bw, y2: y0 + bl + 16, stroke: '#343a40' }));
      add(E('text', { x: cx, y: y0 + bl + 30, 'text-anchor': 'middle', 'font-size': 12 }, `B = ${m(c.B)} ${UT}`));
      add(E('line', { x1: x0 - 16, y1: y0, x2: x0 - 16, y2: y0 + bl, stroke: '#343a40' }));
      add(E('text', { x: x0 - 22, y: cy, 'text-anchor': 'middle', 'font-size': 12, transform: `rotate(-90 ${x0 - 22} ${cy})` }, `L = ${m(c.L)} ${UT}`));
      add(E('text', { x: cx, y: y0 - 8, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--rb1)' }, `X: ${c.mx.n}-${c.mx.bar} (@${m(c.mx.s)}) · Y: ${c.my.n}-${c.my.bar} (@${m(c.my.s)})`));
    }
    const pcb = f.ped.b * sc, pcl = f.ped.l * sc, nC = c.nC;
    add(E('rect', { x: cx - pcb / 2, y: cy - pcl / 2, width: pcb, height: pcl, fill: '#495057', opacity: .85 }));
    const per = Math.ceil(nC / 4);
    for (let k = 0; k < nC; k++) { const side = Math.floor(k / per) % 4, fr = (k % per) / per, pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]], a = pts[side], b = pts[(side + 1) % 4];
      add(E('circle', { cx: cx + (a[0] + (b[0] - a[0]) * fr) * (pcb / 2 - 5), cy: cy + (a[1] + (b[1] - a[1]) * fr) * (pcl / 2 - 5), r: 2.5, fill: '#69db7c' })); }
  }

  function drawSection(svg, state, c) {
    const f = state.footing, u = BCL.units(state), m = u.out; svg.innerHTML = '';
    const S = svg, add = el => S.appendChild(el), pd = f.ped;
    const B = c.B, t = c.t, emb = c.pile ? f.pile.emb : 0, lap = c.lap, colH = c.colH;
    const Wf = 230, Hf = 130, sx = Wf / B, sy = Hf / t, bx = 56, yTopF = 190, yBotF = yTopF + Hf, cxs = bx + Wf / 2;
    const cw = Math.max(34, pd.b * sx), cc = pd.cover * sx, yColTop = 60, yLapTop = yColTop - (lap ? 40 : 0), xRight = bx + Wf + 14;
    const lab = (y, txt, col, fx, fy) => { if (fx != null) add(E('path', { d: `M${fx},${fy} L${xRight - 4},${y - 4}`, stroke: col, 'stroke-width': .8, fill: 'none' })); add(E('text', { x: xRight, y, 'font-size': 10.5, fill: col }, txt)); };
    add(E('rect', { x: cxs - cw / 2, y: yColTop, width: cw, height: yTopF - yColTop, fill: 'var(--conc)', stroke: '#343a40' }));
    const ybk = yTopF - 75; add(E('path', { d: `M${cxs - cw / 2 - 8},${ybk + 4} l${cw / 2},-8 l6,10 l${cw / 2 + 2},-8`, fill: 'none', stroke: '#495057' }));
    add(E('rect', { x: bx, y: yTopF, width: Wf, height: Hf, fill: 'var(--conc)', stroke: '#343a40', 'stroke-width': 1.5 }));
    if (c.pile) { const n = c.tri ? 2 : f.pile.nx, ps = f.pile.s * sx, pdp = Math.max(16, f.pile.d * sx), ey = Math.max(6, emb * sy);
      for (let i = 0; i < n; i++) { const x = cxs + (i - (n - 1) / 2) * ps; add(E('rect', { x: x - pdp / 2, y: yBotF - ey, width: pdp, height: ey + 45, fill: 'var(--pile)', stroke: '#495057' })); }
      add(E('text', { x: bx + Wf + 6, y: yBotF + 16, 'font-size': 10, fill: '#495057' }, `ฝังหัวเข็ม ${m(emb)}`)); }
    else { add(E('rect', { x: bx - 6, y: yBotF, width: Wf + 12, height: 6, fill: '#ced4da' })); add(E('text', { x: bx + Wf + 8, y: yBotF + 12, 'font-size': 10, fill: '#495057' }, 'คอนกรีตหยาบ')); }
    const cS = c.cov * sx, cv = c.cov * sy, dX = Math.max(2.5, D(c.mx.bar) * sx), dY = Math.max(3.4, D(c.my.bar) * sx), dS = Math.max(3.2, D(f.side.bar) * sx);
    const shift = c.sideOn && c.sdOut ? dS : 0, xL = bx + cS + shift, xR = bx + Wf - cS - shift;
    const yb = yBotF - c.botCov * sy - dX / 2, lgB = c.legB * sy, lpB = c.lipB * sx;
    const cPath = (y, lg, lp, dir) => lg ? (lp ? `M${xL + lp},${y + dir * lg} L${xL},${y + dir * lg} L${xL},${y} L${xR},${y} L${xR},${y + dir * lg} L${xR - lp},${y + dir * lg}` : `M${xL},${y + dir * lg} L${xL},${y} L${xR},${y} L${xR},${y + dir * lg}`) : `M${xL},${y} L${xR},${y}`;
    add(E('path', { d: cPath(yb, lgB, lpB, -1), fill: 'none', stroke: 'var(--rb1)', 'stroke-width': dX, 'stroke-linejoin': 'round' }));
    const nDots = Math.min(c.my.n, 40);
    for (let k = 0; k < nDots; k++) { const x = xL + dY / 2 + k * (xR - xL - dY) / Math.max(1, nDots - 1); add(E('circle', { cx: x, cy: yb - dX / 2 - dY / 2, r: dY / 2, fill: 'var(--rb1)' })); }
    let yt = null;
    if (c.tx) { yt = yTopF + cv + 2; const dT = Math.max(2, D(c.tx.bar) * sx);
      add(E('path', { d: cPath(yt, c.legT * sy, c.lipT * sx, 1), fill: 'none', stroke: 'var(--rb2)', 'stroke-width': dT, 'stroke-linejoin': 'round' }));
      for (let k = 0; k < c.ty.n; k++) { const x = xL + 4 + k * (xR - xL - 8) / Math.max(1, c.ty.n - 1); add(E('circle', { cx: x, cy: yt + dT / 2 + 2.4, r: 2.4, fill: 'var(--rb2)' })); } }
    const ySides = [];
    if (c.sideOn) { const n = Math.max(1, f.side.n | 0), yHi = yb - lgB + dS / 2 + 2, yLo = yb - dX / 2 - dY - dS / 2 - 2;
      for (let k = 0; k < n; k++) ySides.push(n === 1 ? yHi : yHi + (yLo - yHi) * k / (n - 1));
      const xo = c.sdOut ? [bx + cS + dS / 2, bx + Wf - cS - dS / 2] : [xL + dX / 2 + dS / 2 + 1, xR - dX / 2 - dS / 2 - 1];
      ySides.forEach(y => xo.forEach(x => add(E('circle', { cx: x, cy: y, r: dS / 2, fill: '#7048e8' })))); }
    const dC = Math.max(2.5, D(pd.bar) * sx), yLeg = yb - dX / 2 - dY - dC / 2, lgC = c.legC * sx;
    const xs = [cxs - cw / 2 + cc + dC / 2, cxs + cw / 2 - cc - dC / 2];
    xs.forEach((x, k) => { const dir = k ? 1 : -1; add(E('path', { d: `M${x},${lap ? yLapTop : yColTop + 4} L${x},${yLeg}` + (lgC ? ` L${x + dir * lgC},${yLeg}` : ''), fill: 'none', stroke: 'var(--rb3)', 'stroke-width': dC, 'stroke-linejoin': 'round' })); });
    // ปลอก: สเกลเดียวกันตลอด (sy) — ส่วนล่างตอม่อ 70px และส่วนบน 50px ตามสเกลจริง ช่วงกลางตัดย่อ
    const LOW = 70, HIGH = 50, yAt = hh => { if (hh <= c.bendDepth) return yLeg - hh * sy; const h2 = hh - c.bendDepth;
      if (h2 * sy <= LOW) return yTopF - h2 * sy; if ((colH - h2) * sy <= HIGH) return yColTop + (colH - h2) * sy; return null; };
    for (let k = 0; k < c.nTie; k++) { const hh = 50 + k * f.tie.s; if (hh > c.tieZone) break; const y = yAt(hh); if (y == null) continue;
      add(E('line', { x1: cxs - cw / 2 + cc, y1: y, x2: cxs + cw / 2 - cc, y2: y, stroke: 'var(--rb3)', 'stroke-width': k === 0 ? 2 : 1 })); }
    const y5 = yAt(50); add(E('path', { d: `M${cxs - cw / 2 - 10},${yLeg} L${cxs - cw / 2 - 10},${y5} M${cxs - cw / 2 - 14},${yLeg} L${cxs - cw / 2 - 6},${yLeg} M${cxs - cw / 2 - 14},${y5} L${cxs - cw / 2 - 6},${y5}`, stroke: 'var(--rb3)', 'stroke-width': .8 }));
    add(E('text', { x: cxs - cw / 2 - 14, y: (yLeg + y5) / 2 + 3, 'font-size': 9.5, 'text-anchor': 'end', fill: 'var(--rb3)' }, m(50)));
    const lv = (y, txt) => { add(E('line', { x1: 6, y1: y, x2: bx - 6, y2: y, stroke: '#868e96', 'stroke-dasharray': '3 3' })); add(E('path', { d: `M10,${y} l6,-7 l-12,0 z`, fill: '#495057' })); add(E('text', { x: 20, y: y - 4, 'font-size': 10 }, txt)); };
    lv(yColTop, (+pd.lvCol).toFixed(2)); lv(yTopF, (+pd.lvTop).toFixed(2)); lv(yBotF, (pd.lvTop - t / 1000).toFixed(2));
    add(E('line', { x1: bx - 24, y1: yTopF, x2: bx - 24, y2: yBotF, stroke: '#343a40' }));
    add(E('text', { x: bx - 28, y: (yTopF + yBotF) / 2, 'font-size': 10.5, 'text-anchor': 'middle', transform: `rotate(-90 ${bx - 28} ${(yTopF + yBotF) / 2})` }, `t = ${m(t)}`));
    add(E('text', { x: cxs - cw / 2 - 6, y: ybk - 14, 'font-size': 10.5, 'text-anchor': 'end', fill: '#1f3a8a' }, `H ตอม่อ ${m(colH)}`));
    if (lap) lab(yLapTop + 8, `เหลือทาบ ${m(lap)}`, 'var(--rb3)', xs[1], yLapTop + 10);
    lab(yColTop + 22, `${c.nC}-${pd.bar} เหล็กยืน`, 'var(--rb3)', xs[1], yColTop + 26);
    lab(yColTop + 38, `ป.${f.tie.bar} @${m(f.tie.s)} (${c.nTie} ตัว)`, 'var(--rb3)', cxs + cw / 2 - cc, yColTop + 44);
    let ly = yTopF + 12;
    if (yt != null) { lab(ly, `บน ${c.tx.n}-${c.tx.bar} / ${c.ty.n}-${c.ty.bar}`, 'var(--rb2)', xR - 10, yt); ly += 14; if (c.legT) { lab(ly, `ขาลง ${m(c.legT)}${c.lipT ? ' พับ ' + m(c.lipT) : ''}`, 'var(--rb2)'); ly += 14; } }
    if (ySides.length) { lab(ly, `รัดรอบ ${ySides.length}-${f.side.bar} (${c.sdOut ? 'นอก' : 'ใน'}) ขามุม ${m(f.side.leg)}`, '#7048e8', c.sdOut ? bx + Wf - cS - dS / 2 : xR - dX / 2 - dS / 2, ySides[0]); ly += 14; }
    if (lgC) { lab(ly, `ขาวาง ${m(c.legC)}`, 'var(--rb3)', xs[1] + lgC, yLeg); ly += 14; }
    lab(Math.max(ly, yb - 16), c.tri ? `${c.mx.bar} ชุดตามด้าน / ${c.my.n}-${c.my.bar}` : `ล่าง ${c.mx.n}-${c.mx.bar} / ${c.my.n}-${c.my.bar}`, 'var(--rb1)', xR - 20, yb);
    if (c.legB) lab(Math.max(ly, yb - 16) + 14, `ขาขึ้น ${m(c.legB)}${c.lipB ? ' พับ ' + m(c.lipB) : ''}`, 'var(--rb1)', xR, yb - lgB / 2);
    add(E('line', { x1: bx, y1: yBotF + 60, x2: bx + Wf, y2: yBotF + 60, stroke: '#343a40' }));
    add(E('text', { x: cxs, y: yBotF + 74, 'text-anchor': 'middle', 'font-size': 11 }, `${c.tri ? 'ด้าน' : 'B'} = ${m(B)} ${u.t} (ไม่ตามสเกล)`));
  }

  /* ---------- ตารางรายการเหล็กทีละเส้น (ใช้ร่วม ฐานราก / คาน) ----------
     rows: { key, label, note, bar, code, shape, calcShape, edited, isEd, qtyEd, sum, calcSum, bends, deduct, cut, qty, weight }
     o: { mult, qtyHead, multHead, totalLabel, onEdit(r, field, mm), onRestore(r) } */
  BCL.bendInfoText = state => { const b = state.project.bend || {};
    return b.on === false ? 'ความยาวตัด = รวมระยะนอก–นอก (ไม่หักการงอ — ตั้งได้ใน ⚙ กฎโครงการ)' : `ความยาวตัด = รวมระยะนอก–นอก − ค่าหักการงอ (90°=${b.f90}d, 135°=${b.f135}d)`; };
  BCL.renderBarList = function (tbl, state, rows, o) {
    const u = BCL.units(state), m = u.out, mult = o.mult || 1, showMult = o.multHead != null;
    let h = `<tr><th>#</th><th>รายการ</th><th>เหล็ก</th><th>รูปทรง (ระยะนอก–นอก, ${u.t})<br><small>คลิกตัวเลขเพื่อแก้</small></th><th>ตัด (${u.t})</th><th>${o.qtyHead || 'จำนวน'}</th>${showMult ? `<th>${o.multHead}</th>` : ''}<th>นน. (กก.)</th></tr>`, kg = 0, tot = 0;
    rows.forEach((r, i) => {
      const w = r.weight * mult; kg += w; tot += r.qty * mult;
      const calcCut = r.calcSum - BCL.bendDeduct(state, r.bar, BCL.fBendsOf(r.calcShape));
      h += `<tr><td>${i + 1}</td><td class="l">${r.label}${r.note ? `<br><small>${r.note}</small>` : ''}<br><small class="code">${r.code} ${BCL.SHAPE_T[r.code] || ''}</small></td><td><b>${r.bar}</b></td>
        <td class="shp${r.isEd ? ' ed' : ''}" data-i="${i}">${r.isEd || r.qtyEd ? `<button class="rst" data-i="${i}" title="คืนค่าที่โปรแกรมคำนวณ">↺</button>` : ''}</td>
        <td class="cut${r.isEd ? ' ed' : ''}"><b>${m(r.cut)}</b>${r.deduct ? `<small>รวมด้าน ${m(r.sum)} − หักงอ ${m(r.deduct)}</small><small class="bt">${BCL.fBendText(r.bends)}</small>` : ''}${r.isEd && calcCut !== r.cut ? `<small>คำนวณ ${m(calcCut)}</small>` : ''}</td>
        <td class="${r.qtyEd ? 'qed' : ''}">${r.qty}</td>${showMult ? `<td><b>${r.qty * mult}</b></td>` : ''}<td>${w.toFixed(1)}</td></tr>`;
    });
    h += `<tr class="sum"><td colspan="${showMult ? 6 : 5}">${o.totalLabel || 'รวม'}</td><td>${tot}</td><td>${kg.toFixed(1)}</td></tr>`;
    tbl.innerHTML = h;
    tbl.querySelectorAll('td.shp').forEach(td => { const r = rows[+td.dataset.i]; td.appendChild(BCL.fShapeSVG(r.shape, u, r.edited)); });
    tbl.querySelectorAll('td.shp text.dim').forEach(t => t.addEventListener('click', () => {
      const td = t.closest('td'), r = rows[+td.dataset.i], fld = t.dataset.f, bb = t.getBoundingClientRect(), tb = td.getBoundingClientRect();
      const inp = document.createElement('input'); inp.type = 'number'; inp.className = 'dimedit'; inp.step = u.step(5); inp.value = m(r.shape[fld]);
      inp.style.left = (bb.left - tb.left + bb.width / 2) + 'px'; inp.style.top = (bb.top - tb.top + bb.height / 2) + 'px';
      td.appendChild(inp); inp.focus(); inp.select();
      let done = false;
      const commit = ok => { if (done) return; done = true;
        const val = ok && inp.value !== '' ? u.in(inp.value) : null;
        setTimeout(() => { if (val != null && val >= 0) o.onEdit(r, fld, Math.round(val)); else o.onRestore && inp.remove(); }); };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') commit(true); if (e.key === 'Escape') commit(false); });
      inp.addEventListener('blur', () => commit(true));
    }));
    tbl.querySelectorAll('button.rst').forEach(b => b.addEventListener('click', () => o.onRestore(rows[+b.dataset.i])));
  };

  /* ---------- หน้าฐานราก ---------- */
  BCL.renderFooting = function (root, state, hooks) {
    const f = state.footing;
    root.innerHTML = `<div class="fwrap">
      <div class="fleft" id="fPanel">${panelHTML(state)}</div>
      <div class="fright">
        <div class="fdraw">
          <div class="fcard"><h2>แปลน (Plan)</h2><svg id="fPlan" viewBox="0 0 420 380"></svg>
            <div class="flegend"><span><i style="background:var(--rb1)"></i>ตะแกรงล่าง</span><span><i style="background:var(--rb2)"></i>ตะแกรงบน</span><span><i style="background:#7048e8"></i>รัดรอบ</span><span><i style="background:var(--pile)"></i>เข็ม</span><span><i style="background:#495057"></i>ตอม่อ</span></div></div>
          <div class="fcard"><h2>รูปตัด (Section)</h2><svg id="fSect" viewBox="0 0 480 400"></svg>
            <div class="flegend"><span><i style="background:var(--rb1)"></i>ตะแกรงล่าง</span><span><i style="background:var(--rb3)"></i>เหล็กยืนตอม่อ / ปลอก</span><span>▼ ระดับ (ม.)</span></div></div>
        </div>
        <div class="fcard" style="margin-top:12px">
          <h2>รายการเหล็กทีละเส้น <small id="fBendInfo"></small></h2>
          <div class="tw"><table class="bs" id="fBs"></table></div>
          <div class="fbtns"><span id="fMsg" class="fmsg"></span><span class="spacer"></span>
            <button id="fRestore" title="คืนระยะทุกรายการเป็นค่าที่โปรแกรมคำนวณ">↺ คืนค่าคำนวณทั้งหมด</button>
            <button id="fSend" class="primary">ส่งไป Bar Cut List →</button></div>
        </div>
      </div></div>`;
    const panel = root.querySelector('#fPanel');
    const u = BCL.units(state);
    // ช่องตัวเลข/ข้อความ: อัปเดตทันทีโดยไม่สร้างช่องกรอกใหม่
    panel.querySelectorAll('input[data-k]:not([type=checkbox])').forEach(inp => {
      inp.addEventListener('input', () => {
        const k = inp.dataset.k;
        if (inp.type === 'text') { set(f, k, inp.value || 'F'); hooks.change(); return; }
        if (inp.value === '' || !isFinite(+inp.value)) return;
        let v = inp.hasAttribute('data-len') ? u.in(inp.value) : +inp.value;
        if (inp.hasAttribute('data-int')) v = Math.max(+(inp.min || 0), Math.round(v));
        if (inp.max && v > +inp.max) v = +inp.max;
        set(f, k, v); BCL.save(state); refresh(); hooks.change();
      });
    });
    // ตัวเลือก/สลับ: สร้างหน้าใหม่ (ช่องที่แสดงเปลี่ยน)
    panel.querySelectorAll('select[data-k], input[type=checkbox][data-k]').forEach(el => el.addEventListener('change', () => {
      const k = el.dataset.k;
      if (el.type === 'checkbox') set(f, k, el.checked);
      else if (/\.mode$/.test(k)) {   // สลับ @ ↔ จำนวน: แปลงค่าให้สอดคล้องกับที่คำนวณอยู่
        const pfx = k.replace(/\.mode$/, ''), c = BCL.footingCalc(state), key = pfx.replace('top.', 't');
        const cur = { bx: c.mx, by: c.my, tm: c.my, tx: c.tx, ty: c.ty }[key];
        const mesh = get(f, pfx); mesh.mode = el.value;
        if (cur) mesh.val = el.value === 'n' ? cur.n : Math.round(cur.s / 5) * 5;
      } else set(f, k, el.tagName === 'SELECT' && /^(90|135)$/.test(el.value) ? +el.value : el.value);
      BCL.save(state); BCL.renderFooting(root, state, hooks); hooks.change();
    }));
    panel.querySelectorAll('[data-seg]').forEach(seg => seg.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      f[seg.dataset.seg] = b.dataset.v;
      if (f.type === 'pile' && f.shape === 'tri' && f.B < f.pile.s + 2 * f.pile.edge * 1.732) f.B = Math.ceil((f.pile.s + 2 * f.pile.edge * 1.732) / 50) * 50;
      BCL.save(state); BCL.renderFooting(root, state, hooks); hooks.change();
    }));
    panel.querySelector('#fUnit').addEventListener('change', e => { state.project.units = e.target.value; BCL.save(state); BCL.renderFooting(root, state, hooks); hooks.change(); });
    root.querySelector('#fRestore').addEventListener('click', () => { f.ovr = {}; BCL.save(state); refresh(); });
    root.querySelector('#fSend').addEventListener('click', () => hooks.send(BCL.footingCalc(state)));

    function refresh() {
      const c = BCL.footingCalc(state), m = u.out;
      const hint = (id, ms, mode) => { const h = root.querySelector('#' + id); if (h && ms) h.textContent = mode === 'n' ? `≈ @${m(ms.s)}` : `= ${ms.n} เส้น`; };
      hint('hBx', c.mx, f.bx.mode); hint('hBy', c.my, f.by.mode); hint('hTm', c.my, f.tm.mode); hint('hTx', c.tx, f.top.x.mode); hint('hTy', c.ty, f.top.y.mode);
      const ht = root.querySelector('#hTie'); if (ht) ht.textContent = `= ${c.nTie} ตัว`;
      root.querySelector('#fColH').textContent = (c.colH / 1000).toFixed(2);
      drawPlan(root.querySelector('#fPlan'), state, c);
      drawSection(root.querySelector('#fSect'), state, c);
      renderList(c);
    }

    function renderList(c) {
      const n = Math.max(1, f.count | 0);
      root.querySelector('#fBendInfo').textContent = BCL.bendInfoText(state);
      BCL.renderBarList(root.querySelector('#fBs'), state, c.rows, {
        mult: n, qtyHead: 'ต่อฐาน', multHead: `× ${n} ฐาน`, totalLabel: `รวม ${f.name} × ${n} ฐาน`,
        onEdit: (r, fld, val) => { f.ovr = f.ovr || {}; const o = f.ovr[r.key] || (f.ovr[r.key] = {});
          if (Math.abs(val - r.calcShape[fld]) < 0.5) delete o[fld]; else o[fld] = val;
          if (!Object.keys(o).length) delete f.ovr[r.key]; BCL.save(state); refresh(); },
        onRestore: r => { delete f.ovr[r.key]; BCL.save(state); refresh(); },
      });
      root.querySelector('#fRestore').disabled = !Object.keys(f.ovr || {}).length;
    }
    refresh();
  };
})(window.BCL);
