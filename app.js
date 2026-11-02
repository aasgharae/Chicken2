'use strict';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const DEVELOPER_TELEGRAM='aasgharae';

const MONTHS=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const DAYS=['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'];
const WEEK=['ش','ی','د','س','چ','پ','ج'];
const TARIFF_LABELS={broiler:'گوشتی',layer:'تخم‌گذار'};

const faNum=n=>Number(n||0).toLocaleString('fa-IR');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const todayJalali=()=>{const n=new Date();return d2j(g2d(n.getFullYear(),n.getMonth()+1,n.getDate()))};
const jStr=j=>`${j.jy}/${String(j.jm).padStart(2,'0')}/${String(j.jd).padStart(2,'0')}`;
const jStrFromParts=(jy,jm,jd)=>`${jy}/${String(jm).padStart(2,'0')}/${String(jd).padStart(2,'0')}`;
const gregStr=j=>{const g=d2g(j2d(j.jy,j.jm,j.jd));return `${g.gy}-${String(g.gm).padStart(2,'0')}-${String(g.gd).padStart(2,'0')}`};
const monthKey=(jy,jm)=>`${jy}/${String(jm).padStart(2,'0')}`;
const currentMonthKey=()=>{const t=todayJalali();return monthKey(t.jy,t.jm)};
const nextMonthKey=()=>{const t=todayJalali();let y=t.jy,m=t.jm+1;if(m>12){m=1;y++}return monthKey(y,m)};

function parseAmount(v){
  const map={'۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9','٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'};
  return parseInt(String(v).split('').map(c=>map[c]||c).join('').replace(/[^\d]/g,''),10)||0;
}
function parseJalali(s){
  if(!s) return null;
  const p=String(s).split('/').map(Number);
  if(p.length!==3||!p[0]||!p[1]||!p[2]) return null;
  return{jy:p[0],jm:p[1],jd:p[2]};
}
function formatDateFa(s){
  const j=parseJalali(s);
  if(!j) return '';
  return `${faNum(j.jd)} ${MONTHS[j.jm-1]} ${faNum(j.jy)}`;
}
function computeAgeDays(entryDatesJson){
  try{
    const arr=JSON.parse(entryDatesJson||'[]');
    if(!arr.length) return null;
    const first=arr[0];
    const p=first.split('/').map(Number);
    if(p.length!==3) return null;
    const t=todayJalali();
    const diff=j2d(t.jy,t.jm,t.jd)-j2d(p[0],p[1],p[2]);
    return diff>=0?diff:null;
  }catch(e){return null}
}
function formatAge(days){
  if(days===null||days===undefined) return '';
  return `${faNum(days)} روز`;
}

