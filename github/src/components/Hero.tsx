import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, Menu, Paperclip, Upload, X, Cloud, MessageCircle, UserRound } from 'lucide-react';
import { useMomento } from '@/hooks/useMomento';
import { photoFromFile, type Photo } from '@/lib/momento';
import MemoryStudio from '@/components/MemoryStudio';
import AccountDialog from '@/components/AccountDialog';
import BetaDialog from '@/components/BetaDialog';
import { trackEvent, type AnalyticsSource } from '@/lib/analytics';

// The hero reuses the exact moving landscape from the supplied Wandor prompt.
// A bundled hand-drawn ambient animation is used only if the remote host is unavailable.
const ORIGINAL_WANDOR_VIDEO = 'https://pollen-batch-41236914.figma.site/_components/v2/f0ee2dae7671c170c34f12e31c4cb41418976c98/769c564298c132f7919405cd9f17c1b1231f341d.769c5642.mp4';
const PROMPT = 'That evening by the sea... warm air, little cafés, and the kind of laughter you wish you could bottle forever.';
type Panel = 'journal' | 'account' | 'feedback' | null;

const examples = [
  { image: '/memory-wall.webp', stamp: '01 / FAR AWAY', title: 'The long way home', date: 'THE LITTLE DETOURS', description: 'For the days when getting lost was the best part.' },
  { image: '/journey-map.webp', stamp: '02 / OUT THERE', title: 'Somewhere in between', date: 'A DIFFERENT VIEW', description: 'For the places you never expected to love.' },
  { image: '/keepsake-shelf.webp', stamp: '03 / RIGHT HERE', title: 'A day to keep', date: 'THE SLOW AFTERNOONS', description: 'For the ordinary things that turn extraordinary.' },
];

