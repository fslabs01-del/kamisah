import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Bell, Check, ChevronDown, CircleHelp, Clapperboard, Download, Film, FolderOpen, Heart, Image as ImageIcon, Images, MoreVertical, Plus, Search, Send, Settings2, Share2, Sparkles, ThumbsDown, ThumbsUp, Upload, Video, X } from 'lucide-react'
import { useKamisahStore } from './store/useKamisahStore'
import ProjectsHome from './pages/ProjectsHome'

const models = ['Veo 2.5', 'Seedance 2.0 Fast', 'Seedance 2.0', 'Kling AI']
const demoMedia = [
  { id: 'demo-1', type: 'image', title: 'Referensi hutan', url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=700&q=80' },
  { id: 'demo-2', type: 'image', title: 'Suasana pegunungan', url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=700&q=80' },
  { id: 'demo-3', type: 'image', title: 'Dunia fantasi', url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=700&q=80' },
]

function ProjectStudio() {
  const { projects, activeProjectId, closeProject, promptState, setPromptText, setAttachedAssets, setGenerationSettings, enqueueGeneration, generationQueue, updateGeneration } = useKamisahStore()
  const project = projects.find(p => p.id === activeProjectId)
  const [popup, setPopup] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [refOpen, setRefOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [localMedia, setLocalMedia] = useState([])
  const [toast, setToast] = useState('')
  const fileRef = useRef(null)
  const videoRef = useRef(null)
  const assets = [...(promptState.attachedAssets || [])]
  const jobs = generationQueue.filter(j => j.projectId === activeProjectId)
  const media = [...localMedia, ...demoMedia]

  useEffect(() => {
    if (!jobs.length) return
    const timer = setInterval(() => {
      jobs.filter(j => j.status === 'queued' || j.status === 'processing').forEach(job => {
        const msgs = ['Menyiapkan adegan…', 'Menyusun gerakan kamera…', 'Bismillah .. mugo mugo jadi ..', 'Memproses visual…']
        const next = (job.loadingMessageIndex + 1) % msgs.length
        updateGeneration(job.id, { status: 'processing', loadingMessageIndex: next, message: msgs[next] })
      })
    }, 2000)
    return () => clearInterval(timer)
  }, [jobs.length, activeProjectId, updateGeneration])

  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2600) }
  const addFiles = (files) => {
    const items = Array.from(files || []).map(file => ({ id: crypto.randomUUID(), type: file.type.startsWith('video/') ? 'video' : 'image', title: file.name, url: URL.createObjectURL(file), fileName: file.name }))
    setLocalMedia(prev => [...items, ...prev])
    setAttachedAssets([...assets, ...items])
    setPopup('')
    notify(`${items.length} file ditambahkan ke referensi`)
  }
  const toggleAsset = (item) => {
    const exists = assets.some(a => a.id === item.id)
    setAttachedAssets(exists ? assets.filter(a => a.id !== item.id) : [...assets, item])
  }
  const generate = () => {
    if (!promptState.text.trim()) { notify('Tulis prompt terlebih dahulu'); return }
    const job = enqueueGeneration({ prompt: promptState.text.trim(), assets, settings: promptState.settings, projectId: activeProjectId })
    setPopup('')
    notify('Pekerjaan ditambahkan ke antrean. API video belum terhubung.')
  }

  return <main className="studio-shell">
    <header className="studio-topbar">
      <button className="icon-button" onClick={closeProject} aria-label="Kembali"><ArrowLeft /></button>
      <div className="studio-title"><strong>{project?.name || 'Proyek'}</strong><span>Studio kreatif</span></div>
      <button className="icon-button" onClick={() => setRefOpen(true)} aria-label="Referensi"><Images /></button>
      <button className="icon-button" onClick={() => notify('Menu proyek segera tersedia')} aria-label="Menu"><MoreVertical /></button>
    </header>

    <div className="studio-toolbar"><span className="section-label">KANVAS PROYEK</span><div className="toolbar-actions"><button className="small-tool" onClick={() => fileRef.current?.click()}><Upload size={16}/> Unggah</button><button className="small-tool" onClick={() => setRefOpen(true)}><Search size={16}/> Referensi</button></div></div>
    <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={e => addFiles(e.target.files)} />

    <section className="media-canvas">
      {localMedia.length === 0 && jobs.length === 0 ? <div className="canvas-welcome"><div className="welcome-icon"><Sparkles size={26}/></div><h1>Mulai kreasimu</h1><p>Tambahkan referensi atau tulis prompt untuk memulai proyek video.</p><button className="outline-button" onClick={() => setRefOpen(true)}><Plus size={17}/> Tambah referensi</button></div> : <div className="media-grid">
        {localMedia.map(item => <button key={item.id} className="media-tile" onClick={() => item.type === 'video' ? notify(`Video: ${item.title}`) : toggleAsset(item)}>{item.type === 'video' ? <video src={item.url} muted /> : <img src={item.url} alt={item.title}/>}<span className="media-tag">{item.type === 'video' ? 'VIDEO' : 'GAMBAR'}</span></button>)}
        {jobs.map(job => <div className="job-tile" key={job.id}><div className="job-spinner"><Sparkles size={20}/></div><strong>{job.status === 'queued' ? 'Dalam antrean' : 'Sedang diproses'}</strong><p>{job.message || 'Menyiapkan adegan…'}</p><small>{job.settings?.model} · {job.settings?.duration}s</small><span className="job-note">Demo antrean · belum tersambung API</span></div>)}
        <button className="add-media-tile" onClick={() => setRefOpen(true)}><Plus size={24}/><span>Tambah media</span></button>
      </div>}
    </section>

    {assets.length > 0 && <section className="attached-strip"><div className="strip-heading"><span>Referensi terpilih ({assets.length})</span><button onClick={() => setAttachedAssets([])}>Hapus semua</button></div><div className="attached-items">{assets.map(item => <div className="attached-item" key={item.id}>{item.type === 'video' ? <Video size={17}/> : <img src={item.url} alt=""/>}<span>{item.title || 'Referensi'}</span><button onClick={() => toggleAsset(item)} aria-label="Hapus referensi"><X size={14}/></button></div>)}</div></section>}

    <section className="prompt-dock">
      <textarea value={promptState.text} onChange={e => setPromptText(e.target.value)} placeholder="Ceritakan video yang ingin kamu buat…" rows={2} />
      <div className="prompt-controls"><div className="prompt-left"><div className="popup-wrap"><button className="round-add" onClick={() => setPopup(popup === 'add' ? '' : 'add')} aria-label="Tambah"><Plus size={21}/></button>{popup === 'add' && <div className="popup-menu"><button onClick={() => fileRef.current?.click()}><Upload size={16}/> Ambil dari perangkat</button><button onClick={() => {setRefOpen(true);setPopup('')}}><Images size={16}/> Galeri / Koleksi</button><button onClick={() => {setRefOpen(true);setPopup('')}}><Video size={16}/> Video referensi</button></div>}</div><button className="setting-chip" onClick={() => setSettingsOpen(true)}><Video size={15}/> Video <span>×{promptState.settings.outputs}</span><ChevronDown size={14}/></button><button className="settings-icon" onClick={() => setSettingsOpen(true)} aria-label="Pengaturan"><Settings2 size={17}/></button></div><button className="generate-button" onClick={generate} aria-label="Generate"><Send size={18}/></button></div>
      <div className="prompt-foot"><span>{assets.length} referensi</span><span>{promptState.settings.model} · {promptState.settings.resolution} · {promptState.settings.duration}s</span></div>
    </section>

    {refOpen && <div className="sheet-backdrop" onClick={() => setRefOpen(false)}><section className="bottom-sheet reference-sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle"/><div className="sheet-title"><div><h2>Referensi</h2><p>Pilih beberapa gambar atau video</p></div><button className="icon-button" onClick={() => setRefOpen(false)}><X/></button></div><div className="reference-search"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari referensi…"/><button onClick={() => fileRef.current?.click()}><Upload size={15}/> Upload</button></div><div className="reference-tabs"><span className="active">Galeri</span><span>Koleksi</span><span>Proyek</span></div><div className="reference-grid">{media.filter(m => (m.title || '').toLowerCase().includes(search.toLowerCase())).map(item => <button key={item.id} className={`reference-card ${assets.some(a => a.id === item.id) ? 'selected' : ''}`} onClick={() => toggleAsset(item)}>{item.type === 'video' ? <div className="reference-video"><Video/></div> : <img src={item.url} alt={item.title}/>}<span>{item.title}</span>{assets.some(a => a.id === item.id) && <i><Check size={13}/></i>}</button>)}</div><button className="primary-button sheet-done" onClick={() => setRefOpen(false)}>Pakai {assets.length} referensi</button></section></div>}

    {settingsOpen && <div className="sheet-backdrop" onClick={() => setSettingsOpen(false)}><section className="bottom-sheet settings-sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle"/><div className="sheet-title"><div><h2>Pengaturan video</h2><p>Atur hasil sebelum generate</p></div><button className="icon-button" onClick={() => setSettingsOpen(false)}><X/></button></div><label className="field-label">Model AI<select value={promptState.settings.model} onChange={e => setGenerationSettings({model:e.target.value})}>{models.map(m => <option key={m}>{m}</option>)}</select></label><div className="field-label">Orientasi<div className="choice-row">{['16:9','9:16','1:1'].map(v => <button key={v} className={promptState.settings.orientation === v ? 'choice active' : 'choice'} onClick={() => setGenerationSettings({orientation:v})}>{v}</button>)}</div></div><div className="field-label">Resolusi<div className="choice-row">{['360p','480p','720p','1080p','4K'].map(v => <button key={v} className={promptState.settings.resolution === v ? 'choice active' : 'choice'} onClick={() => setGenerationSettings({resolution:v})}>{v}</button>)}</div></div><div className="field-label duration-label"><span>Durasi</span><strong>{promptState.settings.duration} detik</strong></div><input className="duration-slider" type="range" min="1" max="30" value={promptState.settings.duration} onChange={e => setGenerationSettings({duration:Number(e.target.value)})}/><div className="range-labels"><span>1 detik</span><span>30 detik</span></div><div className="field-label">Jumlah output<div className="choice-row">{[1,2,3,4].map(v => <button key={v} className={promptState.settings.outputs === v ? 'choice active' : 'choice'} onClick={() => setGenerationSettings({outputs:v})}>{v}</button>)}</div></div><p className="settings-warning">Durasi dan resolusi aktual mengikuti dukungan model/API yang nanti disambungkan.</p><button className="primary-button sheet-done" onClick={() => setSettingsOpen(false)}>Simpan pengaturan</button></section></div>}
    {toast && <div className="toast-message">{toast}</div>}
    <p className="studio-disclaimer">Studio prototipe · Generate belum terhubung ke API video.</p>
  </main>
}

export default function App() {
  const activeProjectId = useKamisahStore(s => s.activeProjectId)
  return activeProjectId ? <ProjectStudio /> : <ProjectsHome />
}
