/* ประกอบหน้า */
(function (BCL) {
  const $ = s => document.querySelector(s);
  let state = BCL.load() || BCL.defaultState(2);
  let lastLayout = null, lastG = null;

  let schedCollapsed = false; try { schedCollapsed = localStorage.getItem('bcl_sched_collapsed') === '1'; } catch (e) {}
  function applyCollapse() {
    $('#schedBody').classList.toggle('hide', schedCollapsed); $('#schedWarnings').classList.toggle('hide', schedCollapsed || !$('#schedWarnings').innerHTML);
    $('#btnSchedToggle').textContent = schedCollapsed ? '▸' : '▾';
    try { localStorage.setItem('bcl_sched_collapsed', schedCollapsed ? '1' : '0'); } catch (e) {}
  }
  function renderSchedule() {
    const sch = state.beam.schedule, wrap = $('#sched');
    $('#schedCard').classList.toggle('hide', !sch);                 // ยังไม่ Generate = ไม่แสดงส่วนนี้เลย
    $('#schedStale').classList.toggle('hide', !(sch && sch.stale));
    wrap.classList.toggle('dim', !!(sch && sch.stale));
    if (!sch) { wrap.innerHTML = ''; wrap.style.height = ''; wrap.style.width = ''; $('#schedTotal').textContent = ''; showSchedWarnings([]); return; }
    applyCollapse();
    const res = BCL.drawSchedule(wrap, state, lastG, lastLayout);
    showSchedWarnings(res.issues); updateTotal(); renderBeamBars();
    wrap.querySelectorAll('[data-sid]').forEach(inp => {
      inp.addEventListener('input', () => {
        const it = sch.items.find(x => x.id === inp.dataset.sid); if (!it) return;
        const f = inp.dataset.f;
        if (f === 'userLength') BCL.beamSetOut(state.beam, it, inp.value === '' ? 0 : Math.round(BCL.units(state).in(inp.value)));
        else { const v = +inp.value; it.userN = inp.value === '' || !(v > 0) || v === it.n ? null : v; }
        inp.closest('.sitem').classList.toggle('edited', it.userLength != null || it.userN != null || !!(state.beam.ovr || {})[it.id + '|' + it.bar]);
        BCL.save(state); updateTotal(); renderBeamBars();
        showSchedWarnings(BCL.drawSchedule(wrap, state, lastG, lastLayout, { svgOnly: true }).issues);   // อัปเดตเส้น/ระยะทาบทันที
      });
      inp.addEventListener('change', () => renderSchedule());   // สร้างใหม่เมื่อออกจากช่อง
    });
    wrap.querySelectorAll('[data-anc]').forEach(b => b.addEventListener('click', () => {
      const it = sch.items.find(x => x.id === b.dataset.anc); if (!it) return;
      it.anchor = (it.anchor || 'left') === 'right' ? 'left' : 'right'; BCL.save(state); renderSchedule();
    }));
  }
  /* ตารางรูปทรง + ความยาวตัด (ระบบเดียวกับฐานราก) */
  function renderBeamBars() {
    if (!state.beam.schedule) return;
    $('#bBendInfo').textContent = BCL.bendInfoText(state);
    BCL.renderBarList($('#bBs'), state, BCL.beamBarRows(state, state.beam), {
      totalLabel: `รวม ${state.beam.name}`,
      onEdit: (r, fld, val) => { BCL.beamEdit(state.beam, r, fld, val); BCL.save(state); renderSchedule(); },
      onRestore: r => { BCL.beamRestore(state.beam, r); BCL.save(state); renderSchedule(); },
    });
  }
  function showSchedWarnings(issues) {
    const sch = state.beam.schedule, wb = $('#schedWarnings');
    const ws = [...(sch ? sch.warnings : []), ...issues];
    wb.innerHTML = ws.map(m => `<div>⚠ ${m}</div>`).join(''); wb.classList.toggle('hide', !ws.length || schedCollapsed);
  }
  function updateTotal() {
    const rows = BCL.scheduleRows(state);
    const kg = rows.reduce((a, r) => a + r.qty * r.length / 1000 * BCL.bar(r.bar).w, 0);
    $('#schedTotal').textContent = rows.length ? `${rows.length} รายการ · ${rows.reduce((a, r) => a + r.qty, 0)} เส้น · ≈ ${kg.toFixed(1)} กก.` : '';
  }

  /* light = กำลังพิมพ์ตัวเลข: วาดรูปใหม่แต่ไม่สร้างตารางใหม่ (เคอร์เซอร์คงที่) */
  function render(light) {
    const G = lastG = BCL.geometry(state);
    const L = lastLayout = BCL.drawElevation($('#elev'), state, G);
    $('#unitLabel').textContent = BCL.units(state).t;
    const w = $('#warnings'); w.innerHTML = G.warnings.map(m => `<div>⚠ ${m}</div>`).join(''); w.style.display = G.warnings.length ? '' : 'none';
    if (!light) {
      BCL.renderOverlays($('#overlays'), state, G, L);
      BCL.renderTable($('#tbl'), state, G, L);
      $('#spanCount').value = state.beam.spans.length;
      $('#beamName').value = state.beam.name;
      $('#btnPasteAll').disabled = !BCL.hasClipboard();
      BCL.bindInputs($('#editor'), state, onModelChange);
    } else {
      BCL.positionOverlays($('#overlays'), G, L);   // ความยาวเปลี่ยนขณะพิมพ์ → ขยับช่องกรอกตาม
    }
    renderMembers();
    renderSchedule();
  }

  /* ---------- รายการชิ้นส่วนที่ส่งแล้ว (project.members) ---------- */
  function renderMembers() {
    const bar = $('#membersBar'), ms = state.members || [];
    bar.classList.toggle('hide', !ms.length || page !== 'beam');
    if (!ms.length) return;
    const TYPE = { beam: 'คาน', column: 'เสา', slab: 'พื้น', footing: 'ฐานราก' };
    bar.innerHTML = `<b>ส่งไป Bar Cut List แล้ว ${ms.length} ชุด:</b>` + ms.map((m, i) => {
      const kg = m.rows.reduce((a, r) => a + r.qty * r.length / 1000 * BCL.bar(r.bar).w, 0);
      return `<span class="chip" title="${TYPE[m.type] || m.type} · ${m.rows.length} รายการ · ≈ ${kg.toFixed(1)} กก.">${m.name}
        <button data-mload="${i}" title="ดึงกลับมาแก้">✎</button><button class="del" data-mdel="${i}" title="ลบออกจากรายการ">✕</button></span>`;
    }).join('') + `<span class="spacer"></span><button data-gotab="summary">ดูสรุป & แผนตัด →</button><button data-gotab="cutsheet">ใบตัดเหล็ก →</button>`;
    bar.querySelectorAll('[data-mload]').forEach(b => b.addEventListener('click', () => {
      loadMember(+b.dataset.mload);
    }));
    bar.querySelectorAll('[data-gotab]').forEach(b => b.addEventListener('click', () => showPage(b.dataset.gotab)));
    bar.querySelectorAll('[data-mdel]').forEach(b => b.addEventListener('click', () => delMember(+b.dataset.mdel)));
  }
  function loadMember(i) {
    const m = state.members[i];
    if (m.type === 'footing') {
      if (!confirm(`ดึง "${m.name}" กลับมาแก้ — ฐานที่กำลังแก้อยู่ (${state.footing.name}) จะถูกแทนที่ และ "${m.name}" จะออกจากรายการจนกว่าจะส่งใหม่ ดำเนินการ?`)) return;
      state.footing = BCL.clone(m.data); state.members.splice(i, 1); BCL.save(state); showPage('footing'); return;
    }
    if (!confirm(`ดึง "${m.name}" กลับมาแก้ — ชุดคานที่กำลังแก้อยู่ (${state.beam.name}) จะถูกแทนที่ และ "${m.name}" จะออกจากรายการจนกว่าจะส่งใหม่ ดำเนินการ?`)) return;
    state.beam = BCL.clone(m.data); state.members.splice(i, 1); BCL.save(state); showPage('beam');
  }
  function delMember(i) {
    if (!confirm(`ลบ "${state.members[i].name}" ออกจากรายการ?`)) return;
    state.members.splice(i, 1); BCL.save(state); if (page === 'home') renderHome(); else renderMembers();
  }
  /* ---------- ฐานราก ---------- */
  const footingHooks = {
    change: () => updateCrumb(),
    send: c => {
      const f = state.footing, name = f.name || 'F', n = Math.max(1, f.count | 0);
      const rows = c.rows.map(r => ({ key: r.key, label: r.label, note: r.note, bar: r.bar, shape: BCL.clone(r.shape), perFooting: r.qty, qty: r.qty * n, length: r.cut }));
      const member = { type: 'footing', name, sentAt: Date.now(), data: BCL.clone(f), rows };
      const idx = state.members.findIndex(m => m.name === name && m.type === 'footing');
      if (idx >= 0) { if (!confirm(`มีฐานชื่อ "${name}" อยู่แล้ว — แทนที่?`)) return; state.members[idx] = member; } else state.members.push(member);
      const next = name.replace(/(\d+)$/, m => String(+m + 1));
      f.name = next === name ? name + '-2' : next; f.ovr = {};   // คงค่าเป็นแม่แบบสำหรับฐานถัดไป
      BCL.save(state); renderFooting();
      const msg = document.querySelector('#fMsg'); if (msg) msg.innerHTML = `✓ ส่ง "${name}" (${rows.length} รายการ × ${n} ฐาน) แล้ว — กำลังแก้ "${f.name}" ต่อ · <a href="#" id="fGoHome">ดูหน้ารวม</a>`;
      const gh = document.querySelector('#fGoHome'); if (gh) gh.onclick = e => { e.preventDefault(); showPage('home'); };
    },
  };
  function renderFooting() { BCL.renderFooting($('#pageFooting'), state, footingHooks); updateCrumb(); }
  function renderHome() { BCL.renderHome($('#pageHome'), state, { go: showPage, load: loadMember, del: delMember }); }

  function sendToCutList() {
    const sch = state.beam.schedule;
    if (!sch) return alert('กด Generate ก่อน');
    if (sch.stale && !confirm('ข้อมูลคานเปลี่ยนหลัง Generate — ส่งข้อมูลตามรายการเหล็กที่แสดงอยู่?')) return;
    const issues = BCL.effectiveItems(state).flatMap(e => e.issues);
    if (issues.length && !confirm(`มีคำเตือน ${issues.length} รายการ (เช่น ${issues[0]}) ส่งต่อหรือไม่?`)) return;
    const name = state.beam.name || 'B';
    const rows = BCL.scheduleRows(state);
    const member = { type: 'beam', name, sentAt: Date.now(), data: BCL.clone(state.beam), rows };
    const idx = (state.members || []).findIndex(m => m.name === name && m.type === 'beam');
    if (idx >= 0) { if (!confirm(`มีชุดชื่อ "${name}" อยู่แล้ว — แทนที่?`)) return; state.members[idx] = member; } else state.members.push(member);
    // เริ่มชุดถัดไป: คงค่าเป็นแม่แบบ หรือเริ่มใหม่
    const keep = confirm(`ส่ง "${name}" แล้ว (${rows.length} รายการ)\n\nตกลง = คงค่าชุดนี้ไว้เป็นแม่แบบสำหรับชุดถัดไป\nยกเลิก = เริ่มชุดใหม่จากค่าเริ่มต้น`);
    const next = name.replace(/(\d+)$/, m => String(+m + 1));
    if (keep) { delete state.beam.schedule; state.beam.name = next === name ? name + '-2' : next; }
    else { const p = state.project, ms = state.members; state = BCL.defaultState(2); state.project = p; state.members = ms; state.beam.name = next === name ? name + '-2' : next; }
    BCL.save(state); render(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function onModelChange(el, light) { if (state.beam.schedule) state.beam.schedule.stale = true; BCL.save(state); render(!!light); }

  $('#spanCount').addEventListener('change', e => { BCL.setSpanCount(state, +e.target.value); onModelChange(); });
  $('#beamName').addEventListener('input', e => { state.beam.name = e.target.value || 'B'; onModelChange(e.target, true); });
  $('#beamName').addEventListener('change', () => onModelChange());
  $('#btnPasteAll').addEventListener('click', () => { if (BCL.pasteAll(state)) onModelChange(); });
  $('#btnReset').addEventListener('click', () => {
    if (page === 'footing') { if (confirm('ล้างข้อมูลฐานที่กำลังแก้กลับเป็นค่าเริ่มต้น?')) { state.footing = BCL.defaultFooting(); BCL.save(state); renderFooting(); } return; }
    if (page === 'beam') { if (confirm('ล้างข้อมูลชุดคานที่กำลังแก้ (กฎโครงการและรายการที่ส่งแล้วคงเดิม)?')) { const d = BCL.defaultState(2); state.beam = d.beam; onModelChange(); } return; }
    if (confirm('ล้างทั้งโครงการ (กฎโครงการ, ชิ้นส่วนที่ส่งแล้ว, ข้อมูลที่กำลังแก้) — ควรบันทึก JSON ไว้ก่อน ดำเนินการ?')) { state = BCL.defaultState(2); BCL.save(state); showPage(page); }
  });
  $('#btnToCut').addEventListener('click', sendToCutList);
  $('#btnExport').addEventListener('click', () => BCL.exportJSON(state));
  $('#btnImport').addEventListener('click', () => $('#fileImport').click());
  $('#fileImport').addEventListener('change', e => { const f = e.target.files[0]; if (f) BCL.importJSON(f, (err, s) => { if (err) alert('ไฟล์ไม่ถูกต้อง'); else { state = s; BCL.save(state); render(); showPage(page); } }); e.target.value = ''; });
  $('#btnProject').addEventListener('click', () => { BCL.renderProject($('#projectBox'), state); BCL.bindProject($('#projectBox'), state, () => { onModelChange(); if (page !== 'beam') showPage(page, true); }); $('#projClose').onclick = () => $('#projectModal').close(); $('#projectModal').showModal(); });
  $('#projectModal').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });

  const generate = () => { BCL.generateSchedule(state); BCL.save(state); schedCollapsed = false; renderSchedule(); $('#schedCard').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  $('#btnGenerate').addEventListener('click', generate);
  $('#btnRegen').addEventListener('click', generate);
  $('#btnSchedToggle').addEventListener('click', () => { schedCollapsed = !schedCollapsed; applyCollapse(); });
  $('#btnSchedReset').addEventListener('click', () => { const s = state.beam.schedule; if (!s) return; s.items.forEach(it => { it.userLength = null; it.userN = null; }); state.beam.ovr = {}; BCL.save(state); renderSchedule(); });

  /* ---------- หน้า: home | footing | beam | summary | cutsheet ---------- */
  let page = 'home';
  const CLS = { home: 'tab-home', footing: 'tab-footing', beam: 'tab-model', summary: 'tab-summary', cutsheet: 'tab-cutsheet' };
  function updateCrumb() {
    const home = '<a data-p="home">หน้ารวม</a>';
    $('#crumb').innerHTML = page === 'home' ? '' : page === 'footing' ? `${home} › ฐานราก › <b>${state.footing.name}</b>` : page === 'beam' ? `${home} › คาน` : `${home} › ${page === 'summary' ? 'สรุป & แผนตัด' : 'ใบตัดเหล็ก'}`;
    $('#crumb').querySelectorAll('[data-p]').forEach(a => a.onclick = () => showPage(a.dataset.p));
  }
  function showPage(p, keepScroll) {
    page = p; document.body.className = CLS[p];
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.page === p));
    $('#pageHome').classList.toggle('hide', p !== 'home'); $('#pageFooting').classList.toggle('hide', p !== 'footing');
    $('#editor').classList.toggle('hide', p !== 'beam'); $('#pageSummary').classList.toggle('hide', p !== 'summary'); $('#pageCutsheet').classList.toggle('hide', p !== 'cutsheet');
    $('#membersBar').classList.toggle('hide', p !== 'beam' || !(state.members || []).length);
    if (p === 'home') renderHome();
    if (p === 'footing') renderFooting();
    if (p === 'beam') render();
    if (p === 'summary') BCL.renderSummary($('#pageSummary'), state);
    if (p === 'cutsheet') BCL.renderCutsheet($('#pageCutsheet'), state);
    updateCrumb();
    try { localStorage.setItem('bcl_page', p); } catch (e) {}
    if (!keepScroll) window.scrollTo(0, 0);
  }
  const showTab = t => showPage(t === 'model' ? 'beam' : t);
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => showPage(b.dataset.page)));
  $('#logo').addEventListener('click', () => showPage('home'));
  $('#btnPrint').addEventListener('click', () => window.print());
  $('#btnExcel').addEventListener('click', () => {
    const name = (state.project.name || 'project').replace(/[\\/:*?"<>|]/g, '_');
    if (page === 'summary') BCL.downloadXLSX(name + '-bar-cut-list', BCL.summarySheets(state));
    else BCL.downloadXLSX(name + '-cutting-list', [BCL.cutsheetSheet(state)]);
  });

  const setHdr = () => document.documentElement.style.setProperty('--hdr', document.querySelector('header').offsetHeight + 'px');
  window.addEventListener('resize', setHdr); setHdr();
  let start = 'home'; try { start = localStorage.getItem('bcl_page') || 'home'; } catch (e) {}
  showPage(CLS[start] ? start : 'home');
})(window.BCL);
