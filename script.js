tailwind.config={darkMode:'class',theme:{extend:{fontFamily:{sans:['Plus Jakarta Sans','sans-serif']}}}}

// ===== KONFIGURASI =====
// Harga (kredit) = ANGKA SEMENTARA. Ganti setelah menghitung dari harga API-mu (1 kredit = Rp100).
// Model & kemampuannya hanya konfigurasi: pastikan penyedia API-mu benar-benar menyediakannya.
const MODELS=[
 {id:'omni-flash',name:'Omni 1.1 Flash',on:false,note:'API terpisah',modes:[],res:['720p'],dur:[4,15]},
 {id:'seedance-2.0-fast',name:'Seedance 2.0 Fast',on:true,modes:['text','image'],res:['480p','720p'],dur:[4,15],rates:{'480p':13,'720p':26}},
 {id:'seedance-2.0',name:'Seedance 2.0',on:true,modes:['text','image','video'],res:['480p','720p','1080p'],dur:[4,15],rates:{'480p':16,'720p':32,'1080p':80}},
 {id:'seedance-2.5',name:'Seedance 2.5',on:true,modes:['text','image'],res:['480p','720p','1080p'],dur:[4,30],rates:{'480p':24,'720p':49,'1080p':120}}
];
const ENDPOINT='/.netlify/functions/seedance';
const $=id=>document.getElementById(id),uid=()=>Math.random().toString(36).slice(2,10),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let S={projects:[],set:{model:'seedance-2.0-fast',ratio:'9:16',res:'720p',n:1,dur:10,audio:true}},U={},CTX='text',DIR=0,SV='set';
let PEND=null;try{PEND=localStorage.getItem('kh_vprompt')}catch{}
const M=id=>MODELS.find(m=>m.id===id),cur=()=>M(S.set.model),ok=(m,mode)=>m.on&&m.modes.includes(mode);
const price=()=>{const m=cur();return (m.rates?Math.ceil(m.rates[S.set.res]*S.set.dur):(m.cost||0))*S.set.n};
function fit(mode){CTX=mode;let m=cur();if(!ok(m,mode)){const f=MODELS.find(x=>ok(x,mode));if(f)S.set.model=f.id}m=cur();if(!m.res.includes(S.set.res))S.set.res=m.res[0];if(m.dur)S.set.dur=Math.min(Math.max(S.set.dur,m.dur[0]),m.dur[1])}
function toast(t){const e=$('toast');e.textContent=t;e.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add('hidden'),3200)}

// ===== Penyimpanan di browser (IndexedDB). Sementara, sampai login + Supabase siap =====
const idb=new Promise(r=>{try{const q=indexedDB.open('kreatorhub',1);q.onupgradeneeded=()=>q.result.createObjectStore('s');q.onsuccess=()=>r(q.result);q.onerror=()=>r(null)}catch{r(null)}});
async function load(){const d=await idb;if(!d)return;return new Promise(r=>{const q=d.transaction('s').objectStore('s').get('db');q.onsuccess=()=>r(q.result);q.onerror=()=>r()})}
let st;function save(){clearTimeout(st);st=setTimeout(async()=>{const d=await idb;try{d&&d.transaction('s','readwrite').objectStore('s').put(S,'db')}catch{}},300)}

