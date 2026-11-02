'use strict';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));

const DEVELOPER_TELEGRAM='aasgharae';

const CATEGORIES=[
  {id:'service',label:'خدمت / ویزیت'},
  {id:'consult',label:'مشاوره'},
  {id:'contract',label:'قرارداد دوره‌ای'},
  {id:'transport',label:'سفر / حمل'},
  {id:'other',label:'سایر'},
];
const catLabel=id=>(CATEGORIES.find(c=>c.id===id)||{label:'سایر'}).label;
const MONTHS=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const DAYS=['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'];

const faNum=n=>Number(n||0).toLocaleString('fa-IR');
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const escapeAttr=escapeHtml;

function parseAmount(v){
  const m={'۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9','٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'};
  return parseInt(String(v).split('').map(c=>m[c]||c).join('').replace(/[^\d]/g,''),10)||0;
}
const todayJalali=()=>{const n=new Date();return d2j(g2d(n.getFullYear(),n.getMonth()+1,n.getDate()))};
const jStr=j=>`${j.jy}/${String(j.jm).padStart(2,'0')}/${String(j.jd).padStart(2,'0')}`;
const gregStr=j=>{const g=d2g(j2d(j.jy,j.jm,j.jd));return `${g.gy}-${String(g.gm).padStart(2,'0')}-${String(g.gd).padStart(2,'0')}`};

/* ===== Storage: File System Access + IndexedDB ===== */
const IDB_NAME='hesabyar-idb', IDB_STORE='db';
let storageMode='idb';
let dirHandle=null;
let pendingDirHandle=null;
let sqliteFileHandle=null;
let fileErrorShown=false;

function idb(){
  return new Promise((res,rej)=>{
    const r=indexedDB.open(IDB_NAME,1);
    r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(IDB_STORE))d.createObjectStore(IDB_STORE)};
    r.onsuccess=()=>res(r.result);
    r.onerror=()=>rej(r.error);
  });
}
async function idbSave(v,key='main'){
  const d=await idb();
  return new Promise((res,rej)=>{
    const tx=d.transaction(IDB_STORE,'readwrite');
    tx.objectStore(IDB_STORE).put(v,key);
    tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);
  });
}
async function idbLoad(key='main'){
  const d=await idb();
  return new Promise((res,rej)=>{
    const tx=d.transaction(IDB_STORE,'readonly');
    const q=tx.objectStore(IDB_STORE).get(key);
    q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);
  });
}

async function pickFolder(){
  const dir=await window.showDirectoryPicker({id:'hesabyar-folder',mode:'readwrite',startIn:'documents'});
  const file=await dir.getFileHandle('hesabyar.sqlite',{create:true});
  dirHandle=dir;
  sqliteFileHandle=file;
  storageMode='file';
  fileErrorShown=false;
  await idbSave(dir,'dirHandle');
}

async function tryRestoreFolder(){
  if(!('showDirectoryPicker' in window)) return 'unsupported';
  try{
    const h=await idbLoad('dirHandle');
    if(!h) return 'none';
    const perm=await h.queryPermission({mode:'readwrite'});
    if(perm==='granted'){
      dirHandle=h;
      sqliteFileHandle=await h.getFileHandle('hesabyar.sqlite',{create:true});
      storageMode='file';
      return 'granted';
    }
    pendingDirHandle=h;
    return 'needs-permission';
  }catch(e){console.warn('restore folder failed',e);return 'none'}
}

async function requestPendingPermission(){
  if(!pendingDirHandle) return false;
  try{
    const p=await pendingDirHandle.requestPermission({mode:'readwrite'});
    if(p!=='granted') return false;
    dirHandle=pendingDirHandle;
    sqliteFileHandle=await dirHandle.getFileHandle('hesabyar.sqlite',{create:true});
    pendingDirHandle=null;
    storageMode='file';
    fileErrorShown=false;
    return true;
  }catch(e){console.error(e);return false}
}

async function loadFromFile(){
  if(!sqliteFileHandle) return null;
  try{
    const f=await sqliteFileHandle.getFile();
    if(!f||f.size===0) return null;
    return new Uint8Array(await f.arrayBuffer());
  }catch(e){console.error('loadFromFile',e);return null}
}

