/* หน้ารวม: ข้อมูลโครงการ + เลือกประเภทชิ้นส่วน + รายการชิ้นส่วนที่ส่งแล้ว */
(function (BCL) {
  const fmt = (n, d = 1) => (+n).toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d });
  const ICON = {
    footing: `<svg width="120" height="80" viewBox="0 0 120 80"><rect x="45" y="6" width="30" height="34" fill="#dee2e6" stroke="#495057"/><rect x="15" y="40" width="90" height="22" fill="#dee2e6" stroke="#495057"/><rect x="25" y="62" width="10" height="16" fill="#adb5bd"/><rect x="85" y="62" width="10" height="16" fill="#adb5bd"/><line x1="20" y1="57" x2="100" y2="57" stroke="#d9480f" stroke-width="2.5"/></svg>`,
    column: `<svg width="120" height="80" viewBox="0 0 120 80"><rect x="48" y="4" width="24" height="72" fill="#dee2e6" stroke="#495057"/><line x1="53" y1="4" x2="53" y2="76" stroke="#1864ab" stroke-width="2"/><line x1="67" y1="4" x2="67" y2="76" stroke="#1864ab" stroke-width="2"/><g stroke="#2b8a3e"><line x1="48" y1="14" x2="72" y2="14"/><line x1="48" y1="26" x2="72" y2="26"/><line x1="48" y1="38" x2="72" y2="38"/><line x1="48" y1="50" x2="72" y2="50"/><line x1="48" y1="62" x2="72" y2="62"/></g></svg>`,
    beam: `<svg width="120" height="80" viewBox="0 0 120 80"><rect x="4" y="26" width="10" height="44" fill="#dee2e6" stroke="#495057"/><rect x="106" y="26" width="10" height="44" fill="#dee2e6" stroke="#495057"/><rect x="14" y="26" width="92" height="22" fill="#eef1f5" stroke="#495057"/><line x1="8" y1="30" x2="112" y2="30" stroke="#d9480f" stroke-width="2.5"/><line x1="8" y1="44" x2="112" y2="44" stroke="#1864ab" stroke-width="2.5"/></svg>`,
    slab: `<svg width="120" height="80" viewBox="0 0 120 80"><polygon points="10,50 70,30 110,40 50,62" fill="#eef1f5" stroke="#495057"/><g stroke="#2b8a3e" stroke-width="1.2"><line x1="22" y1="50" x2="80" y2="31"/><line x1="34" y1="54" x2="92" y2="35"/><line x1="46" y1="58" x2="104" y2="39"/></g></svg>`,
  };
  const TILES = [
    { type: 'footing', t: 'ฐานราก', d: 'ฐานแผ่ / ฐานเข็ม (สี่เหลี่ยม, สามเหลี่ยม) + ตอม่อ' },
    { type: 'column', t: 'เสา', d: 'เหล็กยืน ต่อทาบแต่ละชั้น + เหล็กปลอก', soon: true },
    { type: 'beam', t: 'คาน', d: 'คานต่อเนื่องสูงสุด 6 ช่วง, คานยื่น' },
    { type: 'slab', t: 'พื้น', d: 'พื้นวางบนดิน / พื้นสำเร็จ / พื้นหล่อในที่', soon: true },
  ];
  const TAG = { footing: 't-ft', column: 't-col', beam: 't-bm', slab: 't-sl' };

  BCL.memberDesc = (m, state) => {
    if (m.type === 'footing') return BCL.footingDesc(m.data, BCL.units(state));
    if (m.type === 'beam') { const sp = m.data.spans || []; return `${sp.length} ช่วง (${sp.map(s => s.name).join(', ')})`; }
    return '';
  };

  BCL.renderHome = function (box, state, hooks) {
    const ms = state.members || [], rows = BCL.collectRows(state);
    const kg = rows.reduce((a, r) => a + r.weight, 0), pcs = rows.reduce((a, r) => a + r.qty, 0);
    const cnt = t => ms.filter(m => m.type === t).length;
    const byMember = i => rows.filter(r => r.memberIdx === i).reduce((a, r) => a + r.weight, 0);
    box.innerHTML = `<div class="home">
      <div class="proj">
        <div><span class="k">โครงการ</span><br><input id="hProjName" class="pname" value="${(state.project.name || '').replace(/"/g, '&quot;')}" title="แก้ชื่อโครงการ"></div>
        <div class="stat"><div><b>${ms.length}</b><span class="k">ชิ้นส่วนที่ส่งแล้ว</span></div><div><b>${fmt(kg, 1)}</b><span class="k">กก. (ตามความยาวตัด)</span></div><div><b>${pcs.toLocaleString('th-TH')}</b><span class="k">ท่อนที่ต้องตัด</span></div></div>
        <span class="spacer"></span>
        ${ms.length ? `<button data-go="summary">สรุป & แผนตัด →</button><button data-go="cutsheet">ใบตัดเหล็ก →</button>` : ''}
      </div>
      <div class="tiles">${TILES.map(t => `<div class="tile${t.soon ? ' soon' : ''}" ${t.soon ? '' : `data-go="${t.type}"`}>
          ${t.soon ? '<span class="badge">เร็วๆ นี้</span>' : cnt(t.type) ? `<span class="cnt">${cnt(t.type)} ชุด</span>` : ''}
          ${ICON[t.type]}<h3>${t.t}</h3><p>${t.d}</p></div>`).join('')}</div>
      <div class="mlist"><h4>ชิ้นส่วนที่ส่งไป Bar Cut List แล้ว <span class="spacer"></span><button data-go="footing">+ ฐานราก</button><button data-go="beam">+ คาน</button></h4>
        ${ms.length ? `<table><tr><th>ประเภท</th><th>ชื่อชุด</th><th>รายละเอียด</th><th>จำนวน</th><th>น้ำหนัก (กก.)</th><th></th></tr>
          ${ms.map((m, i) => `<tr><td><span class="tag ${TAG[m.type] || ''}">${BCL.TYPE_T[m.type] || m.type}</span></td><td><b>${m.name}</b></td><td class="l">${BCL.memberDesc(m, state)}</td>
            <td>${m.type === 'footing' ? `${m.data.count} ฐาน` : '1 ชุด'}</td><td>${fmt(byMember(i))}</td>
            <td><button data-mload="${i}" title="ดึงกลับมาแก้">✎</button> <button data-mdel="${i}" title="ลบออกจากรายการ">✕</button></td></tr>`).join('')}</table>`
        : `<p class="empty">ยังไม่มีชิ้นส่วน — เลือกประเภทด้านบนเพื่อเริ่ม แล้วกด "ส่งไป Bar Cut List →"</p>`}
      </div></div>`;
    box.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => hooks.go(b.dataset.go)));
    box.querySelectorAll('[data-mload]').forEach(b => b.addEventListener('click', () => hooks.load(+b.dataset.mload)));
    box.querySelectorAll('[data-mdel]').forEach(b => b.addEventListener('click', () => hooks.del(+b.dataset.mdel)));
    box.querySelector('#hProjName').addEventListener('change', e => { state.project.name = e.target.value || 'โครงการใหม่'; BCL.save(state); });
  };
})(window.BCL);