// ===== API & antrean generate (paralel, tidak saling menunggu) =====
const uuid=()=>crypto.randomUUID?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16)});
async function api(p){const h={'Content-Type':'application/json'};if(SES)h.Authorization='Bearer '+SES.access_token;let r;try{r=await fetch(ENDPOINT,{method:'POST',headers:h,body:JSON.stringify(p)})}catch{const e=Error('Koneksi terputus.');e.net=true;throw e}const d=await r.json().catch(()=>({}));if(!r.ok){const e=Error(d.error||`Permintaan gagal (${r.status}).`);e.status=r.status;e.json=!!d.error;throw e}return d}
const transient=e=>e.net||(e.status>=500&&!e.json);
async function imgData(b){const i=await createImageBitmap(b),s=Math.min(1,1280/Math.max(i.width,i.height)),c=document.createElement('canvas');c.width=Math.round(i.width*s);c.height=Math.round(i.height*s);c.getContext('2d').drawImage(i,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.85)}
async function run(it,payload=it.req){
 try{
  if(!it.jobId){
   if(!payload)throw Error('Data permintaan hilang. Generate ulang.');
   // Kirim ulang dengan idempotency_key yang SAMA bila jaringan terputus/timeout: server tidak memotong kredit dua kali.
   for(let a=0;;a++){
    try{it.jobId=(await api(payload)).id;save();refreshBal();break}
    catch(e){if(!transient(e))throw e;if(a>=7||it.gone){it.resume=true;throw Error('Koneksi terputus saat mengirim permintaan. Buka ulang halaman ini: pengiriman dilanjutkan otomatis tanpa memotong kredit dua kali.')}await sleep(Math.min(2000*2**a,30000))}
   }
  }
  let bad=0;
  for(let i=0;i<150&&!it.gone;i++){await sleep(5000);let s;
   try{s=await api({action:'status',id:it.jobId});bad=0}catch(e){if(transient(e)&&++bad<24)continue;throw e}
   if(s.state==='done'){if(!s.url)throw Error('Video selesai, tetapi tautan hasil tidak tersedia.');it.url=s.url;it.diag=s.diag||null;it.status='ready';return fin(it)}
   if(s.state==='failed')throw Error(s.error||'Pembuatan video gagal.')}
  if(!it.gone)throw Error('Proses terlalu lama.')
 }catch(e){it.status='failed';it.error=e.message;fin(it)}
}
function fin(it){save();refreshBal();if(it.gone)return;const[,k,,b]=location.hash.split('/');if(['g','ide','lanjut','gambar','akun'].includes(k))return;if($('sheet').innerHTML){DIRTY=true;return}if(k!=='v'||b===it.id){const y=scrollY;route();scrollTo(0,y)}}
let GEN_BUSY=false;
async function generate(p,sc,prompt){if(GEN_BUSY)return;GEN_BUSY=true;try{await generateInner(p,sc,prompt)}finally{setTimeout(()=>{GEN_BUSY=false},1200)}}
async function generateInner(p,sc,prompt){
 const pr=prompt.trim();
 const selectedRefs=refs(p,sc);
 const selectedImages=selectedRefs.filter(x=>x.type==='image'&&x.blob);
 const selectedVideos=selectedRefs.filter(x=>x.type==='video'&&!x.blob&&/^https:\/\//i.test(x.url||''));
 const mode=selectedVideos.length?'video':selectedImages.length?'image':'text';
 const m=cur();
 if(!ok(m,mode))return toast(mode==='video'?'Referensi video saat ini hanya disiapkan untuk Seedance 2.0. Pilih model itu atau hapus referensi video.':'Model ini belum mendukung mode itu. Pilih model lain.');
 if(!pr)return toast('Tulis prompt dulu.');
 if(SB&&!SES)return openAuth('Masuk dulu untuk generate video.');
 if(BAL!==null&&price()>BAL)return toast('Saldo kredit kurang.');
 let reference_image_urls=[];
 const reference_video_urls=selectedVideos.map(x=>x.url);
 if(selectedImages.length){
  try{
   const cap=m.id==='seedance-2.5'?30:9;
   for(const item of selectedImages.slice(0,cap)){
    const data_url=await imgData(item.blob);
    const uploaded=await api({action:'upload_reference',data_url});
    reference_image_urls.push(uploaded.url);
   }
  }catch(e){return toast(e.message||'Gambar referensi gagal diunggah.')}
 }
 for(let k=0;k<S.set.n;k++){
  const it={id:uid(),kind:'result',type:'video',status:'processing',sceneId:sc.id,ts:NOW(),prompt:pr,model:m.id,srcId:selectedRefs[0]?.id,referenceCount:reference_image_urls.length+reference_video_urls.length};const req={action:'create',idempotency_key:uuid(),model:m.id,prompt:pr,ratio:S.set.ratio,resolution:S.set.res,duration:S.set.dur,generate_audio:S.set.audio!==false,reference_image_urls,reference_video_urls};it.req=req;p.items.unshift(it);
  run(it,req)}
 save();toast(`${S.set.n} video diproses dengan ${reference_image_urls.length+reference_video_urls.length} referensi terpilih.`);
 sc.draft='';p.updatedAt=NOW();location.hash=`#/s/${p.id}/${sc.id}`;
}

// ===== Tampilan =====
// ===== Pemeriksaan video unggahan: kontainer, codec, dan apakah browser ini benar-benar bisa memutarnya =====
const L1=new TextDecoder('latin1');
async function sniffVideo(f){
 const N=4<<20,head=new Uint8Array(await f.slice(0,Math.min(f.size,N)).arrayBuffer());
 const tail=f.size>N?new Uint8Array(await f.slice(f.size-N).arrayBuffer()):null;
 const r={container:'unknown',brand:null,codec:null};
 if(head.length>=12&&String.fromCharCode(...head.subarray(4,8))==='ftyp'){
  r.brand=String.fromCharCode(...head.subarray(8,12));r.container=r.brand==='qt  '?'mov':'mp4';
  const fs=new DataView(head.buffer,head.byteOffset).getUint32(0);
  const parts=[head.subarray(Math.min(Math.max(fs,8),head.length)),tail].filter(Boolean).map(b=>L1.decode(b));
  const has=t=>parts.some(x=>x.includes(t));
  r.codec=has('hvc1')||has('hev1')?'hevc':has('avc1')||has('avc3')?'h264':has('av01')?'av1':has('vp09')?'vp9':null;
 }else if(head[0]===0x1a&&head[1]===0x45&&head[2]===0xdf&&head[3]===0xa3){
  r.container='webm';const x=L1.decode(head);r.codec=x.includes('V_VP9')?'vp9':x.includes('V_VP8')?'vp8':x.includes('V_AV1')?'av1':null;
 }
 return r}
// Konversi lokal opsional untuk HEVC: berjalan di browser, tanpa mengirim video ke server.
// FFmpeg WebAssembly diunduh hanya jika video HEVC memang gagal diputar.
let ffmpegPromise=null;
async function convertHevcToH264(file){
 if(!ffmpegPromise)ffmpegPromise=(async()=>{
  const {FFmpeg}=await import('https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js');
  const ff=new FFmpeg();
  const base='https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
  await ff.load({coreURL:base+'/ffmpeg-core.js',wasmURL:base+'/ffmpeg-core.wasm'});
  return ff;
 })().catch(e=>{ffmpegPromise=null;throw e});
 const ff=await ffmpegPromise;
 const input='input_video.'+((file.name||'video.mp4').split('.').pop().replace(/[^a-z0-9]/ig,'').slice(0,8)||'mp4');
 const output='kamish-preview.mp4';
 await ff.writeFile(input,new Uint8Array(await file.arrayBuffer()));
 await ff.exec(['-i',input,'-map','0:v:0','-map','0:a?','-c:v','libx264','-preset','ultrafast','-crf','26','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart',output]);
 const data=await ff.readFile(output);
 try{await ff.deleteFile(input);await ff.deleteFile(output)}catch{}
 return new Blob([data],{type:'video/mp4'});
}
function probePlay(blob,ms=8000){return new Promise(res=>{const v=document.createElement('video'),u=URL.createObjectURL(blob);let done=false;
 const end=o=>{if(done)return;done=true;clearTimeout(t);v.removeAttribute('src');try{v.load()}catch{}URL.revokeObjectURL(u);res(o)};
 const t=setTimeout(()=>end({ok:false,code:'timeout'}),ms);
 v.muted=true;v.playsInline=true;v.preload='metadata';
 v.onloadedmetadata=()=>end({ok:v.videoWidth>0,w:v.videoWidth,h:v.videoHeight,dur:v.duration});
 v.onerror=()=>end({ok:false,code:v.error?v.error.code:0});
 v.src=u})}
const unplayable=it=>it.type==='video'&&it.play&&it.play.ok===false&&it.play.code!=='timeout'&&!it.play.force;
async function checkVideo(p,it){
 const f=it.blob;let info={};
 try{info=await sniffVideo(f)}catch{}
 // Beberapa file MOV/MP4 berlabel tipe aneh (mis. video/quicktime atau kosong): coba lagi dengan label video/mp4.
 const tries=[f];if((info.container==='mp4'||info.container==='mov')&&f.type!=='video/mp4')tries.push(new File([f],f.name||'video.mp4',{type:'video/mp4'}));
 let pr={ok:false,code:'?'},relabeled=false;
 for(const b of tries){pr=await probePlay(b);if(pr.ok){if(b!==f){it.blob=b;delete U[it.id];relabeled=true}break}}
 // Bila HEVC gagal, coba transkode lokal ke H.264. File asli disimpan terpisah di memori.
 if(!pr.ok&&pr.code!=='timeout'&&info.codec==='hevc'){
  toast('Video HEVC tidak didukung. Menyiapkan konversi otomatis ke H.264…');
  try{
   const converted=await convertHevcToH264(f);const convertedProbe=await probePlay(converted,12000);
   if(convertedProbe.ok){it.originalBlob=f;it.blob=converted;delete U[it.id];pr=convertedProbe;it.converted=true;toast('Video berhasil dikonversi untuk pratinjau. File asli tidak diubah.');}
   else throw new Error('Hasil konversi belum dapat diputar');
  }catch(err){console.warn('Konversi HEVC gagal:',err);it.conversionFailed=true;toast('Konversi otomatis gagal di perangkat ini. File asli tetap tersimpan.');}
 }
 it.play={ok:!!pr.ok,code:pr.code??null,codec:it.converted?'h264':(info.codec||null),container:info.container||null,brand:info.brand||null,converted:!!it.converted};
 save();
 if(!pr.ok&&pr.code!=='timeout'&&!it.conversionFailed)toast(`Video ini tidak bisa diputar di browser ini (${vidDetail(it)}). File asli tetap tersimpan.`);
 const h=location.hash;if((!pr.ok||relabeled)&&(h.startsWith('#/p/'+p.id)||h.startsWith('#/v/'+p.id)))route()}
function vidDetail(it){const pl=it.play||{},b=it.blob;return[pl.container&&pl.container.toUpperCase(),pl.codec&&pl.codec.toUpperCase(),b&&(b.type||'tipe tidak diketahui'),b&&(b.size/1048576).toFixed(1)+' MB'].filter(Boolean).join(' · ')}
function uploadMsg(it,code){const pl=it.play||{};
 if(pl.container==='unknown')return'File ini tidak dikenali sebagai MP4/MOV/WebM, atau rusak.';
 if(pl.codec==='hevc')return it.conversionFailed?'Video HEVC tidak dapat dikonversi di perangkat ini. File asli tetap tersimpan. Coba video MP4/H.264.':'Video memakai HEVC/H.265 yang tidak didukung pemutar pada perangkat ini.';
 if(pl.codec==='av1'||pl.codec==='vp9'||pl.codec==='vp8')return`Codec ${pl.codec.toUpperCase()} tidak didukung pemutar pada perangkat ini. File asli tetap tersimpan; perlu dukungan pemutar atau konversi otomatis.`;
 if(code===2)return'File tidak bisa dibaca (mungkin sudah dipindah/dihapus dari galeri HP). Unggah ulang.';
 return'Browser tidak bisa memutar file ini (format atau codec tidak didukung).'}
const src=it=>{
 if(it.storagePath && typeof it.url==='string' && it.url) return it.url;
 if(typeof Blob!=='undefined' && it.blob instanceof Blob){
  try { return U[it.id] ??= URL.createObjectURL(it.blob); } catch(e){ console.warn('Blob video tidak valid:',e); }
 }
 return typeof it.url==='string' ? it.url : '';
};
const spin='<div class="w-7 h-7 rounded-full border-2 border-amber-500 border-t-transparent animate-spin"></div>';
// ===== Desain v7: ikon, pembantu, rute, beranda, ruang proyek, media, panel generate =====
const IC={back:'<path d="M15 5l-7 7 7 7"/>',more:'<path d="M12 5h.01M12 12h.01M12 19h.01"/>',plus:'<path d="M12 5v14M5 12h14"/>',play:'<path d="M7 4l13 8-13 8z" fill="currentColor"/>',pause:'<path d="M8 5v14M16 5v14"/>',vol:'<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 010 7"/>',mute:'<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l4 6M21 9l-4 6"/>',full:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',star:'<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',dl:'<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',edit:'<path d="M4 20l1-4L16 5l3 3L8 19z"/>',trash:'<path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13"/>',chk:'<path d="M5 12l5 5 9-10"/>',bell:'<path d="M6 17v-6a6 6 0 0112 0v6l2 2H4zM10 21h4"/>',down:'<path d="M6 9l6 6 6-6"/>',x:'<path d="M6 6l12 12M18 6L6 18"/>',img:'<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',spark:'<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',right:'<path d="M9 5l7 7-7 7"/>'};
const ic=(n,s=20)=>`<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;
const NOW=()=>Date.now(),PRJ=id=>S.projects.find(x=>x.id===id);
const ago=t=>{if(!t)return'';const d=Math.floor((NOW()-t)/864e5);return d<1?'hari ini':d<2?'kemarin':d<30?d+' hari lalu':new Date(t).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})};
const fmtT=s=>Number.isFinite(s)?Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'):'0:00';
const scn=(p,id)=>p.scenes.find(s=>s.id===id)||p.scenes[0],sItems=(p,s)=>p.items.filter(i=>i.sceneId===s.id);
const refs=(p,s)=>(s.refs||[]).map(id=>p.items.find(i=>i.id===id)).filter(i=>i&&i.status==='ready'&&(i.type==='image'||(i.type==='video'&&!i.blob&&/^https:\/\//i.test(i.url||''))));
const best=a=>a.find(i=>i.status==='ready'&&!unplayable(i))||null;
let CURS=null,MF='all',HF='all',ADDREF=false,DIRTY=false,IDEC=0,GI={tab:'t2i',ratio:'1:1',n:1};
function newProject(n){const s={id:uid(),name:'Adegan 1',refs:[]};return{id:uid(),name:n,items:[],scenes:[s],cur:s.id,createdAt:NOW(),updatedAt:NOW()}}
function migrate(){S.projects.forEach(p=>{if(!p.scenes||!p.scenes.length)p.scenes=[{id:uid(),name:'Adegan 1',refs:[]}];p.scenes.forEach(s=>s.refs=s.refs||[]);if(!p.scenes.some(s=>s.id===p.cur))p.cur=p.scenes[0].id;p.items.forEach(i=>{if(!i.sceneId||!p.scenes.some(s=>s.id===i.sceneId))i.sceneId=p.scenes[0].id;if(i.selected===true&&i.type==='image'){const s=scn(p,i.sceneId);if(!s.refs.includes(i.id))s.refs.push(i.id)}delete i.selected})})}
function thumb(it,c=''){
 if(it.status==='processing')return`<div class="${c} th-c"><i class="spin"></i></div>`;
 if(it.status==='failed')return`<div class="${c} th-c bad">Gagal</div>`;
 if(unplayable(it))return`<div class="${c} th-c warn">▶✕<br>${esc((it.play.codec||'format').toUpperCase())}</div>`;
 return it.type==='image'?`<img src="${src(it)}" alt="" class="${c}">`:`<video src="${src(it)}#t=0.1" muted playsinline webkit-playsinline preload="metadata" class="${c}"></video>`}
const ph=n=>`<div class="fill ph">${ic(n,24)}</div>`;
const hdr=(t,r='',b='#/')=>`<header class="hd2"><a href="${b}" class="ib" aria-label="Kembali">${ic('back')}</a><h1>${t}</h1>${r||'<span class="ib"></span>'}</header>`;
const chips=(k,vals,cur,lab=x=>x,dis=()=>false)=>`<div class="chips">${vals.map(v=>`<button type="button" class="chip${String(v)===String(cur)?' on':''}" data-k="${k}" data-v="${v}" aria-pressed="${String(v)===String(cur)}" ${dis(v)?'disabled':''}>${lab(v)}</button>`).join('')}</div>`;
const sh=(t,rows)=>{$('sheet').innerHTML=`<div data-close class="ov"></div><div class="sh" role="dialog" aria-label="${esc(t)}"><h3>${esc(t)}</h3>${rows.map((r,i)=>`<button type="button" class="sr ${r[2]||''}" data-i="${i}">${r[0]}</button>`).join('')}<button type="button" data-close class="sr mu">Batal</button></div>`;$('sheet').querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{closeSheet();rows[b.dataset.i][1]()})};
const ren=o=>{const n=prompt('Nama',o.name);if(n&&n.trim()){o.name=n.trim().slice(0,40);save();route()}};
function delProject(p){if(!confirm(`Hapus proyek "${p.name}" beserta semua isinya?`))return;p.items.forEach(i=>i.gone=true);S.projects=S.projects.filter(x=>x!==p);save();location.hash==='#/'||!location.hash?route():location.hash='#/'}
function delScene(p,s){if(p.scenes.length<2)return toast('Proyek harus punya minimal satu adegan.');if(!confirm(`Hapus ${s.name} beserta media dan hasilnya?`))return;p.items.filter(i=>i.sceneId===s.id).forEach(i=>i.gone=true);p.items=p.items.filter(i=>i.sceneId!==s.id);p.scenes=p.scenes.filter(x=>x!==s);if(p.cur===s.id)p.cur=p.scenes[0].id;save();route()}
const projMenu=p=>sh(p.name,[['Ganti nama',()=>ren(p)],['Hapus proyek',()=>delProject(p),'red']]);
const sceneMenu=(p,s)=>sh(s.name,[['Buka media',()=>location.hash=`#/s/${p.id}/${s.id}`],['Generate di adegan ini',()=>location.hash=`#/g/${p.id}/${s.id}`],['Ganti nama',()=>ren(s)],['Hapus adegan',()=>delScene(p,s),'red']]);
const upd=()=>{const e=$('sal');if(e)e.textContent=balTxt()};
function route(){const[,k,a,b]=location.hash.split('/'),p=PRJ(a);closeSheet();DIRTY=false;scrollTo(0,0);
 if(k==='p'&&p)return viewProject(p,b);
 if(k==='s'&&p){const s=p.scenes.find(x=>x.id===b);if(!s)return location.replace('#/p/'+p.id);CURS=p.cur=s.id;return viewScene(p,s)}
 if(k==='g'&&p){const s=scn(p,b);CURS=p.cur=s.id;return viewGen(p,s)}
 if(k==='v'&&p){const it=p.items.find(x=>x.id===b);if(it)return viewItem(p,it);return location.replace('#/p/'+p.id)}
 if(k==='akun')return viewAkun();
 if(k==='hasil'||k==='antrean')return viewHasil();
 if(k==='ide')return viewIde(p,b);if(k==='lanjut')return viewLanjut();if(k==='gambar')return viewGambar();
 viewList()}
let SHOWALL=false;
function viewList(){
 const ps=S.projects,busy=ps.some(p=>p.items.some(i=>i.status==='processing')),all=SHOWALL?ps:ps.slice(0,4);
 const th=p=>{const it=best(p.items.filter(i=>i.kind==='result'))||best(p.items);return it?thumb(it,'fill'):ph('img')};
 $('view').innerHTML=`<div class="pg"><header class="hd"><div><div class="logo">Kamisah</div><div class="sub">AI Video Studio</div></div><div class="hd-r">
 <a href="#/akun" class="pill" aria-label="Saldo kredit dan akun">${ic('spark',14)}${SES?`<span id="bal">${balTxt()}</span> Kredit`:'Masuk'}</a>
 <a href="#/hasil" class="ib" aria-label="Hasil dan antrean generate">${ic('bell')}${busy?'<i class="dot"></i>':''}</a><a href="#/akun" class="av" aria-label="Akun">${SES?esc((SES.user.email||'?')[0].toUpperCase()):'?'}</a></div></header>
 <h1 class="hero">Ubah Ide Jadi<br>Video Luar Biasa</h1><p class="sub2">Buat video, gambar, dan cerita dengan AI</p>
 <div class="tools"><button type="button" id="tV" class="tool t1">${ic('play',26)}<b>Buat Video</b><small>Seedance 2.0 / 2.5</small></button><a href="#/gambar" class="tool t2">${ic('img',26)}<b>Buat Gambar</b><small>Segera hadir</small></a><a href="/story" class="tool t3">${ic('spark',26)}<b>Dari Teks ke Video</b><small>Ide ke visual</small></a></div>
 <div class="row-h"><h2>Proyek Terbaru</h2>${ps.length>4?`<button type="button" id="all" class="lnk">${SHOWALL?'Ringkas':'Lihat semua'}</button>`:''}</div>
 <div class="list">${all.map(p=>`<div class="card prow"><a href="#/p/${p.id}" class="thumb">${th(p)}</a><a href="#/p/${p.id}" class="grow"><b>${esc(p.name)}</b><small>${p.scenes.length} adegan${p.updatedAt?' · '+ago(p.updatedAt):''}${p.items.some(i=>i.status==='processing')?' · memproses':''}</small></a><button type="button" data-pm="${p.id}" class="ib" aria-label="Menu proyek ${esc(p.name)}">${ic('more')}</button></div>`).join('')||'<div class="empty">Belum ada proyek.<br>Mulai dengan Buat Proyek Baru.</div>'}</div>
 <button type="button" id="newP" class="cta">${ic('plus')} Buat Proyek Baru</button></div>`;
 $('tV').onclick=()=>{let p=S.projects[0];if(!p){p=newProject('Proyek Baru');S.projects.unshift(p);save()}location.hash=`#/g/${p.id}/${scn(p,p.cur).id}`};
 if($('all'))$('all').onclick=()=>{SHOWALL=!SHOWALL;route()};
 $('newP').onclick=()=>{$('sheet').innerHTML=`<div data-close class="ov"></div><form class="sh" id="npf"><h3>Proyek baru</h3><input id="npn" class="inp" maxlength="40" placeholder="Nama proyek" aria-label="Nama proyek" autocomplete="off"><button class="cta">Buat proyek</button></form>`;$('npn').focus();$('npf').onsubmit=e=>{e.preventDefault();const n=$('npn').value.trim();if(!n)return;const p=newProject(n);S.projects.unshift(p);save();location.hash='#/p/'+p.id}};
 document.querySelectorAll('[data-pm]').forEach(b=>b.onclick=()=>projMenu(PRJ(b.dataset.pm)))}
const FL=[['all','Semua'],['image','Gambar'],['video','Video'],['ref','Referensi']];
const flt=(p,L,f)=>L.filter(i=>f==='all'||(f==='ref'?(scn(p,i.sceneId).refs||[]).includes(i.id):i.type===f));
const fbar=(cur,k)=>`<div class="fl">${FL.map(([v,t])=>`<button type="button" class="tab${v===cur?' on':''}" data-f="${v}" data-fk="${k}">${t}</button>`).join('')}</div>`;
function tiles(p,L){return L.map(it=>{const s=scn(p,it.sceneId),on=(s.refs||[]).includes(it.id),rd=it.status==='ready';return`<div class="tile"><button type="button" class="tbtn" data-open="${it.id}" aria-label="Buka pratinjau ${it.type==='video'?'video':'gambar'}">${thumb(it,'fill')}</button>${rd&&it.type==='video'?`<span class="bdg">${ic('play',10)} ${it.req?fmtT(it.req.duration):'Video'}</span>`:''}${it.status==='processing'?'<span class="bdg wait">Memproses</span>':''}${rd&&(it.type==='image'||(it.type==='video'&&!it.blob&&/^https:\/\//i.test(it.url||'')))?`<button type="button" class="chk${on?' on':''}" data-ref="${it.id}" aria-pressed="${on}" aria-label="${on?'Batalkan referensi':'Pilih sebagai referensi'}">${on?ic('chk',14):''}</button>`:''}</div>`}).join('')}
function bindMedia(p){
 document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>location.hash=`#/v/${p.id}/${b.dataset.open}`);
 document.querySelectorAll('[data-ref]').forEach(b=>b.onclick=()=>{const it=p.items.find(i=>i.id===b.dataset.ref),s=scn(p,it.sceneId);s.refs=s.refs.includes(it.id)?s.refs.filter(x=>x!==it.id):[...s.refs,it.id];save();const y=scrollY;route();scrollTo(0,y)});
 document.querySelectorAll('[data-fk]').forEach(b=>b.onclick=()=>{MF=b.dataset.f;const y=scrollY;route();scrollTo(0,y)})}
const addMedia=()=>openUploadChoice();
function viewProject(p,tab){
 tab=['adegan','media','referensi','pengaturan'].includes(tab)?tab:'adegan';
 const hero=best(p.items.filter(i=>i.kind==='result'))||best(p.items),T=[['adegan','Adegan'],['media','Media'],['referensi','Referensi'],['pengaturan','Pengaturan']];let body='';
 if(tab==='adegan')body=`<button type="button" id="addS" class="cta">${ic('plus')} Tambah Adegan</button><div class="list">${p.scenes.map((s,k)=>{const its=sItems(p,s),r=its.filter(i=>i.kind==='result'),h=best(r)||best(its),d=(r.find(i=>i.req)||{}).req;return`<div class="card srow${s.id===p.cur?' on':''}"><a href="#/s/${p.id}/${s.id}" class="no">${String(k+1).padStart(2,'0')}</a><a href="#/s/${p.id}/${s.id}" class="thumb sm">${h?thumb(h,'fill'):ph('img')}</a><a href="#/s/${p.id}/${s.id}" class="grow"><b>${esc(s.name)}</b><small>${d?fmtT(d.duration)+' · ':''}${r.filter(i=>i.status==='ready').length} hasil</small></a><button type="button" data-sm="${s.id}" class="ib" aria-label="Menu ${esc(s.name)}">${ic('more')}</button></div>`}).join('')}</div>`;
 else if(tab==='media'){const L=flt(p,p.items,MF);body=`${fbar(MF,'m')}<div class="gal">${tiles(p,L)}</div>${L.length?'':'<div class="empty">Belum ada media di filter ini.</div>'}<div class="bar"><button type="button" id="addM" class="cta ghost">${ic('plus')} Tambah Media</button></div>`}
 else if(tab==='referensi'){const R=p.scenes.flatMap(s=>refs(p,s).map(i=>({s,i})));body=R.length?`<div class="gal">${R.map(({s,i})=>`<div class="tile"><button type="button" class="tbtn" data-open="${i.id}" aria-label="Buka pratinjau">${thumb(i,'fill')}</button><span class="bdg">${esc(s.name)}</span><button type="button" class="chk on" data-ref="${i.id}" aria-pressed="true" aria-label="Batalkan referensi">${ic('chk',14)}</button></div>`).join('')}</div><p class="note">Referensi dipakai oleh adegannya saat generate. Gambar dapat diunggah sebagai referensi; video hanya dapat dipakai jika sudah memiliki URL HTTPS publik dan model Seedance 2.0 mendukungnya. Video unggahan lokal belum bisa dikirim sebagai referensi.</p>`:'<div class="empty">Belum ada referensi.<br>Pilih gambar lewat kotak centang di Kelola Media.</div>'}
 else body=`<div class="list"><button type="button" id="rnP" class="card lrow">Ganti nama proyek<span>${ic('right')}</span></button><button type="button" id="dlP" class="card lrow" style="color:#ff7b7b">Hapus proyek<span>${ic('right')}</span></button></div><p class="note">${p.scenes.length} adegan · ${p.items.length} media dan hasil. Data tersimpan di perangkat ini (IndexedDB).</p>`;
 $('view').innerHTML=`<div class="pg${tab==='media'?' fx':''}">${hdr(esc(p.name),`<button type="button" id="pm" class="ib" aria-label="Menu proyek">${ic('more')}</button>`)}
 <div class="tabs" role="tablist">${T.map(([v,t])=>`<a href="#/p/${p.id}/${v}" role="tab" aria-selected="${v===tab}" class="tab${v===tab?' on':''}">${t}</a>`).join('')}</div>
 ${tab==='adegan'?`<div class="hero2">${hero?`${thumb(hero,'fill')}<a href="#/v/${p.id}/${hero.id}" class="pl" aria-label="Putar pratinjau"><i>${ic('play',24)}</i></a>`:`<div class="th-c" style="height:100%;color:var(--mu)">${ic('spark',28)}<span>Belum ada hasil</span></div>`}<button type="button" id="rn" class="ed ib" aria-label="Ganti nama proyek">${ic('edit',17)}</button></div><div class="meta"><b>${esc(p.name)}</b><small>${p.scenes.length} adegan${p.createdAt?' · Dibuat '+new Date(p.createdAt).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}):''}</small></div>`:''}${body}</div>`;
 $('pm').onclick=()=>projMenu(p);if($('rn'))$('rn').onclick=()=>ren(p);if($('rnP'))$('rnP').onclick=()=>ren(p);if($('dlP'))$('dlP').onclick=()=>delProject(p);
 if($('addM'))$('addM').onclick=()=>{CURS=p.cur;addMedia()};
 if($('addS'))$('addS').onclick=()=>{const s={id:uid(),name:'Adegan '+(p.scenes.length+1),refs:[]};p.scenes.push(s);p.cur=s.id;p.updatedAt=NOW();save();route()};
 document.querySelectorAll('[data-sm]').forEach(b=>b.onclick=()=>sceneMenu(p,scn(p,b.dataset.sm)));bindMedia(p)}