async function saveToFile(){
  if(!sqliteFileHandle||!db) return;
  try{
    const w=await sqliteFileHandle.createWritable();
    await w.write(db.export());
    await w.close();
    fileErrorShown=false;
  }catch(e){
    console.error('saveToFile',e);
    if(!fileErrorShown){toast('ذخیره در فایل ناموفق — در تنظیمات بررسی کنید');fileErrorShown=true}
  }
}

/* ===== SQLite ===== */
let SQL,db,saveTimer=null;
const SCHEMA_SQL=`PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS farmers(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT DEFAULT '',farm_name TEXT DEFAULT '',address TEXT DEFAULT '',notes TEXT DEFAULT '',created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS transactions(id INTEGER PRIMARY KEY AUTOINCREMENT,farmer_id INTEGER NOT NULL,type TEXT NOT NULL CHECK(type IN ('debt','credit')),category TEXT NOT NULL DEFAULT 'other',amount INTEGER NOT NULL,description TEXT DEFAULT '',jalali_date TEXT NOT NULL,gregorian_date TEXT NOT NULL,created_at TEXT DEFAULT (datetime('now')),FOREIGN KEY(farmer_id) REFERENCES farmers(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_tx_farmer ON transactions(farmer_id);
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(gregorian_date);`;

async function initDB(){
  SQL=await initSqlJs({locateFile:f=>`https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}`});
  let bytes=null;
  if(storageMode==='file') bytes=await loadFromFile();
  if(!bytes||!bytes.byteLength) bytes=await idbLoad();
  db=bytes&&bytes.byteLength?new SQL.Database(new Uint8Array(bytes)):new SQL.Database();
  db.run(SCHEMA_SQL);
  await persistNow();
}

async function persistNow(){
  if(!db) return;
  try{await idbSave(db.export())}catch(e){console.error(e)}
  if(storageMode==='file') await saveToFile();
}
function persist(){
  if(!db) return;
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{persistNow().catch(console.error)},200);
}
function qAll(sql,p=[]){const s=db.prepare(sql);try{s.bind(p);const o=[];while(s.step())o.push(s.getAsObject());return o}finally{s.free()}}
function qOne(sql,p=[]){return qAll(sql,p)[0]||null}
function run(sql,p=[]){db.run(sql,p);persist()}

/* ===== State ===== */
const state={tab:'dashboard',farmers:[],transactions:[],filter:{farmer_id:null,type:null},searchFarmer:''};

async function refreshAll(){
  state.farmers=qAll(`SELECT f.*,COALESCE(SUM(CASE WHEN t.type='debt' THEN t.amount ELSE -t.amount END),0) AS balance,COUNT(t.id) AS tx_count FROM farmers f LEFT JOIN transactions t ON t.farmer_id=f.id GROUP BY f.id ORDER BY f.name COLLATE NOCASE`);
  state.transactions=qAll(`SELECT t.*,f.name AS farmer_name FROM transactions t LEFT JOIN farmers f ON f.id=t.farmer_id ORDER BY t.gregorian_date DESC,t.id DESC LIMIT 400`);
  render();
}

function render(){
  const main=$('#main');
  if(state.tab==='dashboard')main.innerHTML=viewDashboard();
  else if(state.tab==='farmers')main.innerHTML=viewFarmers();
  else if(state.tab==='transactions')main.innerHTML=viewTransactions();
  else main.innerHTML=viewSettings();
}

/* ===== Views ===== */
function viewDashboard(){
  const bal=qOne(`SELECT COALESCE(SUM(CASE WHEN type='debt' THEN amount ELSE -amount END),0) AS b FROM transactions`).b;
  const farmerCount=state.farmers.length;
  const txCount=qOne(`SELECT COUNT(*) AS c FROM transactions`).c;
  const recent=state.transactions.slice(0,5);
  const debtors=state.farmers.filter(f=>f.balance>0).slice(0,8);
  return `
    <section class="cards">
      <div class="card balance ${bal<0?'neg':''}">
        <div class="label">مانده کل حساب</div>
        <div class="amount">${faNum(Math.abs(bal))} <small>تومان ${bal>0?'(طلب)':bal<0?'(بدهی)':''}</small></div>
      </div>
      <div class="card grid">
        <div><div class="label">مرغداران</div><div class="num">${faNum(farmerCount)}</div></div>
        <div><div class="label">تراکنش‌ها</div><div class="num">${faNum(txCount)}</div></div>
      </div>
    </section>
    <section class="section">
      <h3>آخرین تراکنش‌ها</h3>
      <div class="list">${recent.length?recent.map(txRow).join(''):'<div class="empty">هنوز تراکنشی ثبت نشده</div>'}</div>
    </section>
    <section class="section">
      <h3>مرغداران دارای بدهی</h3>
      <div class="list">${debtors.length?debtors.map(farmerRow).join(''):'<div class="empty">بدهی باز وجود ندارد</div>'}</div>
    </section>`;
}

