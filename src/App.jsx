import { ArrowLeft, Film, Images } from 'lucide-react'
import { useKamisahStore } from './store/useKamisahStore'
import ProjectsHome from './pages/ProjectsHome'

function ProjectPlaceholder() {
  const { projects, activeProjectId, closeProject } = useKamisahStore()
  const project = projects.find(p => p.id === activeProjectId)
  return (
    <main className="home-shell">
      <header className="canvas-topbar">
        <button className="icon-button" onClick={closeProject} aria-label="Kembali"><ArrowLeft /></button>
        <strong>{project?.name || 'Proyek'}</strong>
      </header>
      <section className="canvas-placeholder">
        <div className="placeholder-icon"><Film size={28} /></div>
        <h1>Canvas menyusul di Tahap 3</h1>
        <p>Beranda dan state dasar sudah terhubung. Grid media, referensi, prompt, dan Generate akan ditambahkan pada tahap berikutnya.</p>
        <div className="placeholder-stats"><span><Film size={16} /> {project?.videoCount ?? 0} video</span><span><Images size={16} /> {project?.imageCount ?? 0} gambar</span></div>
      </section>
    </main>
  )
}

export default function App() {
  const activeProjectId = useKamisahStore(s => s.activeProjectId)
  return activeProjectId ? <ProjectPlaceholder /> : <ProjectsHome />
}