function viewScene(p,s){
 const L=flt(p,sItems(p,s),MF);
 $('view').innerHTML=`<div class="pg fx">${hdr(`<button type="button" id="sw" class="sw" aria-label="Pilih adegan">${esc(s.name)} ${ic('down',18)}</button>`,`<a href="#/g/${p.id}/${s.id}" class="ib" aria-label="Generate video di adegan ini" style="color:#b9a6ff">${ic('spark')}</a>`,'#/p/'+p.id)}
 ${fbar(MF,'s')}<div class="gal">${tiles(p,L)}</div>${L.length?'':`<div class="empty">${MF==='all'?'Adegan ini belum punya media.<br>Tambah media atau generate video.':'Belum ada media di filter ini.'}</div>`}
 <div class="bar"><button type="button" id="addM" class="cta">${ic('plus')} Tambah Media</button></div></div>`;
 $('addM').onclick=addMedia;$('sw').onclick=()=>sh('Pilih adegan',p.scenes.map(x=>[esc(x.name),()=>location.hash=`#/s/${p.id}/${x.id}`]));bindMedia(p)}
function viewGen(p,s){
 if(PEND&&!s.draft){s.draft=PEND;PEND=null;try{localStorage.removeItem('kh_vprompt')}catch{}}
 fit('text');const m=cur(),R=refs(p,s),durs=[5,10,15,30].filter(d=>d>=m.dur[0]&&d<=m.dur[1]);
 if(!durs.includes(S.set.dur))S.set.dur=durs.reduce((a,b)=>Math.abs(b-S.set.dur)<Math.abs(a-S.set.dur)?b:a);
 const no1080=m.id==='seedance-2.5'&&S.set.ratio==='9:16';if(no1080&&S.set.res==='1080p')S.set.res='720p';
 const low=BAL!==null&&price()>BAL;
 $('view').innerHTML=`<div class="pg fx">${hdr(esc(s.name),`<button type="button" id="sv" class="chip on" style="flex:none;min-height:40px;padding:0 16px">Simpan</button>`,'#/s/'+p.id+'/'+s.id)}
 <section class="sec"><h3>Referensi${R.length?` (${R.length})`:''}</h3><div class="rrow">${R.map(i=>`<div class="ref">${thumb(i,'fill')}<button type="button" class="x" data-unref="${i.id}" aria-label="Hapus referensi">${ic('x',14)}</button></div>`).join('')}<button type="button" id="addR" class="addr">${ic('plus')}${R.length?'Tambah Referensi':'Tambah Referensi (opsional)'}</button></div></section>
 <section class="sec"><div class="tg"><h3>Prompt</h3><a href="#/ide/${p.id}/${s.id}" class="lnk" style="padding:0">Bantuan</a></div><textarea id="pr" class="ta" maxlength="2000" placeholder="Ceritakan kejadian yang ingin kamu buat…" aria-label="Prompt video">${esc(s.draft||'')}</textarea><span class="cnt" id="cnt">${(s.draft||'').length}/2000</span></section>
 <section class="sec"><h3>Model</h3>${chips('model',MODELS.filter(x=>x.on).map(x=>x.id),m.id,id=>`${esc(M(id).name)}<small>${M(id).dur[1]} dtk</small>`)}</section>
 <section class="sec"><h3>Durasi</h3>${chips('dur',durs,S.set.dur,d=>d+'s')}</section>
 <section class="sec"><h3>Rasio</h3>${chips('ratio',['16:9','9:16','1:1','4:3','3:4','21:9'],S.set.ratio)}</section>
 <section class="sec"><h3>Resolusi</h3>${chips('res',['480p','720p','1080p'],S.set.res,x=>x,v=>!m.res.includes(v)||(v==='1080p'&&no1080))}${no1080?'<p class="note">Seedance 2.5 membatasi rasio 9:16 hingga 720p.</p>':''}</section>
 <section class="sec"><h3>Audio</h3>${chips('audio',['1','0'],S.set.audio!==false?'1':'0',v=>v==='1'?'Aktif':'Bisukan')}</section>
 <a href="#/lanjut" class="card lrow">Pengaturan Lanjutan<span class="mu">Jumlah video x${S.set.n} ${ic('right',16)}</span></a>
 <div class="bar"><div class="gbar"><button type="button" id="go" class="gbtn">Generate Video<small>${price()} Kredit${S.set.n>1?` (x${S.set.n} video)`:''}</small></button><div class="sal">${low?'<span class="warn">Saldo kurang. </span>':''}Saldo: <span id="sal">${balTxt()}</span> kredit</div></div></div></div>`;
 const ta=$('pr');ta.oninput=()=>{s.draft=ta.value;$('cnt').textContent=ta.value.length+'/2000';save()};
 $('sv').onclick=()=>{s.draft=ta.value;save();toast('Tersimpan di '+s.name+'.')};
 $('go').onclick=()=>{s.draft=ta.value;generate(p,s,ta.value)};
 document.querySelectorAll('[data-unref]').forEach(b=>b.onclick=()=>{s.refs=s.refs.filter(x=>x!==b.dataset.unref);save();route()});
 $('addR').onclick=()=>{const pool=p.items.filter(i=>i.kind==='upload'&&i.type==='image'&&i.status==='ready'&&!s.refs.includes(i.id));
  $('sheet').innerHTML=`<div data-close class="ov"></div><div class="sh"><h3>Tambah referensi</h3>${pool.length?`<div class="gal" style="margin-bottom:12px">${pool.slice(0,30).map(i=>`<div class="tile"><button type="button" class="tbtn" data-pick="${i.id}" aria-label="Pakai gambar ini">${thumb(i,'fill')}</button></div>`).join('')}</div>`:'<p class="note" style="margin:0 0 12px">Belum ada gambar di proyek ini.</p>'}<button type="button" id="upR" class="cta" style="margin-top:0">${ic('img')} Unggah gambar baru</button></div>`;
  document.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{s.refs.push(b.dataset.pick);save();route()});
  $('upR').onclick=()=>{ADDREF=true;$('file').accept='image/*';closeSheet();$('file').click()}}}