function viewFarmers(){
  const q=state.searchFarmer.trim();
  const farmers=q?state.farmers.filter(f=>(f.name||'').includes(q)||(f.farm_name||'').includes(q)||(f.phone||'').includes(q)):state.farmers;
  return `
    <div class="toolbar">
      <input type="search" id="farmerSearch" placeholder="جستجوی مرغدار..." value="${escapeAttr(q)}">
      <button class="btn primary" data-action="add-farmer">+ جدید</button>
    </div>
    <section class="list" id="farmerList">
      ${farmers.length?farmers.map(farmerRow).join(''):'<div class="empty">مرغداری ثبت نشده — دکمه «+ جدید» را بزنید</div>'}
    </section>`;
}

function viewTransactions(){
  const f=state.filter;
  let txs=state.transactions;
  if(f.farmer_id)txs=txs.filter(t=>t.farmer_id===f.farmer_id);
  if(f.type)txs=txs.filter(t=>t.type===f.type);
  return `
    <div class="toolbar">
      <select id="txFilterFarmer">
        <option value="">همه مرغداران</option>
        ${state.farmers.map(fr=>`<option value="${fr.id}" ${f.farmer_id==fr.id?'selected':''}>${escapeHtml(fr.name)}</option>`).join('')}
      </select>
      <button class="btn primary" data-action="add-tx">+ ثبت</button>
    </div>
    <div class="filters">
      <button class="chip ${!f.type?'active':''}" data-tx-type="">همه</button>
      <button class="chip ${f.type==='debt'?'active':''}" data-tx-type="debt">بدهکار</button>
      <button class="chip ${f.type==='credit'?'active':''}" data-tx-type="credit">بستانکار</button>
    </div>
    <section class="list">${txs.length?txs.map(txRow).join(''):'<div class="empty">تراکنشی یافت نشد</div>'}</section>`;
}

function viewSettings(){
  const supportsFS='showDirectoryPicker' in window;
  let storageSection;
  if(!supportsFS){
    storageSection=`<section class="section">
      <h3>محل ذخیره‌سازی</h3>
      <p class="hint">مرورگر شما از ذخیره در پوشه پشتیبانی نمی‌کند. داده‌ها در حافظه مرورگر (IndexedDB) ذخیره می‌شوند. لطفاً از بکاپ منظم استفاده کنید. برای بهترین تجربه از Chrome یا Edge استفاده کنید.</p>
    </section>`;
  }else{
    const connected=storageMode==='file';
    storageSection=`<section class="section">
      <h3>محل ذخیره‌سازی</h3>
      <div class="kv"><span>وضعیت</span><span style="color:${connected?'var(--success)':'var(--muted)'};font-weight:600">${connected?'✅ متصل به پوشه':'⚠️ فقط در حافظه مرورگر'}</span></div>
      ${connected?`<div class="kv"><span>نام فایل</span><span dir="ltr">hesabyar.sqlite</span></div>`:''}
      <p class="hint">${connected?'داده‌ها به‌طور خودکار در فایل داخل پوشه انتخابی و همچنین در حافظه مرورگر ذخیره می‌شوند. با پاک کردن مرورگر داده‌ها از بین نمی‌روند.':'با انتخاب یک پوشه، داده‌ها در فایل ذخیره می‌شوند و با پاک کردن مرورگر از بین نمی‌روند. پیشنهاد: پوشه‌ای در Documents بسازید.'}</p>
      <div class="btn-row">
        <button class="btn primary" data-action="pick-folder">${connected?'تغییر پوشه':'📁 انتخاب پوشه'}</button>
        ${connected?`<button class="btn" data-action="save-now">💾 ذخیره فوری</button>`:''}
      </div>
    </section>`;
  }
  return `${storageSection}
    <section class="section">
      <h3>پشتیبان‌گیری</h3>
      <p class="hint">از داده‌های خود فایل پشتیبان بگیرید و در جای امن (Google Drive، ایمیل یا فلش) نگه دارید.</p>
      <div class="btn-row">
        <button class="btn primary" data-action="backup">دانلود بکاپ (.sqlite)</button>
        <button class="btn" data-action="restore">بازیابی از فایل</button>
      </div>
      <input type="file" id="restoreFile" accept=".sqlite,.db,application/x-sqlite3" hidden>
    </section>
    <section class="section">
      <h3>خروجی CSV</h3>
      <p class="hint">دریافت تمام تراکنش‌ها برای استفاده در Excel یا Google Sheets</p>
      <button class="btn" data-action="csv">دانلود CSV</button>
    </section>
    <section class="section">
      <h3>ارتباط با توسعه‌دهنده</h3>
      <p class="hint">برای پیشنهاد، گزارش مشکل یا درخواست قابلیت جدید، از طریق تلگرام پیام دهید.</p>
      <a href="https://t.me/${DEVELOPER_TELEGRAM}" target="_blank" rel="noopener" class="btn primary" style="width:100%;display:block;text-align:center">💬 پیام در تلگرام @${DEVELOPER_TELEGRAM}</a>
    </section>
    <section class="section">
      <h3>درباره</h3>
      <p class="hint">حساب‌یار دامپزشک — نسخه ۱.۱<br>مدیریت مالی کاملاً آفلاین برای مرغداران. تمام داده‌ها روی همین دستگاه ذخیره می‌شوند و به هیچ سروری ارسال نمی‌شوند.<br><br>توسعه‌دهنده: <a href="https://t.me/${DEVELOPER_TELEGRAM}" target="_blank" rel="noopener" style="color:var(--primary);text-decoration:none">@${DEVELOPER_TELEGRAM}</a></p>
    </section>`;
}

