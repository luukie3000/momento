import { useEffect,useRef,useState,type ChangeEvent,type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Camera, Check, Cloud, Edit3, ImagePlus, MapPin, Search, Trash2, UploadCloud, X } from 'lucide-react';
import { photoFromFile, type Memory, type MemoryDraft, type Photo } from '../lib/momento';
import type { MomentoStore } from '../hooks/useMomento';
import { trackEvent } from '../lib/analytics';

type View = 'list'|'detail'|'editor'|'starting'|'guided'|'celebration';
const guideSteps=['Title','Story','Photo','Details','Save'];
const readableDate=(s:string)=>new Date(s+'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
function initialDraft(m:Memory|undefined,today:string):MemoryDraft {
  return m?{title:m.title,text:m.text,location:m.location,date:m.date,photos:m.photos}:{title:'',text:'',location:'',date:today,photos:[]};
}
export default function MemoryStudio({store,onClose,onAuth,initial='list',startingDraft,onFirstSaved}:{store:MomentoStore,onClose:()=>void,onAuth:()=>void,initial?:'list'|'editor'|'start',startingDraft?:MemoryDraft,onFirstSaved?:()=>void}) {
  const [view,setView]=useState<View>(initial==='list'?'list':'starting');
  const [selection,setSelection]=useState<Memory|null>(null);
  const [draft,setDraft]=useState<MemoryDraft>(()=>initial==='start'&&startingDraft?startingDraft:initialDraft(undefined,store.dateToday()));
  const [query,setQuery]=useState('');
  const [photosOnly,setPhotosOnly]=useState(false);
  const [sort,setSort]=useState<'newest'|'oldest'>('newest');
  const [problem,setProblem]=useState('');
  const [saving,setSaving]=useState(false);
  const [attaching,setAttaching]=useState(false);
  const [guideStep,setGuideStep]=useState(0);
  const stepHeadingRef=useRef<HTMLHeadingElement>(null);
  const celebrationRef=useRef<HTMLHeadingElement>(null);
  const uploadRef=useRef<HTMLInputElement>(null);
  const closeRef=useRef<HTMLButtonElement>(null);
  const initialEditorTracked=useRef(false);
  useEffect(()=>{closeRef.current?.focus();},[]);
  useEffect(()=>{
    if(view==='starting'&&store.journalReady){
      setView(store.canGuideFirstMemory?'guided':initial==='editor'?'editor':'list');
    }
  },[view,store.journalReady,store.canGuideFirstMemory,initial]);
  useEffect(()=>{
    if((view==='guided'||view==='editor')&&initial!=='list'&&!initialEditorTracked.current){
      initialEditorTracked.current=true;
      trackEvent('memory_editor_opened',{source:'journal',mode:store.user?'cloud':'guest'});
    }
  },[view,initial,store.user]);
  useEffect(()=>{
    if(view==='guided')stepHeadingRef.current?.focus();
    if(view==='celebration')celebrationRef.current?.focus();
  },[view,guideStep]);
  const openEditor=(m?:Memory)=>{
    trackEvent('memory_editor_opened',{source:m?'memory_detail':'journal',mode:store.user?'cloud':'guest'});
    setSelection(m||null);
    if(m||!store.canGuideFirstMemory)setDraft(initialDraft(m,store.dateToday()));
    setProblem('');setGuideStep(0);
    setView(!m&&store.canGuideFirstMemory?'guided':'editor');
  };
  const filtered=store.memories.filter(m=>{
    if(photosOnly&&!m.photos.length)return false;
    return [m.title,m.text,m.location,m.date].join(' ').toLowerCase().includes(query.trim().toLowerCase());
  }).sort((a,b)=>sort==='newest'?b.date.localeCompare(a.date):a.date.localeCompare(b.date));
  async function attach(event:ChangeEvent<HTMLInputElement>){
    const files=Array.from(event.target.files||[]);event.target.value='';
    if(!files.length)return;
    if(files.length+draft.photos.length>5){setProblem('You can add up to five photos per memory.');return;}
    setProblem('');setAttaching(true);
    try{const next:Photo[]=[];for(const file of files)next.push(await photoFromFile(file));setDraft(old=>({...old,photos:[...old.photos,...next]}));}
    catch(e){setProblem(e instanceof Error?e.message:'Could not attach photo.');}
    finally{setAttaching(false);}
  }
  async function submit(event:FormEvent){
    event.preventDefault();setProblem('');
    if(saving||attaching||store.loading)return;
    if(view==='guided'&&guideStep<4){
      if(guideStep===2&&!draft.text.trim()&&!draft.photos.length){setProblem('Write a few words or attach at least one photo.');return;}
      if(guideStep===3&&!draft.date){setProblem('Choose a date.');return;}
      setGuideStep(step=>step+1);return;
    }
    if(!draft.text.trim()&&!draft.photos.length){setProblem('Write a few words or attach at least one photo.');return;}
    if(!draft.date){setProblem('Choose a date.');return;}
    setSaving(true);
    try{
      const item=await store.save({...draft,title:draft.title.trim()||draft.text.trim().split('\n')[0].slice(0,58)||'A moment worth keeping',text:draft.text.trim(),location:draft.location.trim()},selection||undefined);
      setSelection(item);setView(view==='guided'?'celebration':'detail');
      if(view==='guided'&&initial==='start')onFirstSaved?.();
    }catch(e){setProblem(e instanceof Error?e.message:'Saving failed.');}
    finally{setSaving(false);}
  }
  async function remove(m:Memory){
    if(!window.confirm('Permanently delete this memory and its photos? This cannot be undone.'))return;
    try{await store.remove(m);setView('list');setSelection(null);}catch(e){setProblem(e instanceof Error?e.message:'Could not delete.');}
  }
  const selected=selection?store.memories.find(m=>m.id===selection.id)||selection:null;
  const photoFields=<> <div className="editor-photo-head"><span>YOUR PHOTOGRAPHS</span><small>UP TO 5 · JPG, PNG, WEBP</small></div><div className="editor-photo-list">{draft.photos.map(p=><div key={p.id} className="editor-photo"><img src={p.src||'/memory-wall.webp'} alt={p.name}/><button type="button" aria-label={`Remove ${p.name}`} title="Remove photo" disabled={attaching||saving} onClick={()=>setDraft({...draft,photos:draft.photos.filter(x=>x.id!==p.id)})}><X size={14}/></button></div>)}{draft.photos.length<5&&<button type="button" className="editor-add-photo" disabled={attaching||saving} onClick={()=>uploadRef.current?.click()}><ImagePlus size={22}/><span>{attaching?'ADDING...':'ADD PHOTO'}</span></button>}</div><input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e=>void attach(e)}/> </>;
  return <div className="product-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="product-dialog paper-surface" role="dialog" aria-modal="true" aria-label="Your MOMENTO journal">
      <header className="product-top"><span className="mini-overline">✳ &nbsp; MOMENTO / YOUR PERSONAL JOURNAL</span><div className="product-top-actions">{store.user?<span className="cloud-badge"><Cloud size={14}/> PRIVATE CLOUD JOURNAL</span>:<span className="cloud-badge guest"><Check size={14}/> PRIVATE ON THIS DEVICE</span>}<button ref={closeRef} className="product-close" onClick={onClose} aria-label="Close journal"><X size={21}/></button></div></header>
      {view==='starting'&&<div className="product-body" role="status"><p>Opening your little journal…</p></div>}
      {view==='guided'&&<div className="product-body first-memory-guide">
        <div className="first-memory-intro"><div className="eyebrow">✳ A LITTLE BEGINNING</div><h2>Let’s keep your<br/><em>first little moment.</em></h2><p>What happened recently that you’d like to remember?</p></div>
        <ol className="first-memory-progress" aria-label="Your first memory steps">{guideSteps.map((step,i)=><li key={step} className={i===guideStep?'current':i<guideStep?'complete':''} aria-current={i===guideStep?'step':undefined}><span aria-hidden="true">{i<guideStep?<Check size={13}/>:i+1}</span>{step}</li>)}</ol>
        <div className="first-memory-layout"><aside className="first-memory-art"><img src="/journal-window.webp" alt="Hand-drawn journal and keepsakes by a sunlit window"/><p className="first-memory-caption">The little things matter.<br/>This one is yours to keep.</p></aside>
          <form className="editor-form first-memory-form" aria-labelledby="first-memory-step" onSubmit={e=>void submit(e)}>
            <div className="first-memory-step"><span className="eyebrow">STEP {guideStep+1} OF 5</span><h3 id="first-memory-step" ref={stepHeadingRef} tabIndex={-1}>{['Give it a little name.','Tell a little of the story.','A picture, if you like.','Keep the little details.','Ready to tuck it away?'][guideStep]}</h3><p>{['A title can be as simple as “Sunday in the garden.”','A sentence is enough. What made this moment yours?','Add up to five photographs, or keep this memory in words.','When was it? Where were you? A place is optional.','A little preview of the moment you’re about to keep.'][guideStep]}</p></div>
            {guideStep===0&&<label>MEMORY TITLE<input maxLength={90} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} placeholder="That afternoon by the sea"/><small>A name is optional. Your first line can be the title.</small></label>}
            {guideStep===1&&<label>THE STORY<textarea rows={5} maxLength={20000} value={draft.text} onChange={e=>setDraft({...draft,text:e.target.value})} placeholder="We took the long way home, and…"/><small>Your words, however few. You can also let a photo tell the story.</small></label>}
            {guideStep===2&&photoFields}
            {guideStep===3&&<div className="editor-form-row"><label>DATE<input type="date" required value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value})}/></label><label>PLACE (OPTIONAL)<input maxLength={140} value={draft.location} onChange={e=>setDraft({...draft,location:e.target.value})} placeholder="Somewhere special"/></label></div>}
            {guideStep===4&&<div className="first-memory-preview">{draft.photos[0]&&<img src={draft.photos[0].src} alt="Your memory preview"/>}<div><h4>{draft.title.trim()||draft.text.trim().split('\n')[0].slice(0,58)||'A moment worth keeping'}</h4><p>{draft.text||'A picture worth keeping.'}</p><span className="first-memory-date">{draft.date&&readableDate(draft.date)}{draft.location&&` · ${draft.location}`}{draft.photos.length>0&&` · ${draft.photos.length} ${draft.photos.length===1?'photo':'photos'}`}</span></div></div>}
            {problem&&<p className="product-error" role="alert">{problem}</p>}
            <div className="first-memory-actions"><button type="button" className="product-back" disabled={saving||attaching||store.loading} onClick={()=>{setProblem('');if(guideStep>0)setGuideStep(step=>step-1);else setView('list');}}><ArrowLeft size={15}/>{guideStep===0?'BACK TO JOURNAL':'BACK'}</button><button type="submit" className="black-pill" disabled={saving||attaching||store.loading}>{saving?'TUCKING IT AWAY…':guideStep===4?'KEEP THIS MEMORY':guideStep===2&&!draft.photos.length?'SKIP PHOTO':'CONTINUE'} <ArrowRight size={16}/></button></div>
            <p className="form-disclaimer">{store.user?'Your words and photos stay private in your cloud journal.':'Saved privately on this device. You can create an account to sync it later.'}</p>
          </form>
        </div>
      </div>}
      {view==='celebration'&&selected&&<div className="product-body first-memory-celebration" role="status"><span className="first-memory-seal" aria-hidden="true"><Check size={32}/></span><div><div className="eyebrow">✳ THE FIRST OF MANY LITTLE CHAPTERS</div><h2 ref={celebrationRef} tabIndex={-1}>Your first memory<br/>is <em>tucked away.</em></h2><p>The little things matter. This one now has a home.</p><button className="black-pill" onClick={()=>setView('detail')}>VIEW MY MEMORY <ArrowRight size={16}/></button></div></div>}
      {view==='list'&&<div className="product-body">{store.error&&<p className="product-error" role="alert">{store.error}</p>}<div className="product-heading"><div><div className="eyebrow">A LIFE IN LITTLE CHAPTERS</div><h2>My little <em>collection.</em></h2><p>{store.memories.length===0?'Your very first page is waiting.':`${store.memories.length} ${store.memories.length===1?'memory':'memories'} worth keeping.`}</p></div><button className="black-pill" disabled={!store.journalReady} onClick={()=>openEditor()}>ADD A MEMORY <ArrowRight size={15}/></button></div>
        {store.user&&store.drafts.length>0&&<div className="sync-banner"><UploadCloud size={22}/><div><strong>{store.drafts.length} guest {store.drafts.length===1?'memory':'memories'} on this device.</strong><small>Save them to your private account so they appear across devices.</small></div><button onClick={onAuth}>IMPORT TO CLOUD →</button></div>}
        {!store.user&&store.cloudEnabled&&<div className="sync-banner"><Cloud size={23}/><div><strong>Take your memories with you.</strong><small>Sign up for a free account to sync them privately.</small></div><button onClick={onAuth}>SIGN IN →</button></div>}
        <div className="journal-toolbar"><label className="journal-search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search your memories or places..." aria-label="Search memories"/></label><button className={`journal-filter ${photosOnly?'active':''}`} onClick={()=>setPhotosOnly(s=>!s)}><Camera size={17}/> WITH PHOTOS</button><label className="journal-sort"><span>SORT</span><select value={sort} onChange={e=>setSort(e.target.value as 'newest'|'oldest')} aria-label="Sort memories"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label></div>
        {store.loading&&!store.ready?<p>Opening your journal...</p>:filtered.length?<div className="product-memory-grid">{filtered.map((m,i)=><article key={m.id} className={`product-memory-card angle-${i%3}`}><button className="product-memory-main" onClick={()=>{setSelection(m);setView('detail');setProblem('');}}><img loading="lazy" src={m.photos[0]?.src||'/journal-window.webp'} alt={m.photos.length?'Your attached memory photograph':'Vintage illustrated journal'} /><span className="product-memory-date">{readableDate(m.date).toUpperCase()}</span><h3>{m.title}</h3><p>{m.text||'A picture worth keeping.'}</p><span>{m.photos.length?`${m.photos.length} ${m.photos.length===1?'PHOTO':'PHOTOS'}`:'WORDS TO KEEP'} {m.location?` · ${m.location.toUpperCase()}`:''}</span></button></article>)}</div>:<div className="product-empty"><img src="/sunset-timecapsule.webp" alt="Illustrated memories at sunset"/><div><span className="star-char">✳</span><h3>{store.memories.length?'No memories match your search.':'Every story starts somewhere.'}</h3><p>{store.memories.length?'Try clearing the filters.':'Write a line, choose a date, and add a photograph if you wish.'}</p><button className="black-pill" disabled={!store.journalReady} onClick={()=>openEditor()}>START A MEMORY <ArrowRight size={15}/></button></div></div>}
      </div>}
      {view==='detail'&&selected&&<div className="product-body detail-product"><button className="product-back" onClick={()=>{setView('list');setProblem('');}}><ArrowLeft size={17}/> BACK TO JOURNAL</button><div className="detail-head"><div className="eyebrow">A MOMENT TO REVISIT</div><h2>{selected.title}</h2><div className="detail-meta"><CalendarDays size={15}/>{readableDate(selected.date)}{selected.location&&<><MapPin size={15}/>{selected.location}</>}</div></div>{selected.photos.length>0&&<div className={`detail-photo-grid ${selected.photos.length===1?'single':''}`}>{selected.photos.map(p=><a key={p.id} href={p.src||undefined} onClick={e=>{if(!p.src)e.preventDefault();}} target="_blank" rel="noreferrer" title={`Open ${p.name}`}><img src={p.src||'/memory-wall.webp'} alt={p.name}/></a>)}</div>}<p className="detail-story-new">{selected.text||'Sometimes, a photo says it all.'}</p><div className="detail-actions"><button className="black-pill" onClick={()=>openEditor(selected)}><Edit3 size={15}/> EDIT MEMORY</button><button className="text-danger" onClick={()=>void remove(selected)}><Trash2 size={16}/> DELETE MEMORY</button></div>{problem&&<p className="product-error" role="alert">{problem}</p>}</div>}
      {view==='editor'&&<div className="product-body"><button className="product-back" onClick={()=>setView(selection?'detail':'list')}><ArrowLeft size={17}/> {selection?'BACK TO MEMORY':'BACK TO JOURNAL'}</button><div className="editor-layout"><div className="editor-copy"><div className="eyebrow">✳ {selection?'YOUR STORY, REVISITED':'MAKE A MEMORY'}</div><h2>{selection?'Edit this':'A page for'}<br/><em>{selection?'little story.':'today.'}</em></h2><p>Words, pictures, and the little details that make this moment yours.</p><img src="/keepsake-shelf.webp" alt="Illustrated books, framed photo and keepsakes"/></div><form onSubmit={e=>void submit(e)} className="editor-form"><label>MEMORY TITLE<input maxLength={90} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} placeholder="That afternoon by the sea"/></label><div className="editor-form-row"><label>DATE<input type="date" required value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value})}/></label><label>PLACE (OPTIONAL)<input value={draft.location} maxLength={140} onChange={e=>setDraft({...draft,location:e.target.value})} placeholder="Somewhere special"/></label></div><label>THE STORY<textarea rows={5} maxLength={20000} value={draft.text} onChange={e=>setDraft({...draft,text:e.target.value})} placeholder="Everything you never want to forget..."/></label>{photoFields}{problem&&<p className="product-error" role="alert">{problem}</p>}<button disabled={saving||store.loading||attaching} className="black-pill editor-submit" type="submit">{saving?'SAVING...':selection?'SAVE CHANGES':'KEEP THIS MEMORY'} <ArrowRight size={16}/></button><p className="form-disclaimer">{store.user?'Your words and photos are private in your cloud account.':'This guest journal is saved on this device until you choose to sign in and import it.'}</p></form></div></div>}
    </section>
  </div>;
}