function videoMsg(v,it){const c=v.error&&v.error.code,d=(it&&it.diag)||{};
 if(it&&it.blob&&!it.url)return uploadMsg(it,c)+' ['+vidDetail(it)+']';
 console.warn('[kamisah] video error',{code:c,msg:v.error&&v.error.message,src:v.currentSrc,diag:d});
 if(d.status>=400)return`Tautan video ditolak penyedia (HTTP ${d.status}); kemungkinan kedaluwarsa.`;
 if(d.ok&&d.looksLikeVideo===false)return'File dari tautan bukan MP4/WebM yang valid.';
 if(d.reason&&d.ok===false)return d.reason;
 if(c===4)return'Browser tidak bisa membuka sumber video ini (tautan atau format).';
 if(c===3)return'Video rusak, atau codec-nya tidak didukung perangkat ini.';
 if(c===2)return'Koneksi terputus saat memuat video.';
 return'Video gagal dimuat.'}
function videoFail(v,it,inline){const m=videoMsg(v,it);if(!inline||!v.parentNode)return toast(m);if(v.parentNode.querySelector('.kh-vfail'))return;
 const b=document.createElement('div');b.className='kh-vfail absolute inset-x-4 bottom-2 z-10 rounded-2xl bg-black/85 border border-red-500/40 p-3 text-center text-xs text-red-300';
 const t=document.createElement('p');t.textContent=m;b.appendChild(t);
 const r=document.createElement('button');r.type='button';r.textContent='Coba muat lagi';r.className='mt-2 mr-2 px-3 py-1.5 rounded-xl bg-neutral-800 text-white';r.onclick=()=>{b.remove();v.load()};b.appendChild(r);
 if(it&&it.url){const a=document.createElement('a');a.href=it.url;a.target='_blank';a.rel='noopener';a.textContent='Buka tautan asli';a.className='inline-block mt-2 px-3 py-1.5 rounded-xl bg-violet-700 text-white';b.appendChild(a)}
 v.parentNode.appendChild(b)}