/* ===== Row helpers ===== */
function farmerRow(f){
  const bal=f.balance,cls=bal>0?'pos':bal<0?'neg':'zero';
  const label=bal>0?'بدهکار':bal<0?'بستانکار':'تسویه';
  return `<div class="row" data-action="farmer-detail" data-id="${f.id}">
    <div class="row-main"><div class="row-title">${escapeHtml(f.name)}</div><div class="row-sub">${escapeHtml(f.farm_name||f.phone||'—')}</div></div>
    <div class="row-side ${cls}"><div class="amount">${faNum(Math.abs(bal))}</div><div class="tag">${label}</div></div>
  </div>`;
}
function txRow(t){
  const cls=t.type==='debt'?'pos':'neg';
  const sign=t.type==='debt'?'+':'−';
  return `<div class="row tx-row" data-action="tx-detail" data-id="${t.id}">
    <div class="row-main"><div class="row-title">${escapeHtml(t.farmer_name||'—')}</div><div class="row-sub">${catLabel(t.category)} · ${t.jalali_date}</div></div>
    <div class="row-side ${cls}"><div class="amount">${sign} ${faNum(t.amount)}</div>${t.description?`<div class="tag">${escapeHtml(t.description)}</div>`:''}</div>
  </div>`;
}

/* ===== Modal ===== */
function openModal(html){
  $('#modalRoot').innerHTML=`<div class="modal-backdrop" data-backdrop><div class="modal" role="dialog">${html}</div></div>`;
  $$('[data-close]').forEach(b=>b.addEventListener('click',closeModal));
  const bd=$('[data-backdrop]');
  bd.addEventListener('click',e=>{if(e.target===bd)closeModal()});
}
function closeModal(){$('#modalRoot').innerHTML=''}

/* ===== Folder setup modals ===== */
function showSetupModal(){
  openModal(`<h2>📁 محل ذخیره‌سازی</h2>
    <p class="hint">برای اینکه داده‌ها با پاک شدن مرورگر از بین نروند، یک پوشه روی دستگاه خود انتخاب کنید. فایل <b>hesabyar.sqlite</b> در آن ذخیره می‌شود.</p>
    <p class="hint">پیشنهاد: پوشه‌ای به نام <b>Hesabyar</b> داخل Documents بسازید.</p>
    <div class="form-actions" style="grid-template-columns:1fr">
      <button class="btn primary" data-action="pick-folder">📁 انتخاب پوشه (پیشنهادی)</button>
      <button class="btn" data-close>فعلاً بدون پوشه ادامه بده</button>
    </div>
  `);
}
function showReconnectModal(){
  openModal(`<h2>🔓 اتصال دوباره به پوشه</h2>
    <p class="hint">برای دسترسی به فایل ذخیره‌سازی، یک بار دیگر به پوشه اجازه بدهید.</p>
    <div class="form-actions" style="grid-template-columns:1fr">
      <button class="btn primary" data-action="reconnect-folder">اتصال دوباره</button>
      <button class="btn" data-close>ادامه بدون پوشه</button>
    </div>
  `);
}

