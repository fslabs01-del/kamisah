// Menempelkan token login ke panggilan fungsi Netlify (untuk halaman beranda & Story). Tidak aktif bila config.js kosong.
(function () {
  const c = window.KH || {};
  if (!c.SUPABASE_URL || !c.SUPABASE_PUBLISHABLE_KEY || !window.supabase) return;
  const sb = supabase.createClient(c.SUPABASE_URL, c.SUPABASE_PUBLISHABLE_KEY), f = window.fetch.bind(window);
  window.fetch = async (u, o = {}) => {
    const url = typeof u === 'string' ? u : (u && u.url) || '';
    if (!url.includes('/.netlify/functions/')) return f(u, o);
    const { data } = await sb.auth.getSession(), h = new Headers(o.headers || {});
    if (data.session) h.set('Authorization', 'Bearer ' + data.session.access_token);
    const r = await f(u, { ...o, headers: h });
    if (r.status === 401 && confirm('Fitur ini butuh login. Buka halaman Akun?')) location.href = '/video-generator#/akun';
    return r;
  };
})();