async function dl(it){const url=src(it),name=(it.blob&&it.blob.name)||`kamisah-${it.type}-${it.id}.${it.type==='video'?'mp4':'jpg'}`,a=document.createElement('a');
 const fire=(h,t)=>{a.href=h;if(t){a.target='_blank';a.rel='noopener'}a.download=name;document.body.appendChild(a);a.click();a.remove()};
 try{if(it.blob)return fire(url);const r=await fetch(url);if(!r.ok)throw 0;const o=URL.createObjectURL(await r.blob());fire(o);setTimeout(()=>URL.revokeObjectURL(o),6e4)}catch{fire(url,1);toast('Jika unduhan tidak dimulai, video dibuka di tab baru agar bisa disimpan.')}}
function editFrom(p,s,it){const r=it.req||{};if(M(r.model)&&M(r.model).on)S.set.model=r.model;if(r.ratio)S.set.ratio=r.ratio;if(r.resolution)S.set.res=r.resolution;if(r.duration)S.set.dur=r.duration;if(r.generate_audio!==undefined)S.set.audio=r.generate_audio!==false;s.draft=it.prompt||s.draft;save();location.hash=`#/g/${p.id}/${s.id}`}
function viewItem(p,it){
 const s=scn(p,it.sceneId),L=sItems(p,s),i=L.indexOf(it),rdy=it.status==='ready',isR=(s.refs||[]).includes(it.id),c=DIR?(DIR>0?'sl':'sr'):'';DIR=0;
 const media=!rdy?(it.status==='failed'?`<p class="warn" style="color:#ff7b7b;text-align:center;padding:24px">${esc(it.error||'Pembuatan video gagal.')}</p>`:`<div style="text-align:center;padding:28px;color:var(--mu);font-size:14px"><i class="spin" style="display:inline-block;margin-bottom:12px"></i><br>Sedang dibuat. Proses tetap berjalan jika kamu pindah halaman.<p class="note">${esc(it.prompt||'')}</p></div>`)
  :it.type==='image'?`<img src="${src(it)}" alt="Gambar ${i+1}" class="pv">`
  :unplayable(it)?`<div style="text-align:center;padding:24px"><div style="font-size:34px">▶✕</div><p class="warn">${esc(uploadMsg(it))}</p><p class="note">${esc(vidDetail(it))}</p><button type="button" id="forcePlay" class="chip" style="margin-top:12px">Coba putar juga</button></div>`
  :`<video id="vid" src="${src(it)}" controls playsinline webkit-playsinline preload="metadata" class="pv" aria-label="Video"></video>`;
 const A=[];if(rdy&&it.type==='image')A.push(['ref',isR?'Hapus Referensi':'Jadikan Referensi','spark']);if(rdy)A.push(['dl','Download','dl']);if(it.kind==='result'&&it.prompt)A.push(['ed','Edit','edit']);A.push(['rm','Hapus','trash','del']);
 $('view').innerHTML=`<div class="pg">${hdr(`${i+1} / ${L.length}`,`<button type="button" id="fav" class="ib" aria-label="${it.fav?'Hapus dari favorit':'Tandai favorit'}" aria-pressed="${!!it.fav}" style="${it.fav?'color:#ffc46b':''}">${ic('star')}</button>`,'#/s/'+p.id+'/'+s.id)}
 <div id="stage" class="stage ${c}">${media}${i>0?`<button type="button" class="nv l" id="pv" aria-label="Sebelumnya">${ic('back',18)}</button>`:''}${i<L.length-1?`<button type="button" class="nv r" id="nx" aria-label="Berikutnya">${ic('right',18)}</button>`:''}</div>

 <div class="strip">${L.map(x=>`<a href="#/v/${p.id}/${x.id}" data-st class="st${x===it?' on':''}" aria-label="Buka media">${thumb(x,'fill')}</a>`).join('')}</div>
 <div class="acts">${A.map(([k,t,n,c2])=>`<button type="button" class="act ${c2||''}" data-a="${k}">${ic(n,22)}${t}</button>`).join('')}</div></div>`;
 document.querySelectorAll('[data-st]').forEach(a=>a.onclick=e=>{e.preventDefault();location.replace(a.href)});
 if($('pv'))$('pv').onclick=()=>go(p,it,-1);if($('nx'))$('nx').onclick=()=>go(p,it,1);
 $('fav').onclick=()=>{it.fav=!it.fav;save();route()};
 const act={ref:()=>{s.refs=isR?s.refs.filter(x=>x!==it.id):[...s.refs,it.id];save();toast(isR?'Referensi dibatalkan.':'Jadi referensi '+s.name+'.');route()},dl:()=>dl(it),ed:()=>editFrom(p,s,it),rm:()=>{if(confirm('Hapus item ini?')){it.gone=true;s.refs=s.refs.filter(x=>x!==it.id);p.items.splice(p.items.indexOf(it),1);save();location.replace(`#/s/${p.id}/${s.id}`)}}};
 document.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>act[b.dataset.a]());
 const v=$('vid');if(v){
  // Gunakan kontrol asli browser Android agar play/pause, scrubber, volume, dan fullscreen mengikuti dukungan perangkat.
  v.controls=true;
  v.addEventListener('error',()=>videoFail(v,it,true));
 }
 if($('forcePlay'))$('forcePlay').onclick=()=>{it.play.force=true;save();route()};
 const sg=$('stage');let x0,y0;sg.ontouchstart=e=>{x0=e.touches[0].clientX;y0=e.touches[0].clientY};sg.ontouchend=e=>{const t=e.changedTouches[0],dx=t.clientX-x0,dy=t.clientY-y0;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)go(p,it,dx<0?1:-1)}}
function go(p,it,d){const L=sItems(p,scn(p,it.sceneId)),n=L[L.indexOf(it)+d];if(!n)return toast(d>0?'Ini item terakhir.':'Ini item pertama.');DIR=d;location.replace(`#/v/${p.id}/${n.id}`)}

function viewAkun(){
 const np=S.projects.length,ni=S.projects.reduce((a,p)=>a+p.items.length,0);
 $('view').innerHTML=`<header class="flex items-center px-4 h-14 max-w-xl mx-auto"><a href="#/" class="font-extrabold text-lg">← Kamisah</a></header><div class="px-4 pb-28 max-w-xl mx-auto"><h1 class="text-2xl font-bold mt-3 mb-4">Akun</h1>
<div class="rounded-2xl bg-neutral-900 p-4 mb-3"><div class="text-xs text-neutral-400">Email</div><div class="text-sm font-semibold mb-3">${SES?esc(SES.user.email):'Belum masuk'}</div><div class="text-xs text-neutral-400">Saldo kredit</div><div class="text-2xl font-extrabold text-amber-400">${balTxt()}</div><p class="text-[11px] text-neutral-500 mt-1">1 kredit = Rp100. Top-up menyusul.</p>
<button id="acBtn" type="button" class="mt-3 w-full py-3 rounded-2xl ${SES?'bg-neutral-800':'bg-amber-500 text-black'} text-sm font-bold">${SES?'Keluar':SB?'Masuk / Daftar':'Login belum dikonfigurasi'}</button></div>
<div class="rounded-2xl bg-neutral-900 p-4 mb-3 text-xs text-neutral-300">Di perangkat ini: ${np} project, ${ni} item.</div>
<h2 class="text-sm font-bold mb-2">Top-up saldo (QRIS)</h2><div class="grid grid-cols-2 gap-2 mb-3">${[5000,10000,25000,50000].map(a=>`<button type="button" data-tp="${a}" class="rounded-2xl bg-neutral-900 border border-neutral-800 py-3 text-xs font-bold">Rp${a.toLocaleString('id-ID')}<div class="text-[10px] font-normal text-neutral-400">${a/100} kredit</div></button>`).join('')}</div>
<div class="rounded-2xl border border-neutral-800 bg-neutral-900 p-3 mb-3"><label for="customTopupAmount" class="block text-xs font-semibold mb-2">Atau masukkan nominal sendiri</label><div class="flex gap-2"><div class="flex min-w-0 flex-1 items-center rounded-xl border border-neutral-700 bg-neutral-950 px-3"><span class="text-sm text-neutral-400 mr-2">Rp</span><input id="customTopupAmount" type="number" inputmode="numeric" min="10000" max="10000000" step="100" placeholder="Contoh: 100000 atau 500000" class="w-full min-w-0 bg-transparent py-3 text-sm outline-none" aria-describedby="customTopupHelp"></div><button type="button" id="customTopupBtn" class="rounded-xl bg-amber-500 px-4 py-3 text-xs font-bold text-black">Lanjut</button></div><p id="customTopupHelp" class="mt-2 text-[11px] text-neutral-400">Minimal Rp10.000 · Maksimal Rp10.000.000 · 1 kredit = Rp100.</p><p id="customTopupCredits" class="mt-1 text-xs text-amber-400"></p></div><p class="text-[11px] text-neutral-500 mb-4">Kredit masuk otomatis setelah pembayaran terkonfirmasi. Kredit tidak bisa ditransfer antar akun.</p>
<h2 class="text-sm font-bold mb-2">Riwayat kredit</h2><div id="hist" class="space-y-2 text-xs text-neutral-400">${SES?'Memuat…':'Masuk untuk melihat riwayat.'}</div></div>`;
 $('acBtn').onclick=()=>SES?SB.auth.signOut().then(()=>route()):openAuth();
 document.querySelectorAll('[data-tp]').forEach(b=>b.onclick=()=>startTopup(+b.dataset.tp));
 const customAmount=$('customTopupAmount'),customBtn=$('customTopupBtn'),customCredits=$('customTopupCredits');
 const updateCustomCredits=()=>{const a=Number(customAmount?.value);if(customCredits)customCredits.textContent=Number.isInteger(a)&&a>=10000&&a<=10000000&&a%100===0?`Kamu akan menerima ${(a/100).toLocaleString('id-ID')} kredit.`:''};
 if(customAmount){customAmount.addEventListener('input',updateCustomCredits);customAmount.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();customBtn?.click()}})}
 if(customBtn)customBtn.onclick=()=>{const a=Number(customAmount?.value);if(!Number.isSafeInteger(a)||a<10000||a>10000000||a%100!==0){toast('Masukkan nominal Rp10.000–Rp10.000.000 dengan kelipatan Rp100.');return}startTopup(a)};
 if(SES)SB.from('ledger').select('delta,reason,created_at').order('created_at',{ascending:false}).limit(30).then(({data})=>{const e=$('hist');if(!e)return;const L={generate:'Generate video',refund:'Pengembalian',topup:'Top-up',chat:'Chat AI',bonus:'Bonus pendaftaran'};
  e.innerHTML=(data||[]).map(r=>`<div class="flex justify-between rounded-xl bg-neutral-900 px-3 py-2"><span>${L[r.reason]||esc(r.reason)} · ${new Date(r.created_at).toLocaleDateString('id-ID')}</span><b class="${r.delta>0?'text-emerald-400':'text-neutral-200'}">${r.delta>0?'+':''}${r.delta}</b></div>`).join('')||'Belum ada transaksi.'})}