async function handlePickFolder(){
  if(!('showDirectoryPicker' in window)){toast('مرورگر شما پشتیبانی نمی‌کند');return}
  try{
    await pickFolder();
  }catch(e){
    if(e.name!=='AbortError'){console.error(e);toast('خطا در انتخاب پوشه')}
    return;
  }
  try{
    const existing=await loadFromFile();
    if(existing&&existing.byteLength>0){
      const useFile=confirm('در این پوشه فایلی از قبل وجود دارد. داده‌های آن بارگذاری شود؟\n(اگر «نه» بزنید، فایل با داده‌های فعلی جایگزین می‌شود)');
      if(useFile){
        try{
          try{db.close()}catch(_){}
          db=new SQL.Database(existing);
          db.run(SCHEMA_SQL);
        }catch(err){
          console.error(err);
          toast('فایل معتبر نبود — فایل جدید ساخته می‌شود');
          db=new SQL.Database();
          db.run(SCHEMA_SQL);
        }
      }
    }
    await persistNow();
    closeModal();
    await refreshAll();
    toast('✅ پوشه متصل شد — داده‌ها در فایل ذخیره می‌شوند');
  }catch(e){console.error(e);toast('خطا در ذخیره‌سازی')}
}

/* ===== Forms ===== */
function openFarmerForm(id=null){
  const isEdit=id!=null;
  const f=isEdit?qOne('SELECT * FROM farmers WHERE id=?',[id]):null;
  openModal(`<h2>${isEdit?'ویرایش مرغدار':'افزودن مرغدار'}</h2>
    <form id="farmerForm" class="form">
      <label>نام <span class="req">*</span><input name="name" required value="${escapeAttr(f?.name||'')}"></label>
      <label>نام مرغداری<input name="farm_name" value="${escapeAttr(f?.farm_name||'')}"></label>
      <label>شماره تماس<input name="phone" type="tel" inputmode="tel" value="${escapeAttr(f?.phone||'')}"></label>
      <label>آدرس<textarea name="address" rows="2">${escapeHtml(f?.address||'')}</textarea></label>
      <label>یادداشت<textarea name="notes" rows="2">${escapeHtml(f?.notes||'')}</textarea></label>
      <div class="form-actions">
        <button type="button" class="btn" data-close>انصراف</button>
        <button type="submit" class="btn primary">${isEdit?'ذخیره':'افزودن'}</button>
      </div>
    </form>`);
  $('#farmerForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    const d={name:(fd.get('name')||'').trim(),farm_name:(fd.get('farm_name')||'').trim(),phone:(fd.get('phone')||'').trim(),address:(fd.get('address')||'').trim(),notes:(fd.get('notes')||'').trim()};
    if(!d.name)return;
    if(isEdit)run('UPDATE farmers SET name=?,farm_name=?,phone=?,address=?,notes=? WHERE id=?',[d.name,d.farm_name,d.phone,d.address,d.notes,id]);
    else run('INSERT INTO farmers(name,farm_name,phone,address,notes) VALUES(?,?,?,?,?)',[d.name,d.farm_name,d.phone,d.address,d.notes]);
    closeModal();await refreshAll();toast(isEdit?'ویرایش شد':'مرغدار افزوده شد');
  });
}

function dateInputs(prefix,dateObj){
  const t=todayJalali();
  const y=dateObj?.jy||t.jy,m=dateObj?.jm||t.jm,d=dateObj?.jd||t.jd;
  const years=[];for(let i=t.jy-5;i<=t.jy+1;i++)years.push(i);
  return `<div class="date-inputs">
    <select name="${prefix}_y">${years.map(v=>`<option value="${v}" ${v===y?'selected':''}>${v}</option>`).join('')}</select>
    <select name="${prefix}_m">${MONTHS.map((n,i)=>`<option value="${i+1}" ${i+1===m?'selected':''}>${n}</option>`).join('')}</select>
    <select name="${prefix}_d">${Array.from({length:31},(_,i)=>i+1).map(v=>`<option value="${v}" ${v===d?'selected':''}>${v}</option>`).join('')}</select>
  </div>`;
}