/* ===== Storage ===== */
const IDB='hesabyar-idb',STORE='db';
let storageMode='idb',dirHandle=null,pendingDirHandle=null,sqliteFileHandle=null,fileErr=false;
function idb(){return new Promise((res,rej)=>{const r=indexedDB.open(IDB,1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE)};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function idbSave(v,key='main'){const d=await idb();return new Promise((res,rej)=>{const tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).put(v,key);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function idbLoad(key='main'){const d=await idb();return new Promise((res,rej)=>{const tx=d.transaction(STORE,'readonly');const q=tx.objectStore(STORE).get(key);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}

async function pickFolder(){
  const dir=await window.showDirectoryPicker({id:'hesabyar-folder',mode:'readwrite',startIn:'documents'});
  const file=await dir.getFileHandle('hesabyar.sqlite',{create:true});
  dirHandle=dir;sqliteFileHandle=file;storageMode='file';fileErr=false;
  await idbSave(dir,'dirHandle');
}
async function tryRestoreFolder(){
  if(!('showDirectoryPicker' in window))return'unsupported';
  try{
    const h=await idbLoad('dirHandle');
    if(!h)return'none';
    const perm=await h.queryPermission({mode:'readwrite'});
    if(perm==='granted'){dirHandle=h;sqliteFileHandle=await h.getFileHandle('hesabyar.sqlite',{create:true});storageMode='file';return'granted'}
    pendingDirHandle=h;return'needs-permission';
  }catch(e){return'none'}
}
async function requestPendingPermission(){
  if(!pendingDirHandle)return false;
  try{
    const p=await pendingDirHandle.requestPermission({mode:'readwrite'});
    if(p!=='granted')return false;
    dirHandle=pendingDirHandle;sqliteFileHandle=await dirHandle.getFileHandle('hesabyar.sqlite',{create:true});
    pendingDirHandle=null;storageMode='file';fileErr=false;return true;
  }catch(e){return false}
}
async function loadFromFile(){if(!sqliteFileHandle)return null;try{const f=await sqliteFileHandle.getFile();if(!f||f.size===0)return null;return new Uint8Array(await f.arrayBuffer())}catch(e){return null}}
async function saveToFile(){if(!sqliteFileHandle||!db)return;try{const w=await sqliteFileHandle.createWritable();await w.write(db.export());await w.close();fileErr=false}catch(e){if(!fileErr){toast('ذخیره در فایل ناموفق');fileErr=true}}}

/* ===== SQLite ===== */
let SQL,db,saveTimer=null;
const SCHEMA=`
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS farmers(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT DEFAULT '',notes TEXT DEFAULT '',created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS houses(id INTEGER PRIMARY KEY AUTOINCREMENT,farmer_id INTEGER NOT NULL,name TEXT NOT NULL,address TEXT DEFAULT '',capacity INTEGER DEFAULT 0,owner_name TEXT DEFAULT '',tenant_name TEXT DEFAULT '',tariff_type TEXT DEFAULT 'broiler',initial_debt INTEGER DEFAULT 0,placement_date TEXT DEFAULT '',loading_date TEXT DEFAULT '',contract_start TEXT DEFAULT '',contract_end TEXT DEFAULT '',active INTEGER DEFAULT 1,created_at TEXT DEFAULT (datetime('now')),FOREIGN KEY(farmer_id) REFERENCES farmers(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS transactions(id INTEGER PRIMARY KEY AUTOINCREMENT,farmer_id INTEGER NOT NULL,house_id INTEGER,cycle_id INTEGER,type TEXT NOT NULL,amount INTEGER NOT NULL,description TEXT DEFAULT '',jalali_date TEXT NOT NULL,gregorian_date TEXT NOT NULL,for_month TEXT DEFAULT '',created_at TEXT DEFAULT (datetime('now')),FOREIGN KEY(farmer_id) REFERENCES farmers(id) ON DELETE CASCADE,FOREIGN KEY(house_id) REFERENCES houses(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS cycles(id INTEGER PRIMARY KEY AUTOINCREMENT,house_id INTEGER NOT NULL,entry_dates TEXT DEFAULT '',chick_count INTEGER DEFAULT 0,system_cost INTEGER DEFAULT 0,mortality_count INTEGER DEFAULT 0,diseases TEXT DEFAULT '',mortality_enabled INTEGER DEFAULT 0,vaccine_enabled INTEGER DEFAULT 0,load_start_date TEXT DEFAULT '',load_end_date TEXT DEFAULT '',cycle_end_date TEXT DEFAULT '',active INTEGER DEFAULT 1,created_at TEXT DEFAULT (datetime('now')),FOREIGN KEY(house_id) REFERENCES houses(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS tariff_history(id INTEGER PRIMARY KEY AUTOINCREMENT,tariff_type TEXT NOT NULL,amount INTEGER NOT NULL,effective_from TEXT NOT NULL,created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);
CREATE INDEX IF NOT EXISTS idx_tx_farmer ON transactions(farmer_id);
CREATE INDEX IF NOT EXISTS idx_tx_house ON transactions(house_id);
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(gregorian_date);
CREATE INDEX IF NOT EXISTS idx_tx_month ON transactions(house_id,type,for_month);
`;

async function initDB(){
  SQL=await initSqlJs({locateFile:f=>`https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}`});
  let bytes=null;
  if(storageMode==='file') bytes=await loadFromFile();
  if(!bytes||!bytes.byteLength) bytes=await idbLoad();
  db=bytes&&bytes.byteLength?new SQL.Database(new Uint8Array(bytes)):new SQL.Database();
  db.run(SCHEMA);
  await persistNow();
}
async function persistNow(){if(!db)return;try{await idbSave(db.export())}catch(e){}if(storageMode==='file')await saveToFile()}
function persist(){if(!db)return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>persistNow().catch(()=>{}),200)}
function qAll(sql,p=[]){const s=db.prepare(sql);try{s.bind(p);const o=[];while(s.step())o.push(s.getAsObject());return o}finally{s.free()}}
function qOne(sql,p=[]){return qAll(sql,p)[0]||null}
function run(sql,p=[]){db.run(sql,p);persist()}

/* ===== Tariff helpers ===== */
function getTariffForMonth(type,mKey){
  const r=qOne('SELECT amount FROM tariff_history WHERE tariff_type=? AND effective_from<=? ORDER BY effective_from DESC LIMIT 1',[type,mKey]);
  return r?r.amount:0;
}
function getCurrentTariff(type){
  const r=qOne('SELECT amount FROM tariff_history WHERE tariff_type=? ORDER BY effective_from DESC LIMIT 1',[type]);
  return r?r.amount:0;
}

/* ===== Monthly charge generator ===== */
function generateMonthlyCharges(){
  const today=todayJalali();
  const nowKey=monthKey(today.jy,today.jm);
  const houses=qAll('SELECT * FROM houses');
  let created=0;
  for(const h of houses){
    if(!h.contract_start) continue;
    const start=parseJalali(h.contract_start); if(!start) continue;
    let end=null;
    if(h.contract_end){end=parseJalali(h.contract_end)}
    else if(!h.active){continue}
    let y=start.jy,m=start.jm;
    let safety=0;
    while(safety++<600){
      const mKey=monthKey(y,m);
      if(nowKey<mKey) break;
      if(end && mKey>monthKey(end.jy,end.jm)) break;
      const exists=qOne(`SELECT id FROM transactions WHERE house_id=? AND type='monthly_charge' AND for_month=?`,[h.id,mKey]);
      if(!exists){
        const tar=getTariffForMonth(h.tariff_type,mKey);
        if(tar>0 && h.capacity>0){
          const amount=tar*h.capacity;
          const ld=jalaliMonthLength(y,m);
          const jalStr=`${mKey}/${String(ld).padStart(2,'0')}`;
          const g=d2g(j2d(y,m,ld));
          const gr=`${g.gy}-${String(g.gm).padStart(2,'0')}-${String(g.gd).padStart(2,'0')}`;
          db.run(`INSERT INTO transactions(farmer_id,house_id,type,amount,description,jalali_date,gregorian_date,for_month) VALUES(?,?,?,?,?,?,?,?)`,
            [h.farmer_id,h.id,'monthly_charge',amount,`شارژ ماهانه ${MONTHS[m-1]} ${y}`,jalStr,gr,mKey]);
          created++;
        }
      }
      m++;if(m>12){m=1;y++}
    }
  }
  if(created>0){persist();toast(`${faNum(created)} شارژ ماهانه جدید ثبت شد`)}
}

/* ===== Balance helpers ===== */
function farmerBalance(farmerId){
  const charge=qOne(`SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE farmer_id=? AND type IN ('initial_debt','manual_debt','system_cost','monthly_charge')`,[farmerId]).s;
  const pay=qOne(`SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE farmer_id=? AND type='payment'`,[farmerId]).s;
  return charge-pay;
}
function houseBalance(houseId){
  const h=qOne('SELECT initial_debt FROM houses WHERE id=?',[houseId]);
  if(!h) return 0;
  const ch=qOne(`SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE house_id=? AND type IN ('manual_debt','system_cost','monthly_charge')`,[houseId]).s;
  const pay=qOne(`SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE house_id=? AND type='payment'`,[houseId]).s;
  return (h.initial_debt||0)+ch-pay;
}

/* ===== State & Views ===== */
const state={tab:'dashboard',searchFarmer:'',searchHouse:'',filterTx:{type:null,house_id:null,farmer_id:null}};

async function refreshAll(){render()}

function render(){
  const main=$('#main');
  if(state.tab==='dashboard')main.innerHTML=viewDashboard();
  else if(state.tab==='farmers')main.innerHTML=viewFarmers();
  else if(state.tab==='houses')main.innerHTML=viewHouses();
  else if(state.tab==='transactions')main.innerHTML=viewTransactions();
  else main.innerHTML=viewSettings();
}

function viewDashboard(){
  const farmers=qAll('SELECT id,name FROM farmers');
  const houses=qAll('SELECT id,active FROM houses');
  const activeHouses=houses.filter(h=>h.active).length;
  const totalDebt=farmers.reduce((s,f)=>s+farmerBalance(f.id),0);
  const recent=qAll(`SELECT t.*,f.name AS farmer_name,h.name AS house_name FROM transactions t LEFT JOIN farmers f ON f.id=t.farmer_id LEFT JOIN houses h ON h.id=t.house_id ORDER BY t.gregorian_date DESC,t.id DESC LIMIT 6`);
  return `
    <section class="cards">
      <div class="card balance ${totalDebt<0?'neg':''}">
        <div class="label">مجموع بدهی مرغداران</div>
        <div class="amount">${faNum(Math.abs(totalDebt))} <small>تومان ${totalDebt>0?'(طلب)':totalDebt<0?'(بستانکار)':''}</small></div>
      </div>
      <div class="card grid">
        <div><div class="label">مرغداران</div><div class="num">${faNum(farmers.length)}</div></div>
        <div><div class="label">سالن‌ها</div><div class="num">${faNum(houses.length)}</div></div>
        <div><div class="label">فعال</div><div class="num">${faNum(activeHouses)}</div></div>
      </div>
    </section>
    <section class="section">
      <h3>آخرین تراکنش‌ها</h3>
      <div class="list">${recent.length?recent.map(txRow).join(''):'<div class="empty">تراکنشی ثبت نشده</div>'}</div>
    </section>`;
}

function viewFarmers(){
  const q=state.searchFarmer.trim();
  const all=qAll('SELECT * FROM farmers ORDER BY name COLLATE NOCASE');
  const farmers=q?all.filter(f=>f.name.includes(q)||(f.phone||'').includes(q)):all;
  return `
    <div class="toolbar">
      <input type="search" id="farmerSearch" placeholder="جستجوی مرغدار..." value="${esc(q)}">
      <button class="btn primary" data-action="add-farmer">+ جدید</button>
    </div>
    <section class="list" id="farmerList">
      ${farmers.length?farmers.map(farmerRow).join(''):'<div class="empty">مرغداری ثبت نشده — دکمه + جدید</div>'}
    </section>`;
}

function viewHouses(){
  const q=state.searchHouse.trim();
  const all=qAll(`SELECT h.*,f.name AS farmer_name,
    (SELECT entry_dates FROM cycles WHERE house_id=h.id ORDER BY active DESC,id DESC LIMIT 1) AS active_entry_dates
    FROM houses h JOIN farmers f ON f.id=h.farmer_id ORDER BY h.active DESC,h.name COLLATE NOCASE`);
  const houses=q?all.filter(h=>h.name.includes(q)||(h.farmer_name||'').includes(q)):all;
  return `
    <div class="toolbar">
      <input type="search" id="houseSearch" placeholder="جستجوی سالن یا مرغدار..." value="${esc(q)}">
      <button class="btn primary" data-action="add-house">+ جدید</button>
    </div>
    <section class="list" id="houseList">
      ${houses.length?houses.map(houseRow).join(''):'<div class="empty">سالنی ثبت نشده — دکمه + جدید</div>'}
    </section>`;
}

function viewTransactions(){
  const f=state.filterTx;
  let sql=`SELECT t.*,f.name AS farmer_name,h.name AS house_name FROM transactions t LEFT JOIN farmers f ON f.id=t.farmer_id LEFT JOIN houses h ON h.id=t.house_id WHERE 1=1`;
  const params=[];
  if(f.type){sql+=` AND t.type=?`;params.push(f.type)}
  if(f.farmer_id){sql+=` AND t.farmer_id=?`;params.push(f.farmer_id)}
  sql+=` ORDER BY t.gregorian_date DESC,t.id DESC LIMIT 300`;
  const txs=qAll(sql,params);
  const farmers=qAll('SELECT id,name FROM farmers ORDER BY name');
  return `
    <div class="toolbar">
      <select id="txFilterFarmer">
        <option value="">همه مرغداران</option>
        ${farmers.map(fr=>`<option value="${fr.id}" ${f.farmer_id==fr.id?'selected':''}>${esc(fr.name)}</option>`).join('')}
      </select>
      <button class="btn primary" data-action="add-tx">+ ثبت</button>
    </div>
    <div class="filters">
      <button class="chip ${!f.type?'active':''}" data-tx-type="">همه</button>
      <button class="chip ${f.type==='payment'?'active':''}" data-tx-type="payment">پرداخت</button>
      <button class="chip ${f.type==='monthly_charge'?'active':''}" data-tx-type="monthly_charge">شارژ ماهانه</button>
      <button class="chip ${f.type==='manual_debt'?'active':''}" data-tx-type="manual_debt">بدهی دستی</button>
      <button class="chip ${f.type==='system_cost'?'active':''}" data-tx-type="system_cost">هزینه سیستم</button>
    </div>
    <section class="list">${txs.length?txs.map(txRow).join(''):'<div class="empty">تراکنشی یافت نشد</div>'}</section>`;
}

function viewSettings(){
  const supportsFS='showDirectoryPicker' in window;
  const broiler=getCurrentTariff('broiler');
  const layer=getCurrentTariff('layer');
  const history=qAll('SELECT * FROM tariff_history ORDER BY effective_from DESC,tariff_type');
  const storageSection=!supportsFS?
    `<section class="section"><h3>محل ذخیره‌سازی</h3><p class="hint">مرورگر شما از ذخیره در پوشه پشتیبانی نمی‌کند. از Chrome یا Edge استفاده کنید.</p></section>`:
    `<section class="section"><h3>محل ذخیره‌سازی</h3>
      <div class="kv"><span>وضعیت</span><span style="color:${storageMode==='file'?'var(--success)':'var(--muted)'};font-weight:600">${storageMode==='file'?'✅ متصل به پوشه':'⚠️ فقط در حافظه مرورگر'}</span></div>
      <div class="btn-row" style="margin-top:10px">
        <button class="btn primary" data-action="pick-folder">${storageMode==='file'?'تغییر پوشه':'📁 انتخاب پوشه'}</button>
        ${storageMode==='file'?'<button class="btn" data-action="save-now">💾 ذخیره فوری</button>':''}
      </div>
    </section>`;
  return `${storageSection}
    <section class="section">
      <h3>تعرفه ماهانه هر سر جوجه (تومان)</h3>
      <div class="section-card">
        <div class="kv"><span>🐔 گوشتی</span><span><b>${broiler?faNum(broiler):'تعیین نشده'}</b></span></div>
        <div class="kv"><span>🥚 تخم‌گذار</span><span><b>${layer?faNum(layer):'تعیین نشده'}</b></span></div>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn primary small" data-action="set-tariff" data-type="broiler">تعرفه گوشتی</button>
          <button class="btn primary small" data-action="set-tariff" data-type="layer">تعرفه تخم‌گذار</button>
        </div>
      </div>
      ${history.length?`<details style="margin-top:8px"><summary style="cursor:pointer;font-size:13px;color:var(--muted)">تاریخچه تعرفه‌ها (${faNum(history.length)})</summary>
        <div class="mini-list" style="margin-top:8px">${history.map(h=>`<div class="row" style="cursor:default;padding:8px 12px">
          <div class="row-main"><div class="row-title" style="font-size:13px">${TARIFF_LABELS[h.tariff_type]||h.tariff_type}</div><div class="row-sub">از ${h.effective_from}</div></div>
          <div class="row-side"><div class="amount" style="font-size:14px">${faNum(h.amount)}</div><div class="tag">تومان</div></div>
        </div>`).join('')}</div></details>`:''}
    </section>
    <section class="section">
      <h3>پشتیبان‌گیری</h3>
      <div class="btn-row">
        <button class="btn primary" data-action="backup">دانلود بکاپ</button>
        <button class="btn" data-action="restore">بازیابی</button>
      </div>
      <input type="file" id="restoreFile" accept=".sqlite,.db" hidden>
    </section>
    <section class="section">
      <h3>خروجی CSV</h3>
      <button class="btn" data-action="csv">دانلود CSV تراکنش‌ها</button>
    </section>
    <section class="section">
      <h3>ارتباط با توسعه‌دهنده</h3>
      <a href="https://t.me/${DEVELOPER_TELEGRAM}" target="_blank" rel="noopener" class="btn primary" style="width:100%;display:block">💬 تلگرام @${DEVELOPER_TELEGRAM}</a>
    </section>
    <section class="section">
      <h3>درباره</h3>
      <p class="hint">حساب‌یار دامپزشک — نسخه ۲.۰<br>مدیریت مالی کاملاً آفلاین. توسعه‌دهنده: <a href="https://t.me/${DEVELOPER_TELEGRAM}" target="_blank" rel="noopener">@${DEVELOPER_TELEGRAM}</a></p>
    </section>`;
}

/* ===== Row renderers ===== */
function farmerRow(f){
  const bal=farmerBalance(f.id),cls=bal>0?'pos':bal<0?'neg':'zero';
  const houseCount=qOne('SELECT COUNT(*) AS c FROM houses WHERE farmer_id=?',[f.id]).c;
  return `<div class="row" data-action="farmer-detail" data-id="${f.id}">
    <div class="row-main"><div class="row-title">${esc(f.name)}</div><div class="row-sub">${faNum(houseCount)} سالن${f.phone?' · '+esc(f.phone):''}</div></div>
    <div class="row-side ${cls}"><div class="amount">${faNum(Math.abs(bal))}</div><div class="tag">${bal>0?'بدهکار':bal<0?'بستانکار':'تسویه'}</div></div>
  </div>`;
}
function houseRow(h){
  const bal=houseBalance(h.id),cls=bal>0?'pos':bal<0?'neg':'zero';
  const age=computeAgeDays(h.active_entry_dates);
  const tarLabel=TARIFF_LABELS[h.tariff_type]||'';
  return `<div class="row" data-action="house-detail" data-id="${h.id}">
    <div class="row-main">
      <div class="row-title">${esc(h.name)} <span class="badge ${h.active?'active':'inactive'}">${h.active?'فعال':'خاتمه'}</span></div>
      <div class="row-sub">${esc(h.farmer_name)} · ${faNum(h.capacity)} قطعه · ${tarLabel}${age!==null?` · <span class="age-badge">${faNum(age)} روز</span>`:''}</div>
    </div>
    <div class="row-side ${cls}"><div class="amount">${faNum(Math.abs(bal))}</div><div class="tag">${bal>0?'بدهکار':bal<0?'بستانکار':'تسویه'}</div></div>
  </div>`;
}
const TX_LABELS={monthly_charge:'شارژ ماهانه',payment:'پرداخت',manual_debt:'بدهی دستی',system_cost:'هزینه سیستم',initial_debt:'بدهی اولیه'};
function txRow(t){
  const isPay=t.type==='payment';
  const cls=isPay?'neg':'pos';
  const sign=isPay?'−':'+';
  return `<div class="row" data-action="tx-detail" data-id="${t.id}">
    <div class="row-main"><div class="row-title">${esc(t.farmer_name||'—')}${t.house_name?' · '+esc(t.house_name):''}</div><div class="row-sub">${TX_LABELS[t.type]||t.type} · ${t.jalali_date}</div></div>
    <div class="row-side ${cls}"><div class="amount">${sign} ${faNum(t.amount)}</div>${t.description?`<div class="tag">${esc(t.description)}</div>`:''}</div>
  </div>`;
}

/* ===== Modal ===== */
function openModal(html){
  $('#modalRoot').innerHTML=`<div class="modal-backdrop" data-backdrop><div class="modal">${html}</div></div>`;
  $$('[data-close]').forEach(b=>b.addEventListener('click',closeModal));
  const bd=$('[data-backdrop]');
  bd.addEventListener('click',e=>{if(e.target===bd)closeModal()});
}
function closeModal(){$('#modalRoot').innerHTML=''}

/* ===== Date picker ===== */
function pickDate(current,callback){
  let init=parseJalali(current)||todayJalali();
  let{jy,jm,jd}=init;
  const render=()=>{
    const days=jalaliMonthLength(jy,jm);
    const first=g2d(d2g(j2d(jy,jm,1)).gy,d2g(j2d(jy,jm,1)).gm,d2g(j2d(jy,jm,1)).gd);
    const g=d2g(j2d(jy,jm,1));
    const jsDay=new Date(g.gy,g.gm-1,g.gd).getDay();
    const pStart=(jsDay+1)%7;
    let cells='';
    for(let i=0;i<pStart;i++)cells+='<div></div>';
    const t=todayJalali();
    for(let d=1;d<=days;d++){
      const isSel=d===jd;
      const isToday=(jy===t.jy&&jm===t.jm&&d===t.jd);
      cells+=`<button type="button" class="cal-day ${isSel?'selected':''} ${isToday?'today':''}" data-day="${d}">${faNum(d)}</button>`;
    }
    return `<div class="cal-header">
      <button type="button" data-cal-nav="-1">‹</button>
      <div><b>${MONTHS[jm-1]}</b>${faNum(jy)}</div>
      <button type="button" data-cal-nav="1">›</button>
    </div>
    <div class="cal-week">${WEEK.map(w=>`<div>${w}</div>`).join('')}</div>
    <div class="cal-grid">${cells}</div>`;
  };
  const update=()=>{
    const body=$('#calBody');if(!body)return;
    body.innerHTML=render();
    $$('[data-cal-nav]',body).forEach(b=>b.onclick=()=>{
      const n=+b.dataset.calNav;
      if(n<0){jm--;if(jm<1){jm=12;jy--}}else{jm++;if(jm>12){jm=1;jy++}}
      update();
    });
    $$('[data-day]',body).forEach(b=>b.onclick=()=>{
      const d=+b.dataset.day;
      closeModal();
      callback(jStrFromParts(jy,jm,d));
    });
  };
  openModal(`<h2>انتخاب تاریخ</h2><div id="calBody"></div>
    <div class="form-actions single" style="margin-top:16px">
      <button type="button" class="btn" data-close>انصراف</button>
    </div>`);
  update();
}
function dateField(name,value,label){
  return `<label>${label}
    <div class="date-picker-input" data-date-field="${name}">
      <span class="${value?'':'placeholder'}">${value?formatDateFa(value):'انتخاب تاریخ'}</span>
      <span class="icon">📅</span>
    </div>
    <input type="hidden" name="${name}" value="${esc(value||'')}">
  </label>`;
}

/* ===== Farmer form ===== */
function openFarmerForm(id=null){
  const isEdit=id!=null;
  const f=isEdit?qOne('SELECT * FROM farmers WHERE id=?',[id]):null;
  openModal(`<h2>${isEdit?'ویرایش مرغدار':'افزودن مرغدار'}</h2>
    <form id="farmerForm" class="form">
      <label>نام <span class="req">*</span><input name="name" required value="${esc(f?.name||'')}"></label>
      <label>شماره تماس<input name="phone" type="tel" inputmode="tel" value="${esc(f?.phone||'')}"></label>
      <label>یادداشت<textarea name="notes" rows="2">${esc(f?.notes||'')}</textarea></label>
      <div class="form-actions">
        <button type="button" class="btn" data-close>انصراف</button>
        <button type="submit" class="btn primary">${isEdit?'ذخیره':'افزودن'}</button>
      </div>
    </form>`);
  $('#farmerForm').addEventListener('submit',e=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    const d={name:(fd.get('name')||'').trim(),phone:(fd.get('phone')||'').trim(),notes:(fd.get('notes')||'').trim()};
    if(!d.name)return;
    if(isEdit)run('UPDATE farmers SET name=?,phone=?,notes=? WHERE id=?',[d.name,d.phone,d.notes,id]);
    else run('INSERT INTO farmers(name,phone,notes) VALUES(?,?,?)',[d.name,d.phone,d.notes]);
    closeModal();render();toast(isEdit?'ویرایش شد':'مرغدار افزوده شد');
  });
}

/* ===== House form ===== */
function openHouseForm(id=null,prefarmer=null){
  const isEdit=id!=null;
  const h=isEdit?qOne('SELECT * FROM houses WHERE id=?',[id]):null;
  const farmers=qAll('SELECT id,name FROM farmers ORDER BY name');
  if(!farmers.length){toast('ابتدا یک مرغدار اضافه کنید');openFarmerForm();return}
  const fid=h?.farmer_id||prefarmer||farmers[0].id;
  openModal(`<h2>${isEdit?'ویرایش سالن':'افزودن سالن'}</h2>
    <form id="houseForm" class="form">
      <label>مرغدار <span class="req">*</span>
        <select name="farmer_id" required>${farmers.map(f=>`<option value="${f.id}" ${f.id==fid?'selected':''}>${esc(f.name)}</option>`).join('')}</select>
      </label>
      <label>نام سالن <span class="req">*</span><input name="name" required value="${esc(h?.name||'')}" placeholder="مثلاً سالن ۱"></label>
      <label>آدرس<input name="address" value="${esc(h?.address||'')}"></label>
      <label>ظرفیت (تعداد قطعه) <span class="req">*</span><input name="capacity" inputmode="numeric" required value="${h?.capacity||''}" placeholder="مثلاً ۱۰۰۰۰"></label>
      <label>نام مالک<input name="owner_name" value="${esc(h?.owner_name||'')}"></label>
      <label>نام مستاجر<input name="tenant_name" value="${esc(h?.tenant_name||'')}"></label>
      <label>نوع تعرفه
        <select name="tariff_type">
          <option value="broiler" ${h?.tariff_type==='broiler'?'selected':''}>گوشتی</option>
          <option value="layer" ${h?.tariff_type==='layer'?'selected':''}>تخم‌گذار</option>
        </select>
      </label>
      <label>بدهی اولیه (تومان)<input name="initial_debt" inputmode="numeric" value="${h?.initial_debt||''}" placeholder="اختیاری"></label>
      ${dateField('contract_start',h?.contract_start||jStr(todayJalali()),'تاریخ شروع قرارداد')}
      ${dateField('contract_end',h?.contract_end||'','تاریخ پایان قرارداد (برای خاتمه خالی بگذارید)')}
      ${dateField('placement_date',h?.placement_date||'','تاریخ جوجه‌ریزی (اختیاری)')}
      ${dateField('loading_date',h?.loading_date||'','تاریخ بارگیری (اختیاری)')}
      <div class="switch-row">
        <span>سالن فعال است</span>
        <label class="switch"><input type="checkbox" name="active" ${h?.active!==0?'checked':''}><span class="switch-slider"></span></label>
      </div>
      <div class="form-actions">
        <button type="button" class="btn" data-close>انصراف</button>
        <button type="submit" class="btn primary">${isEdit?'ذخیره':'افزودن'}</button>
      </div>
    </form>`);
  $('#houseForm').addEventListener('submit',e=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    const d={
      farmer_id:+fd.get('farmer_id'),name:(fd.get('name')||'').trim(),address:(fd.get('address')||'').trim(),
      capacity:parseAmount(fd.get('capacity')),owner_name:(fd.get('owner_name')||'').trim(),
      tenant_name:(fd.get('tenant_name')||'').trim(),tariff_type:fd.get('tariff_type'),
      initial_debt:parseAmount(fd.get('initial_debt')),contract_start:fd.get('contract_start')||'',
      contract_end:fd.get('contract_end')||'',placement_date:fd.get('placement_date')||'',
      loading_date:fd.get('loading_date')||'',active:fd.get('active')?1:0
    };
    if(!d.name||!d.capacity){toast('نام و ظرفیت الزامی است');return}
    if(isEdit){
      run(`UPDATE houses SET farmer_id=?,name=?,address=?,capacity=?,owner_name=?,tenant_name=?,tariff_type=?,initial_debt=?,contract_start=?,contract_end=?,placement_date=?,loading_date=?,active=? WHERE id=?`,
        [d.farmer_id,d.name,d.address,d.capacity,d.owner_name,d.tenant_name,d.tariff_type,d.initial_debt,d.contract_start,d.contract_end,d.placement_date,d.loading_date,d.active,id]);
      // update initial_debt transaction
      const existing=qOne(`SELECT id FROM transactions WHERE house_id=? AND type='initial_debt'`,[id]);
      if(d.initial_debt>0){
        if(existing)run('UPDATE transactions SET amount=?,farmer_id=? WHERE id=?',[d.initial_debt,d.farmer_id,existing.id]);
        else{
          const j=todayJalali();
          run(`INSERT INTO transactions(farmer_id,house_id,type,amount,description,jalali_date,gregorian_date) VALUES(?,?,?,?,?,?,?)`,
            [d.farmer_id,id,'initial_debt',d.initial_debt,'بدهی اولیه',jStr(j),gregStr(j)]);
        }
      }else if(existing)run('DELETE FROM transactions WHERE id=?',[existing.id]);
    }else{
      db.run(`INSERT INTO houses(farmer_id,name,address,capacity,owner_name,tenant_name,tariff_type,initial_debt,contract_start,contract_end,placement_date,loading_date,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [d.farmer_id,d.name,d.address,d.capacity,d.owner_name,d.tenant_name,d.tariff_type,d.initial_debt,d.contract_start,d.contract_end,d.placement_date,d.loading_date,d.active]);
      const newId=qOne('SELECT last_insert_rowid() AS id').id;
      if(d.initial_debt>0){
        const j=todayJalali();
        db.run(`INSERT INTO transactions(farmer_id,house_id,type,amount,description,jalali_date,gregorian_date) VALUES(?,?,?,?,?,?,?)`,
          [d.farmer_id,newId,'initial_debt',d.initial_debt,'بدهی اولیه',jStr(j),gregStr(j)]);
      }
      persist();
    }
    closeModal();
    generateMonthlyCharges();
    render();
    toast(isEdit?'ویرایش شد':'سالن افزوده شد');
  });
}

/* ===== Farmer detail ===== */
function openFarmerDetail(id){
  const f=qOne('SELECT * FROM farmers WHERE id=?',[id]);
  if(!f)return;
  const houses=qAll('SELECT * FROM houses WHERE farmer_id=? ORDER BY active DESC,name',[id]);
  const txs=qAll('SELECT * FROM transactions WHERE farmer_id=? ORDER BY gregorian_date DESC,id DESC LIMIT 20',[id]);
  const bal=farmerBalance(id);
  openModal(`<h2>${esc(f.name)}</h2>
    ${f.phone?`<div class="modal-sub" dir="ltr">${esc(f.phone)}</div>`:''}
    <div class="detail-balance ${bal<0?'neg':bal===0?'zero':''}">
      <span class="label">مانده کل حساب</span>
      <span class="amount">${faNum(Math.abs(bal))} تومان</span>
      <span class="tag">${bal>0?'بدهکار':bal<0?'بستانکار':'تسویه'}</span>
    </div>
    <h3>سالن‌ها (${faNum(houses.length)})</h3>
    <div class="mini-list">${houses.length?houses.map(h=>{
      const hb=houseBalance(h.id),cls=hb>0?'pos':hb<0?'neg':'zero';
      const age=computeAgeDays((qOne('SELECT entry_dates FROM cycles WHERE house_id=? ORDER BY active DESC,id DESC LIMIT 1',[h.id])||{}).entry_dates);
      return `<div class="row" data-action="house-detail" data-id="${h.id}">
        <div class="row-main"><div class="row-title">${esc(h.name)} <span class="badge ${h.active?'active':'inactive'}">${h.active?'فعال':'خاتمه'}</span></div>
        <div class="row-sub">${faNum(h.capacity)} قطعه${age!==null?' · '+faNum(age)+' روز':''}</div></div>
        <div class="row-side ${cls}"><div class="amount">${faNum(Math.abs(hb))}</div></div>
      </div>`;
    }).join(''):'<div class="empty">سالنی ثبت نشده</div>'}</div>
    <h3>تراکنش‌های اخیر</h3>
    <div class="mini-list">${txs.length?txs.map(txRow).join(''):'<div class="empty">تراکنشی نیست</div>'}</div>
    <div class="form-actions" style="grid-template-columns:1fr 1fr 1fr">
      <button type="button" class="btn" data-close>بستن</button>
      <button type="button" class="btn danger" data-action="delete-farmer" data-id="${f.id}">حذف</button>
      <button type="button" class="btn primary" data-action="add-house-for" data-id="${f.id}">+ سالن</button>
    </div>`);
}

/* ===== House detail ===== */
function openHouseDetail(id){
  const h=qOne('SELECT h.*,f.name AS farmer_name FROM houses h JOIN farmers f ON f.id=h.farmer_id WHERE h.id=?',[id]);
  if(!h)return;
  const cycles=qAll('SELECT * FROM cycles WHERE house_id=? ORDER BY id DESC',[id]);
  const txs=qAll('SELECT * FROM transactions WHERE house_id=? ORDER BY gregorian_date DESC,id DESC LIMIT 30',[id]);
  const bal=houseBalance(id);
  const activeCycle=cycles.find(c=>c.active===1)||cycles[0];
  const age=activeCycle?computeAgeDays(activeCycle.entry_dates):null;
  return (function(){
    openModal(`<h2>${esc(h.name)}</h2>
      <div class="modal-sub">${esc(h.farmer_name)}</div>
      <div class="detail-balance ${bal<0?'neg':bal===0?'zero':''}">
        <span class="label">مانده این سالن</span>
        <span class="amount">${faNum(Math.abs(bal))} تومان</span>
        <span class="tag">${bal>0?'بدهکار':bal<0?'بستانکار':'تسویه'}</span>
      </div>
      <div class="kv"><span>ظرفیت</span><span>${faNum(h.capacity)} قطعه</span></div>
      <div class="kv"><span>نوع تعرفه</span><span>${TARIFF_LABELS[h.tariff_type]} (${faNum(getCurrentTariff(h.tariff_type))} ت/سر)</span></div>
      ${h.address?`<div class="kv"><span>آدرس</span><span>${esc(h.address)}</span></div>`:''}
      ${h.owner_name?`<div class="kv"><span>مالک</span><span>${esc(h.owner_name)}</span></div>`:''}
      ${h.tenant_name?`<div class="kv"><span>مستاجر</span><span>${esc(h.tenant_name)}</span></div>`:''}
      ${h.contract_start?`<div class="kv"><span>شروع قرارداد</span><span>${formatDateFa(h.contract_start)}</span></div>`:''}
      ${h.contract_end?`<div class="kv"><span>پایان قرارداد</span><span>${formatDateFa(h.contract_end)}</span></div>`:''}
      <div class="kv"><span>وضعیت</span><span><span class="badge ${h.active?'active':'inactive'}">${h.active?'فعال':'خاتمه'}</span></span></div>
      ${age!==null?`<div class="kv"><span>سن جوجه</span><span><span class="age-badge">${faNum(age)} روز</span></span></div>`:''}
      <h3>دوره پرورش</h3>
      ${activeCycle?`
        <div class="kv"><span>تعداد جوجه</span><span>${faNum(activeCycle.chick_count)}</span></div>
        ${activeCycle.entry_dates?`<div class="kv"><span>تاریخ ورود</span><span>${JSON.parse(activeCycle.entry_dates||'[]').map(formatDateFa).join(' , ')||'—'}</span></div>`:''}
        ${activeCycle.load_start_date?`<div class="kv"><span>شروع بارگیری</span><span>${formatDateFa(activeCycle.load_start_date)}</span></div>`:''}
        ${activeCycle.load_end_date?`<div class="kv"><span>پایان بارگیری</span><span>${formatDateFa(activeCycle.load_end_date)}</span></div>`:''}
        ${activeCycle.cycle_end_date?`<div class="kv"><span>خاتمه دوره</span><span>${formatDateFa(activeCycle.cycle_end_date)}</span></div>`:''}
        ${activeCycle.system_cost?`<div class="kv"><span>هزینه سیستم</span><span>${faNum(activeCycle.system_cost)} تومان</span></div>`:''}
        ${activeCycle.mortality_enabled?`<div class="kv"><span>تلفات</span><span>${faNum(activeCycle.mortality_count)} قطعه</span></div>`:''}
        ${activeCycle.vaccine_enabled?`<div class="kv"><span>واکسن</span><span>انجام شده</span></div>`:''}
        ${activeCycle.diseases?`<div class="kv"><span>بیماری</span><span>${esc(activeCycle.diseases)}</span></div>`:''}
        <button type="button" class="btn small" style="margin-top:8px;width:100%" data-action="edit-cycle" data-id="${activeCycle.id}">✏️ ویرایش دوره</button>
      `:'<div class="hint" style="text-align:center;padding:8px">دوره‌ای ثبت نشده</div>'}
      <button type="button" class="btn small" style="margin-top:6px;width:100%" data-action="add-cycle" data-id="${h.id}">+ افزودن دوره جدید</button>
      <h3>تراکنش‌ها</h3>
      <div class="mini-list">${txs.length?txs.map(txRow).join(''):'<div class="empty">تراکنشی نیست</div>'}</div>
      <div class="form-actions" style="grid-template-columns:1fr 1fr 1fr">
        <button type="button" class="btn" data-close>بستن</button>
        <button type="button" class="btn danger" data-action="delete-house" data-id="${h.id}">حذف</button>
        <button type="button" class="btn primary" data-action="edit-house" data-id="${h.id}">ویرایش</button>
      </div>`);
  })();
}

/* ===== Cycle form ===== */
function openCycleForm(houseId,cycleId=null){
  const c=cycleId?qOne('SELECT * FROM cycles WHERE id=?',[cycleId]):null;
  const entryArr=c?JSON.parse(c.entry_dates||'[]'):[];
  openModal(`<h2>${c?'ویرایش':'افزودن'} دوره پرورش</h2>
    <form id="cycleForm" class="form" data-house-id="${houseId}">
      <label>تاریخ ورود جوجه
        <div class="entry-dates" data-entry-dates>
          <input type="hidden" name="entry_dates" value="${esc(JSON.stringify(entryArr))}">
          <div class="chips" id="entryChips"></div>
          <button type="button" class="btn small" id="addEntryBtn">+ افزودن تاریخ</button>
        </div>
      </label>
      <label>تعداد جوجه ورودی<input name="chick_count" inputmode="numeric" value="${c?.chick_count||''}"></label>
      <label>هزینه سیستم (به بدهی مرغدار اضافه می‌شود)<input name="system_cost" inputmode="numeric" value="${c?.system_cost||''}" placeholder="اختیاری"></label>
      <div class="switch-row">
        <span>ثبت تلفات</span>
        <label class="switch"><input type="checkbox" id="mortToggle" ${c?.mortality_enabled?'checked':''}><span class="switch-slider"></span></label>
      </div>
      <label id="mortField" style="${c?.mortality_enabled?'':'display:none'}">تعداد تلفات<input name="mortality_count" inputmode="numeric" value="${c?.mortality_count||''}"></label>
      <div class="switch-row">
        <span>واکسن انجام شد</span>
        <label class="switch"><input type="checkbox" name="vaccine_enabled" ${c?.vaccine_enabled?'checked':''}><span class="switch-slider"></span></label>
      </div>
      <label>بیماری‌های دوره<input name="diseases" value="${esc(c?.diseases||'')}" placeholder="اختیاری"></label>
      ${dateField('load_start_date',c?.load_start_date||'','تاریخ شروع بارگیری')}
      ${dateField('load_end_date',c?.load_end_date||'','تاریخ پایان بارگیری')}
      ${dateField('cycle_end_date',c?.cycle_end_date||'','تاریخ خاتمه دوره')}
      <div class="form-actions">
        <button type="button" class="btn" data-close>انصراف</button>
        <button type="submit" class="btn primary">${c?'ذخیره':'افزودن'}</button>
      </div>
    </form>`);
  const renderChips=()=>{
    const hid=$('input[name="entry_dates"]');
    const arr=JSON.parse(hid.value||'[]');
    $('#entryChips').innerHTML=arr.map((d,i)=>`<span class="chip-date">${formatDateFa(d)}<button type="button" data-rm="${i}">×</button></span>`).join('');
    $$('[data-rm]').forEach(b=>b.onclick=()=>{
      const idx=+b.dataset.rm;arr.splice(idx,1);hid.value=JSON.stringify(arr);renderChips();
    });
  };
  renderChips();
  $('#addEntryBtn').onclick=()=>{
    pickDate('',(d)=>{
      const hid=$('input[name="entry_dates"]');
      const arr=JSON.parse(hid.value||'[]');
      arr.push(d);hid.value=JSON.stringify(arr);
      renderChips();
      // re-open modal (since pickDate closes it)
      openCycleForm(houseId,cycleId);
      // restore form state - tricky, we lose it
    });
  };
  // Simpler approach: use event delegation for addEntryBtn
  $('#mortToggle').onchange=e=>{
    $('#mortField').style.display=e.target.checked?'block':'none';
  };
  $('#cycleForm').addEventListener('submit',e=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    const hid=$('input[name="entry_dates"]');
    const d={
      entry_dates:hid.value||'[]',
      chick_count:parseAmount(fd.get('chick_count')),
      system_cost:parseAmount(fd.get('system_cost')),
      mortality_enabled:$('#mortToggle').checked?1:0,
      mortality_count:parseAmount(fd.get('mortality_count')),
      vaccine_enabled:fd.get('vaccine_enabled')?1:0,
      diseases:(fd.get('diseases')||'').trim(),
      load_start_date:fd.get('load_start_date')||'',
      load_end_date:fd.get('load_end_date')||'',
      cycle_end_date:fd.get('cycle_end_date')||''
    };
    const hidHouse=+e.target.dataset.houseId;
    if(cycleId){
      run(`UPDATE cycles SET entry_dates=?,chick_count=?,system_cost=?,mortality_enabled=?,mortality_count=?,vaccine_enabled=?,diseases=?,load_start_date=?,load_end_date=?,cycle_end_date=? WHERE id=?`,
        [d.entry_dates,d.chick_count,d.system_cost,d.mortality_enabled,d.mortality_count,d.vaccine_enabled,d.diseases,d.load_start_date,d.load_end_date,d.cycle_end_date,cycleId]);
      // sync system_cost transaction
      const h=qOne('SELECT farmer_id FROM houses WHERE id=?',[hidHouse]);
      const existing=qOne(`SELECT id FROM transactions WHERE cycle_id=? AND type='system_cost'`,[cycleId]);
      if(d.system_cost>0){
        const j=todayJalali();
        if(existing)run('UPDATE transactions SET amount=? WHERE id=?',[d.system_cost,existing.id]);
        else run(`INSERT INTO transactions(farmer_id,house_id,cycle_id,type,amount,description,jalali_date,gregorian_date) VALUES(?,?,?,?,?,?,?,?)`,
          [h.farmer_id,hidHouse,cycleId,'system_cost',d.system_cost,'هزینه سیستم',jStr(j),gregStr(j)]);
      }else if(existing)run('DELETE FROM transactions WHERE id=?',[existing.id]);
    }else{
      // mark previous cycle inactive
      run('UPDATE cycles SET active=0 WHERE house_id=?',[hidHouse]);
      db.run(`INSERT INTO cycles(house_id,entry_dates,chick_count,system_cost,mortality_enabled,mortality_count,vaccine_enabled,diseases,load_start_date,load_end_date,cycle_end_date,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,1)`,
        [hidHouse,d.entry_dates,d.chick_count,d.system_cost,d.mortality_enabled,d.mortality_count,d.vaccine_enabled,d.diseases,d.load_start_date,d.load_end_date,d.cycle_end_date]);
      const newId=qOne('SELECT last_insert_rowid() AS id').id;
      if(d.system_cost>0){
        const h=qOne('SELECT farmer_id FROM houses WHERE id=?',[hidHouse]);
        const j=todayJalali();
        db.run(`INSERT INTO transactions(farmer_id,house_id,cycle_id,type,amount,description,jalali_date,gregorian_date) VALUES(?,?,?,?,?,?,?,?)`,
          [h.farmer_id,hidHouse,newId,'system_cost',d.system_cost,'هزینه سیستم',jStr(j),gregStr(j)]);
      }
      persist();
    }
    closeModal();render();toast(c?'ذخیره شد':'دوره افزوده شد');
  });
}

// Override entry date add with delegated handler
document.addEventListener('click',e=>{
  if(e.target.id==='addEntryBtn'){
    e.preventDefault();
    const hid=$('input[name="entry_dates"]');
    pickDate('',(d)=>{
      const arr=JSON.parse(hid.value||'[]');
      arr.push(d);hid.value=JSON.stringify(arr);
      // Re-render chips directly without closing modal
      const chipsEl=$('#entryChips');
      if(chipsEl){
        chipsEl.innerHTML=arr.map((dd,i)=>`<span class="chip-date">${formatDateFa(dd)}<button type="button" data-rm="${i}">×</button></span>`).join('');
        $$('[data-rm]').forEach(b=>b.onclick=()=>{
          const idx=+b.dataset.rm;arr.splice(idx,1);hid.value=JSON.stringify(arr);
          chipsEl.innerHTML=arr.map((dd,j)=>`<span class="chip-date">${formatDateFa(dd)}<button type="button" data-rm="${j}">×</button></span>`).join('');
          $$('[data-rm]').forEach(bb=>bb.onclick=()=>{const i2=+bb.dataset.rm;arr.splice(i2,1);hid.value=JSON.stringify(arr);bb.parentElement.remove()});
        });
      }
    });
  }
  if(e.target.classList.contains('cal-day')) return; // handled inline
});

/* ===== Transaction form ===== */
function openTxForm(){
  const farmers=qAll('SELECT id,name FROM farmers ORDER BY name');
  if(!farmers.length){toast('ابتدا مرغدار اضافه کنید');openFarmerForm();return}
  const houses=qAll('SELECT id,farmer_id,name FROM houses ORDER BY name');
  const t=todayJalali();
  openModal(`<h2>ثبت تراکنش</h2>
    <form id="txForm" class="form">
      <label>مرغدار <span class="req">*</span>
        <select name="farmer_id" required id="txFarmerSel">${farmers.map(f=>`<option value="${f.id}">${esc(f.name)}</option>`).join('')}</select>
      </label>
      <label>سالن (اختیاری)
        <select name="house_id" id="txHouseSel"><option value="">بدون سالن (سطح مرغدار)</option></select>
      </label>
      <label>نوع تراکنش
        <select name="type">
          <option value="payment">پرداخت مرغدار (کاهش بدهی)</option>
          <option value="manual_debt">بدهی دستی (افزایش بدهی)</option>
          <option value="system_cost">هزینه سیستم (افزایش بدهی)</option>
        </select>
      </label>
      <label>مبلغ (تومان) <span class="req">*</span><input name="amount" inputmode="numeric" required placeholder="مثلاً ۵۰۰۰۰۰"></label>
      ${dateField('jalali_date',jStr(t),'تاریخ')}
      <label>توضیح<input name="description" maxlength="100" placeholder="اختیاری"></label>
      <div class="form-actions">
        <button type="button" class="btn" data-close>انصراف</button>
        <button type="submit" class="btn primary">ثبت</button>
      </div>
    </form>`);
  const updateHouses=()=>{
    const fid=+$('#txFarmerSel').value;
    const sel=$('#txHouseSel');
    sel.innerHTML='<option value="">بدون سالن (سطح مرغدار)</option>'+houses.filter(h=>h.farmer_id===fid).map(h=>`<option value="${h.id}">${esc(h.name)}</option>`).join('');
  };
  updateHouses();
  $('#txFarmerSel').onchange=updateHouses;
  $('#txForm').addEventListener('submit',e=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    const fid=+fd.get('farmer_id'),hid=fd.get('house_id')?+fd.get('house_id'):null;
    const type=fd.get('type'),amount=parseAmount(fd.get('amount'));
    const desc=(fd.get('description')||'').trim();
    const jd=fd.get('jalali_date');
    if(!fid||!amount||!jd){toast('اطلاعات ناقص');return}
    const p=parseJalali(jd);
    run(`INSERT INTO transactions(farmer_id,house_id,type,amount,description,jalali_date,gregorian_date) VALUES(?,?,?,?,?,?,?)`,
      [fid,hid,type,amount,desc,jd,gregStr(p)]);
    closeModal();render();toast('تراکنش ثبت شد');
  });
}

function openTxDetail(id){
  const t=qOne(`SELECT t.*,f.name AS farmer_name,h.name AS house_name FROM transactions t LEFT JOIN farmers f ON f.id=t.farmer_id LEFT JOIN houses h ON h.id=t.house_id WHERE t.id=?`,[id]);
  if(!t)return;
  openModal(`<h2>جزئیات تراکنش</h2>
    <div class="kv"><span>مرغدار</span><span>${esc(t.farmer_name||'—')}</span></div>
    ${t.house_name?`<div class="kv"><span>سالن</span><span>${esc(t.house_name)}</span></div>`:''}
    <div class="kv"><span>نوع</span><span>${TX_LABELS[t.type]||t.type}</span></div>
    <div class="kv"><span>مبلغ</span><span>${faNum(t.amount)} تومان</span></div>
    <div class="kv"><span>تاریخ</span><span>${formatDateFa(t.jalali_date)}</span></div>
    ${t.for_month?`<div class="kv"><span>ماه مربوطه</span><span>${t.for_month}</span></div>`:''}
    ${t.description?`<div class="kv"><span>توضیح</span><span>${esc(t.description)}</span></div>`:''}
    <div class="form-actions">
      <button type="button" class="btn" data-close>بستن</button>
      ${t.type!=='monthly_charge'?`<button type="button" class="btn danger" data-action="delete-tx" data-id="${t.id}">حذف</button>`:'<div class="hint" style="grid-column:2;text-align:center;font-size:12px">شارژ ماهانه خودکار</div>'}
    </div>`);
}

/* ===== Tariff form ===== */
function openTariffForm(type){
  const current=getCurrentTariff(type);
  const hasHistory=!!qOne('SELECT id FROM tariff_history WHERE tariff_type=?',[type]);
  const defEff=hasHistory?nextMonthKey():currentMonthKey();
  openModal(`<h2>تعرفه ${TARIFF_LABELS[type]}</h2>
    ${current?`<p class="hint">تعرفه فعلی: <b>${faNum(current)}</b> تومان به ازای هر سر</p>`:'<p class="hint">تعرفه تعیین نشده</p>'}
    <form id="tariffForm" class="form">
      <label>تعرفه جدید (تومان به ازای هر سر) <span class="req">*</span>
        <input name="amount" inputmode="numeric" required placeholder="مثلاً ۱۳۵">
      </label>
      ${dateField('effective_from',defEff,'اعمال از ماه (اول ماه)')}
      <p class="hint" style="font-size:12px;margin:0">${hasHistory?'تعرفه جدید از این ماه به بعد اعمال می‌شود. ماه‌های گذشته با تعرفه قبلی محاسبه می‌مانند.':'این اولین تعرفه است. از تاریخ انتخاب‌شده به بعد برای تمام سالن‌های این نوع تعرفه اعمال می‌شود.'}</p>
      <div class="form-actions">
        <button type="button" class="btn" data-close>انصراف</button>
        <button type="submit" class="btn primary">ذخیره</button>
      </div>
    </form>`);
  $('#tariffForm').addEventListener('submit',e=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    const amt=parseAmount(fd.get('amount'));
    const eff=fd.get('effective_from');
    if(!amt||!eff){toast('اطلاعات ناقص');return}
    const p=parseJalali(eff);
    if(!p){toast('تاریخ نامعتبر');return}
    const mKey=monthKey(p.jy,p.jm);
    run('INSERT INTO tariff_history(tariff_type,amount,effective_from) VALUES(?,?,?)',[type,amt,mKey]);
    closeModal();
    generateMonthlyCharges();
    render();
    toast('تعرفه ذخیره شد');
  });
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
  if(!confirm('داده‌های فعلی جایگزین می‌شوند. ادامه؟'))return;
  try{
    const bytes=new Uint8Array(await file.arrayBuffer());
    const nd=new SQL.Database(bytes);
    nd.exec('SELECT COUNT(*) FROM farmers');
    try{db.close()}catch(_){}
    db=nd;db.run(SCHEMA);
    await persistNow();
    render();toast('بازیابی شد');
  }catch(e){console.error(e);toast('فایل معتبر نیست')}
}
function downloadCSV(){
  const rows=[['تاریخ','مرغدار','سالن','نوع','مبلغ','توضیح']];
  const txs=qAll(`SELECT t.*,f.name AS farmer_name,h.name AS house_name FROM transactions t LEFT JOIN farmers f ON f.id=t.farmer_id LEFT JOIN houses h ON h.id=t.house_id ORDER BY t.gregorian_date DESC`);
  for(const t of txs)rows.push([t.jalali_date,t.farmer_name||'',t.house_name||'',TX_LABELS[t.type]||t.type,String(t.amount),t.description||'']);
  const csv='\uFEFF'+rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const j=todayJalali();
  const a=document.createElement('a');a.href=url;
  a.download=`hesabyar-${j.jy}-${String(j.jm).padStart(2,'0')}-${String(j.jd).padStart(2,'0')}.csv`;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('CSV دانلود شد');
}

/* ===== Toast ===== */
function toast(msg){
  const el=$('#toast');el.textContent=msg;el.classList.add('show');
  clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2400);
}

/* ===== Setup / reconnect modals ===== */
function showSetupModal(){
  openModal(`<h2>📁 محل ذخیره‌سازی</h2>
    <p class="hint">برای اینکه داده‌ها با پاک شدن مرورگر از بین نروند، یک پوشه انتخاب کنید. فایل <b>hesabyar.sqlite</b> در آن ساخته می‌شود.</p>
    <p class="hint">پیشنهاد: پوشه‌ای به نام <b>Hesabyar</b> در Documents بسازید.</p>
    <div class="form-actions single">
      <button class="btn primary" data-action="pick-folder">📁 انتخاب پوشه</button>
      <button class="btn" data-close>فعلاً بدون پوشه ادامه</button>
    </div>`);
}
function showReconnectModal(){
  openModal(`<h2>🔓 اتصال دوباره به پوشه</h2>
    <p class="hint">اجازه دسترسی به پوشه ذخیره‌سازی را دوباره بدهید.</p>
    <div class="form-actions single">
      <button class="btn primary" data-action="reconnect-folder">اتصال</button>
      <button class="btn" data-close>ادامه بدون پوشه</button>
    </div>`);
}
async function handlePickFolder(){
  if(!('showDirectoryPicker' in window)){toast('مرورگر پشتیبانی نمی‌کند');return}
  try{await pickFolder()}catch(e){if(e.name!=='AbortError'){console.error(e);toast('خطا')};return}
  try{
    const existing=await loadFromFile();
    if(existing&&existing.byteLength>0){
      if(confirm('فایلی از قبل وجود دارد. داده‌های آن بارگذاری شود؟')){
        try{try{db.close()}catch(_){}db=new SQL.Database(existing);db.run(SCHEMA)}catch(err){toast('فایل نامعتبر');db=new SQL.Database();db.run(SCHEMA)}
      }
    }
    await persistNow();
    closeModal();generateMonthlyCharges();render();
    toast('✅ متصل شد');
  }catch(e){console.error(e);toast('خطا در ذخیره')}
}

/* ===== Global delegation ===== */
function setupDelegation(){
  document.addEventListener('click',async e=>{
    // date field
    const df=e.target.closest('[data-date-field]');
    if(df){
      const name=df.dataset.dateField;
      const hidden=document.querySelector(`input[name="${name}"]`);
      pickDate(hidden.value,(newDate)=>{
        hidden.value=newDate;
        df.querySelector('span').textContent=formatDateFa(newDate);
        df.querySelector('span').classList.remove('placeholder');
      });
      return;
    }
    const chip=e.target.closest('[data-tx-type]');
    if(chip){state.filterTx.type=chip.dataset.txType||null;render();return}
    const el=e.target.closest('[data-action]');
    if(!el)return;
    const a=el.dataset.action,id=el.dataset.id?+el.dataset.id:null;
    if(a==='add-farmer')openFarmerForm();
    else if(a==='add-house')openHouseForm();
    else if(a==='add-house-for'){closeModal();openHouseForm(null,id)}
    else if(a==='add-tx')openTxForm();
    else if(a==='farmer-detail')openFarmerDetail(id);
    else if(a==='house-detail')openHouseDetail(id);
    else if(a==='tx-detail')openTxDetail(id);
    else if(a==='edit-house'){closeModal();openHouseForm(id)}
    else if(a==='add-cycle'){closeModal();openCycleForm(id)}
    else if(a==='edit-cycle'){closeModal();const c=qOne('SELECT house_id FROM cycles WHERE id=?',[id]);openCycleForm(c.house_id,id)}
    else if(a==='set-tariff')openTariffForm(el.dataset.type);
    else if(a==='pick-folder')handlePickFolder();
    else if(a==='save-now'){await persistNow();toast('ذخیره شد')}
    else if(a==='reconnect-folder'){
      const ok=await requestPendingPermission();
      if(ok){await persistNow();closeModal();generateMonthlyCharges();render();toast('✅ متصل شد')}
      else toast('دسترسی رد شد');
    }
    else if(a==='backup')downloadBackup();
    else if(a==='restore')$('#restoreFile').click();
    else if(a==='csv')downloadCSV();
    else if(a==='delete-farmer'){
      if(confirm('این مرغدار و همه سالن‌ها و تراکنش‌هایش حذف شوند؟')){
        run('DELETE FROM farmers WHERE id=?',[id]);
        closeModal();render();toast('حذف شد');
      }
    }
    else if(a==='delete-house'){
      if(confirm('این سالن و همه دوره‌ها و تراکنش‌هایش حذف شوند؟')){
        run('DELETE FROM transactions WHERE house_id=?',[id]);
        run('DELETE FROM houses WHERE id=?',[id]);
        closeModal();render();toast('حذف شد');
      }
    }
    else if(a==='delete-tx'){
      if(confirm('حذف شود؟')){run('DELETE FROM transactions WHERE id=?',[id]);closeModal();render();toast('حذف شد')}
    }
  });
  document.addEventListener('change',e=>{
    if(e.target.id==='txFilterFarmer'){state.filterTx.farmer_id=e.target.value?+e.target.value:null;render()}
    if(e.target.id==='restoreFile'&&e.target.files[0]){handleRestore(e.target.files[0]);e.target.value=''}
  });
  document.addEventListener('input',e=>{
    if(e.target.id==='farmerSearch'){
      state.searchFarmer=e.target.value;
      const q=state.searchFarmer.trim();
      const all=qAll('SELECT * FROM farmers ORDER BY name COLLATE NOCASE');
      const filtered=q?all.filter(f=>f.name.includes(q)||(f.phone||'').includes(q)):all;
      $('#farmerList').innerHTML=filtered.length?filtered.map(farmerRow).join(''):'<div class="empty">یافت نشد</div>';
    }
    if(e.target.id==='houseSearch'){
      state.searchHouse=e.target.value;
      const q=state.searchHouse.trim();
      const all=qAll(`SELECT h.*,f.name AS farmer_name,(SELECT entry_dates FROM cycles WHERE house_id=h.id ORDER BY active DESC,id DESC LIMIT 1) AS active_entry_dates FROM houses h JOIN farmers f ON f.id=h.farmer_id ORDER BY h.active DESC,h.name COLLATE NOCASE`);
      const filtered=q?all.filter(h=>h.name.includes(q)||(h.farmer_name||'').includes(q)):all;
      $('#houseList').innerHTML=filtered.length?filtered.map(houseRow).join(''):'<div class="empty">یافت نشد</div>';
    }
  });
}

/* ===== Boot ===== */
async function boot(){
  try{
    if('showDirectoryPicker' in window){
      const mode=await tryRestoreFolder();
      if(mode==='granted')storageMode='file';
    }
    await initDB();
    generateMonthlyCharges();

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
    render();

    if('showDirectoryPicker' in window){
      if(pendingDirHandle) showReconnectModal();
      else if(storageMode!=='file'){
        const asked=await idbLoad('folder-asked');
        if(!asked){showSetupModal();await idbSave(true,'folder-asked')}
      }
    }

    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')persistNow().catch(()=>{})});
    window.addEventListener('beforeunload',()=>{persistNow().catch(()=>{})});

    if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
  }catch(e){
    console.error(e);
    $('#main').innerHTML=`<div class="empty">خطا در راه‌اندازی.<br><small>${esc(e.message)}</small></div>`;
  }
}
boot();