function viewHasil(){
 const all=S.projects.flatMap(p=>p.items.filter(i=>i.kind==='result').map(i=>({p,i}))),L=all.filter(({i})=>HF==='all'||i.type===HF),lab={processing:['Memproses','wait'],ready:['Selesai','ok'],failed:['Gagal','bad']};
 $('view').innerHTML=`<div class="pg">${hdr('Hasil Generate')}<div class="fl">${[['all','Semua'],['video','Video'],['image','Gambar']].map(([v,t])=>`<button type="button" class="tab${v===HF?' on':''}" data-hf="${v}">${t}</button>`).join('')}</div>
 <div class="gal">${L.map(({p,i})=>`<div class="tile"><a href="#/v/${p.id}/${i.id}" class="tbtn" style="display:block" aria-label="Buka hasil">${thumb(i,'fill')}</a><span class="bdg ${lab[i.status][1]}">${lab[i.status][0]}</span></div>`).join('')}</div>
 ${L.length?'':`<div class="empty">${HF==='image'?'Belum ada hasil gambar. Generator gambar belum tersedia.':'Belum ada hasil generate.'}</div>`}
 ${all.some(x=>x.i.status==='failed')?`<button type="button" id="clr" class="cta ghost">Hapus yang gagal</button>`:''}</div>`;
 document.querySelectorAll('[data-hf]').forEach(b=>b.onclick=()=>{HF=b.dataset.hf;route()});
 if($('clr'))$('clr').onclick=()=>{S.projects.forEach(p=>p.items=p.items.filter(i=>i.status!=='failed'));save();route()}}