function openTxForm(prefillFarmerId=null){
  const t=todayJalali();
  if(!state.farmers.length){toast('ابتدا یک مرغدار اضافه کنید');openFarmerForm();return}
  const opts=state.farmers.map(f=>`<option value="${f.id}" ${prefillFarmerId==f.id?'selected':''}>${escapeHtml(f.name)}${f.farm_name?' — '+escapeHtml(f.farm_name):''}</option>`).join('');
  openModal(`<h2>ثبت تراکنش</h2>
    <form id="txForm" class="form">
      <label>مرغدار <span class="req">*</span><select name="farmer_id" required><option value="">انتخاب کنید...</option>${opts}</select></label>
      <label>نوع تراکنش</label>
      <div class="segmented">
        <button type="button" data-tx-set="debt" class="active">بدهکار (طلب من)</button>
        <button type="button" data-tx-set="credit">بستانکار (پرداخت)</button>
      </div>
      <input type="hidden" name="type" value="debt">
      <label>دسته<select name="category">${CATEGORIES.map(c=>`<option value="${c.id}">${c.label}</option>`).join('')}</select></label>
      <label>مبلغ (تومان) <span class="req">*</span><input name="amount" required inputmode="numeric" placeholder="مثلاً ۵۰۰۰۰۰" autocomplete="off"></label>
      <label>تاریخ${dateInputs('date',t)}</label>
      <label>توضیح<input name="description" maxlength="100" placeholder="اختیاری"></label>
      <div class="form-actions">
        <button type="button" class="btn" data-close>انصراف</button>
        <button type="submit" class="btn primary">ثبت</button>
      </div>
    </form>`);
  $$('[data-tx-set]').forEach(b=>b.addEventListener('click',()=>{
    $$('[data-tx-set]').forEach(x=>x.classList.toggle('active',x===b));
    $('#txForm [name=type]').value=b.dataset.txSet;
  }));
  $('#txForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    const farmer_id=+fd.get('farmer_id');
    const type=fd.get('type');
    const category=fd.get('category');
    const amount=parseAmount(fd.get('amount'));
    const description=(fd.get('description')||'').trim();
    const jy=+fd.get('date_y'),jm=+fd.get('date_m'),jd=+fd.get('date_d');
    if(!farmer_id||!amount){toast('مرغدار و مبلغ را وارد کنید');return}
    run(`INSERT INTO transactions(farmer_id,type,category,amount,description,jalali_date,gregorian_date) VALUES(?,?,?,?,?,?,?)`,
      [farmer_id,type,category,amount,description,jStr({jy,jm,jd}),gregStr({jy,jm,jd})]);
    closeModal();await refreshAll();toast('تراکنش ثبت شد');
  });
}

/* ===== Details ===== */
function openFarmerDetail(id){
  const f=state.farmers.find(x=>x.id===id);
  if(!f)return;
  const txs=qAll(`SELECT * FROM transactions WHERE farmer_id=? ORDER BY gregorian_date DESC,id DESC`,[id]);
  const bal=f.balance,cls=bal>0?'pos':bal<0?'neg':'zero';
  openModal(`<h2>${escapeHtml(f.name)}</h2>
    ${f.farm_name?`<div class="modal-sub">${escapeHtml(f.farm_name)}</div>`:''}
    <div class="detail-balance ${bal<0?'neg':bal===0?'zero':''}">
      <span class="label">مانده حساب</span>
      <span class="amount">${faNum(Math.abs(bal))} تومان</span>
      <span class="tag">${bal>0?'بدهکار':bal<0?'بستانکار':'تسویه'}</span>
    </div>
    ${f.phone?`<div class="kv"><span>تماس</span><a href="tel:${escapeAttr(f.phone)}" dir="ltr">${escapeHtml(f.phone)}</a></div>`:''}
    ${f.address?`<div class="kv"><span>آدرس</span><span style="text-align:left">${escapeHtml(f.address)}</span></div>`:''}
    ${f.notes?`<div class="kv"><span>یادداشت</span><span style="text-align:left">${escapeHtml(f.notes)}</span></div>`:''}
    <h3>تراکنش‌ها (${faNum(txs.length)})</h3>
    <div class="mini-list">${txs.length?txs.map(t=>`<div class="row" data-action="tx-detail" data-id="${t.id}">
      <div class="row-main"><div class="row-title">${catLabel(t.category)}</div><div class="row-sub">${t.jalali_date}${t.description?' · '+escapeHtml(t.description):''}</div></div>
      <div class="row-side ${t.type==='debt'?'pos':'neg'}"><div class="amount">${t.type==='debt'?'+':'−'} ${faNum(t.amount)}</div></div>
    </div>`).join(''):'<div class="empty">تراکنشی نیست</div>'}</div>
    <div class="form-actions" style="grid-template-columns:1fr 1fr 1fr">
      <button type="button" class="btn" data-close>بستن</button>
      <button type="button" class="btn danger" data-action="delete-farmer" data-id="${f.id}">حذف</button>
      <button type="button" class="btn primary" data-action="add-tx-for" data-id="${f.id}">+ تراکنش</button>
    </div>`);
}

