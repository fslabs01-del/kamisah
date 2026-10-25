(() => {
  const KEY = 'kamisah-studio-film-v1';
  const blank = () => ({ projects: [], activeProjectId: null, assets: [], scenes: [], shots: [], settings: {} });
  let state;
  try { state = { ...blank(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { state = blank(); }
  let screen = 'projects', projectFilter = 'all', assetType = 'Karakter', activeCreditTab = 'summary', activeJobFilter = 'all', activeDevTab = 'synopsis', zoom = 1, undoStack = [], redoStack = [];
  const $ = id => document.getElementById(id);
  const toast = msg => { const el=$('toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),2600); };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); $('saveStatus').textContent = state.activeProjectId ? 'Tersimpan di perangkat' : 'Belum ada proyek'; } catch { $('saveStatus').textContent='Penyimpanan perangkat penuh'; } };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const activeProject = () => state.projects.find(p=>p.id===state.activeProjectId);
  const projectForUI = () => activeProject();
  function go(next) {
    screen=next;
    document.querySelectorAll('.screen').forEach(el=>el.classList.toggle('active',el.id===`screen-${next}`));
    document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.screen===next));
    $('screenSelect').value=next;
    renderAll();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function requireProject() {
    if (!activeProject()) { toast('Buat atau pilih proyek terlebih dahulu.'); go('projects'); return false; }
    return true;
  }
  function createProject() {
    const name = window.prompt('Nama proyek film:', '');
    if (name === null) return;
    if (!name.trim()) { toast('Nama proyek belum diisi.'); return; }
    const project={id:crypto.randomUUID(),name:name.trim(),idea:'',settings:{},createdAt:new Date().toISOString(),assets:[],scenes:[],shots:[],status:'draft'};
    state.projects.unshift(project); state.activeProjectId=project.id; save(); renderAll(); fillForm(); go('input'); toast('Proyek dibuat. Silakan isi ide dan pengaturan.');
  }
  function renderProjects() {
    const projects=state.projects.filter(p=>projectFilter==='all'||p.status===projectFilter);
    $('projectList').innerHTML=projects.map(p=>`<article class="project-card"><div class="asset-type">${esc(p.status==='done'?'Selesai':p.status==='production'?'Produksi':'Draft')}</div><h3>${esc(p.name)}</h3><p>${esc(p.idea ? p.idea.slice(0,125)+(p.idea.length>125?'…':'') : 'Ide cerita belum diisi.')}</p><p>Dibuat ${new Date(p.createdAt).toLocaleDateString('id-ID')}</p><div class="project-actions"><button class="btn primary" data-open-project="${p.id}">Buka Proyek</button><button class="btn secondary" data-delete-project="${p.id}">Hapus</button></div></article>`).join('');
    $('projectEmpty').classList.toggle('hidden',projects.length>0);
    $('projectList').classList.toggle('hidden',projects.length===0);
  }
  function fillForm() {
    const p=activeProject(); if(!p) return;
    $('projectName').value=p.name||''; $('storyIdea').value=p.idea||'';
    const s=p.settings||{};
    for(const [id,key] of [['targetDuration','duration'],['genre','genre'],['visualStyle','visualStyle'],['dialogLanguage','language'],['actCount','actCount'],['endingType','ending']]) $(id).value=s[key]||'';
    $('exportTarget').textContent=s.duration?(s.duration==='custom'?'Durasi khusus':`${s.duration} menit`):'Belum ditentukan';
    $('referenceStatus').textContent=(p.referenceNames||[]).length ? p.referenceNames.join(', ') : 'Belum ada referensi dipilih.';
  }
  function renderDevelopment() {
    const p=activeProject(); const has=p&&p.idea.trim();
    $('developmentEmpty').classList.toggle('hidden',!!has);
    $('developmentContent').classList.toggle('hidden',!has);
    if(has){$('devProjectName').textContent=p.name;$('devStory').textContent=p.idea;$('devDuration').textContent=p.settings?.duration?(p.settings.duration==='custom'?'Durasi khusus':`${p.settings.duration} menit`):'Belum ditentukan';$('devActs').textContent=p.settings?.actCount||'Belum ditentukan';$('devScenes').textContent=p.scenes?.length||'Belum dibuat';$('devShots').textContent=(p.shots||[]).length||'Belum dibuat';}
  }
  function renderAssets() {
    const p=activeProject(); const assets=(p?.assets||[]).filter(a=>a.type===assetType);
    $('assetList').innerHTML=assets.map(a=>`<article class="asset-card"><div class="asset-type">${esc(a.type)}</div><h3>${esc(a.name)}</h3><p>${esc(a.notes||'Belum ada catatan.')}</p><button class="btn secondary" data-delete-asset="${a.id}">Hapus Aset</button></article>`).join('');
    $('assetEmpty').classList.toggle('hidden',assets.length>0);
    $('assetList').classList.toggle('hidden',assets.length===0);
  }
  function renderScenes() {
    const p=activeProject(); const scenes=p?.scenes||[];
    $('sceneList').innerHTML=scenes.map(s=>`<article class="scene-card"><div class="asset-type">ADEGAN</div><h3>${esc(s.name)}</h3><p>${esc(s.notes||'Belum ada deskripsi.')}</p><p>${(s.shots||[]).length} shot</p><div class="button-row"><button class="btn primary" data-add-shot="${s.id}">＋ Tambah Shot</button><button class="btn secondary" data-delete-scene="${s.id}">Hapus Adegan</button></div></article>`).join('');
    $('sceneEmpty').classList.toggle('hidden',scenes.length>0); $('sceneList').classList.toggle('hidden',scenes.length===0);
  }
  function renderShots() {
    const p=activeProject(); const shots=p?.shots||[];
    $('shotEmpty').classList.toggle('hidden',shots.length>0);
    $('shotDetail').classList.toggle('hidden',shots.length===0);
    if(shots.length){const sh=shots[shots.length-1];$('shotName').value=sh.name||'';$('shotPrompt').value=sh.prompt||'';}
  }
  function renderChecks() {
    const p=activeProject(); const has=!!(p&&p.idea.trim());
    $('checksEmpty').classList.toggle('hidden',!!state.lastCheck&&has);
    $('checksResult').classList.toggle('hidden',!(state.lastCheck&&has));
    if(state.lastCheck&&has){$('checksRows').innerHTML=[['Nama proyek',!!p.name],['Ide cerita',!!p.idea.trim()],['Durasi target',!!p.settings?.duration],['Genre',!!p.settings?.genre],['Referensi visual',(p.referenceNames||[]).length>0]].map(([label,ok])=>`<div class="check-row" style="display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid #193144"><span>${esc(label)}</span><b style="color:${ok?'#00e59b':'#ffc857'}">${ok?'Lengkap':'Belum diisi'}</b></div>`).join('');}
  }
  function renderProduction() {
    const p=activeProject(); const jobs=p?.jobs||[]; const filtered=jobs.filter(j=>activeJobFilter==='all'||j.status===activeJobFilter);
    $('productionEmpty').classList.toggle('hidden',filtered.length>0);$('productionList').classList.toggle('hidden',filtered.length===0);
    $('productionList').innerHTML=filtered.length?`<table><thead><tr><th>Shot</th><th>Generasi</th><th>Kontinuitas</th><th>Persetujuan</th></tr></thead><tbody>${filtered.map(j=>`<tr><td>${esc(j.name)}</td><td>${esc(j.status)}</td><td>Belum diperiksa</td><td>Belum disetujui</td></tr>`).join('')}</tbody></table>`:'';
  }
  function renderAll(){renderProjects();renderDevelopment();renderAssets();renderScenes();renderShots();renderChecks();renderProduction();if(!activeProject())$('saveStatus').textContent='Belum ada proyek';}
  $('sideNav').addEventListener('click',e=>{const b=e.target.closest('[data-screen]');if(b)go(b.dataset.screen)});
  $('screenSelect').addEventListener('change',e=>go(e.target.value));
  document.addEventListener('click',e=>{
    const goto=e.target.closest('[data-goto]');if(goto){go(goto.dataset.goto);return}
    const op=e.target.closest('[data-open-project]');if(op){state.activeProjectId=op.dataset.openProject;save();fillForm();go('input');return}
    const del=e.target.closest('[data-delete-project]');if(del){if(confirm('Hapus proyek ini beserta data lokalnya?')){state.projects=state.projects.filter(p=>p.id!==del.dataset.deleteProject);if(state.activeProjectId===del.dataset.deleteProject)state.activeProjectId=null;save();renderAll();toast('Proyek dihapus dari penyimpanan lokal.')}return}
    const da=e.target.closest('[data-delete-asset]');if(da){const p=activeProject();p.assets=p.assets.filter(a=>a.id!==da.dataset.deleteAsset);save();renderAssets();return}
    const ds=e.target.closest('[data-delete-scene]');if(ds){const p=activeProject();p.scenes=p.scenes.filter(a=>a.id!==ds.dataset.deleteScene);save();renderScenes();renderDevelopment();return}
    const add=e.target.closest('[data-add-shot]');if(add){const p=activeProject();const scene=p.scenes.find(s=>s.id===add.dataset.addShot);const sh={id:crypto.randomUUID(),name:'Shot baru',prompt:'',sceneId:scene.id,status:'queued'};p.shots.push(sh);scene.shots.push(sh.id);save();go('shot');toast('Shot kosong dibuat. Lengkapi prompt sebelum produksi.');return}
  });
  $('newProject').addEventListener('click',createProject);$('emptyCreate').addEventListener('click',createProject);
  document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{projectFilter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderProjects()}));
  $('projectForm').addEventListener('submit',e=>{e.preventDefault();if(!requireProject())return;const p=activeProject();p.name=$('projectName').value.trim()||p.name;p.idea=$('storyIdea').value.trim();p.settings={duration:$('targetDuration').value,genre:$('genre').value,visualStyle:$('visualStyle').value,language:$('dialogLanguage').value,actCount:$('actCount').value,ending:$('endingType').value};p.referenceNames=Array.from($('referenceFiles').files||[]).map(f=>f.name);save();renderAll();fillForm();toast('Pengaturan proyek disimpan.');});
  $('clearForm').addEventListener('click',()=>{if(!requireProject())return;if(!confirm('Kosongkan ide dan pengaturan proyek ini?'))return;$('storyIdea').value='';for(const id of ['targetDuration','genre','visualStyle','dialogLanguage','actCount','endingType'])$(id).value='';$('referenceFiles').value='';toast('Form dikosongkan. Simpan untuk menerapkan perubahan.');});
  $('toDevelopment').addEventListener('click',()=>{if(!$('projectForm').requestSubmit){$('projectForm').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}))}else $('projectForm').requestSubmit();if(activeProject()?.idea)go('development');});
  $('referenceFiles').addEventListener('change',()=>{$('referenceStatus').textContent=Array.from($('referenceFiles').files||[]).map(f=>f.name).join(', ')||'Belum ada referensi dipilih.';});
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{activeDevTab=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));if(activeDevTab!=='synopsis')toast('Tab ini menunggu layanan pengembangan cerita.');}));
  document.querySelectorAll('[data-asset]').forEach(b=>b.addEventListener('click',()=>{assetType=b.dataset.asset;document.querySelectorAll('[data-asset]').forEach(x=>x.classList.toggle('active',x===b));renderAssets()}));
  const assetDialog=$('assetDialog');const sceneDialog=$('sceneDialog');
  const openAsset=()=>{if(!requireProject())return;$('assetType').value=assetType;$('assetName').value='';$('assetNotes').value='';assetDialog.showModal()};
  $('addAsset').addEventListener('click',openAsset);$('emptyAddAsset').addEventListener('click',openAsset);
  $('saveAsset').addEventListener('click',e=>{e.preventDefault();if(!$('assetName').value.trim()){toast('Nama aset wajib diisi.');return}const p=activeProject();p.assets.push({id:crypto.randomUUID(),type:$('assetType').value,name:$('assetName').value.trim(),notes:$('assetNotes').value.trim()});assetType=$('assetType').value;save();assetDialog.close();renderAssets();toast('Aset disimpan pada proyek ini.')});
  const openScene=()=>{if(!requireProject())return;$('sceneName').value='';$('sceneNotes').value='';sceneDialog.showModal()};
  $('addScene').addEventListener('click',openScene);$('emptyAddScene').addEventListener('click',openScene);
  $('saveScene').addEventListener('click',e=>{e.preventDefault();if(!$('sceneName').value.trim()){toast('Nama adegan wajib diisi.');return}const p=activeProject();p.scenes.push({id:crypto.randomUUID(),name:$('sceneName').value.trim(),notes:$('sceneNotes').value.trim(),shots:[]});save();sceneDialog.close();renderScenes();renderDevelopment();toast('Adegan ditambahkan.')});
  $('runChecks').addEventListener('click',()=>{if(!requireProject())return;state.lastCheck=new Date().toISOString();save();renderChecks();toast('Pemeriksaan kelengkapan lokal selesai; bukan analisis AI.')});
  document.querySelectorAll('[data-credit-tab]').forEach(b=>b.addEventListener('click',()=>{activeCreditTab=b.dataset.creditTab;document.querySelectorAll('[data-credit-tab]').forEach(x=>x.classList.toggle('active',x===b));toast('Data kredit menunggu koneksi backend akun.')}));
  document.querySelectorAll('[data-job-filter]').forEach(b=>b.addEventListener('click',()=>{activeJobFilter=b.dataset.jobFilter;document.querySelectorAll('[data-job-filter]').forEach(x=>x.classList.toggle('active',x===b));renderProduction()}));
  $('saveShot').addEventListener('click',()=>{const p=activeProject();if(!p?.shots.length){toast('Belum ada shot.');return}const sh=p.shots[p.shots.length-1];sh.name=$('shotName').value.trim()||'Shot baru';sh.prompt=$('shotPrompt').value.trim();save();toast('Detail shot disimpan.')});
  $('generateShot').addEventListener('click',()=>toast('API generasi video belum terhubung. Tidak ada kredit yang dipotong.'));
  $('zoomTimeline').addEventListener('click',()=>{zoom=zoom===1?1.25:zoom===1.25?1.5:1;document.querySelectorAll('.track-empty').forEach(el=>el.style.minWidth=`${100*zoom}%`);$('timelineStatus').textContent=`Tampilan zoom ${Math.round(zoom*100)}%`;});
  $('undoTimeline').addEventListener('click',()=>toast('Belum ada perubahan timeline untuk dibatalkan.'));
  $('redoTimeline').addEventListener('click',()=>toast('Belum ada perubahan timeline untuk diulang.'));
  $('exportButton').addEventListener('click',()=>toast('Ekspor belum tersedia karena timeline dan backend media belum terhubung.'));
  $('oldExport').addEventListener('click',()=>toast('Belum ada versi ekspor yang tersimpan.'));
  renderAll();if(activeProject())fillForm();save();
})();