const IDEAS={'Ide AI':['Pertarungan dua pendekar di kuil kuno, gerakan cepat, debu beterbangan, sinematik','Kota futuristik di malam hari, lampu neon memantul di jalan basah, drone melintas','Monster raksasa muncul dari lautan saat badai, ombak besar, kamera drone dari udara','Warga desa melarikan diri saat gunung berapi meletus, kamera genggam, dramatis','Pasukan tentara di medan perang berkabut saat fajar, slow motion, epik'],
'Gaya Visual':['Sinematik, high detail, dynamic lighting, depth of field, color grading hangat','Anime berkualitas tinggi, garis tegas, warna cerah, latar lukisan tangan','Realistis seperti dokumenter, cahaya alami, kamera genggam','Neon cyberpunk, kontras tinggi, pantulan basah, nuansa ungu dan biru','Miniatur tilt-shift, warna jenuh, seolah dunia mainan'],
'Karakter':['Pendekar wanita berambut panjang, jubah kulit, pedang di tangan, tatapan tajam','Pria tua penjaga mercusuar, janggut putih, jaket kuning lusuh','Robot kurir dengan lampu mata biru, bodi berkarat, berjalan di pasar malam','Anak kecil berpayung merah menyusuri jalan desa saat hujan','Penyihir muda dengan tongkat bercahaya di perpustakaan tua'],
'Sinema':['Close-up wajah, kamera perlahan mendekat, cahaya samping dramatis','Tracking shot mengikuti karakter berjalan di lorong sempit','Drone shot naik perlahan dari tanah hingga memperlihatkan seluruh kota','Slow motion saat benda jatuh dan pecah, kamera diam, latar gelap','Gerakan kamera orbit 360 derajat mengelilingi karakter di tengah lapangan']};
async function cp(t){try{await navigator.clipboard.writeText(t);toast('Prompt disalin.')}catch{const a=document.createElement('textarea');a.value=t;a.style.cssText='position:fixed;opacity:0';document.body.appendChild(a);a.select();let ok=false;try{ok=document.execCommand('copy')}catch{}a.remove();toast(ok?'Prompt disalin.':'Gagal menyalin. Tahan teks prompt untuk menyalin manual.')}}
function viewIde(p,sid){
 const cats=Object.keys(IDEAS),cat=cats[IDEC]||cats[0],s=p?scn(p,sid):null;
 $('view').innerHTML=`<div class="pg">${hdr('Mode Prompt Cepat',null,p?`#/g/${p.id}/${s.id}`:'#/')}<div class="fl">${cats.map((c,k)=>`<button type="button" class="tab${k===IDEC?' on':''}" data-c="${k}">${c}</button>`).join('')}</div>
 <div class="list">${IDEAS[cat].map((t,k)=>`<div class="card idea"><span>${esc(t)}</span>${p?`<button type="button" class="chip on" style="flex:none;min-height:40px" data-use="${k}">Pakai</button>`:''}<button type="button" class="ib" data-cp="${k}" aria-label="Salin prompt">${ic('copy')}</button></div>`).join('')}</div></div>`;
 document.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{IDEC=+b.dataset.c;route()});
 document.querySelectorAll('[data-cp]').forEach(b=>b.onclick=()=>cp(IDEAS[cat][b.dataset.cp]));
 document.querySelectorAll('[data-use]').forEach(b=>b.onclick=()=>{s.draft=IDEAS[cat][b.dataset.use];save();location.hash=`#/g/${p.id}/${s.id}`})}
function viewLanjut(){
 $('view').innerHTML=`<div class="pg">${hdr('Pengaturan Lanjutan',null,'javascript:history.back()')}
 <section class="sec"><h3>Jumlah video per permintaan</h3>${chips('n',[1,2,3,4],S.set.n,x=>'x'+x)}<p class="note">Setiap video dihitung dan dipotong kreditnya sendiri-sendiri. Estimasi saat ini: ${price()} kredit.</p></section>
 <section class="sec"><h3>Audio</h3>${chips('audio',['1','0'],S.set.audio!==false?'1':'0',v=>v==='1'?'Aktif':'Bisukan')}</section>
 <p class="note">Opsi seperti seed, motion strength, gerakan kamera, dan enhance detail belum didukung backend Seedance yang terpasang, jadi tidak ditampilkan.</p></div>`}
function viewGambar(){
 $('view').innerHTML=`<div class="pg">${hdr('Buat Gambar AI')}<div class="chips" style="margin-bottom:14px">${[['t2i','Teks ke Gambar'],['i2i','Gambar ke Gambar']].map(([v,t])=>`<button type="button" class="chip${GI.tab===v?' on':''}" data-gt="${v}">${t}</button>`).join('')}</div>
 ${GI.tab==='i2i'?`<section class="sec"><h3>Gambar acuan</h3><button type="button" id="gi" class="addr" style="width:100%;height:96px">${ic('img')}Pilih gambar</button><img id="gp" alt="" style="display:none;width:100%;border-radius:14px;margin-top:8px"></section>`:''}
 <section class="sec"><h3>Prompt</h3><textarea class="ta" placeholder="Contoh: pemandangan kota futuristik di malam hari, neon, sinematik" aria-label="Prompt gambar"></textarea></section>
 <section class="sec"><h3>Rasio</h3>${chips('gr',['1:1','16:9','9:16'],GI.ratio)}</section><section class="sec"><h3>Jumlah</h3>${chips('gn',[1,2,4],GI.n)}</section>
 <p class="note warn">Generator gambar (Nano Banana) belum tersambung ke backend, jadi tombol Generate dinonaktifkan. Biaya kredit akan ditampilkan setelah API tersedia.</p>
 <button type="button" class="cta" disabled>${ic('spark')} Generate Gambar</button></div>`;
 document.querySelectorAll('[data-gt]').forEach(b=>b.onclick=()=>{GI.tab=b.dataset.gt;route()});
  if($('gi')){const f=document.createElement('input');f.type='file';f.accept='image/*';f.onchange=()=>{const x=f.files[0];if(!x)return;$('gp').src=URL.createObjectURL(x);$('gp').style.display='block'};$('gi').onclick=()=>f.click()}}
$('view').addEventListener('click',e=>{const b=e.target.closest('[data-k]');if(!b)return;const k=b.dataset.k,v=b.dataset.v;if(k==='gr'||k==='gn'){if(k==='gr')GI.ratio=v;else GI.n=+v;return route()}if(k==='audio')S.set.audio=v==='1';else if(k==='n'||k==='dur')S.set[k]=+v;else S.set[k]=v;fit('text');save();route()});

// ===== Sheet pengaturan & model =====
function closeSheet(){$('sheet').innerHTML=''}
function openSheet(v){SV=v;renderSheet()}
function renderSheet(){
 const m=cur(),sec=(n,t,b)=>`<h3 class="flex items-center gap-2 text-sm font-bold mt-4 mb-2"><span class="w-6 h-6 grid place-items-center rounded-full bg-indigo-600 text-[11px]">${n}</span>${t}</h3>${b}`;
 const grid=(k,a,val,cols,label)=>`<div class="grid ${cols} gap-2">${a.map(o=>`<button type="button" data-k="${k}" data-v="${o}" aria-pressed="${o===val}" class="kh-option py-3 px-1 text-xs ${o===val?'text-white':'text-neutral-300'}"><b class="block">${label(o).split('|')[0]}</b><span class="block text-[10px] text-neutral-400 mt-1">${label(o).split('|')[1]||''}</span></button>`).join('')}</div>`;
 const badge={'seedance-2.0-fast':'HOT','seedance-2.0':'POPULAR','seedance-2.5':'BEST','omni-flash':'BARU'};
 const art={'seedance-2.0-fast':'assets/seedance-fast.jpg','seedance-2.0':'assets/seedance-fast.jpg','seedance-2.5':'assets/seedance-25.jpg','omni-flash':'assets/omni-flash.jpg'};
 const card=x=>{const active=ok(x,CTX),selected=x.id===m.id,desc=!x.on?(x.note||'Segera hadir'):!active?'Tidak tersedia untuk mode ini':`${x.dur?x.dur[0]+'–'+x.dur[1]+' detik':''} · ${x.res[0]}–${x.res[x.res.length-1]}`;return `<button type="button" data-m="${x.id}" aria-pressed="${selected}" ${active?'':'disabled'} class="kh-model w-full flex gap-3 text-left p-3 rounded-2xl mb-2 ${selected?'border-violet-400':''}"><span class="kh-art w-[76px] h-[76px] shrink-0 rounded-xl overflow-hidden grid place-items-center text-3xl">${String(art[x.id]||'').includes('.jpg')?`<img src="${art[x.id]}" alt="" class="w-full h-full object-cover">`:art[x.id]||'🎞'}</span><span class="min-w-0 flex-1"><span class="flex items-center gap-2"><b class="text-sm">${esc(x.name)}</b>${badge[x.id]?`<i class="not-italic text-[9px] px-1.5 py-1 rounded-md bg-rose-500 text-white font-extrabold">${badge[x.id]}</i>`:''}</span><span class="block text-[11px] text-neutral-400 mt-1">${esc(desc)}</span><span class="block text-[10px] text-neutral-500 mt-2">${x.modes.map(t=>({text:'Teks',image:'Gambar',video:'Video'}[t])).join(' / ')||'Segera hadir'}</span></span>${selected?'<span class="text-violet-300 font-bold">✓</span>':''}</button>`};
 let h;
 if(SV==='model')h=`<div class="flex items-center gap-3 mb-4"><button type="button" id="backS" class="w-10 h-10 rounded-full bg-white/5">←</button><div class="flex-1 text-center font-bold">Pilih Model AI</div><span class="w-10"></span></div><div class="grid grid-cols-4 gap-1 rounded-xl bg-white/5 p-1 mb-3"><button type="button" class="py-2 rounded-lg bg-indigo-600 text-xs">Semua</button><button type="button" class="py-2 rounded-lg text-xs text-neutral-400">Video</button><button type="button" class="py-2 rounded-lg text-xs text-neutral-400">Gambar</button><button type="button" class="py-2 rounded-lg text-xs text-neutral-400">Favorit</button></div>${MODELS.map(card).join('')}`;
 else h=`<div class="flex items-start justify-between mb-2"><div><h2 class="text-xl font-extrabold">Pengaturan Video</h2><p class="text-xs text-neutral-400 mt-1">Atur hasil sebelum membuat video</p></div><button type="button" data-close aria-label="Tutup" class="w-10 h-10 rounded-full bg-white/5">✕</button></div>${sec(1,'Pilih Model AI',card(m)+`<button type="button" id="pickM" class="text-xs text-indigo-300 py-2">Lihat semua ›</button>`)}${sec(2,'Rasio Video',grid('ratio',['16:9','9:16','1:1','4:3','3:4','21:9'],S.set.ratio,'grid-cols-3',o=>`${o}|${({'16:9':'YouTube','9:16':'TikTok','1:1':'Instagram','4:3':'Umum','3:4':'Potret','21:9':'Cinematic'})[o]}`))}${sec(3,'Kualitas Video',grid('res',m.res,S.set.res,'grid-cols-3',o=>`${o}|${({'480p':'hemat','720p':'standar','1080p':'jernih'})[o]||''}`))}${sec(4,'Jumlah Video',grid('n',[1,2,3,4],S.set.n,'grid-cols-4',o=>`x${o}|`))}${m.dur?sec(5,'Durasi Video',`<div class="flex items-center gap-3 rounded-xl bg-white/5 p-3"><input id="dur" type="range" min="${m.dur[0]}" max="${m.dur[1]}" value="${S.set.dur}" class="flex-1 accent-violet-500" aria-label="Durasi video"><b id="dl" class="text-sm w-20 text-right">${S.set.dur} detik</b></div>`):''}${sec(6,'Audio Video',`<button type="button" id="audioToggle" aria-pressed="${S.set.audio!==false}" class="w-full flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4"><span><b class="block text-sm">${S.set.audio!==false?'🔊 Audio aktif':'🔇 Audio nonaktif'}</b><span class="text-xs text-neutral-400">${S.set.audio!==false?'Video dibuat dengan audio':'Video dibuat tanpa audio'}</span></span><span class="rounded-full px-4 py-2 text-xs font-bold ${S.set.audio!==false?'bg-violet-600':'bg-neutral-700'}">${S.set.audio!==false?'ON':'OFF'}</span></button>`)}<div class="sticky bottom-0 -mx-4 mt-4 px-4 pt-3 pb-1 bg-[#080c17] flex items-center gap-3 border-t border-white/10"><div class="text-[11px] text-neutral-400 shrink-0">Estimasi biaya<div class="text-lg font-extrabold text-amber-400"><span id="sc">${price()}</span> kredit</div></div><button type="button" data-close class="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-sm font-extrabold">Simpan Pengaturan</button></div>`;
 $('sheet').innerHTML=`<div data-close class="fixed inset-0 z-40 bg-black/65"></div><div class="kh-sheet fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-auto rounded-t-3xl border-t px-4 pt-4">${h}</div>`
}
$('sheet').onclick=e=>{const t=e.target;if(t.dataset.close!==undefined){closeSheet();if(DIRTY){DIRTY=false;route()}return}const b=t.closest('button');if(!b)return;
 if(b.dataset.k)S.set[b.dataset.k]=b.dataset.k==='n'?+b.dataset.v:b.dataset.v;
 else if(b.dataset.m){S.set.model=b.dataset.m;fit(CTX);SV='set'}
 else if(b.id==='pickM')SV='model';else if(b.id==='backS')SV='set';else if(b.id==='audioToggle'){S.set.audio=S.set.audio===false;save();renderSheet();upd();return}else return;
 save();renderSheet();upd()};
$('sheet').oninput=e=>{if(e.target.id!=='dur')return;S.set.dur=+e.target.value;$('dl').textContent=S.set.dur+' detik';$('sc').textContent=price();upd();save()};

// ===== Login & saldo (Supabase). Kosong di config.js = mode tanpa login =====
let SB=null,SES=null,BAL=null,CT=null;const balTxt=()=>BAL===null?'—':BAL;
async function initAuth(){const c=window.KH||{};if(!c.SUPABASE_URL||!c.SUPABASE_PUBLISHABLE_KEY||!window.supabase)return;SB=supabase.createClient(c.SUPABASE_URL,c.SUPABASE_PUBLISHABLE_KEY);const{data}=await SB.auth.getSession();SES=data.session;await refreshBal();SB.auth.onAuthStateChange((_e,s)=>{SES=s;refreshBal()})}
async function refreshBal(){if(!SB||!SES){BAL=null}else{const{data,error}=await SB.from('wallets').select('balance').eq('user_id',SES.user.id).maybeSingle();if(error){console.error('Kamisah: gagal membaca saldo',error.message);BAL=null}else{BAL=data?data.balance:0}}const e=$('bal');if(e)e.textContent=balTxt();upd()}
function openAuth(msg){
 if(!SB)return toast('Login belum dikonfigurasi (isi config.js).');
 const box=SES?`<p class="text-sm mb-1">${esc(SES.user.email)}</p><p class="text-xs text-neutral-400 mb-4">Saldo: <b>${balTxt()}</b> kredit</p><button type="button" id="out" class="w-full py-3 rounded-2xl bg-neutral-800 text-sm font-semibold">Keluar</button>`
 :`<p class="text-sm font-bold mb-3">${esc(msg||'Masuk atau daftar')}</p><input id="em" type="email" autocomplete="email" placeholder="Email" aria-label="Email" class="w-full mb-2 px-4 py-3 rounded-2xl bg-neutral-800 text-sm outline-none"><input id="pw" type="password" autocomplete="current-password" placeholder="Kata sandi (min. 8)" aria-label="Kata sandi" class="w-full mb-2 px-4 py-3 rounded-2xl bg-neutral-800 text-sm outline-none"><div id="cf" class="mb-3"></div><div class="grid grid-cols-2 gap-2"><button type="button" id="si" class="py-3 rounded-2xl bg-amber-500 text-black text-sm font-bold">Masuk</button><button type="button" id="su" class="py-3 rounded-2xl bg-neutral-800 text-sm font-semibold">Daftar</button></div><button type="button" id="ph" class="mt-3 w-full text-xs text-amber-400 underline">Masuk / daftar dengan nomor HP (OTP)</button>`;
 $('sheet').innerHTML=`<div data-close class="fixed inset-0 z-40 bg-black/50"></div><div class="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-neutral-900 p-5" style="padding-bottom:calc(1.25rem + env(safe-area-inset-bottom))">${box}</div>`;
 if(SES)$('out').onclick=async()=>{await SB.auth.signOut();closeSheet();toast('Sudah keluar.')};
 else{const go=async up=>{const email=$('em').value.trim(),password=$('pw').value;if(!email||password.length<8)return toast('Isi email dan kata sandi (min. 8 karakter).');
  const k=(window.KH||{}).TURNSTILE_SITEKEY;if(k&&!CT)return toast('Selesaikan verifikasi captcha dulu.');const o={email,password,options:{captchaToken:CT||undefined}};const{data,error}=up?await SB.auth.signUp(o):await SB.auth.signInWithPassword(o);
  if(error){CT=null;if(k&&window.turnstile)turnstile.reset();return toast(/Database error/i.test(error.message)?'Pendaftaran ditolak. Pakai email aktif yang belum pernah terdaftar.':error.message)}if(!data.session)return toast('Cek email untuk konfirmasi, lalu masuk.');closeSheet();toast('Berhasil masuk.')};
  $('si').onclick=()=>go(false);$('su').onclick=()=>go(true);$('ph').onclick=openPhone;const k=(window.KH||{}).TURNSTILE_SITEKEY;CT=null;if(k&&window.turnstile)turnstile.render('#cf',{sitekey:k,callback:t=>{CT=t}})}}

async function startTopup(amt){
 if(!SB||!SES)return openAuth('Masuk dulu untuk top-up.');
 try{
  const r=await fetch('/.netlify/functions/topup',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+SES.access_token},body:JSON.stringify({amount:amt})});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Gagal membuat tagihan.');
  $('sheet').innerHTML=`<div data-close class="fixed inset-0 z-40 bg-black/50"></div><div class="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-neutral-900 p-5 text-center" style="padding-bottom:calc(1.25rem + env(safe-area-inset-bottom))"><p class="text-sm font-bold">Scan QRIS · Rp${amt.toLocaleString('id-ID')}</p><img src="${esc(d.qr_url)}" alt="Kode QRIS" class="mx-auto my-3 w-56 h-56 rounded-2xl bg-white object-contain"><p id="tps" class="text-xs text-neutral-400">Menunggu pembayaran… (${d.credits} kredit)</p></div>`;
  const end=Date.parse(d.expires_at)||Date.now()+9e5;
  while(Date.now()<end&&$('tps')){await sleep(4000);const{data}=await SB.from('topups').select('status').eq('id',d.id).maybeSingle();
   if(data&&data.status==='paid'){closeSheet();toast('Pembayaran diterima. Kredit bertambah.');await refreshBal();if(location.hash==='#/akun')route();return}}
  if($('tps'))$('tps').textContent='Tagihan kedaluwarsa. Buat tagihan baru.';
 }catch(e){toast(e.message)}}

