/* หน้าสรุป: ① สรุปสั่งเหล็ก ② แผนการตัด ③ รายการเหล็กทั้งหมด */
(function (BCL) {
  const $ = s => document.querySelector(s);
  const fmt = (n, d = 1) => (+n).toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt0 = n => (+n).toLocaleString('th-TH', { maximumFractionDigits: 0 });
  const COLORS = ['#1864ab', '#2b8a3e', '#d9480f', '#7048e8', '#0b7285', '#c2255c', '#5c940d', '#e67700'];
  const SHAPE_T = { S1: 'ปลอก ขอ 135°', S2: 'ปลอก ขอ 90°', R1: 'รัดรอบ', L0: 'ตรง', L1: 'งอ 1 ด้าน', L2: 'งอ 2 ด้าน', C: 'งอ + พับปลาย' };
  BCL.SHAPE_T = SHAPE_T;
  let opts = { separate: false, compare: false, filterMember: '', filterBar: '' };
  BCL.summaryOpts = opts;

  BCL.renderSummary = function (box, state) {
    const u = BCL.units(state), ms = state.members || [];
    if (!ms.length) { box.innerHTML = `<div class="card"><h2>สรุป / Bar Cut List</h2><p class="hint" style="margin:0 16px">ยังไม่มีชิ้นส่วนที่ส่งมา — กลับไปหน้ารวม เลือกฐานราก/คาน แล้วกด "ส่งไป Bar Cut List →"</p></div>`; return; }
    const res = BCL.cutPlan(state, { separate: opts.separate });
    const stockT = mm => `${mm / 1000} ม.`;
    let h = '';

    // ---------- ① สรุปสั่งเหล็ก ----------
    h += `<div class="card"><h2>① สรุปสั่งเหล็ก (ใบสั่งซื้อ) <span class="f">โครงการ: ${state.project.name} · ${ms.length} ชุด: ${ms.map(m => m.name).join(', ')}</span></h2>
      <div class="kpi"><div><b>${fmt0(res.sum.weight)} กก.</b><small>น้ำหนักเหล็กที่ต้องซื้อ</small></div><div><b>${res.sum.bars} เส้น</b><small>เหล็กเส้นทั้งหมด</small></div>
      <div><b>${fmt(res.sum.wastePct)} %</b><small>เศษรวม (${fmt0(res.sum.weight - res.sum.usedWeight)} กก.)</small></div><div><b>${fmt0(res.sum.usedWeight)} กก.</b><small>น้ำหนักเหล็กที่ใช้จริง</small></div></div>
      <div class="tw"><table class="sum"><tr><th>ขนาด</th>${opts.separate ? '<th>ชุด</th>' : ''}<th>ความยาวเส้น</th><th>จำนวน (เส้น)</th><th>นน./เส้น (กก.)</th><th>น้ำหนักรวม (กก.)</th><th>ใช้จริง (ม.)</th><th>เศษ (ม.)</th><th>% เศษ</th></tr>`;
    res.plan.forEach(p => { h += `<tr><td><b>${p.bar}</b></td>${opts.separate ? `<td>${p.group}</td>` : ''}<td>${stockT(p.stock)}</td><td>${p.bars}</td><td>${fmt(p.weightPerBar, 2)}</td><td>${fmt(p.weight)}</td><td>${fmt(p.used / 1000)}</td><td>${fmt(p.waste / 1000)}</td><td class="${p.wastePct > 10 ? 'warn' : 'ok'}">${fmt(p.wastePct)}</td></tr>`; });
    h += `<tr class="sumrow"><td colspan="${opts.separate ? 3 : 2}">รวม</td><td>${res.sum.bars}</td><td></td><td>${fmt(res.sum.weight)}</td><td>${fmt(res.sum.used / 1000)}</td><td>${fmt((res.sum.total - res.sum.used) / 1000)}</td><td>${fmt(res.sum.wastePct)}</td></tr></table></div>`;
    if (res.errors.length) h += `<div class="warnbox" style="margin-top:8px">${res.errors.map(e => `<div>⚠ ${e}</div>`).join('')}</div>`;
    h += `</div>`;

    // ---------- ② แผนการตัด ----------
    h += `<div class="card"><h2>② แผนการตัด (Cutting Plan) <span class="f">
        <label class="chk"><input type="checkbox" id="optSeparate" ${opts.separate ? 'checked' : ''}> แยกตามชุด</label>
        <label class="chk"><input type="checkbox" id="optCompare" ${opts.compare ? 'checked' : ''}> เปรียบเทียบ 10 vs 12 ม.</label>
        <span>เผื่อรอยตัด ${u.out(res.kerf)} ${u.t} · เศษใช้ได้ ≥ ${u.out(res.minUse)} ${u.t}</span></span></h2>`;
    if (opts.compare) {
      const cmp = BCL.compareStocks(state, { separate: opts.separate });
      h += `<div class="tw"><table class="sum"><tr><th>ขนาด</th><th colspan="3">เหล็กเส้น 10 ม.</th><th colspan="3">เหล็กเส้น 12 ม.</th><th>แนะนำ</th></tr><tr><th></th><th>เส้น</th><th>น้ำหนัก</th><th>% เศษ</th><th>เส้น</th><th>น้ำหนัก</th><th>% เศษ</th><th></th></tr>`;
      const bars = [...new Set(cmp[0].res.plan.map(p => p.bar + '|' + (p.group ?? '')))];
      bars.forEach(key => { const [bar, g] = key.split('|'); const a = cmp[0].res.plan.find(p => p.bar === bar && (p.group ?? '') === g), b = cmp[1].res.plan.find(p => p.bar === bar && (p.group ?? '') === g);
        const rec = a.weight <= b.weight ? '10 ม.' : '12 ม.';
        h += `<tr><td><b>${bar}</b>${g ? ' · ' + g : ''}</td><td>${a.bars}</td><td>${fmt(a.weight)}</td><td>${fmt(a.wastePct)}</td><td>${b.bars}</td><td>${fmt(b.weight)}</td><td>${fmt(b.wastePct)}</td><td class="ok"><b>${rec}</b></td></tr>`; });
      h += `</table></div><p class="hint" style="margin:6px 0 12px">เลือกความยาวเหล็กเส้นต่อขนาดได้ใน ⚙ กฎโครงการ (ความยาวเหล็กเส้น) — แผนด้านล่างใช้ค่าตามกฎโครงการ</p>`;
    }
    res.plan.forEach(p => {
      h += `<div class="sz">${p.bar}${p.group ? ` <small>ชุด ${p.group}</small>` : ''} <small>เหล็กเส้น ${stockT(p.stock)} × ${p.bars} เส้น · ${p.patterns.length} รูปแบบ · เศษ ${fmt(p.wastePct)} %${p.offcutUsable ? ` · เศษใช้ต่อได้ ${fmt(p.offcutUsable / 1000, 2)} ม.` : ''}</small></div>
        <div class="tw"><table class="pat"><tr><th style="width:56px">รูปแบบ</th><th style="width:70px">จำนวนเส้น</th><th>การตัดในเหล็ก 1 เส้น (${u.t})</th><th style="width:28%">รายการตัด</th><th style="width:90px">เศษ (${u.t})</th></tr>`;
      p.patterns.forEach(pt => {
        const refs = new Map(); pt.parts.forEach(x => refs.set(x.ref, (refs.get(x.ref) || 0) + 1));
        const colorOf = ref => COLORS[[...refs.keys()].indexOf(ref) % COLORS.length];
        const bar = pt.parts.map(x => `<span style="width:${x.len / p.stock * 100}%;background:${colorOf(x.ref)}" title="${x.ref} ${u.out(x.len)}">${u.out(x.len)}</span>`).join('') + (pt.rem > 0 ? `<span class="w" style="width:${pt.rem / p.stock * 100}%">${pt.rem >= res.minUse ? '★' : ''}</span>` : '');
        const list = [...refs.entries()].map(([ref, n]) => { const len = pt.parts.find(x => x.ref === ref).len; return `${u.out(len)}${n > 1 ? ' × ' + n : ''} <small>(${ref})</small>`; }).join(' + ');
        h += `<tr><td><b>${pt.code}</b></td><td>${pt.count}</td><td><div class="bar">${bar}</div></td><td class="l">${list}</td><td class="${pt.rem >= res.minUse ? 'ok' : ''}">${u.out(pt.rem)}${pt.rem >= res.minUse ? ' ★' : ''}</td></tr>`;
      });
      h += `</table></div>`;
    });
    h += `<p class="hint" style="margin:8px 0 0">★ = เศษยาวพอใช้ต่อ (≥ ${u.out(res.minUse)} ${u.t})</p></div>`;

    // ---------- ③ รายการเหล็กทั้งหมด ----------
    const allRows = res.rows, bars = [...new Set(allRows.map(r => r.bar))].sort((a, b) => BCL.barD(a) - BCL.barD(b));
    const fr = allRows.filter(r => (!opts.filterMember || r.member === opts.filterMember) && (!opts.filterBar || r.bar === opts.filterBar));
    h += `<div class="card"><h2>③ รายการเหล็กทั้งหมด (Bar Schedule รวม) <span class="f">กรอง:
        <select id="optMember"><option value="">ทุกชุด</option>${ms.map(m => `<option ${opts.filterMember === m.name ? 'selected' : ''}>${m.name}</option>`).join('')}</select>
        <select id="optBar"><option value="">ทุกขนาด</option>${bars.map(b => `<option ${opts.filterBar === b ? 'selected' : ''}>${b}</option>`).join('')}</select></span></h2>
      <div class="tw"><table class="sum"><tr><th>#</th><th>ชุด</th><th>ประเภท</th><th>รายการ</th><th>ขนาด</th><th>รูปทรง</th><th>รวมด้าน − หักงอ</th><th>ความยาวตัด (${u.t})</th><th>จำนวน</th><th>รวม (ม.)</th><th>นน. (กก.)</th></tr>`;
    fr.forEach((r, i) => { h += `<tr><td>${i + 1}</td><td>${r.member}</td><td>${BCL.TYPE_T[r.type] || r.type}</td><td class="l">${r.label}</td><td><b>${r.bar}</b></td><td>${r.shape.code} <small>${SHAPE_T[r.shape.code] || ''}</small></td><td><small>${r.deduct ? `${u.out(r.sum)} − ${u.out(r.deduct)}` : '–'}</small></td><td>${u.out(r.length)}</td><td>${r.qty}</td><td>${fmt(r.qty * r.length / 1000, 2)}</td><td>${fmt(r.weight)}</td></tr>`; });
    h += `<tr class="sumrow"><td colspan="8">รวม${opts.filterMember || opts.filterBar ? ' (ตามตัวกรอง)' : 'ทุกรายการ'}</td><td>${fr.reduce((a, r) => a + r.qty, 0)}</td><td>${fmt(fr.reduce((a, r) => a + r.qty * r.length / 1000, 0), 2)}</td><td>${fmt(fr.reduce((a, r) => a + r.weight, 0))}</td></tr></table></div></div>`;
    box.innerHTML = h;

    const re = () => BCL.renderSummary(box, state);
    $('#optSeparate').onchange = e => { opts.separate = e.target.checked; re(); };
    $('#optCompare').onchange = e => { opts.compare = e.target.checked; re(); };
    $('#optMember').onchange = e => { opts.filterMember = e.target.value; re(); };
    $('#optBar').onchange = e => { opts.filterBar = e.target.value; re(); };
  };
  BCL.TYPE_T = { beam: 'คาน', column: 'เสา', slab: 'พื้น', footing: 'ฐานราก' };

  /* ข้อมูลสำหรับ Excel: 3 ชีต */
  BCL.summarySheets = function (state) {
    const res = BCL.cutPlan(state, { separate: opts.separate }), u = BCL.units(state);
    const s1 = [['ขนาด', 'ชุด', 'ความยาวเส้น (มม.)', 'จำนวน (เส้น)', 'นน./เส้น (กก.)', 'น้ำหนักรวม (กก.)', 'ใช้จริง (ม.)', 'เศษ (ม.)', '% เศษ']];
    res.plan.forEach(p => s1.push([p.bar, p.group || 'รวม', p.stock, p.bars, +p.weightPerBar.toFixed(2), +p.weight.toFixed(1), +(p.used / 1000).toFixed(2), +(p.waste / 1000).toFixed(2), +p.wastePct.toFixed(1)]));
    s1.push(['รวม', '', '', res.sum.bars, '', +res.sum.weight.toFixed(1), +(res.sum.used / 1000).toFixed(2), +((res.sum.total - res.sum.used) / 1000).toFixed(2), +res.sum.wastePct.toFixed(1)]);
    const s2 = [['ขนาด', 'ชุด', 'เหล็กเส้น (มม.)', 'รูปแบบ', 'จำนวนเส้น', 'รายการตัด (มม.)', 'เศษ (มม.)']];
    res.plan.forEach(p => p.patterns.forEach(pt => s2.push([p.bar, p.group || 'รวม', p.stock, pt.code, pt.count, pt.parts.map(x => `${x.len} (${x.ref})`).join(' + '), pt.rem])));
    const s3 = [['#', 'ชุด', 'ประเภท', 'รายการ', 'ขนาด', 'รูปทรง', 'รวมด้าน (มม.)', 'หักงอ (มม.)', `ความยาวตัด (มม.)`, 'จำนวน', 'รวม (ม.)', 'น้ำหนัก (กก.)']];
    res.rows.forEach((r, i) => s3.push([i + 1, r.member, BCL.TYPE_T[r.type] || r.type, r.label, r.bar, r.shape.code, r.sum ?? r.length, r.deduct || 0, r.length, r.qty, +(r.qty * r.length / 1000).toFixed(2), +r.weight.toFixed(2)]));
    return [{ name: 'สรุปสั่งเหล็ก', rows: s1 }, { name: 'แผนการตัด', rows: s2 }, { name: 'รายการเหล็ก', rows: s3 }];
  };
})(window.BCL);
