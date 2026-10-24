import { MoreVertical, Film, Images } from 'lucide-react'

export default function ProjectCard({ project, onOpen, onRename, onDelete }) {
  const menu = () => {
    const choice = window.prompt(`Proyek: ${project.name}\nKetik "nama" untuk mengganti nama atau "hapus" untuk menghapus.`)
    if (choice?.toLowerCase() === 'nama') {
      const name = window.prompt('Nama proyek baru:', project.name)
      if (name?.trim()) onRename(project.id, name)
    } else if (choice?.toLowerCase() === 'hapus') {
      if (window.confirm(`Hapus proyek "${project.name}"?`)) onDelete(project.id)
    }
  }

  return (
    <article className="project-card">
      <button className="project-thumb" onClick={() => onOpen(project.id)} aria-label={`Buka ${project.name}`}>
        {project.thumbnail
          ? <img src={project.thumbnail} alt="" loading="lazy" />
          : <div className="thumb-empty"><Film size={28} /></div>}
      </button>
      <button className="project-info" onClick={() => onOpen(project.id)}>
        <strong>{project.name}</strong>
        <span>{project.updatedAt || 'Baru dibuat'}</span>
        <span className="project-counts"><span><Film size={15} /> {project.videoCount ?? 0}</span><span><Images size={15} /> {project.imageCount ?? 0}</span></span>
      </button>
      <button className="icon-button project-menu" onClick={menu} aria-label={`Menu ${project.name}`}><MoreVertical size={20} /></button>
    </article>
  )
}