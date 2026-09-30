import { useEffect,useRef,useState,type ChangeEvent,type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Camera, Check, Cloud, Edit3, ImagePlus, MapPin, Search, Trash2, UploadCloud, X } from 'lucide-react';
import { photoFromFile, type Memory, type MemoryDraft, type Photo } from '../lib/momento';
import type { MomentoStore } from '../hooks/useMomento';
import { trackEvent } from '../lib/analytics';

type View = 'list'|'detail'|'editor';
const readableDate=(s:string)=>new Date(s+'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
function initialDraft(m:Memory|undefined,today:string):MemoryDraft {
  return m?{title:m.title,text:m.text,location:m.location,date:m.date,photos:m.photos}:{title:'',text:'',location:'',date:today,photos:[]};
}
export default function MemoryStudio({store,onClose,onAuth,initial='list'}:{store:MomentoStore,onClose:()=>void,onAuth:()=>void,initial?:'list'|'editor'}) {
  const [view,setView]=useState<View>(initial);
  const [selection,setSelection]=useState<Memory|null>(null);
  const [draft,setDraft]=useState<MemoryDraft>(()=>initialDraft(undefined,store.dateToday()));
  const [query,setQuery]=useState('');
  const [photosOnly,setPhotosOnly]=useState(false);
  const [sort,setSort]=useState<'newest'|'oldest'>('newest');
  const [problem,setProblem]=useState('');
  const [saving,setSaving]=useState(false);
  const uploadRef=useRef<HTMLInputElement>(null);
  const closeRef=useRef<HTMLButtonElement>(null);
  const initialEditorTracked=useRef(false);
  useEffect(()=>{closeRef.current?.focus();},[]);
  useEffect(()=>{
    if(initial==='editor'&&!initialEditorTracked.current){
      initialEditorTracked.current=true;
      trackEvent('memory_editor_opened',{source:'journal',mode:store.user?'cloud':'guest'});
    }
  },[initial,store.user]);
  const openEditor=(m?:Memory)=>{trackEvent('memory_editor_opened',{source:m?'memory_detail':'journal',mode:store.user?'cloud':'guest'});setSelection(m||null);setDraft(initialDraft(m,store.dateToday()));setProblem('');setView('editor');};
  const filtered=store.memories.filter(m=>{
    if(photosOnly&&!m.photos.length)return false;
    return [m.title,m.text,m.location,m.date].join(' ').toLowerCase().includes(query.trim().toLowerCase());
  }).sort((a,b)=>sort==='newest'?b.date.localeCompare(a.date):a.date.localeCompare(b.date));
  async function attach(event:ChangeEvent<HTMLInputElement>){
    const files=Array.from(event.target.files||[]);event.target.value='';
    if(!files.length)return;
    if(files.length+draft.photos.length>5){setProblem('You can add up to five photos per memory.');return;}
    setProblem('');
    try{const next:Photo[]=[];for(const file of files)next.push(await photoFromFile(file));setDraft(old=>({...old,photos:[...old.photos,...next]}));}
    catch(e){setProblem(e instanceof Error?e.message:'Could not attach photo.');}
  }
  async function submit(event:FormEvent){
    event.preventDefault();setProblem('');
    if(!draft.text.trim()&&!draft.photos.length){setProblem('Write a few words or attach at least one photo.');return;}
    if(!draft.date){setProblem('Choose a date.');return;}
    setSaving(true);
    try{
      const item=await store.save({...draft,title:draft.title.trim()||draft.text.trim().split('\n')[0].slice(0,58)||'A moment worth keeping',text:draft.text.trim(),location:draft.location.trim()},selection||undefined);
      setSelection(item);setView('detail');
    }catch(e){setProblem(e instanceof Error?e.message:'Saving failed.');}
    finally{setSaving(false);}
  }
  async function remove(m:Memory){
    if(!window.confirm('Permanently delete this memory and its photos? This cannot be undone.'))return;
    try{await store.remove(m);setView('list');setSelection(null);}catch(e){setProblem(e instanceof Error?e.message:'Could not delete.');}
  }
  const selected=selection?store.memories.find(m=>m.id===selection.id)||selection:null;
  return <div className="product-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="product-dialog paper-surface" role="dialog" aria-modal="true" aria-label="Your MOMENTO journal">
      <header className="product-top"><span className="mini-overline">✳ &nbsp; MOMENTO / YOUR PERSONAL JOURNAL</span><div className="product-top-actions">{store.user?<span className="cloud-badge"><Cloud size={14}/> PRIVATE CLOUD JOURNAL</span>:<span className="cloud-badge guest"><Check size={14}/> PRIVATE ON THIS DEVICE</span>}<button ref={closeRef} className="product-close" onClick={onClose} aria-label="Close journal"><X size={21}/></button></div></header>
      {view==='list'&&<div className="product-body"><div className="product-heading"><div><div className="eyebrow">A LIFE IN LITTLE CHAPTERS</div><h2>My little <em>collection.</em></h2><p>{store.memories.length===0?'Your very first page is waiting.':`${store.memories.length} ${store.memories.length===1?'memory':'memories'} worth keeping.`}</p></div><button className="black-pill" onClick={()=>openEditor()}>ADD A MEMORY <ArrowRight size={15}/></button></div>
        {store.user&&store.drafts.length>0&&<div className="sync-banner"><UploadCloud size={22}/><div><strong>{store.drafts.length} guest {store.drafts.length===1?'memory':'memories'} on this device.</strong><small>Save them to your private account so they appear across devices.</small></div><button onClick={onAuth}>IMPORT TO CLOUD →</button></div>}
        {!store.user&&store.cloudEnabled&&<div className="sync-banner"><Cloud size={23}/><div><strong>Take your memories with you.</strong><small>Sign up for a free account to sync them privately.</small></div><button onClick={onAuth}>SIGN IN →</button></div>}
        <div className="journal-toolbar"><label className="journal-search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search your memories or places..." aria-label="Search memories"/></label><button className={`journal-filter ${photosOnly?'active':''}`} onClick={()=>setPhotosOnly(s=>!s)}><Camera size={17}/> WITH PHOTOS</button><label className="journal-sort"><span>SORT</span><select value={sort} onChange={e=>setSort(e.target.value as 'newest'|'oldest')} aria-label="Sort memories"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label></div>
        {store.loading&&!store.ready?<p>Opening your journal...</p>:filtered.length?<div className="product-memory-grid">{filtered.map((m,i)=><article key={m.id} className={`product-memory-card angle-${i%3}`}><button className="product-memory-main" onClick={()=>{setSelection(m);setView('detail');setProblem('');}}><img loading="lazy" src={m.photos[0]?.src||'/journal-window.webp'} alt={m.photos.length?'Your attached memory photograph':'Vintage illustrated journal'} /><span className="product-memory-date">{readableDate(m.date).toUpperCase()}</span><h3>{m.title}</h3><p>{m.text||'A picture worth keeping.'}</p><span>{m.photos.length?`${m.photos.length} ${m.photos.length===1?'PHOTO':'PHOTOS'}`:'WORDS TO KEEP'} {m.location?` · ${m.location.toUpperCase()}`:''}</span></button></article>)}</div>:<div className="product-empty"><img src="/sunset-timecapsule.webp" alt="Illustrated memories at sunset"/><div><span className="star-char">✳</span><h3>{store.memories.length?'No memories match your search.':'Every story starts somewhere.'}</h3><p>{store.memories.length?'Try clearing the filters.':'Write a line, choose a date, and add a photograph if you wish.'}</p><button className="black-pill" onClick={()=>openEditor()}>START A MEMORY <ArrowRight size={15}/></button></div></div>}
      </div>}
      {view==='detail'&&selected&&<div className="product-body detail-product"><button className="product-back" onClick={()=>{setView('list');setProblem('');}}><ArrowLeft size={17}/> BACK TO JOURNAL</button><div className="detail-head"><div className="eyebrow">A MOMENT TO REVISIT</div><h2>{selected.title}</h2><div className="detail-meta"><CalendarDays size={15}/>{readableDate(selected.date)}{selected.location&&<><MapPin size={15}/>{selected.location}</>}</div></div>{selected.photos.length>0&&<div className={`detail-photo-grid ${selected.photos.length===1?'single':''}`}>{selected.photos.map(p=><a key={p.id} href={p.src||undefined} onClick={e=>{if(!p.src)e.preventDefault();}} target="_blank" rel="noreferrer" title={`Open ${p.name}`}><img src={p.src||'/memory-wall.webp'} alt={p.name}/></a>)}</div>}<p className="detail-story-new">{selected.text||'Sometimes, a photo says it all.'}</p><div className="detail-actions"><button className="black-pill" onClick={()=>openEditor(selected)}><Edit3 size={15}/> EDIT MEMORY</button><button className="text-danger" onClick={()=>void remove(selected)}><Trash2 size={16}/> DELETE MEMORY</button></div>{problem&&<p className="product-error" role="alert">{problem}</p>}</div>}
      {view==='editor'&&<div className="product-body"><button className="product-back" onClick={()=>setView(selection?'detail':'list')}><ArrowLeft size={17}/> {selection?'BACK TO MEMORY':'BACK TO JOURNAL'}</button><div className="editor-layout"><div className="editor-copy"><div className="eyebrow">✳ {selection?'YOUR STORY, REVISITED':'MAKE A MEMORY'}</div><h2>{selection?'Edit this':'A page for'}<br/><em>{selection?'little story.':'today.'}</em></h2><p>Words, pictures, and the little details that make this moment yours.</p><img src="/keepsake-shelf.webp" alt="Illustrated books, framed photo and keepsakes"/></div><form onSubmit={e=>void submit(e)} className="editor-form"><label>MEMORY TITLE<input maxLength={90} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} placeholder="That afternoon by the sea"/></label><div className="editor-form-row"><label>DATE<input type="date" required value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value})}/></label><label>PLACE (OPTIONAL)<input value={draft.location} maxLength={140} onChange={e=>setDraft({...draft,location:e.target.value})} placeholder="Somewhere special"/></label></div><label>THE STORY<textarea rows={5} maxLength={20000} value={draft.text} onChange={e=>setDraft({...draft,text:e.target.value})} placeholder="Everything you never want to forget..."/></label><div className="editor-photo-head"><span>YOUR PHOTOGRAPHS</span><small>UP TO 5 · JPG, PNG, WEBP</small></div><div className="editor-photo-list">{draft.photos.map(p=><div key={p.id} className="editor-photo"><img src={p.src||'/memory-wall.webp'} alt={p.name}/><button type="button" aria-label={`Remove ${p.name}`} title="Remove photo" onClick={()=>setDraft({...draft,photos:draft.photos.filter(x=>x.id!==p.id)})}><X size={14}/></button></div>)}{draft.photos.length<5&&<button type="button" className="editor-add-photo" onClick={()=>uploadRef.current?.click()}><ImagePlus size={22}/><span>ADD PHOTO</span></button>}</div><input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e=>void attach(e)}/>{problem&&<p className="product-error" role="alert">{problem}</p>}<button disabled={saving||store.loading} className="black-pill editor-submit" type="submit">{saving?'SAVING...':selection?'SAVE CHANGES':'KEEP THIS MEMORY'} <ArrowRight size={16}/></button><p className="form-disclaimer">{store.user?'Your words and photos are private in your cloud account.':'This guest journal is saved on this device until you choose to sign in and import it.'}</p></form></div></div>}
    </section>
  </div>;
}