export default function Hero() {
  const store = useMomento();
  const fileRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [text,setText] = useState('');
  const [composePhotos,setComposePhotos] = useState<Photo[]>([]);
  const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState(false);
  const [panel,setPanel] = useState<Panel>(null);
  const [studioInitial,setStudioInitial] = useState<'list'|'editor'>('list');
  const [mobileMenu,setMobileMenu] = useState(false);
  const [useBackupVideo,setUseBackupVideo] = useState(false);
  const openJournal = (initial:'list'|'editor'='list',source:AnalyticsSource='composer') => {
    if(panel!=='journal')trackEvent('journal_opened',{source,mode:store.user?'cloud':'guest'});
    setStudioInitial(initial);setPanel('journal');setMobileMenu(false);
  };
  const startComposer=(source:AnalyticsSource)=>{trackEvent('hero_start_journal_clicked',{source});focusComposer();};
  useEffect(() => {
    document.body.style.overflow = panel ? 'hidden' : '';
    return () => {document.body.style.overflow = '';};
  }, [panel]);
  useEffect(() => {
    const listener=(event:globalThis.KeyboardEvent) => {if(event.key==='Escape'){setPanel(null);setMobileMenu(false);}};
    document.addEventListener('keydown',listener);
    return () => document.removeEventListener('keydown',listener);
  }, []);
  useEffect(() => {
    const targets=document.querySelectorAll<HTMLElement>('[data-reveal]');
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||!('IntersectionObserver' in window)){
      targets.forEach(el=>el.classList.add('is-visible'));return;
    }
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
      if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}
    }),{threshold:.12,rootMargin:'0px 0px -40px 0px'});
    targets.forEach(el=>observer.observe(el));
    return ()=>observer.disconnect();
  }, []);
  function focusComposer(){setPanel(null);setMobileMenu(false);document.getElementById('home')?.scrollIntoView({behavior:'smooth'});window.setTimeout(()=>promptRef.current?.focus({preventScroll:true}),450);}
  function visitSection(section:string){setMobileMenu(false);document.getElementById(section)?.scrollIntoView({behavior:'smooth'});}
  async function attachPhoto(event:ChangeEvent<HTMLInputElement>){
    const files=Array.from(event.target.files||[]);event.target.value='';
    if(composePhotos.length+files.length>5){setNotice('Add up to five photographs per memory.');return;}
    setBusy(true);
    try{const photos:Photo[]=[];for(const f of files)photos.push(await photoFromFile(f));setComposePhotos(old=>[...old,...photos]);setNotice(`${photos.length} ${photos.length===1?'photo':'photos'} attached.`);}
    catch(e){setNotice(e instanceof Error?e.message:'Could not open the image.');}
    finally{setBusy(false);}
  }
  async function saveMemory(){
    if(!text.trim()&&!composePhotos.length){setNotice('Write a little story or attach a photograph first.');promptRef.current?.focus();return;}
    setBusy(true);
    try{
      await store.save({title:text.trim().split(/[.!?\n]/)[0].slice(0,80)||'A little moment',text:text.trim(),date:store.dateToday(),location:'',photos:composePhotos},undefined,'composer');
      setText('');setComposePhotos([]);setNotice(store.user?'Saved to your private cloud journal.':'Saved on this device. Sign in anytime to sync your memories.');
      openJournal();
    }catch(e){setNotice(e instanceof Error?e.message:'Could not save your memory.');}
    finally{setBusy(false);}
  }
  function onTextareaKeyDown(event:KeyboardEvent<HTMLTextAreaElement>){if((event.metaKey||event.ctrlKey)&&event.key==='Enter')void saveMemory();}
  const memories=store.memories;

  return <div className="momento-site">
    <section id="home" className={`hero-scene${useBackupVideo ? ' using-backup-video' : ''}`} aria-label="Momento homepage">
      <div className="world-motion" aria-hidden="true">
        <div className="world-still" />
        <video
          className="world-video"
          src={useBackupVideo ? '/momento-ambient.mp4' : ORIGINAL_WANDOR_VIDEO}
          data-fallback-src="/momento-ambient.mp4"
          onError={() => { if (!useBackupVideo) setUseBackupVideo(true); }}
          autoPlay muted loop playsInline preload="auto"
          poster="/illustrated-landscape.jpg"
          aria-hidden="true"
        />
      </div>
      {/* The exact original footage already contains illustrated clouds and birds. */}
      {useBackupVideo && <>
        <img className="cloud cloud-one" src="/cloud-left.png" alt="" aria-hidden="true" />
        <img className="cloud cloud-two" src="/cloud-right.png" alt="" aria-hidden="true" />
        <img className="birds birds-one" src="/ink-birds.png" alt="" aria-hidden="true" />
        <img className="birds birds-two" src="/ink-birds.png" alt="" aria-hidden="true" />
      </>}
      <div className="hero-wash" aria-hidden="true" />
      <div className="hero-shell">
        <nav className="top-nav" aria-label="Main navigation">
          <button className="wordmark" onClick={focusComposer} aria-label="Momento home">momento<span className="wordmark-dot">.</span></button>
          <div className="nav-middle">
            <button onClick={() => visitSection('keepsakes')}>DISCOVER</button>
            <button onClick={() => visitSection('how-it-works')}>HOW IT WORKS</button>
            <button onClick={() => visitSection('our-story')}>OUR STORY</button>
          </div>
          <div className="nav-actions"><button className="nav-journal" onClick={() => openJournal('list','navigation')}>MY JOURNAL{memories.length > 0 && <sup>{memories.length}</sup>}</button><button className="nav-account" onClick={()=>setPanel('account')}><UserRound size={15}/> {store.user?(store.profile.display_name||'MY PROFILE'):'SIGN IN'}</button><button className="black-pill nav-add" onClick={()=>startComposer('navigation')}>ADD A MEMORY <ArrowUpRight size={14}/></button><button className="mobile-menu-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label={mobileMenu ? 'Close menu' : 'Open menu'} aria-expanded={mobileMenu}>{mobileMenu ? <X size={23}/> : <Menu size={23}/>}</button></div>
        </nav>
        {mobileMenu && <div className="mobile-dropdown"><button onClick={() => visitSection('keepsakes')}>DISCOVER</button><button onClick={() => visitSection('how-it-works')}>HOW IT WORKS</button><button onClick={() => visitSection('our-story')}>OUR STORY</button><button onClick={() => openJournal('list','menu')}>MY JOURNAL</button><button onClick={()=>{setPanel('account');setMobileMenu(false);}}>ACCOUNT</button><button onClick={()=>{setPanel('feedback');setMobileMenu(false);}}>GIVE FEEDBACK</button></div>}
        <main className="hero-content">
          <h1>Every moment<br className="hero-heading-break"/> has a story<span className="hero-period">.</span></h1>
          <p className="hero-subtitle">A little home for the days you never want to forget.<br className="desktop-only"/> Keep the photos, places, and stories that made them yours.</p>
          <div className="prompt-glass">
            <label className="sr-only" htmlFor="memory-entry">Write your memory</label>
            <textarea id="memory-entry" ref={promptRef} onFocus={()=>trackEvent('memory_editor_opened',{source:'composer',mode:store.user?'cloud':'guest'})} value={text} onChange={e => setText(e.target.value)} onKeyDown={onTextareaKeyDown} spellCheck placeholder={PROMPT} aria-describedby="memory-hint" />
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={attachPhoto} className="sr-only-file" aria-label="Choose a photo" />
            <div className="prompt-bottom"><div className="prompt-attach"><button className="upload-circle" type="button" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Attach a photograph" title="Attach a photograph"><Upload size={18} strokeWidth={1.8}/></button>{composePhotos.length>0 && <span className="attached-name"><Paperclip size={13}/>{composePhotos.length} {composePhotos.length===1?'PHOTO':'PHOTOS'} <button className="remove-attachments" type="button" onClick={()=>setComposePhotos([])} aria-label="Remove attached photographs"><X size={12}/></button></span>}<span className="hint-text" id="memory-hint">{store.user?'Saved to your private account':'A moment worth keeping'}</span></div><button className="black-pill save-button" type="button" onClick={() => void saveMemory()} disabled={busy||store.loading}>{busy||store.loading ? 'SAVING...' : 'SAVE MEMORY'} <ArrowUpRight size={15}/></button></div>
          </div>
          {notice && <div role="status" aria-live="polite" className="status-message">{notice}</div>}
          <button className="open-journal-link" onClick={() => {trackEvent('hero_start_journal_clicked',{source:'hero'});openJournal('list','hero');}}>OPEN YOUR JOURNAL <ArrowUpRight size={14}/></button>
        </main>
      </div>
      <div className="hero-bottom-text" aria-hidden="true"><span>COLLECTED WITH CARE</span><span>EST. TODAY · MADE TO LAST</span></div>
      <a className="scroll-cue" href="#keepsakes" aria-label="Scroll to discover Momento"><span>SCROLL TO DISCOVER</span><ArrowDownRight size={16}/></a>
    </section>

    <section id="keepsakes" className="intro-section paper-surface section-pad" aria-label="A home for your memories">
      <div className="ink-rule" aria-hidden="true" />
      <div className="section-shell intro-layout">
        <div className="intro-copy" data-reveal><div className="eyebrow"><span className="star-char">✳</span> THE ART OF REMEMBERING <span className="eyebrow-index">/ 001</span></div><h2>For all the<br/><em>little things</em><br/>that mean a lot.</h2><p>Not every memory is a milestone. Sometimes it's the sun through the window, a conversation that lasted too long, or a place you wish you could visit again.</p><p>Give those moments a place to live.</p><button className="text-arrow" onClick={()=>startComposer('intro')}>START YOUR STORY <ArrowUpRight size={18}/></button></div>
        <div className="keepsake-illustration">
          <div className="loose-postcard main-postcard"><div className="postcard-img postcard-photo-main"><img src="/journey-map.webp" alt="Vintage illustrated journey across the coast"/></div><div className="postcard-caption"><span>somewhere wonderful</span><span>NO. 001</span></div></div>
          <div className="loose-postcard mini-postcard"><img src="/sunset-timecapsule.webp" alt="Vintage hand-drawn garden at sunset with a memory box"/><span>the little detours.</span></div>
          <div className="round-postmark" aria-hidden="true"><span>FOR THE</span><strong>good<br/>old days</strong><span>✳ & ALWAYS ✳</span></div>
          <div className="ink-scribble" aria-hidden="true">✺</div>
        </div>
      </div>
    </section>

    <section className="features-section paper-surface section-pad" aria-labelledby="features-heading">
      <div className="section-shell">
        <div className="features-head" data-reveal><div className="eyebrow"><span className="star-char">✳</span> YOUR STORY, YOUR WAY <span className="eyebrow-index">/ 002</span></div><div className="features-heading-row"><h2 id="features-heading">More than just<br/>a <em>camera roll.</em></h2><p>Little details have a way of fading. Make a home for the whole story, not just the photograph.</p></div></div>
        <div className="features-editorial">
          <article className="editorial-feature feature-one"><div className="feature-paper feature-photo"><div className="feature-number">01 / CAPTURE</div><div className="feature-visual"><img src="/journal-window.webp" alt="New original illustration of a scrapbook and photographs beside a sunlit window"/></div><div className="feature-flourish" aria-hidden="true">✷</div></div><h3>Save what it felt like.</h3><p>Write the words, attach the photograph, and hold on to all those small details.</p></article>
          <article className="editorial-feature feature-two" data-reveal><div className="feature-paper notebook"><div className="feature-number">02 / COLLECT</div><div className="notebook-lines"><div className="notebook-date">A PAGE FROM YOUR JOURNAL</div><div className="notebook-writing">Dear diary,<br/><br/>We took the long way home today. I think that made it even better.</div><span className="notebook-flower">✳</span></div><span className="notebook-corner">✴</span></div><h3>A journal that's yours.</h3><p>Every story joins your own collection of days, ready whenever you want to revisit them.</p></article>
          <article className="editorial-feature feature-three"><div className="feature-paper feature-photo film-paper"><div className="feature-number">03 / REDISCOVER</div><div className="film-photo"><img src="/keepsake-shelf.webp" alt="New original illustration of family photo albums, letters and keepsakes"/><div className="film-date">OCTOBER, SOMEWHERE</div></div><span className="film-stamp">KEEP<br/>FOREVER</span></div><h3>Go back for a moment.</h3><p>Open your journal and find the places, people, and moments that stayed with you.</p></article>
        </div>
      </div>
    </section>

    <section id="illustrated-stories" className="illustrated-stories paper-surface" aria-labelledby="illustrations-heading">
      <div className="section-shell">
        <div className="illustrated-header" data-reveal>
          <div className="eyebrow"><span className="star-char">✳</span> A WORLD OF LITTLE STORIES <span className="eyebrow-index">/ 003</span></div>
          <h2 id="illustrations-heading">Made to <em>remember.</em></h2>
          <p>Original, hand-drawn moments. A different little world for each story you keep.</p>
        </div>
        <div className="living-row">
          <div className="living-media living-journal">
            <img className="living-art" src="/memory-journal.webp" alt="Hand-drawn memory journal, postcards, tea, and an olive branch on a wooden table" loading="lazy" decoding="async" />
            <span className="print-label">A PAGE TO KEEP / 01</span>
          </div>
          <div className="living-copy"><span className="living-index">01 <span>—</span> THE JOURNAL</span><h3>Every page<br/>holds a place.</h3><p>Photographs, little notes, and all the things you thought you would never forget.</p><span className="living-note">THE LITTLE DETAILS MATTER ✳</span></div>
        </div>
        <div className="living-row living-reverse">
          <div className="living-media living-map">
            <img className="living-art" src="/memory-map.webp" alt="Hand-drawn coastal memory map with a lighthouse, village, bridge, and picture cards" loading="lazy" decoding="async" />
            <span className="print-label">SOMEWHERE, ONCE / 02</span>
          </div>
          <div className="living-copy"><span className="living-index">02 <span>—</span> THE JOURNEYS</span><h3>All the places<br/>you've been.</h3><p>The long way home. The unexpected detour. Every somewhere becomes part of your story.</p><span className="living-note">COLLECT THE WAY THERE ✳</span></div>
        </div>
        <div className="living-row">
          <div className="living-media living-capsule">
            <img className="living-art" src="/time-capsule.webp" alt="Hand-drawn time capsule with keepsakes, letters, lanterns, and flowers" loading="lazy" decoding="async" />
            <span className="print-label">KEEP FOR LATER / 03</span>
          </div>
          <div className="living-copy"><span className="living-index">03 <span>—</span> THE KEEPSAKES</span><h3>Some things<br/>are forever.</h3><p>A place for the letters, the afternoons, and the stories that become more precious with time.</p><span className="living-note">FOR YOUR FUTURE SELF ✳</span></div>
        </div>
      </div>
    </section>

    <section id="how-it-works" className="how-section paper-surface section-pad" aria-labelledby="how-heading">
      <div className="section-shell how-layout">
        <div className="how-art"><div className="how-photo-frame"><img src="/keepsake-terrace.webp" alt="Custom illustration of memory-filled suitcase and lanterns on a terrace"/><div className="how-photo-label"><span>A LITTLE MOMENT</span><span>NO. 003 ✳</span></div></div><div className="how-taped-note">the days<br/>we keep. <span>↗</span></div><div className="how-washi" aria-hidden="true" /></div>
        <div className="how-copy" data-reveal><div className="eyebrow"><span className="star-char">✳</span> AS EASY AS REMEMBERING <span className="eyebrow-index">/ 003</span></div><h2 id="how-heading">A little space<br/>for <em>every day.</em></h2><div className="step-list"><div className="step"><span>01</span><div><h3>Write it down</h3><p>Start with a sentence, a story, or just a few words.</p></div></div><div className="step"><span>02</span><div><h3>Give it a picture</h3><p>Attach your favorite photograph from that moment.</p></div></div><div className="step"><span>03</span><div><h3>Keep it close</h3><p>Save it to your personal journal and come back whenever you like.</p></div></div></div><button className="text-arrow" onClick={() => openJournal('list','how_it_works')}>SEE YOUR JOURNAL <ArrowUpRight size={18}/></button><p className="local-note"><Check size={13}/> {store.user?'Your photos and memories are stored privately and sync across devices.':'Start privately on this device. Create a free account to sync across devices.'}</p></div>
      </div>
    </section>

    <section className="gallery-section paper-surface section-pad" aria-labelledby="gallery-heading"><div className="section-shell"><div className="gallery-top" data-reveal><div><div className="eyebrow"><span className="star-char">✳</span> PAGES FROM LIFE <span className="eyebrow-index">/ 004</span></div><h2 id="gallery-heading">The moments<br/>in <em>between.</em></h2></div><p>From faraway places to right around the corner. A little inspiration for the memories you'll collect.</p></div><div className="gallery-grid">{examples.map((example, i) => <article className={`gallery-item gallery-${i}`} key={example.title}><div className="gallery-image"><img src={example.image} alt={`Vintage illustrated memory: ${example.title}`}/><div className="gallery-stamp">{example.stamp}</div></div><div className="gallery-meta"><span>{example.date}</span><span>✳</span></div><h3>{example.title}</h3><p>{example.description}</p></article>)}</div></div></section>

    <section id="our-story" className="end-section" aria-labelledby="end-heading"><div className="end-background" aria-hidden="true"/><div className="end-inner" data-reveal><span className="end-star">✳</span><div className="eyebrow">A LITTLE SPACE, JUST FOR YOU</div><h2 id="end-heading">One day, you'll be glad<br/>you <em>remembered.</em></h2><p>The little moments become the big memories.<br/>Save one today, and give your future self a story to find.</p><button className="black-pill end-cta" onClick={()=>startComposer('end')}>MAKE YOUR FIRST MEMORY <ArrowUpRight size={16}/></button></div><div className="end-scenery" aria-hidden="true"/></section>

    <section id="early-access" className="beta-section paper-surface" aria-labelledby="beta-section-title"><div className="section-shell beta-section-layout"><div data-reveal><div className="eyebrow">✳ &nbsp; HELP US WRITE THE NEXT CHAPTER</div><h2 id="beta-section-title">A little beginning.<br/><em>Made together.</em></h2><p>MOMENTO is being prepared for a free early beta. Create your private journal, sync across your devices once the cloud is connected, and tell us what should come next.</p><div className="beta-cta-row"><button className="black-pill" onClick={()=>{if(store.user)openJournal('editor','beta');else setPanel('account');}}>{store.user?'ADD A NEW MEMORY':'GET EARLY ACCESS'} <ArrowUpRight size={16}/></button><button className="beta-feedback-cta" onClick={()=>setPanel('feedback')}><MessageCircle size={17}/> SHARE FEEDBACK <ArrowRight size={16}/></button></div><p className="beta-launch-note">{store.cloudEnabled?'CLOUD CONNECTION READY · FREE BETA':'INTERACTIVE PREVIEW · CLOUD LAUNCH REQUIRES SETUP'}</p></div><div className="beta-roadmap"><span className="beta-roadmap-label">THE FIRST FOUR CHAPTERS</span><div><b>01</b><strong>The journal</strong><small>Write, add up to five photos, organize, edit and delete.</small><Check size={16}/></div><div><b>02</b><strong>Your account</strong><small>Create a profile and keep your memories personal.</small><UserRound size={16}/></div><div><b>03</b><strong>Private cloud</strong><small>Access your collection across devices after setup.</small><Cloud size={16}/></div><div><b>04</b><strong>Free beta</strong><small>A feedback form and deployment-ready starter.</small><MessageCircle size={16}/></div></div></div></section>

    <footer className="site-footer paper-surface"><div className="footer-inner"><button className="wordmark" onClick={focusComposer}>momento<span className="wordmark-dot">.</span></button><span>COLLECT THE DAYS. KEEP THE STORIES.</span><div className="footer-links"><button onClick={() => visitSection('keepsakes')}>DISCOVER</button><button onClick={() => visitSection('how-it-works')}>HOW IT WORKS</button><button onClick={() => openJournal('list','footer')}>YOUR JOURNAL <ArrowRight size={14}/></button><button onClick={()=>setPanel('feedback')}>BETA FEEDBACK</button></div></div><div className="footer-small"><span>MADE FOR REMEMBERING ✳</span><span>{store.user?'PRIVATE CLOUD SYNC ENABLED':'YOUR DEVICE FIRST · CLOUD SYNC AFTER SIGN IN'}</span><a href="#home">BACK TO TOP ↑</a></div></footer>

    {panel==='journal'&&<MemoryStudio store={store} initial={studioInitial} onClose={()=>setPanel(null)} onAuth={()=>setPanel('account')}/>}
    {panel==='account'&&<AccountDialog store={store} onClose={()=>setPanel(null)}/>}
    {panel==='feedback'&&<BetaDialog store={store} onClose={()=>setPanel(null)} onAuth={()=>setPanel('account')}/>}
  </div>;
}
