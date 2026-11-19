/* ใบตัดเหล็ก (Bar Cutting List) สำหรับช่างตัด: รูปทรง + ระยะ + จำนวน พิมพ์ A4 แนวนอน */
(function (BCL) {
  const $ = s => document.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const E = (t, a, tx) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (tx != null) e.textContent = tx; return e; };
  const RED = '#c92a2a', INK = '#333';
  let opts = { member: '', sort: 'member' };
  BCL.cutsheetOpts = opts;

  /* วาดรูปทรง (ระยะเป็นหน่วยตามกฎโครงการ) */
  BCL.shapeSVG = function (shape, u) {
    if (shape.f) return BCL.fShapeSVG(shape, u, {}, 330);   // รูปทรงฐานราก (C, L, I, ปลอก 90/135, รัดรอบ)
    const W = 330, H = 96, svg = E('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    const dim = (x1, y1, x2, y2, t, tx, ty) => { svg.appendChild(E('line', { x1, y1, x2, y2, stroke: INK })); svg.appendChild(E('text', { x: tx, y: ty, 'font-size': 11, 'text-anchor': 'middle', 'font-weight': 700 }, t)); };
    if (shape.code === 'S1') {
      const ratio = Math.max(.35, Math.min(2.5, shape.w / shape.h)), h = 60, w = Math.min(200, Math.max(50, h * ratio)), x = (W - w) / 2 - 10, y = 24;
      svg.appendChild(E('rect', { x, y, width: w, height: h, rx: 5, fill: 'none', stroke: RED, 'stroke-width': 4 }));
      svg.appendChild(E('path', { d: `M${x + w - 2},${y + h - 2} l9,-9 M${x + w - 2},${y + h - 2} l0,9`, stroke: RED, 'stroke-width': 4, fill: 'none' }));   // ขอ 135°
      svg.appendChild(E('line', { x1: x, y1: y - 5, x2: x + w, y2: y - 5, stroke: INK }));
      svg.appendChild(E('text', { x: x + w / 2, y: y - 8 + 1, 'font-size': 11, 'text-anchor': 'middle', 'font-weight': 700 }, u.out(shape.w)));
      svg.appendChild(E('line', { x1: x + w + 10, y1: y, x2: x + w + 10, y2: y + h, stroke: INK }));
      svg.appendChild(E('text', { x: x + w + 16, y: y + h / 2 + 4, 'font-size': 11, 'font-weight': 700 }, u.out(shape.h)));
      svg.appendChild(E('text', { x: x - 8, y: y + h / 2 + 4, 'font-size': 10, 'text-anchor': 'end', fill: '#6b7482' }, `ขอ ${u.out(shape.hook)}`));
      return svg;
    }
    // เหล็กแกน: ขางอยาวตามสัดส่วนคร่าวๆ (ไม่ scale จริง) เพื่อให้ขาสั้น/ขายาวดูต่างกัน
    const up = !!shape.up, x0 = 30, x1 = W - 30, y = shape.code === 'L0' ? 48 : up ? 64 : 30, d = up ? -1 : 1;
    const legPx = mm => Math.max(14, Math.min(52, 14 + mm / 10));          // 150 → 29px, 350 → 49px
    svg.appendChild(E('line', { x1: x0, y1: y, x2: x1, y2: y, stroke: RED, 'stroke-width': 4, 'stroke-linecap': 'round' }));
    if (shape.hookStart) { const l = legPx(shape.hookStart); svg.appendChild(E('line', { x1: x0, y1: y, x2: x0, y2: y + d * l, stroke: RED, 'stroke-width': 4, 'stroke-linecap': 'round' })); svg.appendChild(E('text', { x: x0 - 4, y: y + d * l / 2 + 4, 'font-size': 11, 'text-anchor': 'end', 'font-weight': 700 }, u.out(shape.hookStart))); }
    if (shape.hookEnd) { const l = legPx(shape.hookEnd); svg.appendChild(E('line', { x1: x1, y1: y, x2: x1, y2: y + d * l, stroke: RED, 'stroke-width': 4, 'stroke-linecap': 'round' })); svg.appendChild(E('text', { x: x1 + 4, y: y + d * l / 2 + 4, 'font-size': 11, 'font-weight': 700 }, u.out(shape.hookEnd))); }
    const yd = up ? y + 14 : y - 14;
    dim(x0, yd, x1, yd, u.out(shape.straight), (x0 + x1) / 2, up ? yd + 13 : yd - 4);
    [x0, x1].forEach(x => svg.appendChild(E('line', { x1: x, y1: yd - 6, x2: x, y2: yd + 6, stroke: INK })));
    return svg;
  };

  BCL.renderCutsheet = function (box, state) {
    const u = BCL.units(state), ms = state.members || [];
    if (!ms.length) { box.innerHTML = `<div class="card"><h2>ใบตัดเหล็ก</h2><p class="hint" style="margin:0 16px">ยังไม่มีชิ้นส่วนที่ส่งมา</p></div>`; return; }
    let rows = BCL.collectRows(state);
    if (opts.member) rows = rows.filter(r => r.member === opts.member);
    if (opts.sort === 'bar') rows.sort((a, b) => BCL.barD(a.bar) - BCL.barD(b.bar) || b.length - a.length);
    else if (opts.sort === 'shape') rows.sort((a, b) => a.shape.code.localeCompare(b.shape.code) || BCL.barD(a.bar) - BCL.barD(b.bar) || b.length - a.length);
    const today = new Date().toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const zone = opts.member || ms.map(m => m.name).join(', ');
    const note = r => {
      const n = [];
      if (r.shape.f) {
        if (r.shape.k === 'S') n.push(`ขอ ${r.shape.deg}° สองปลาย`); else if (r.shape.k === 'R') n.push('ขาที่มุม 2 ปลาย'); else if (r.shape.k === 'C') n.push(r.shape.up === false ? 'ขางอลง' : 'ขางอขึ้น');
      } else if (r.shape.code === 'S1') n.push(`ขอ 135° สองด้าน ${u.out(r.shape.hook)}`);
      if (r.deduct) n.push(`รวมด้าน ${u.out(r.sum)} − หักงอ ${u.out(r.deduct)}`);
      if (!r.shape.f && r.shape.hookStart && r.shape.hookEnd) n.push('งอฉาก 2 ด้าน'); else if (r.shape.hookStart || r.shape.hookEnd) n.push('งอฉาก 1 ด้าน');
      if (r.lap) n.push(`ทาบ ${u.out(r.lap)} (ท่อน ${r.piece}/${r.of})`);
      return n.join(' · ');
    };
    const tally = {}; rows.forEach(r => tally[r.bar] = (tally[r.bar] || 0) + r.qty);
    let h = `<div class="rowhead noprint"><h2>ใบตัดเหล็ก (Bar Cutting List)</h2><span class="spacer"></span>
      แสดง: <select id="csMember"><option value="">ทุกชุด (ทั้งโครงการ)</option>${ms.map(m => `<option ${opts.member === m.name ? 'selected' : ''}>${m.name}</option>`).join('')}</select>
      เรียงตาม: <select id="csSort"><option value="member" ${opts.sort === 'member' ? 'selected' : ''}>ชุด → รายการ</option><option value="bar" ${opts.sort === 'bar' ? 'selected' : ''}>ขนาดเหล็ก → ความยาว</option><option value="shape" ${opts.sort === 'shape' ? 'selected' : ''}>รูปแบบ</option></select></div>`;
    h += `<div class="sheet"><p class="title">ใบตัดเหล็ก (BAR CUTTING LIST)</p>
      <div class="hd"><div class="k">Project :</div><div class="v">${state.project.name}</div><div class="k">Date :</div><div class="v">${today}</div><div class="k">Zone :</div><div class="v">${zone}</div>
      <div class="k">หน่วย :</div><div class="v">${u.t}</div><div class="k">ผู้จัดทำ :</div><div class="v">&nbsp;</div><div class="k">รวม :</div><div class="v">${rows.reduce((a, r) => a + r.qty, 0)} เส้น</div></div>
      <table class="cst"><tr><th style="width:40px">No.</th><th style="width:60px">รหัส<br>รูปแบบ</th><th>รูปแบบ (ระยะ ${u.t})</th><th style="width:70px">เหล็ก</th><th style="width:80px">ตัด<br>(${u.t})</th><th style="width:70px">จำนวน<br>(เส้น)</th><th style="width:170px">ตำแหน่ง</th><th style="width:180px">หมายเหตุ</th></tr>`;
    let last = null;
    rows.forEach((r, i) => {
      if (opts.sort === 'member' && r.member !== last) { last = r.member; const m = ms.find(x => x.name === r.member); h += `<tr class="grp"><td colspan="8">ชุด ${r.member} (${BCL.TYPE_T[r.type] || r.type}) — ${BCL.memberDesc(m, state)}${m.type === 'footing' ? ` · ${m.data.count} ฐาน (จำนวนรวมแล้ว)` : ''}</td></tr>`; }
      h += `<tr><td>${i + 1}</td><td class="big">${r.shape.code}</td><td class="shape" data-shape="${i}"></td><td class="big">${r.bar}</td><td class="big">${u.out(r.length)}</td><td class="big">${r.qty}</td><td>${r.member}<br><small>${r.label}</small></td><td class="note">${note(r)}</td></tr>`;
    });
    h += `</table><div class="sum"><span>รวม: ${Object.entries(tally).sort((a, b) => BCL.barD(a[0]) - BCL.barD(b[0])).map(([b, n]) => `${b} = ${n} เส้น`).join(' · ')}</span>
      <span>รหัส: S1 ปลอกขอ 135° · S2 ปลอกขอ 90° · R1 รัดรอบ · L0 ตรง · L1 งอ 1 ด้าน · L2 งอ 2 ด้าน · C งอ + พับปลาย</span></div>
      <div class="sign"><div>ผู้จัดทำ</div><div>ผู้ตรวจสอบ</div><div>ช่างตัด (รับทราบ)</div></div></div>`;
    box.innerHTML = h;
    box.querySelectorAll('[data-shape]').forEach(td => td.appendChild(BCL.shapeSVG(rows[+td.dataset.shape].shape, u)));
    $('#csMember').onchange = e => { opts.member = e.target.value; BCL.renderCutsheet(box, state); };
    $('#csSort').onchange = e => { opts.sort = e.target.value; BCL.renderCutsheet(box, state); };
  };

  BCL.cutsheetSheet = function (state) {
    const u = BCL.units(state);
    let rows = BCL.collectRows(state); if (opts.member) rows = rows.filter(r => r.member === opts.member);
    const out = [['No.', 'รหัสรูปแบบ', 'รูปทรง', `ระยะ A (${u.t})`, `ระยะ B (${u.t})`, `ระยะ C (${u.t})`, 'เหล็ก', `รวมด้าน (${u.t})`, `หักงอ (${u.t})`, `ตัด (${u.t})`, 'จำนวน', 'ชุด', 'ตำแหน่ง', 'น้ำหนัก (กก.)']];
    const dims = s => s.f ? (s.k === 'S' || s.k === 'R' ? [s.w, s.h, s.hook] : s.k === 'C' ? [s.a, s.leg, s.lip || ''] : s.k === 'L' ? [s.a, s.leg, ''] : [s.a, '', ''])
      : s.code === 'S1' ? [s.w, s.h, s.hook] : [s.straight, s.hookStart || s.hookEnd || 0, s.hookStart && s.hookEnd ? s.hookEnd : ''];
    rows.forEach((r, i) => { const s = r.shape, d = dims(s).map(x => x === '' ? '' : u.out(x)); out.push([i + 1, s.code, BCL.SHAPE_T[s.code], ...d, r.bar, u.out(r.sum ?? r.length), u.out(r.deduct || 0), u.out(r.length), r.qty, r.member, r.label, +r.weight.toFixed(2)]); });
    return { name: 'ใบตัดเหล็ก', rows: out };
  };
})(window.BCL);
