import { Bell, Plus, Sparkles } from 'lucide-react'
import { useKamisahStore } from '../store/useKamisahStore'
import ProjectCard from '../components/ProjectCard'

export default function ProjectsHome() {
  const { projects, createProject, openProject, renameProject, deleteProject } = useKamisahStore()

  const newProject = () => {
    const name = window.prompt('Nama proyek baru:', 'Film Baru')
    if (name === null) return
    createProject(name)
  }

  return (
    <main className="home-shell">
      <header className="topbar">
        <div className="brand-mark"><Sparkles size={21} /></div>
        <div className="brand-copy"><strong>Kamisah</strong><span>AI Video Creator</span></div>
        <button className="icon-button notification" aria-label="Notifikasi"><Bell size={22} /><i /></button>
        <button className="avatar" aria-label="Profil pengguna">U</button>
      </header>

      <section className="project-heading">
        <div><p className="eyebrow">RUANG KREATIF AI</p><h1>Proyek</h1></div>
        <button className="primary-button" onClick={newProject}><Plus size={19} /> Baru</button>
      </section>

      {projects.length ? (
        <section className="project-list" aria-label="Daftar proyek">
          {projects.map(project => <ProjectCard key={project.id} project={project} onOpen={openProject} onRename={renameProject} onDelete={deleteProject} />)}
        </section>
      ) : (
        <section className="empty-state"><Sparkles size={32} /><h2>Belum ada proyek</h2><p>Buat proyek pertama untuk mulai membuat video AI.</p><button className="primary-button" onClick={newProject}><Plus size={18} /> Buat proyek</button></section>
      )}
      <p className="prototype-note">Tahap 1–2 · Prototipe Beranda Proyek</p>
    </main>
  )
}