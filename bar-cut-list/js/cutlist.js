/* ขั้น 4: รวมรายการเหล็กจากทุกชิ้นส่วน (project.members) → จัดท่อนลงเหล็กเส้น (1D bin packing) → สรุปสั่งซื้อ */
(function (BCL) {
  const P = s => s.project;

  /* ---------- แถบติ๊กเลือกชิ้นส่วนที่จะคิดในรอบนี้ (ใช้ร่วมหน้าสรุป / ใบตัด) ---------- */
  BCL.isSel = m => m.sel !== false;
  BCL.pickBar = function (state, onChange) {
    const ms = state.members || [], nSel = ms.filter(BCL.isSel).length, types = [...new Set(ms.map(m => m.type))];
    const el = document.createElement('div'); el.className = 'pickbar';
    el.innerHTML = `<b>คิดเฉพาะที่เลือก (${nSel}/${ms.length})</b>
      ${ms.map((m, i) => `<label class="pick ${BCL.isSel(m) ? 'on' : ''}"><input type="checkbox" data-pi="${i}" ${BCL.isSel(m) ? 'checked' : ''}> <span class="tag t-${{ footing: 'ft', beam: 'bm', column: 'col', slab: 'sl' }[m.type] || ''}">${BCL.TYPE_T[m.type] || m.type}</span> ${m.name}</label>`).join('')}
      <span class="spacer"></span>
      <button data-pa="all">เลือกทั้งหมด</button><button data-pa="none">ไม่เลือกเลย</button>
      ${types.length > 1 ? types.map(t => `<button data-pa="t:${t}">เฉพาะ${BCL.TYPE_T[t] || t}</button>`).join('') : ''}`;
    const done = () => { BCL.save(state); onChange(); };
    el.querySelectorAll('[data-pi]').forEach(c => c.addEventListener('change', () => { ms[+c.dataset.pi].sel = c.checked; done(); }));
    el.querySelectorAll('[data-pa]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.pa; ms.forEach(m => { m.sel = a === 'all' ? true : a === 'none' ? false : m.type === a.slice(2); }); done();
    }));
    return el;
  };

  /* ---------- รวมรายการเหล็กทุกชิ้นส่วน พร้อมข้อมูลรูปทรงสำหรับใบตัด ---------- */
  BCL.collectRows = function (state, filter = {}) {
    const rows = [];
    (state.members || []).forEach((m, mi) => {
      if (!filter.all && m.sel === false) return;   // ไม่ได้ติ๊กเลือกไว้ (สั่งรอบนี้เฉพาะที่เลือก)
      if (filter.member != null && filter.member !== mi) return;
      if (filter.type && m.type !== filter.type) return;
      const data = m.data || {};
      if (m.type === 'footing') {   // ฐานราก: รูปทรงเก็บเป็นระยะนอก–นอก → หักการงอตามกฎโครงการปัจจุบัน
        (m.rows || []).forEach(fr => {
          const sum = Math.round(BCL.fLenOf(fr.shape)), bends = BCL.fBendsOf(fr.shape), deduct = BCL.bendDeduct(state, fr.bar, bends), length = sum - deduct;
          if (!(fr.qty > 0) || !(length > 0)) return;
          rows.push({ member: m.name, memberIdx: mi, type: m.type, label: fr.label + (fr.note ? ` (${fr.note})` : ''), kind: 'footing', bar: fr.bar, length, sum, deduct, bends, qty: fr.qty,
            weight: fr.qty * length / 1000 * BCL.bar(fr.bar).w, shape: { ...fr.shape, code: BCL.fCode(fr.shape), f: true }, lap: 0, id: fr.key });
        });
        return;
      }
      BCL.beamBarRows(state, data).forEach(r => {   // คาน: รูปทรงระบบเดียวกับฐานราก
        const it = r.item; if (!(r.qty > 0) || !(r.cut > 0)) return;
        rows.push({ member: m.name, memberIdx: mi, type: m.type, label: r.label, kind: it.kind, bar: r.bar, length: r.cut, sum: r.sum, deduct: r.deduct, bends: r.bends, qty: r.qty,
          weight: r.weight, shape: { ...r.shape, code: r.code, f: true, zones: it.zones }, lap: it.lapReq || 0, piece: it.piece, of: it.of, runId: it.runId, id: it.id });
      });
    });
    return rows;
  };

  /* ---------- 1D bin packing สำหรับเหล็กขนาดเดียว ---------- */
  function pack(pieces, stock, kerf) {
    // pieces: [{len, ref}] ขยายทีละเส้นแล้ว; FFD และ BFD เลือกผลที่จำนวนเส้นน้อยกว่า (เท่ากัน → เศษใช้ได้ยาวกว่า)
    const sorted = pieces.slice().sort((a, b) => b.len - a.len);
    const run = best => {
      const bins = [];
      sorted.forEach(p => {
        let target = null, score = best ? Infinity : -1;
        for (let i = 0; i < bins.length; i++) {
          const need = p.len + (bins[i].parts.length ? kerf : 0);
          if (bins[i].rem >= need) { if (!best) { target = bins[i]; break; } if (bins[i].rem - need < score) { score = bins[i].rem - need; target = bins[i]; } }
        }
        if (!target) { target = { rem: stock, parts: [] }; bins.push(target); }
        target.rem -= p.len + (target.parts.length ? kerf : 0); target.parts.push(p);
      });
      return bins;
    };
    const a = run(false), b = run(true);
    const maxRem = bins => Math.max(...bins.map(x => x.rem));
    return (b.length < a.length || (b.length === a.length && maxRem(b) > maxRem(a))) ? b : a;
  }

  /* จัดกลุ่ม bins ที่ตัดเหมือนกันเป็น "รูปแบบ" */
  function patterns(bins) {
    const map = new Map();
    bins.forEach(bin => {
      const key = bin.parts.map(p => p.len).sort((x, y) => y - x).join('+');
      if (!map.has(key)) map.set(key, { key, count: 0, parts: bin.parts.slice().sort((x, y) => y.len - x.len), rem: bin.rem });
      map.get(key).count++;
    });
    return [...map.values()].sort((a, b) => b.count - a.count || b.parts.length - a.parts.length).map((p, i) => ({ ...p, code: String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '') }));
  }

  /* ---------- แผนการตัดทั้งโครงการ ---------- */
  BCL.cutPlan = function (state, opts = {}) {
    const rows = BCL.collectRows(state, opts.filter || {});
    const kerf = P(state).cut?.kerf ?? 0, minUse = P(state).cut?.minOffcut ?? 1000;
    const stockOf = bar => opts.stockOverride || P(state).stock.bySize[bar] || P(state).stock.default;
    const bySize = {};
    rows.forEach(r => (bySize[r.bar] = bySize[r.bar] || []).push(r));
    const sizes = Object.keys(bySize).sort((a, b) => BCL.barD(a) - BCL.barD(b));
    const groups = opts.separate ? [...new Set(rows.map(r => r.member))] : [null];   // แยกตามชุด หรือรวม
    const plan = [], errors = [];
    sizes.forEach(bar => {
      groups.forEach(gname => {
        const list = bySize[bar].filter(r => gname == null || r.member === gname);
        if (!list.length) return;
        const stock = stockOf(bar), pieces = [];
        list.forEach(r => { if (r.length > stock) { errors.push(`${r.member} ${r.label}: ยาว ${r.length} เกินเหล็กเส้น ${stock}`); return; } for (let k = 0; k < r.qty; k++) pieces.push({ len: r.length, ref: `${r.member} ${r.label}`, row: r }); });
        if (!pieces.length) return;
        const bins = pack(pieces, stock, kerf), pats = patterns(bins);
        const used = pieces.reduce((a, p) => a + p.len, 0), total = bins.length * stock;
        const offcutUsable = bins.filter(b => b.rem >= minUse).reduce((a, b) => a + b.rem, 0);
        plan.push({ bar, group: gname, stock, bars: bins.length, patterns: pats, used, total, waste: total - used, wastePct: total ? (total - used) / total * 100 : 0,
          offcutUsable, weightPerBar: stock / 1000 * BCL.bar(bar).w, weight: bins.length * stock / 1000 * BCL.bar(bar).w, usedWeight: used / 1000 * BCL.bar(bar).w });
      });
    });
    const sum = plan.reduce((a, p) => { a.bars += p.bars; a.weight += p.weight; a.used += p.used; a.total += p.total; a.usedWeight += p.usedWeight; return a; }, { bars: 0, weight: 0, used: 0, total: 0, usedWeight: 0 });
    sum.wastePct = sum.total ? (sum.total - sum.used) / sum.total * 100 : 0;
    return { rows, plan, sum, errors, kerf, minUse };
  };

  /* เปรียบเทียบเหล็กเส้น 10 ม. กับ 12 ม. (ต่อขนาด) */
  BCL.compareStocks = function (state, opts = {}) {
    return [10000, 12000].map(stock => ({ stock, res: BCL.cutPlan(state, { ...opts, stockOverride: stock }) }));
  };

  /* ---------- ส่งออก CSV (เปิดใน Excel ได้ ใช้ UTF-8 BOM) ---------- */
  BCL.downloadCSV = function (name, table) {
    const esc = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = '﻿' + table.map(r => r.map(esc).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
  };
  /* ส่งออก Excel หลายชีตด้วย SheetJS ถ้าโหลดได้ ไม่ได้ → CSV ทีละตาราง */
  BCL.downloadXLSX = function (name, sheets) {
    if (window.XLSX) {
      const wb = XLSX.utils.book_new();
      sheets.forEach(s => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name.slice(0, 31)));
      XLSX.writeFile(wb, name + '.xlsx');
    } else sheets.forEach(s => BCL.downloadCSV(`${name}-${s.name}.csv`, s.rows));
  };
})(window.BCL);
