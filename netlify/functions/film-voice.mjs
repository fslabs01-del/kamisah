export const handler = async (event) => {
 const out=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8'},body:JSON.stringify(body)});
 if(event.httpMethod!=='POST') return out(405,{error:'Gunakan POST.'});
 const key=process.env.GEMINI_API_KEY;if(!key)return out(503,{error:'GEMINI_API_KEY belum dipasang di Netlify Environment Variables.'});
 try{
  const {text,voice='Kore'}=JSON.parse(event.body||'{}');
  if(!text||typeof text!=='string')return out(400,{error:'Naskah tidak ditemukan.'});
  if(text.length>28000)return out(413,{error:'Naskah terlalu panjang untuk satu permintaan suara. Pemecahan dan penggabungan audio bertahap perlu diaktifkan.'});
  const model=process.env.GEMINI_TTS_MODEL||'gemini-2.5-flash-preview-tts';
  const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:'Bacakan naskah berikut dalam Bahasa Indonesia dengan jelas dan alami. Jangan meringkas atau menambahkan kata.\\n\\n'+text}]}],generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:voice}}}}})});
  const data=await res.json();if(!res.ok)return out(res.status,{error:data.error?.message||'Pembuatan audio Gemini gagal.'});
  const parts=data.candidates?.[0]?.content?.parts||[];const audio=parts.find(p=>p.inlineData?.data)?.inlineData;
  if(!audio)return out(502,{error:'Gemini tidak mengembalikan data audio.'});
  return out(200,{audioBase64:audio.data,mimeType:audio.mimeType||'audio/pcm;rate=24000'});
 }catch(e){return out(500,{error:e.message||'Kesalahan saat membuat suara AI.'});}
};
