const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function headers(){return {apikey:SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,"Content-Type":"application/json"};}
function check(res){ if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Variáveis do Supabase não configuradas"); }

export default async function handler(req,res){
  try{
    check();
    const key = req.method==='POST' ? req.body?.key : req.query.key;
    if(!key || typeof key!=="string") return res.status(400).json({error:"key obrigatória"});
    const base=`${SUPABASE_URL}/rest/v1/app_data`;
    if(req.method==='GET'){
      const r=await fetch(`${base}?key=eq.${encodeURIComponent(key)}&select=key,value`,{headers:headers()});
      if(!r.ok) throw new Error(await r.text()); const rows=await r.json();
      if(!rows.length) return res.status(404).json({error:"não encontrado"});
      return res.status(200).json(rows[0]);
    }
    if(req.method==='POST'){
      if(!Object.prototype.hasOwnProperty.call(req.body||{},'value')) return res.status(400).json({error:"value obrigatório"});
      const r=await fetch(`${base}?on_conflict=key`,{method:'POST',headers:{...headers(),Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify([{key,value:req.body.value}])});
      if(!r.ok) throw new Error(await r.text()); return res.status(200).json({ok:true});
    }
    if(req.method==='DELETE'){
      const r=await fetch(`${base}?key=eq.${encodeURIComponent(key)}`,{method:'DELETE',headers:{...headers(),Prefer:'return=minimal'}});
      if(!r.ok) throw new Error(await r.text()); return res.status(200).json({ok:true});
    }
    res.setHeader('Allow','GET,POST,DELETE'); return res.status(405).json({error:'Método não permitido'});
  }catch(e){ console.error(e); return res.status(500).json({error:e.message||'Erro interno'}); }
}
