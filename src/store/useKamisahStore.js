import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

const makeProject = (name = 'Proyek Baru') => ({
  id: crypto.randomUUID(),
  name,
  updatedAt: new Date().toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
  videoCount: 0,
  imageCount: 0,
  thumbnail: '',
  assets: [],
  generations: []
})

export const useKamisahStore = create(persist((set, get) => ({
  projects: [],
  activeProjectId: null,
  promptState: {
    text: '',
    attachedAssets: [],
    settings: { contentType: 'video', model: 'Veo 2.5', orientation: '16:9', resolution: '720p', duration: 8, outputs: 1 }
  },
  generationQueue: [],
  generationHistory: [],

  createProject: (name) => {
    const project = makeProject(name?.trim() || 'Proyek Baru')
    set(state => ({ projects: [project, ...state.projects], activeProjectId: project.id }))
    return project
  },
  openProject: (id) => set({ activeProjectId: id }),
  closeProject: () => set({ activeProjectId: null }),
  renameProject: (id, name) => set(state => ({
    projects: state.projects.map(p => p.id === id ? { ...p, name: name.trim() || p.name } : p)
  })),
  deleteProject: (id) => set(state => ({
    projects: state.projects.filter(p => p.id !== id),
    activeProjectId: state.activeProjectId === id ? null : state.activeProjectId
  })),
  setPromptText: (text) => set(state => ({ promptState: { ...state.promptState, text } })),
  setAttachedAssets: (assets) => set(state => ({ promptState: { ...state.promptState, attachedAssets: assets } })),
  setGenerationSettings: (settings) => set(state => ({
    promptState: { ...state.promptState, settings: { ...state.promptState.settings, ...settings } }
  })),

  // Frontend queue model only. Connect enqueueGeneration to the real backend in a later phase.
  enqueueGeneration: ({ prompt, assets, settings, projectId }) => {
    const job = {
      id: crypto.randomUUID(),
      projectId: projectId ?? get().activeProjectId,
      prompt,
      assets: assets ?? [...get().promptState.attachedAssets],
      settings: { ...get().promptState.settings, ...(settings || {}) },
      status: 'queued',
      progress: null,
      loadingMessageIndex: 0,
      createdAt: new Date().toISOString()
    }
    set(state => ({
      generationQueue: [job, ...state.generationQueue],
      generationHistory: [job, ...state.generationHistory],
      promptState: { ...state.promptState, text: '', attachedAssets: [] }
    }))
    return job
  },
  updateGeneration: (id, patch) => set(state => ({
    generationQueue: state.generationQueue.map(job => job.id === id ? { ...job, ...patch } : job),
    generationHistory: state.generationHistory.map(job => job.id === id ? { ...job, ...patch } : job)
  }))
}), {
  name: 'kamisah-phase1-state',
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    projects: state.projects,
    activeProjectId: state.activeProjectId,
    promptState: state.promptState,
    generationQueue: state.generationQueue,
    generationHistory: state.generationHistory
  })
}))