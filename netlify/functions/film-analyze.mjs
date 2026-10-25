const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8'},body:JSON.stringify(body)});
export const handler = async (event) => {
  if(event.httpMethod!=='POST') return json(405,{error:'Gunakan POST.'});
  const key=process.env.GEMINI_API_KEY;
  if(!key) return json(503,{error:'GEMINI_API_KEY belum dipasang di Netlify Environment Variables.'});
  try {
    const ct=event.headers['content-type']||event.headers['Content-Type']||'';
    if(!ct.includes('multipart/form-data')) return json(400,{error:'Unggah video melalui form.'});
    // Netlify multipart parsing support varies; reject unsupported body instead of pretending analysis succeeded.
    const body=event.isBase64Encoded?Buffer.from(event.body||'','base64'):Buffer.from(event.body||'','utf8');
    if(body.length>18*1024*1024) return json(413,{error:'Unggahan melewati batas 18 MB. Film panjang membutuhkan unggah langsung ke penyimpanan cloud.'});
    const boundary=(ct.match(/boundary=(?:"([^"]+)"|([^;]+))/i)||[]).slice(1).find(Boolean);
    if(!boundary) return json(400,{error:'Boundary multipart tidak ditemukan.'});
    const raw=body.toString('latin1');
    const marker='name="video"';
    const pos=raw.indexOf(marker);
    if(pos<0) return json(400,{error:'File video tidak ditemukan.'});
    const headEnd=raw.indexOf('\r\n\r\n',pos);
    const header=raw.slice(pos,headEnd);
    const filename=(header.match(/filename="([^"]+)"/i)||[])[1]||'film.mp4';
    const mime=(header.match(/Content-Type:\s*([^\r\n]+)/i)||[])[1]||'video/mp4';
    const start=headEnd+4, end=raw.indexOf('\r\n--'+boundary,start);
    if(end<0) return json(400,{error:'Data video tidak lengkap.'});
    const video=body.subarray(start,end);
    const startRes=await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(key)}`,{
      method:'POST',headers:{'X-Goog-Upload-Protocol':'resumable','X-Goog-Upload-Command':'start','X-Goog-Upload-Header-Content-Length':String(video.length),'X-Goog-Upload-Header-Content-Type':mime,'Content-Type':'application/json'},
      body:JSON.stringify({file:{display_name:filename}})
    });
    if(!startRes.ok) throw new Error('Gemini gagal memulai unggahan video: '+(await startRes.text()).slice(0,350));
    const uploadUrl=startRes.headers.get('x-goog-upload-url');
    if(!uploadUrl) throw new Error('Gemini tidak mengembalikan URL unggahan.');
    const uploadRes=await fetch(uploadUrl,{method:'POST',headers:{'X-Goog-Upload-Offset':'0','X-Goog-Upload-Command':'upload, finalize','Content-Length':String(video.length)},body:video});
    if(!uploadRes.ok) throw new Error('Unggahan ke Gemini gagal: '+(await uploadRes.text()).slice(0,350));
    const uploaded=await uploadRes.json(); let file=uploaded.file||uploaded;
    for(let i=0;i<24 && file.state && file.state!=='ACTIVE';i++){
      if(file.state==='FAILED') throw new Error('Gemini gagal memproses file video.');
      await new Promise(r=>setTimeout(r,2500));
      const poll=await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${encodeURIComponent(key)}`);
      if(!poll.ok) break; file=await poll.json();
    }
    if(!file.uri) throw new Error('Gemini belum menyediakan URI video. Coba lagi nanti.');
    const model=process.env.GEMINI_MODEL||'gemini-2.5-flash';
    const prompt=`Analisis video film yang diberikan dan tulis NASKAH ALUR CERITA LENGKAP dalam Bahasa Indonesia. Jangan hanya sinopsis. Susun kronologis dari awal hingga akhir, pecah menjadi adegan, dan untuk setiap adegan jelaskan perkiraan urutan/waktu jika dapat dikenali, lokasi, karakter yang terlihat, gerakan/tindakan konkret, interaksi, dialog yang benar-benar dapat dikenali, perubahan suasana, konflik, serta akibat kejadian terhadap cerita. Akhiri dengan penjelasan penutup film. Jangan mengarang detail atau dialog yang tidak bisa dipastikan; tandai bagian tidak jelas. Berikan judul dan heading yang rapi.`;
    const gen=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{file_data:{mime_type:file.mimeType||mime,file_uri:file.uri}},{text:prompt}]}],generationConfig:{temperature:0.25,maxOutputTokens:20000}})});
    const result=await gen.json();
    if(!gen.ok) throw new Error(result.error?.message||'Permintaan analisis Gemini gagal.');
    const script=(result.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('\n').trim();
    if(!script) throw new Error('Gemini tidak menghasilkan naskah.');
    return json(200,{script,filename:'Alur_Cerita_Film.txt'});
  } catch(e){return json(500,{error:e.message||'Kesalahan server saat analisis.'});}
};
