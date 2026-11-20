/* ตารางกรอกข้อมูล + ส่วนควบคุม */
(function (BCL) {
  const $ = s => document.querySelector(s);
  const opt = (v, list, labels) => list.map((x, i) => `<option value="${x}" ${x === v ? 'selected' : ''}>${labels ? labels[i] : x}</option>`).join('');
  const get = (o, path) => path.split('.').reduce((a, k) => a == null ? a : a[k], o);
  const set = (o, path, v) => { const p = path.split('.'); let t = o; for (let i = 0; i < p.length - 1; i++) t = t[p[i]]; t[p[p.length - 1]] = v; };
  const MODE_T = Object.fromEntries(BCL.END_MODES.map(m => [m.v, m.t]));
  let clipboard = null;

  /* ---------- ตารางกรอก (คอลัมน์ตรงกับช่วงในรูป) ---------- */
  BCL.renderTable = function (tbl, state, G, L) {
    const sps = state.beam.spans, n = sps.length, u = BCL.units(state);
    const num = (i, k, mm, stepMm, extra = '') => `<input type="number" data-u step="${u.step(stepMm)}" ${c(i, k)} value="${u.out(mm)}" ${extra}>`;
    const colW = G.spans.map(g => g.L * L.SC);
    const firstW = L.X(G.spans[0].cx0);
    const cols = `<colgroup><col style="width:${firstW}px">${colW.map(w => `<col style="width:${w}px">`).join('')}<col style="width:${Math.max(40, L.W - firstW - colW.reduce((a, b) => a + b, 0))}px"></colgroup>`;
    const c = (i, k) => `data-i="${i}" data-k="${k}"`;
    const row = (label, cells, cls = '') => `<tr class="${cls}"><td class="h">${label}</td>${cells.join('')}<td></td></tr>`;
    const sec = l => `<tr class="sec"><td colspan="${n + 2}">${l}</td></tr>`;
    const endCell = (i, kind, side) => {
      const e = sps[i][kind][side], r = (G.ends[kind][i] || {})[side] || { mode: 'hook', value: null };
      const needVal = ['extend', 'hook', 'stop'].includes(e.mode);
      const hint = e.mode === 'auto' ? `<small class="hint">→ ${MODE_T[r.mode]}${r.value ? ' ' + u.out(r.value) : ''}</small>` : (r.forced ? `<small class="hint warn">→ ${MODE_T[r.mode]}</small>` : '');
      return `<div class="endgrp"><span class="lab">${side === 'left' ? 'ซ้าย' : 'ขวา'}</span>
        <select ${c(i, `${kind}.${side}.mode`)} class="mode">${opt(e.mode, BCL.END_MODES.map(m => m.v), BCL.END_MODES.map(m => m.t))}</select>
        <input type="number" data-u step="${u.step(10)}" class="${needVal ? '' : 'hide'}" ${c(i, `${kind}.${side}.value`)} value="${u.out(e.value)}" placeholder="${u.out(r.value)}" title="${u.t} (ว่าง = ค่าเริ่มต้น)">${hint}</div>`;
    };
    const barCell = (i, k, s) => {
      const L = BCL.layersOf(s), nl = L.length;
      const layers = nl === 1 ? `<input class="n" type="number" min="1" step="1" ${c(i, k + '.n')} value="${s.n}">`
        : L.map((v, li) => `<input class="n" type="number" min="0" step="1" ${c(i, `${k}.layers.${li}`)} value="${v}" title="ชั้นที่ ${li + 1}">`).join('<span class="lab">+</span>');
      return `<td><select class="ly" ${c(i, k + '.nLayers')} title="จำนวนชั้น">${opt(String(nl), ['1', '2', '3'], ['1 ชั้น', '2 ชั้น', '3 ชั้น'])}</select> ${layers} - <select ${c(i, k + '.bar')}>${opt(s.bar, BCL.BAR_NAMES)}</select>${nl > 1 ? `<small class="hint"> รวม ${s.n}</small>` : ''}</td>`;
    };

    let h = cols + `<tr><th></th>${sps.map((s, i) => `<th>${G.spans[i].name}${G.spans[i].cantilever ? ' <small>(คานยื่น)</small>' : ''}
        <span class="tools"><button data-copy="${i}" title="คัดลอกช่วงนี้">คัดลอก</button><button data-paste="${i}" title="วางลงช่วงนี้" ${clipboard ? '' : 'disabled'}>วาง</button></span></th>`).join('')}<th></th></tr>`;

    h += sec('<span class="ct">เหล็กบน</span>');
    h += row('เหล็กแกนบน', sps.map((s, i) => barCell(i, 'top', s.top)));
    h += row('&nbsp;&nbsp;การจบปลาย', sps.map((s, i) => `<td class="ends">${endCell(i, 'top', 'left')}${endCell(i, 'top', 'right')}</td>`));
    h += row('เสริมพิเศษบน <small>(หัวเสา)</small>', sps.map((s, i) => `<td><input type="checkbox" ${c(i, 'extraTop.on')} ${s.extraTop.on ? 'checked' : ''}>
        <span class="${s.extraTop.on ? '' : 'off'}"><input class="n" type="number" min="1" ${c(i, 'extraTop.n')} value="${s.extraTop.n}"> - <select ${c(i, 'extraTop.bar')}>${opt(s.extraTop.bar, BCL.BAR_NAMES)}</select>
        <select class="z" ${c(i, 'extraTop.frac')}>${opt(s.extraTop.frac, BCL.EXTRA_TOP_FRAC)}</select></span></td>`));

    h += sec('<span class="cb">เหล็กล่าง</span>');
    h += row('เหล็กแกนล่าง', sps.map((s, i) => barCell(i, 'bot', s.bot)));
    h += row('&nbsp;&nbsp;การจบปลาย', sps.map((s, i) => `<td class="ends">${endCell(i, 'bot', 'left')}${endCell(i, 'bot', 'right')}</td>`));
    h += row('เสริมพิเศษล่าง <small>(กลางคาน)</small>', sps.map((s, i) => `<td><input type="checkbox" ${c(i, 'extraBot.on')} ${s.extraBot.on ? 'checked' : ''}>
        <span class="${s.extraBot.on ? '' : 'off'}"><input class="n" type="number" min="1" ${c(i, 'extraBot.n')} value="${s.extraBot.n}"> - <select ${c(i, 'extraBot.bar')}>${opt(s.extraBot.bar, BCL.BAR_NAMES)}</select>
        <select class="z" ${c(i, 'extraBot.len.value')}>${opt(s.extraBot.len.value, BCL.EXTRA_BOT_LEN)}</select>
        ${num(i, 'extraBot.len.custom', s.extraBot.len.custom, 50, `class="${s.extraBot.len.value === 'กำหนดเอง' ? '' : 'hide'}" title="ความยาว (${u.t})"`)}</span></td>`));

    h += sec('<span class="cw">เหล็กข้าง (web bar)</span>');
    h += row('เหล็กข้าง <small>(รวมทั้งสองข้าง)</small>', sps.map((s, i) => `<td><input type="checkbox" ${c(i, 'web.on')} ${s.web.on ? 'checked' : ''}>
        <span class="${s.web.on ? '' : 'off'}"><input class="n" type="number" min="1" ${c(i, 'web.n')} value="${s.web.n}"> - <select ${c(i, 'web.bar')}>${opt(s.web.bar, BCL.BAR_NAMES)}</select></span></td>`));
    h += row('&nbsp;&nbsp;การจบปลาย', sps.map((s, i) => `<td class="ends ${s.web.on ? '' : 'off'}">${endCell(i, 'web', 'left')}${endCell(i, 'web', 'right')}</td>`));

    h += sec('<span class="cs">เหล็กปลอก</span>');
    h += row('ขนาด @ ระยะ', sps.map((s, i) => `<td><select ${c(i, 'stir.bar')}>${opt(s.stir.bar, BCL.STIRRUP_BARS)}</select> @ ${num(i, 'stir.s', s.stir.s, 25)} <span class="lab">ขอ</span> <select ${c(i, 'stir.deg')}>${opt(String(+s.stir.deg === 90 ? 90 : 135), ['135', '90'], ['135°', '90°'])}</select></td>`));
    h += row('หัวเสาถี่กว่า', sps.map((s, i) => `<td><input type="checkbox" ${c(i, 'stir.endOn')} ${s.stir.endOn ? 'checked' : ''}>
        <span class="${s.stir.endOn ? '' : 'off'}"><span class="lab">@</span> ${num(i, 'stir.sEnd', s.stir.sEnd, 25)} <span class="lab">ยาวโซน</span> ${num(i, 'stir.endLen', s.stir.endLen, 50)}</span></td>`));
    h += row('<small>จำนวนปลอก (คำนวณ)</small>', G.stirrups.map(st => `<td class="calc">${st.count} ตัว · ยาวตัด ${u.out(st.cutLength)} ${u.t}</td>`));
    tbl.innerHTML = h;
  };

  /* ---------- ช่องกรอกที่ซ้อนบนรูป: ชื่อช่วง, L, b×h, ความกว้าง Support, ☐ คานยื่น ---------- */
  BCL.renderOverlays = function (box, state, G, L) {
    const u = BCL.units(state), c = (i, k) => `data-i="${i}" data-k="${k}"`;
    box.innerHTML = '';
    const add = (cls, pos, html) => { const d = document.createElement('div'); d.className = 'ov ' + cls; d.dataset.pos = pos; d.innerHTML = html; box.appendChild(d); return d; };
    G.spans.forEach((g, i) => {
      const sp = state.beam.spans[i];
      add('ovname', `name:${i}`, `<input type="text" ${c(i, 'name')} value="${sp.name}" title="ชื่อคานช่วงนี้">`);
      add('ovlen', `L:${i}`, `<input type="number" data-u step="${u.step(50)}" ${c(i, 'L')} value="${u.out(sp.L)}" title="ความยาว ${g.cantilever ? 'ถึงปลายยื่น' : 'center–center'} (${u.t})">`);
      add('ovsize', `size:${i}`, `<input type="number" data-u step="${u.step(10)}" ${c(i, 'b')} value="${u.out(sp.b)}" title="กว้าง b (${u.t})"><span>×</span><input type="number" data-u step="${u.step(10)}" ${c(i, 'h')} value="${u.out(sp.h)}" title="ลึก h (${u.t})">`);
    });
    G.supports.forEach((s, k) => {
      const edge = k === 0 || k === G.spans.length, raw = state.beam.supports[k];
      if (!s.free) add('ovsup', `sup:${k}`, `<input type="number" data-u step="${u.step(50)}" data-sup="${k}" value="${u.out(raw.width)}" title="ความกว้าง Support (${u.t})">`);
      if (edge) add('ovcant', `cant:${k}`, `<label class="chk" title="ติ๊กถ้าปลายนี้ไม่มีเสารองรับ"><input type="checkbox" data-cant="${k}" ${raw.on === false ? 'checked' : ''}> คานยื่น</label>`);
    });
    BCL.positionOverlays(box, G, L);
  };
  /* จัดตำแหน่ง (เรียกซ้ำตอนพิมพ์ เพราะความยาวเปลี่ยนทำให้ตำแหน่งเลื่อน) */
  BCL.positionOverlays = function (box, G, L) {
    box.style.width = L.W + 'px'; box.style.height = L.H + 'px';
    box.querySelectorAll('.ov').forEach(d => {
      const [kind, idx] = d.dataset.pos.split(':'), i = +idx, lay = L.lay;
      let x, y;
      if (kind === 'name') { const g = G.spans[i]; x = L.X((g.x0 + g.x1) / 2); y = lay.yName; }
      else if (kind === 'L') { const g = G.spans[i]; x = L.X((g.cx0 + g.cx1) / 2); y = lay.yDim; }
      else if (kind === 'size') { const g = G.spans[i]; x = L.X((g.x0 + g.x1) / 2); y = lay.ySize; }
      else if (kind === 'sup') { x = L.X(G.supports[i].cx); y = lay.ySup; }
      else if (kind === 'cant') { x = L.X(G.supports[i].cx); y = G.supports[i].free ? lay.ySup : lay.ySup + 24; }
      d.style.left = x + 'px'; d.style.top = y + 'px';
    });
  };

  /* ---------- กฎโครงการ (modal) ---------- */
  BCL.renderProject = function (box, state) {
    const p = state.project, u = BCL.units(state);
    const f = (label, path, step = 1) => `<label>${label}<input type="number" step="${step}" data-p="${path}" value="${get(p, path)}"></label>`;
    const fu = (label, path, stepMm) => `<label>${label} (${u.t})<input type="number" data-u step="${u.step(stepMm)}" data-p="${path}" value="${u.out(get(p, path))}"></label>`;
    box.innerHTML = `
      <h3>กฎโครงการ</h3>
      <div class="grid">
        <label>ชื่อโครงการ<input type="text" data-p="name" value="${p.name}"></label>
        <label>หน่วยความยาวที่แสดง/กรอก<select data-p="units">${opt(p.units || 'mm', ['mm', 'cm', 'm'], ['มิลลิเมตร (มม.)', 'เซนติเมตร (ซม.)', 'เมตร (ม.)'])}</select></label>
        ${fu('ระยะหุ้มคอนกรีต', 'cover', 5)}
        <label>ความยาวเหล็กเส้น<select data-p="stock.default">${opt(String(p.stock.default), ['10000', '12000'], ['10 ม.', '12 ม.'])}</select></label>
        ${f('ความยาวทาบ = n × d, n =', 'lap.factor')}
        ${f('งอฉากเหล็กแกน = n × d, n =', 'hook.main90.factor')}
        ${fu('งอฉาก: อย่างน้อย', 'hook.main90.min', 10)}
        ${f('ขอปลอก 135° = n × d, n =', 'hook.stirrup135.factor')}
        ${fu('ขอปลอก 135°: อย่างน้อย', 'hook.stirrup135.min', 5)}
        ${f('ขอปลอก 90° = n × d, n =', 'hook.stirrup90.factor')}
        ${fu('ขอปลอก 90°: อย่างน้อย', 'hook.stirrup90.min', 5)}
        <label>มุมขอปลอก (ช่วงใหม่)<select data-p="stirrup.deg">${opt(String(p.stirrup.deg || 135), ['135', '90'], ['135°', '90°'])}</select></label>
        ${fu('ปลอกตัวแรกห่างหน้า Support', 'stirrup.firstSpacing', 10)}
        ${f('ยื่นเข้าคานลึกกว่า = n × d, n =', 'endDefaults.shallowToDeep.factorD')}
        ${f('โซนต่อเหล็กบน: กลางช่วงกว้าง L ×', 'splice.top.fraction', 0.01)}
        ${f('โซนต่อเหล็กล่าง: จากหน้า Support L ×', 'splice.bottom.fraction', 0.01)}
        ${fu('เผื่อรอยตัด (kerf)', 'cut.kerf', 1)}
        ${fu('เศษสั้นสุดที่ถือว่าใช้ต่อได้', 'cut.minOffcut', 50)}
      </div>
      <h3 style="margin-top:12px">ค่าหักการงอ <small style="font-weight:normal;color:var(--muted)">ความยาวตัด = รวมระยะนอก–นอก − ค่าหักทุกจุดที่งอ</small></h3>
      <div class="grid">
        <label>หักค่าการงอ<select data-p="bend.on">${opt(String(p.bend.on !== false), ['true', 'false'], ['หัก (แนะนำ)', 'ไม่หัก (บวกตรงๆ)'])}</select></label>
        ${f('งอ 90° หัก n × d, n =', 'bend.f90', 0.1)}
        ${f('งอ 135° หัก n × d, n =', 'bend.f135', 0.1)}
        ${f('งอ 180° หัก n × d, n =', 'bend.f180', 0.1)}
      </div>
      <p class="hint">ค่าเริ่มต้นการจบปลาย: Support ริม = งอฉาก · ความลึกเท่ากัน = ต่อเนื่อง · ตื้น→ลึก = ยื่นเข้า · ลึก→ตื้น = งอฉาก (แก้ทับรายจุดได้ในตาราง)</p>
      <div class="btns"><button id="projClose">ปิด</button></div>`;
  };

  /* ---------- ผูก event ---------- */
  BCL.bindInputs = function (root, state, onChange) {
    // ช่องตัวเลข: ตอนพิมพ์ (input) อัปเดตเฉพาะรูป, ตอนออกจากช่อง (change) สร้างตารางใหม่ → เคอร์เซอร์ไม่กระโดด
    const typed = inp => inp.type === 'number' || inp.type === 'text';
    root.querySelectorAll('[data-k]').forEach(inp => { if (typed(inp)) inp.addEventListener('change', () => onChange(inp, false)); });
    root.querySelectorAll('[data-k]').forEach(inp => inp.addEventListener('input', () => {
      const i = +inp.dataset.i, k = inp.dataset.k, sp = state.beam.spans[i];
      let v;
      if (inp.type === 'checkbox') v = inp.checked;
      else if (inp.type === 'number') { if (inp.value === '') { if (/\.value$/.test(k)) v = null; else return; } else { v = +inp.value; if (!isFinite(v)) return; if (inp.hasAttribute('data-u')) v = BCL.units(state).in(v); } }
      else v = inp.value;
      const ml = k.match(/^(top|bot)\.nLayers$/);
      if (ml) {   // เปลี่ยนจำนวนชั้น: คงชั้นเดิม เพิ่มชั้นใหม่ 2 เส้น / ตัดชั้นเกิน
        const g = sp[ml[1]], cur = BCL.layersOf(g), want = +v; const L = cur.slice(0, want); while (L.length < want) L.push(2);
        g.layers = want > 1 ? L : undefined; if (want === 1) { g.n = L[0]; delete g.layers; } else g.n = L.reduce((a, b) => a + b, 0);
        onChange(inp, false); return;
      }
      set(sp, k, v);
      const mlay = k.match(/^(top|bot)\.(layers\.\d+|n)$/);
      if (mlay) { const g = sp[mlay[1]]; if (g.layers) g.n = g.layers.reduce((a, b) => a + (b | 0), 0); }
      // รักษาความสอดคล้องของ "ต่อเนื่อง" สองฝั่งรอยต่อ
      const m = k.match(/^(top|bot|web)\.(left|right)\.mode$/);
      if (m) {
        const kind = m[1], side = m[2], j = side === 'right' ? i + 1 : i - 1, other = side === 'right' ? 'left' : 'right';
        const nb = state.beam.spans[j];
        if (nb) { if (v === 'continuous') nb[kind][other].mode = 'continuous'; else if (nb[kind][other].mode === 'continuous') nb[kind][other].mode = 'auto'; }
        sp[kind][side].value = null;
      }
      // ช่องตัวเลขที่ซ้อนบนรูป (L, b, h): ระหว่างพิมพ์แค่บันทึกค่า ไม่วาดใหม่ → รูปไม่ยืด/หดจนกว่าจะพิมพ์เสร็จ (change)
      if (inp.type === 'number' && inp.closest('#overlays')) { BCL.save(state); if (state.beam.schedule) state.beam.schedule.stale = true; return; }
      onChange(inp, typed(inp));
    }));
    root.querySelectorAll('[data-cant]').forEach(inp => inp.addEventListener('change', () => { state.beam.supports[+inp.dataset.cant].on = !inp.checked; onChange(inp, false); }));
    root.querySelectorAll('[data-sup]').forEach(inp => {
      inp.addEventListener('input', () => { const v = BCL.units(state).in(inp.value); if (v > 0) { state.beam.supports[+inp.dataset.sup].width = v; BCL.save(state); } });   // วาดใหม่ตอน change
      inp.addEventListener('change', () => onChange(inp, false));
    });
    root.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => { clipboard = BCL.clone(state.beam.spans[+b.dataset.copy]); onChange(); }));
    root.querySelectorAll('[data-paste]').forEach(b => b.addEventListener('click', () => { if (!clipboard) return; state.beam.spans[+b.dataset.paste] = BCL.clone(clipboard); onChange(); }));
  };
  BCL.pasteAll = state => { if (!clipboard) return false; state.beam.spans = state.beam.spans.map(() => BCL.clone(clipboard)); return true; };
  BCL.hasClipboard = () => !!clipboard;
  BCL.bindProject = function (root, state, onChange) {
    root.querySelectorAll('[data-p]').forEach(inp => inp.addEventListener('input', () => {
      let v = inp.type === 'number' || inp.tagName === 'SELECT' && /^\d+$/.test(inp.value) ? +inp.value : inp.value;
      if (inp.type === 'number' && (!isFinite(v) || inp.value === '')) return;
      if (inp.hasAttribute('data-u')) v = BCL.units(state).in(v);
      if (v === 'true' || v === 'false') v = v === 'true';
      set(state.project, inp.dataset.p, v); onChange(inp, inp.type === 'number' || inp.type === 'text');
      if (inp.dataset.p === 'units') { const box = inp.closest('#projectBox'); BCL.renderProject(box, state); BCL.bindProject(box, state, onChange); box.querySelector('#projClose').onclick = () => box.closest('dialog').close(); }
    }));
  };
})(window.BCL);