function openTxDetail(id){
  const t=qOne(`SELECT t.*,f.name AS farmer_name FROM transactions t LEFT JOIN farmers f ON f.id=t.farmer_id WHERE t.id=?`,[id]);
  if(!t)return;
  openModal(`<h2>جزئیات تراکنش</h2>
    <div class="kv"><span>مرغدار</span><span>${escapeHtml(t.farmer_name||'—')}</span></div>
    <div class="kv"><span>نوع</span><span>${t.type==='debt'?'بدهکار':'بستانکار'}</span></div>
    <div class="kv"><span>دسته</span><span>${catLabel(t.category)}</span></div>
    <div class="kv"><span>مبلغ</span><span>${faNum(t.amount)} تومان</span></div>
    <div class="kv"><span>تاریخ</span><span>${t.jalali_date}</span></div>
    ${t.description?`<div class="kv"><span>توضیح</span><span>${escapeHtml(t.description)}</span></div>`:''}
    <div class="form-actions">
      <button type="button" class="btn" data-close>بستن</button>
      <button type="button" class="btn danger" data-action="delete-tx" data-id="${t.id}">حذف</button>
    </div>`);
}

/* ===== Backup / Restore / CSV ===== */
async function downloadBackup(){
  const blob=new Blob([db.export()],{type:'application/x-sqlite3'});
  const url=URL.createObjectURL(blob);
  const t=todayJalali();
  const a=document.createElement('a');
  a.href=url;a.download=`hesabyar-backup-${t.jy}-${String(t.jm).padStart(2,'0')}-${String(t.jd).padStart(2,'0')}.sqlite`;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('بکاپ دانلود شد');
}

async function handleRestore(file){
  if(!confirm('داده‌های فعلی جایگزین می‌شوند. ادامه می‌دهید؟'))return;
  try{
    const bytes=new Uint8Array(await file.arrayBuffer());
    const nd=new SQL.Database(bytes);
    nd.exec('SELECT COUNT(*) FROM farmers');nd.exec('SELECT COUNT(*) FROM transactions');
    try{db.close()}catch(_){}
    db=nd;
    await persistNow();
    await refreshAll();toast('داده‌ها بازیابی شد');
  }catch(e){console.error(e);toast('فایل معتبر نیست')}
}

function downloadCSV(){
  const txs=qAll(`SELECT t.*,f.name AS farmer_name FROM transactions t LEFT JOIN farmers f ON f.id=t.farmer_id ORDER BY t.gregorian_date DESC,t.id DESC`);
  const rows=[['تاریخ','مرغدار','نوع','دسته','مبلغ (تومان)','توضیح']];
  for(const t of txs)rows.push([t.jalali_date,t.farmer_name||'',t.type==='debt'?'بدهکار':'بستانکار',catLabel(t.category),String(t.amount),t.description||'']);
  const csv='\uFEFF'+rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const j=todayJalali();
  const a=document.createElement('a');
  a.href=url;a.download=`hesabyar-${j.jy}-${String(j.jm).padStart(2,'0')}-${String(j.jd).padStart(2,'0')}.csv`;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('CSV دانلود شد');
}

/* ===== Toast ===== */
function toast(msg){
  const el=$('#toast');el.textContent=msg;el.classList.add('show');
  clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2400);
}