function openPhone(){
 $('sheet').innerHTML=`<div data-close class="fixed inset-0 z-40 bg-black/50"></div><div class="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-neutral-900 p-5" style="padding-bottom:calc(1.25rem + env(safe-area-inset-bottom))"><p class="text-sm font-bold mb-3">Masuk dengan nomor HP</p><input id="hp" type="tel" inputmode="tel" autocomplete="tel" placeholder="08xxxxxxxxxx" aria-label="Nomor HP" class="w-full mb-2 px-4 py-3 rounded-2xl bg-neutral-800 text-sm outline-none"><input id="otp" inputmode="numeric" maxlength="8" placeholder="Kode OTP" aria-label="Kode OTP" class="hidden w-full mb-2 px-4 py-3 rounded-2xl bg-neutral-800 text-sm outline-none"><div id="cf" class="mb-3"></div><button type="button" id="sendOtp" class="w-full py-3 rounded-2xl bg-amber-500 text-black text-sm font-bold">Kirim kode OTP</button><p class="text-[11px] text-neutral-500 mt-2">Bonus 10 kredit untuk nomor yang baru terverifikasi, sekali per nomor.</p></div>`;
 let sent=false,phone='';const k=(window.KH||{}).TURNSTILE_SITEKEY;CT=null;if(k&&window.turnstile)turnstile.render('#cf',{sitekey:k,callback:t=>{CT=t}});
 $('sendOtp').onclick=async()=>{
  if(!sent){let p=$('hp').value.replace(/[^\d+]/g,'');if(p.startsWith('0'))p='+62'+p.slice(1);else if(p.startsWith('62'))p='+'+p;
   if(!/^\+\d{9,15}$/.test(p))return toast('Nomor HP tidak valid.');if(k&&!CT)return toast('Selesaikan verifikasi captcha dulu.');
   const{error}=await SB.auth.signInWithOtp({phone:p,options:{captchaToken:CT||undefined}});
   if(error){CT=null;if(k&&window.turnstile)turnstile.reset();return toast(error.message)}
   phone=p;sent=true;$('otp').classList.remove('hidden');$('sendOtp').textContent='Verifikasi';toast('Kode OTP dikirim.')}
  else{const{data,error}=await SB.auth.verifyOtp({phone,token:$('otp').value.trim(),type:'sms'});
   if(error)return toast('Kode salah atau kedaluwarsa.');if(data.session){closeSheet();toast('Berhasil masuk.')}}}}

// Upload progress uses the real XMLHttpRequest upload events, not a simulated timer.
function showUploadProgress(file,pct,title){const panel=$('uploadProgressPanel');if(!panel)return;panel.style.display='block';$('uploadProgressTitle').textContent=title||'Mengunggah…';$('uploadProgressMeta').textContent=`${file.name||'File'} · ${(file.size/1024/1024).toFixed(2)} MB`;setUploadPct(pct)}
function setUploadPct(pct){const n=Math.max(0,Math.min(100,Math.round(pct||0)));if($('uploadProgressPct'))$('uploadProgressPct').textContent=n+'%';if($('uploadProgressBar'))$('uploadProgressBar').style.width=n+'%'}
function hideUploadProgress(delay=0){setTimeout(()=>{if($('uploadProgressPanel'))$('uploadProgressPanel').style.display='none'},delay)}
function uploadToSupabaseWithProgress(bucket,path,file,onProgress){return new Promise((resolve,reject)=>{const cfg=window.KH||{};if(!cfg.SUPABASE_URL||!cfg.SUPABASE_PUBLISHABLE_KEY||!SES?.access_token)return reject(Error('Supabase belum terhubung atau sesi login berakhir.'));const xhr=new XMLHttpRequest();const url=cfg.SUPABASE_URL.replace(/\/$/,'')+'/storage/v1/object/'+encodeURIComponent(bucket)+'/'+path.split('/').map(encodeURIComponent).join('/');xhr.open('POST',url);xhr.setRequestHeader('apikey',cfg.SUPABASE_PUBLISHABLE_KEY);xhr.setRequestHeader('Authorization','Bearer '+SES.access_token);xhr.setRequestHeader('Content-Type',file.type||'application/octet-stream');xhr.setRequestHeader('x-upsert','false');xhr.setRequestHeader('cache-control','3600');xhr.upload.onprogress=e=>{if(e.lengthComputable&&onProgress)onProgress(e.loaded/e.total*100)};xhr.onerror=()=>reject(Error('Koneksi terputus saat mengunggah.'));xhr.onabort=()=>reject(Error('Unggahan dibatalkan.'));xhr.onload=()=>{let data={};try{data=JSON.parse(xhr.responseText||'{}')}catch{}if(xhr.status>=200&&xhr.status<300)resolve(data);else reject(Error(data.message||data.error||`Unggah ditolak server (${xhr.status}).`))};xhr.send(file)})}

// Media actions: press and hold for 1 second. Uploads stay in preview until explicitly referenced.
function openUploadChoice(){sh('Tambah media',[[ic('img')+' Unggah gambar',()=>{$('file').accept='image/*';$('file').click()}],[ic('play')+' Unggah video',()=>{$('file').accept='video/*';$('file').click()}]])}
// ===== Unggah/import media: gambar dan video diproses dulu, lalu langsung dibuka di pratinjau =====
$('file').onchange=async e=>{
 const p=S.projects.find(x=>x.id===location.hash.split('/')[2]);
 const files=[...(e.target.files||[])]; if(!p||!files.length){e.target.value='';return}
 const sc=p.scenes.find(s=>s.id===CURS)||scn(p,p.cur);let rej=0,first=null;
 // Buat item dengan status importing agar UI tidak menganggap file siap sebelum diproses.
 for(const f of files){
  const nm=(f.name||'').toLowerCase();
  const t=f.type.startsWith('video')||/\.(mp4|m4v|mov|webm|3gp|mkv)$/.test(nm)?'video':f.type.startsWith('image')?'image':null;
  if(!t){rej++;continue}
  const it={id:uid(),kind:'upload',type:t,blob:f,status:'uploading',sceneId:sc.id,ts:NOW(),uploadProgress:0};
  p.items.unshift(it);p.updatedAt=NOW();if(!first)first=it;
  save();toast(`Menyiapkan ${t==='video'?'video':'gambar'}: ${f.name||'file'}…`);
  try{
   // Unggah file asli ke Supabase Storage; jangan tandai siap hanya karena file sudah dipilih di browser.
   if(!SB)throw Error('Penyimpanan belum terhubung. Periksa konfigurasi Supabase.');
   if(!SES)throw Error('Masuk dulu agar gambar/video bisa diunggah ke penyimpanan.');
   const ext=((f.name||'').split('.').pop()|| (t==='image'?'jpg':'mp4')).toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,8)||(t==='image'?'jpg':'mp4');
   const path=`${SES.user.id}/${Date.now()}-${uuid()}.${ext}`;
   it.uploadProgress=0;save();showUploadProgress(f,0,`Mengunggah ${t==='video'?'video':'gambar'}…`);toast(`Mengunggah ${t==='video'?'video':'gambar'}…`);
   const up=await uploadToSupabaseWithProgress('video-references',path,f,pct=>{it.uploadProgress=pct;setUploadPct(pct);save()});
   const {data:pub}=SB.storage.from('video-references').getPublicUrl(path);
   if(!pub?.publicUrl)throw Error('File terunggah tetapi URL pratinjau tidak tersedia.');
   it.url=pub.publicUrl;it.storagePath=path;it.uploadProgress=100;it.status='ready';showUploadProgress(f,100,'Unggahan berhasil');
   if(ADDREF&&t==='image')sc.refs.push(it.id);
   if(t==='video')await checkVideo(p,it);
  }catch(err){it.status='error';it.error=String(err&&err.message||err);if($('uploadProgressTitle'))$('uploadProgressTitle').textContent='Unggahan gagal';toast(`Gagal mengunggah ${f.name||'file'}: ${it.error}`);hideUploadProgress(3500)}
  save();
 }
 if(rej)toast(`${rej} file dilewati: bukan gambar atau video yang dikenali.`);
 ADDREF=false;e.target.value='';save();
 // Setelah file siap, buka layar pratinjau media—bukan sekadar kembali ke daftar media.
 if(first){location.hash=`#/v/${p.id}/${first.id}`;route()}
 if(first&&first.status==='ready')hideUploadProgress(1400);
};
(async()=>{await initAuth();refreshBal();const d=await load();if(d&&d.projects)S={...S,...d,set:{...S.set,...d.set}};migrate();if(!M(S.set.model)||!M(S.set.model).on)S.set.model='seedance-2.0-fast';
 S.projects.forEach(p=>p.items.forEach(it=>{if(it.status==='processing'){if(it.jobId||it.req)run(it);else{it.status='failed';it.error='Terputus saat halaman dimuat ulang.'}}else if(it.status==='failed'&&it.resume&&!it.jobId&&it.req){it.status='processing';it.error='';it.resume=false;run(it)}}));
 addEventListener('hashchange',route);route();if(PEND)toast('Prompt dari Story AI siap. Tekan Buat Video untuk memakainya.')})();
