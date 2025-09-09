// ==UserScript==
// @name         Canvas → Wayground MCQ Sync (vanh) v0.5.6 + XLSX Export (robust)
// @namespace    https://vanh.local/sync
// @version      0.5.6
// @description  Canvas MCQ (only correct) → Wayground (strict mapping, verified fill, strict Save). Export XLSX/CSV có auto-download + in link tải trong panel (30s).
// @author       vanh
// @match        https://canvas.phenikaa-uni.edu.vn/*
// @match        https://wayground.com/admin/quiz/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_listValues
// @grant        GM_notification
// @grant        GM_download
// @run-at       document-idle
// @require      https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
// ==/UserScript==

(function () {
  'use strict';

  /* ================= Shared ================= */
  const CANVAS_HOST = 'canvas.phenikaa-uni.edu.vn';
  const WAYGROUND_HOST = 'wayground.com';

  const BUS = {
    QUEUE: 'wg_queue',
    AUTORUN: 'wg_autorun',
    DELAY: 'wg_delay_ms',
    BUMP: 'wg_last_event',
  };

  const DEFAULT_DELAY = 800;
  const ch = new BroadcastChannel('wg-sync');
  const sleep = (ms)=>new Promise(r=>setTimeout(r, ms));
  const now = ()=>Date.now();
  const normalize = s => (s||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();

  async function getDelay(){ const v = await GM_getValue(BUS.DELAY, DEFAULT_DELAY); return Number.isFinite(+v)?+v:DEFAULT_DELAY; }
  async function bump(){ await GM_setValue(BUS.BUMP, now()); }
  async function setAutorun(on){ await GM_setValue(BUS.AUTORUN, {on:!!on}); await bump(); ch.postMessage({t:'autorun',on}); }
  async function getAutorun(){ const a=await GM_getValue(BUS.AUTORUN,{on:false}); return !!a.on; }

  async function pushQueue(items){
    if(!Array.isArray(items)||!items.length) return 0;
    const q = await GM_getValue(BUS.QUEUE, []);
    const seen = new Set(q.map(x=>normalize(x.question)));
    const add=[];
    for(const it of items){
      const key = normalize(it.question);
      if(key && !seen.has(key)){ seen.add(key); add.push(it); }
    }
    await GM_setValue(BUS.QUEUE, q.concat(add));
    await bump(); ch.postMessage({t:'queue'});
    return add.length;
  }
  async function popQueue(){
    const q = await GM_getValue(BUS.QUEUE, []);
    if(!q.length) return null;
    const it = q.shift();
    await GM_setValue(BUS.QUEUE, q); await bump();
    return it;
  }
  async function getQueue(){ return await GM_getValue(BUS.QUEUE, []); }

  /* ================= UI Logger ================= */
  function injectPanel(id, title){
    if(document.getElementById(id)) return;
    const el=document.createElement('div');
    el.id=id;
    Object.assign(el.style,{
      position:'fixed', right:'16px', bottom:'16px', zIndex:2147483647,
      width:'380px', background:'#0b0f1a', color:'#e5e7eb',
      border:'1px solid #2b2f3a', borderRadius:'12px', boxShadow:'0 10px 28px rgba(0,0,0,.35)',
      fontFamily:'Inter,system-ui,Arial', fontSize:'12px', overflow:'hidden'
    });
    el.innerHTML=`
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#0f172a;border-bottom:1px solid #1f2430">
        <strong>${title}</strong>
        <span id="${id}-badge" style="margin-left:auto;background:#1f2937;padding:2px 8px;border-radius:999px">idle</span>
      </div>
      <div style="padding:8px;display:flex;gap:6px;border-bottom:1px solid #1f2430;flex-wrap:wrap">
        <button id="${id}-collect" class="wgbtn">Collect</button>
        <button id="${id}-clear" class="wgbtn">Clear</button>
        <button id="${id}-export" class="wgbtn">Export</button>
        <button id="${id}-start" class="wgbtn">Start</button>
        <button id="${id}-stop" class="wgbtn">Stop</button>
        <input id="${id}-delay" type="number" min="200" step="50" title="Delay (ms)"
               style="margin-left:auto;width:86px;background:#0b1220;color:#fff;border:1px solid #2b2f3a;border-radius:8px;padding:4px 6px" />
      </div>
      <div id="${id}-log" style="max-height:260px;overflow:auto;padding:8px"></div>`;
    document.body.appendChild(el);
    el.querySelectorAll('.wgbtn').forEach(b=>{
      Object.assign(b.style,{padding:'6px 8px',background:'#1e293b',border:'1px solid #354055',borderRadius:'8px',color:'#fff',cursor:'pointer'});
      b.onmouseenter=()=>b.style.background='#24324a';
      b.onmouseleave=()=>b.style.background='#1e293b';
    });
  }
  function logger(id){
    const box=()=>document.getElementById(`${id}-log`);
    const badge=()=>document.getElementById(`${id}-badge`);
    const log=(m,c)=>{const b=box(); if(!b) return; const d=document.createElement('div'); d.textContent=`[${new Date().toLocaleTimeString()}] ${m}`; if(c) d.style.color=c; b.appendChild(d); b.scrollTop=b.scrollHeight; console.log('%c[WG]', 'color:#7dd3fc', m);};
    const set=(t,bg)=>{const x=badge(); if(!x) return; x.textContent=t; x.style.background=bg;};
    return {log,setBadge:set};
  }

  /* ================== XLSX / CSV Export (robust) ================== */
  function getLogBox(){
    return document.getElementById('wg-sync-c-log') || document.getElementById('wg-sync-w-log');
  }
  // Auto-download + in ra link để bấm tay (sống 30s)
  function downloadBlob(name, blob, log){
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel='noopener'; a.style.display='none';
    document.body.appendChild(a); a.click(); a.remove();

    const lb = getLogBox();
    if(lb){
      const row=document.createElement('div');
      const link=document.createElement('a');
      link.href=url; link.download=name; link.target='_blank';
      link.textContent = `⬇ ${name} (click nếu không tự tải)`;
      link.style.color='#93c5fd';
      row.appendChild(link);
      lb.appendChild(row);
      lb.scrollTop = lb.scrollHeight;
    }
    setTimeout(()=>URL.revokeObjectURL(url), 30000);
    log && log(`Export ready: ${name} (link 30s)`, '#86efac');
  }

  function aoaToXlsxAndDownload(rows, filename, log){
    try{
      if (typeof XLSX !== 'undefined' && XLSX.utils?.aoa_to_sheet){
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [
          {wch:80},{wch:16},{wch:36},{wch:36},{wch:36},{wch:36},{wch:10},{wch:16},{wch:10}
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        const out = XLSX.write(wb, {bookType:'xlsx', type:'array'});
        const blob = new Blob([out], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
        const name = filename.endsWith('.xlsx') ? filename : filename + '.xlsx';
        downloadBlob(name, blob, log);
        return;
      }
    }catch(e){ console.warn('XLSX export failed, fallback CSV:', e); }
    // Fallback CSV
    const csv = rows.map(r=>r.map(v=>{
      const s = (v==null?'':String(v)).replace(/"/g,'""');
      return `"${s}"`;
    }).join(',')).join('\r\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
    const name = filename.replace(/\.xlsx$/i,'') + '.csv';
    downloadBlob(name, blob, log);
  }

  async function exportQueueToXlsx(log){
    const items = await getQueue();
    if(!items.length){ log && log('Export: queue rỗng', '#fca5a5'); return; }

    const seen = new Set(); const uniq=[];
    for(const it of items){
      const k = normalize(it.question);
      if(k && !seen.has(k)){ seen.add(k); uniq.push(it); }
    }

    const header1 = [
      'Question Text','Question Type','Option 1','Option 2','Option 3','Option 4','Option 5','Correct Answer','Time in seconds'
    ];
    const header2 = [
      'Text of the question(required)',
      '(default is Multiple Choice)',
      '(required in all cases)','(required in all cases)','(optional)','(optional)','(optional)',
      'Leave blank for (1=A,2=B,3=C,4=D)','(optional, default 20)'
    ];
    const rows=[header1,header2];

    for(const it of uniq){
      const o = it.options || [];
      rows.push([
        it.question,
        'Multiple Choice',
        o[0]||'', o[1]||'', o[2]||'', o[3]||'',
        '',
        (Number.isFinite(it.correctIndex) ? (it.correctIndex+1) : ''),
        20
      ]);
    }

    const ts = new Date().toISOString().replace(/[:T]/g,'-').slice(0,19);
    aoaToXlsxAndDownload(rows, `canvas_mcq_export_${ts}.xlsx`, log);
  }

  /* ================= Canvas (collector) ================= */
  const onCanvas = ()=> location.hostname===CANVAS_HOST;
  function collectCanvas(){
    const nodes=document.querySelectorAll('.display_question.question.multiple_choice_question');
    const out=[];
    nodes.forEach((qNode,i)=>{
      if(qNode.classList.contains('incorrect')) return;
      const qEl=qNode.querySelector('.question_text,[id$="_question_text"]');
      const question = normalize(qEl?.innerText||'');
      const answers=qNode.querySelectorAll('.answers .answer');
      const options=[]; let correctIndex=-1;
      answers.forEach((aNode,idx)=>{
        const txt=normalize(aNode.querySelector('.answer_text')?.innerText||'');
        if(txt) options.push(txt);
        const selected = aNode.className.includes('selected_answer') || !!aNode.querySelector('input:checked');
        const marked   = aNode.className.includes('correct');
        if(selected||marked) correctIndex=idx;
      });
      if(!question || options.length<2) return;
      const sliced=options.slice(0,4);
      if(correctIndex<0||correctIndex>=sliced.length) correctIndex=0;
      out.push({kind:'MCQ',question,options:sliced,correctIndex,sourceId:(qNode.id||'').replace(/\D+/g,'')||`canvas_${i}`,collectedAt:now(),sourceHost:CANVAS_HOST});
    });
    return out;
  }
  function mountCanvas(){
    injectPanel('wg-sync-c','Canvas → Wayground');
    const {log,setBadge}=logger('wg-sync-c');
    getDelay().then(ms=>document.getElementById('wg-sync-c-delay').value=ms);
    document.getElementById('wg-sync-c-delay').onchange=async e=>{const v=Math.max(200,+e.target.value||DEFAULT_DELAY); await GM_setValue(BUS.DELAY,v); await bump(); log(`Delay = ${v}ms`, '#cbd5e1');};

    document.getElementById('wg-sync-c-collect').onclick=async ()=>{
      const items=collectCanvas(); const added=await pushQueue(items);
      log(`Collected ${items.length} | Added ${added}`, '#86efac'); setBadge('queued','#374151');
      GM_notification?.({title:'Canvas → Wayground',text:`Added ${added} item(s)`,timeout:1500});
    };
    document.getElementById('wg-sync-c-clear').onclick=async ()=>{await GM_setValue(BUS.QUEUE,[]); await bump(); log('Queue cleared','#fca5a5'); setBadge('cleared','#3f1d1d');};

    // Export
    document.getElementById('wg-sync-c-export').onclick=()=>exportQueueToXlsx(log);

    document.getElementById('wg-sync-c-start').onclick=async ()=>{await setAutorun(true); setBadge('autorun','#14532d'); log('Autorun ON — switch to Wayground', '#a7f3d0');};
    document.getElementById('wg-sync-c-stop').onclick=async ()=>{await setAutorun(false); setBadge('idle','#1f2937'); log('Autorun OFF','#fecaca');};
  }

  /* ================= Wayground (poster) ================= */
  const onWayground = ()=> location.hostname===WAYGROUND_HOST && location.pathname.includes('/admin/quiz/');

  function scanExistingWG(){
    const set=new Set();
    document.querySelectorAll('[data-testid="qdc-inner-card-question"], .question-text-wrapper, [data-testid^="question-details-card-top-"]').forEach(el=>{
      const t=normalize(el.innerText||''); if(t && (/[?]/.test(t)||t.length>10)) set.add(t);
    });
    return set;
  }

  async function waitForVisible(sel, timeout=10000){
    const t0=now(); let el=null;
    while(now()-t0<timeout){ el=document.querySelector(sel); if(el && el.offsetParent!==null) return el; await sleep(60); }
    return el;
  }
  function isClickable(el){
    if(!el) return false;
    const cs = getComputedStyle(el);
    if (el.getAttribute('disabled')!==null) return false;
    if (el.getAttribute('aria-disabled')==='true') return false;
    if (cs.pointerEvents==='none' || cs.visibility==='hidden' || cs.display==='none') return false;
    const r=el.getBoundingClientRect(); return r.width>0 && r.height>0;
  }
  async function waitClickable(sel, timeout=12000){
    const t0=now(); let el=null;
    while(now()-t0<timeout){
      el=document.querySelector(sel);
      if(el && el.offsetParent!==null && isClickable(el)) return el;
      await sleep(80);
    }
    return null;
  }

  // ===== editor helpers =====
  function selectQuestionEditor(){
    return document.querySelector('#query-editor-tiptap-wrapper [data-testid="tiptap-mini-editor-content"] .tiptap.ProseMirror[contenteditable="true"]') ||
           document.querySelector('[data-testid="query-editor-tiptap"] .tiptap.ProseMirror[contenteditable="true"]') ||
           document.querySelector('#query-editor-tiptap-wrapper .ProseMirror[contenteditable="true"]') ||
           document.querySelector('.ProseMirror[contenteditable="true"]');
  }
  async function waitForQuestionEditor(timeout=12000){
    const t0=now(); let el=null;
    while(now()-t0<timeout){ el = selectQuestionEditor(); if(el && el.offsetParent!==null) return el; await sleep(80); }
    return null;
  }
  function nearestEditorTo(el) {
    const target = el.getBoundingClientRect();
    const cands = Array.from(document.querySelectorAll(
      '[data-testid="question-option-text"] [data-testid="tiptap-mini-editor-content"] .tiptap.ProseMirror[contenteditable="true"]'
    )).filter(ed => ed.offsetParent !== null);
    if(!cands.length){
      cands.push(...Array.from(document.querySelectorAll(
        '[data-testid="tiptap-mini-editor-content"] .tiptap.ProseMirror[contenteditable="true"]'
      )));
    }
    let best = null, bestDist = Infinity;
    for (const ed of cands) {
      const r = ed.getBoundingClientRect();
      const dx = ((r.left + r.right) / 2) - ((target.left + target.right) / 2);
      const dy = ((r.top  + r.bottom) / 2) - ((target.top  + target.bottom) / 2);
      const dist = dx*dx + dy*dy;
      if (dist < bestDist) { bestDist = dist; best = ed; }
    }
    return best || null;
  }
  function findEditorsByRows(){
    const rows=[];
    for(let i=0;i<4;i++){
      const btn=document.querySelector(`[data-testid="mcq-editor-mark-answer-${i}-button"]`);
      if(!btn){ rows.push(null); continue; }
      let editor=null;
      let anc=btn.closest('button')?.parentElement || btn.parentElement;
      for(let hop=0; hop<8 && anc; hop++, anc=anc.parentElement){
        const eds=anc.querySelectorAll('[data-testid="question-option-text"] [data-testid="tiptap-mini-editor-content"] .tiptap.ProseMirror[contenteditable="true"]');
        if(eds.length===1){ editor=eds[0]; break; }
      }
      if(!editor){ btn.scrollIntoView({block:'center'}); editor=nearestEditorTo(btn); }
      rows.push(editor||null);
    }
    return rows;
  }
  function setEditorText(editor, text){
    if(!editor) return false;
    editor.scrollIntoView({block:'center'}); editor.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    const bi=new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:text});
    editor.dispatchEvent(bi);
    if(normalize(editor.innerText)!==normalize(text)){
      editor.innerHTML=''; editor.appendChild(document.createTextNode(text));
      editor.dispatchEvent(new Event('input',{bubbles:true}));
      editor.blur(); editor.focus();
    }
    return normalize(editor.innerText)===normalize(text);
  }
  async function fillEditorWithRetry(editor, text, label, log, tries=3){
    for(let k=1;k<=tries;k++){
      const ok=setEditorText(editor, text);
      if(ok){ log(`Filled: ${label} = ${text}`, '#86efac'); return true; }
      log(`Re-try fill ${label} (${k})`, '#fde047'); await sleep(120);
    }
    log(`Fail fill ${label}`, '#f87171'); return false;
  }
  async function ensureFourOptionsFilled(log){
    const rows=findEditorsByRows();
    const texts=rows.map(ed=>normalize(ed?.innerText||'')); const emptyIdx=texts.findIndex(t=>!t);
    if(emptyIdx===-1) return true;
    const btn=document.querySelector(`[data-testid="mcq-editor-mark-answer-${emptyIdx}-button"]`);
    const fbEd=btn?nearestEditorTo(btn):null;
    if(fbEd && fbEd!==rows[emptyIdx]){
      rows[emptyIdx]=fbEd;
      const txt=normalize(fbEd?.innerText||''); if(txt) return true;
    }
    (log||(()=>{}))(`Block Add: Option ${String.fromCharCode(65+emptyIdx)} empty`, '#fbbf24');
    return false;
  }
  async function clickMarkCorrect(idx){
    const b=document.querySelector(`[data-testid="mcq-editor-mark-answer-${idx}-button"]`);
    if(b){ b.click(); return true; }
    return false;
  }

  // ===== STRICT Save selection =====
  function isVisible(el){ return !!el && el.offsetParent !== null; }
  function textMatchesSave(el){
    const t=(el.textContent||'').toLowerCase();
    const title=(el.querySelector('.title')?.getAttribute('title')||'').toLowerCase();
    return /lưu câu hỏi/.test(t) || /lưu câu hỏi/.test(title);
  }
  function hasDiskIcon(el){ return !!el.querySelector('.fa-floppy-disk'); }
  function findSaveButtonsStrict(){
    const all = Array.from(document.querySelectorAll('[data-testid="generic-button"]'))
      .filter(btn => isVisible(btn) && (textMatchesSave(btn) || hasDiskIcon(btn)) && isClickable(btn));
    const container = document.querySelector('#query-editor-tiptap-wrapper')?.closest('div');
    if(container){
      const inBox = all.filter(b => container.contains(b));
      if(inBox.length) return inBox;
    }
    return all;
  }
  async function clickSaveStrict(log){
    const btns = findSaveButtonsStrict();
    if(!btns.length) return null;
    const btn = btns[0];
    btn.scrollIntoView({block:'center'}); btn.click();
    (log||(()=>{}))('Clicked: Lưu câu hỏi (strict)', '#93c5fd');
    return btn;
  }
  async function clickAnyAdditionalSave(excludeBtn, log, timeout=3500){
    const t0=now();
    while(now()-t0<timeout){
      const list = findSaveButtonsStrict().filter(b=>b!==excludeBtn);
      if(list.length){
        const b=list[0];
        b.scrollIntoView({block:'center'}); b.click();
        (log||(()=>{}))('Clicked: Lưu câu hỏi (additional)', '#93c5fd');
        await sleep(300);
        return true;
      }
      await sleep(120);
    }
    return false;
  }

  async function addMCQ(mcq, log){
    const delay=await getDelay();
    log(`→ Begin add: ${mcq.question.slice(0,80)}…`);

    if(scanExistingWG().has(normalize(mcq.question))){
      log('Skip: duplicate on page', '#fbbf24'); return {status:'skip-duplicate'};
    }

    // Nếu editor đã mở, bỏ qua Add/Chọn MCQ
    let qEd = await waitForQuestionEditor(1500);

    if(!qEd){
      let addBtn = await waitClickable('[data-testid="create-new-question-button"]', 12000);
      if(!addBtn) throw new Error('Không thấy nút "Thêm câu hỏi"');
      addBtn.scrollIntoView({block:'center'}); addBtn.click();
      log('Clicked: Thêm câu hỏi', '#93c5fd');
      await sleep(delay);

      let mcqBtn=await waitClickable('[data-testid="create-question-type-MCQ"]', 12000);
      if(!mcqBtn) throw new Error('Không thấy nút chọn MCQ');
      mcqBtn.click(); log('Clicked: Chọn MCQ', '#93c5fd');
      await sleep(delay);

      qEd = await waitForQuestionEditor(12000);
      if(!qEd) throw new Error('Không tìm thấy ô câu hỏi');
    }

    await fillEditorWithRetry(qEd, mcq.question, 'Question', log);

    const rows = findEditorsByRows();
    if(rows.filter(Boolean).length<mcq.options.length) throw new Error('Không đủ 4 ô đáp án (row-map)');

    for(let i=0;i<mcq.options.length;i++){
      const btn = document.querySelector(`[data-testid="mcq-editor-mark-answer-${i}-button"]`);
      const ed  = rows[i] || (btn ? nearestEditorTo(btn) : null);
      if(!ed) throw new Error(`Không tìm thấy editor của Option ${String.fromCharCode(65+i)}`);
      for(let k=1;k<=3;k++){
        ed.scrollIntoView({ block:'center' });
        ed.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        const text = mcq.options[i];
        const bi   = new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:text});
        ed.dispatchEvent(bi);
        if (normalize(ed.innerText)!==normalize(text)) {
          ed.innerHTML=''; ed.appendChild(document.createTextNode(text));
          ed.dispatchEvent(new Event('input',{bubbles:true}));
          ed.blur(); ed.focus();
        }
        if (normalize(ed.innerText)===normalize(text)) {
          log(`Filled: Option ${String.fromCharCode(65+i)} = ${text}`, '#86efac');
          break;
        }
        await sleep(120);
      }
      await sleep(80);
    }

    if(!(await ensureFourOptionsFilled(log))) throw new Error('ABCD chưa điền đủ — dừng để tránh kẹt Add');

    await clickMarkCorrect(mcq.correctIndex);
    log(`Marked correct: ${String.fromCharCode(65+mcq.correctIndex)}`, '#f0abfc');
    await sleep(150);

    const primarySave = await clickSaveStrict(log);
    if(!primarySave) throw new Error('Không thấy nút "Lưu câu hỏi"');

    await clickAnyAdditionalSave(primarySave, log, 3500);

    const ready = await waitClickable('[data-testid="create-new-question-button"]', 20000);
    if(!ready) log('Warn: Add chưa clickable sau khi lưu (sẽ thử lần sau)', '#fde047');

    log('✓ Done 1 item', '#34d399');
    return {status:'ok'};
  }

  let WG_BUSY=false;
  async function pumpWG(log){
    if(WG_BUSY) return; WG_BUSY=true;
    try{
      while(await getAutorun()){
        const q=await GM_getValue(BUS.QUEUE,[]);
        if(!q.length){ log('Queue empty'); break; }
        const item=await popQueue(); if(!item) break;
        if(item.kind!=='MCQ') continue;

        try { await addMCQ(item, log); }
        catch(e){
          log(`Error: ${e.message}`, '#f87171');
          const rest=await GM_getValue(BUS.QUEUE,[]); rest.push(item);
          await GM_setValue(BUS.QUEUE, rest); await bump();
          break;
        }
      }
    } finally { WG_BUSY=false; }
  }

  function mountWayground(){
    injectPanel('wg-sync-w','Wayground Receiver');
    const {log,setBadge}=logger('wg-sync-w');

    getDelay().then(ms=>document.getElementById('wg-sync-w-delay').value=ms);
    document.getElementById('wg-sync-w-delay').onchange=async e=>{
      const v=Math.max(200,+e.target.value||DEFAULT_DELAY);
      await GM_setValue(BUS.DELAY,v); await bump(); log(`Delay = ${v}ms`, '#cbd5e1');
    };
    document.getElementById('wg-sync-w-collect').onclick=()=>log('Collect chỉ dùng ở Canvas','#fbbf24');
    document.getElementById('wg-sync-w-clear').onclick=async ()=>{await GM_setValue(BUS.QUEUE,[]); await bump(); log('Queue cleared','#fca5a5');};

    // Export
    document.getElementById('wg-sync-w-export').onclick=()=>exportQueueToXlsx(log);

    document.getElementById('wg-sync-w-start').onclick=async ()=>{await setAutorun(true); setBadge('autorun','#14532d'); log('Autorun ON','#a7f3d0'); pumpWG(log);};
    document.getElementById('wg-sync-w-stop').onclick=async ()=>{await setAutorun(false); setBadge('idle','#1f2937'); log('Autorun OFF','#fecaca');};

    GM_addValueChangeListener(BUS.BUMP, async ()=>{ if(await getAutorun()) pumpWG(log); });
    ch.onmessage = async (e)=>{ if(e?.data?.t==='autorun' || e?.data?.t==='queue'){ if(await getAutorun()) pumpWG(log); } };

    getAutorun().then(on=>{ if(on){ setBadge('autorun','#14532d'); log('Autorun ON (hot start)','#a7f3d0'); pumpWG(log);} });

    new MutationObserver(async ()=>{ if(await getAutorun() && !WG_BUSY) pumpWG(log); })
      .observe(document.body,{childList:true,subtree:true});
  }

  /* ================= Boot ================= */
  const onCanvasHost = () => location.hostname===CANVAS_HOST;
  const onWaygroundHost = () => location.hostname===WAYGROUND_HOST && location.pathname.includes('/admin/quiz/');
  if(onCanvasHost())  { injectPanel('wg-sync-c','Canvas → Wayground'); mountCanvas(); }
  if(onWaygroundHost()){ injectPanel('wg-sync-w','Wayground Receiver'); mountWayground(); }

})();