/* ===== Delegation ===== */
function setupDelegation(){
  document.addEventListener('click',async e=>{
    const chip=e.target.closest('[data-tx-type]');
    if(chip){state.filter.type=chip.dataset.txType||null;render();return}
    const actionEl=e.target.closest('[data-action]');
    if(!actionEl)return;
    const a=actionEl.dataset.action;
    if(a==='add-farmer')openFarmerForm();
    else if(a==='add-tx')openTxForm();
    else if(a==='add-tx-for'){const fid=+actionEl.dataset.id;closeModal();openTxForm(fid)}
    else if(a==='farmer-detail')openFarmerDetail(+actionEl.dataset.id);
    else if(a==='tx-detail')openTxDetail(+actionEl.dataset.id);
    else if(a==='delete-farmer'){
      if(confirm('این مرغدار و همه تراکنش‌هایش حذف شود؟')){
        run('DELETE FROM transactions WHERE farmer_id=?',[+actionEl.dataset.id]);
        run('DELETE FROM farmers WHERE id=?',[+actionEl.dataset.id]);
        closeModal();refreshAll();toast('حذف شد');
      }
    }else if(a==='delete-tx'){
      if(confirm('این تراکنش حذف شود؟')){
        run('DELETE FROM transactions WHERE id=?',[+actionEl.dataset.id]);
        closeModal();refreshAll();toast('حذف شد');
      }
    }else if(a==='backup')downloadBackup();
    else if(a==='restore')$('#restoreFile').click();
    else if(a==='csv')downloadCSV();
    else if(a==='pick-folder'){await handlePickFolder()}
    else if(a==='save-now'){await persistNow();toast('ذخیره شد')}
    else if(a==='reconnect-folder'){
      const ok=await requestPendingPermission();
      if(ok){await persistNow();closeModal();await refreshAll();toast('✅ اتصال برقرار شد')}
      else{toast('دسترسی رد شد')}
    }
  });
  document.addEventListener('change',e=>{
    if(e.target.id==='txFilterFarmer'){state.filter.farmer_id=e.target.value?+e.target.value:null;render()}
    if(e.target.id==='restoreFile'&&e.target.files[0]){handleRestore(e.target.files[0]);e.target.value=''}
  });
  document.addEventListener('input',e=>{
    if(e.target.id==='farmerSearch'){
      state.searchFarmer=e.target.value;
      const q=state.searchFarmer.trim();
      const farmers=q?state.farmers.filter(f=>(f.name||'').includes(q)||(f.farm_name||'').includes(q)||(f.phone||'').includes(q)):state.farmers;
      $('#farmerList').innerHTML=farmers.length?farmers.map(farmerRow).join(''):'<div class="empty">مرغداری یافت نشد</div>';
    }
  });
}

/* ===== Boot ===== */
async function boot(){
  try{
    if('showDirectoryPicker' in window){
      const mode=await tryRestoreFolder();
      if(mode==='granted') storageMode='file';
    }

    await initDB();
    await refreshAll();

    const j=todayJalali();
    const g=d2g(j2d(j.jy,j.jm,j.jd));
    const dt=new Date(g.gy,g.gm-1,g.gd);
    $('#headerDate').textContent=`${DAYS[dt.getDay()]} ${j.jd} ${MONTHS[j.jm-1]} ${j.jy}`;

    $$('.tabbar button').forEach(btn=>btn.addEventListener('click',()=>{
      state.tab=btn.dataset.tab;
      $$('.tabbar button').forEach(b=>b.classList.toggle('active',b===btn));
      render();
    }));

    setupDelegation();

    if('showDirectoryPicker' in window){
      if(pendingDirHandle){
        showReconnectModal();
      }else if(storageMode!=='file'){
        const asked=await idbLoad('folder-asked');
        if(!asked){
          showSetupModal();
          await idbSave(true,'folder-asked');
        }
      }
    }

    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='hidden') persistNow().catch(()=>{});
    });
    window.addEventListener('beforeunload',()=>{persistNow().catch(()=>{})});

    if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(console.warn);
  }catch(e){
    console.error(e);
    $('#main').innerHTML=`<div class="empty">خطا در راه‌اندازی.<br><small>${escapeHtml(e.message)}</small><br><br>بار اول نیاز به اینترنت دارید تا اسکریپت SQLite دانلود شود.</div>`;
  }
}
boot();
