import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, Menu, Paperclip, Upload, X, Cloud, MessageCircle, UserRound } from 'lucide-react';
import { useMomento } from '@/hooks/useMomento';
import { photoFromFile, type Photo } from '@/lib/momento';
import MemoryStudio from '@/components/MemoryStudio';
import AccountDialog from '@/components/AccountDialog';
import BetaDialog from '@/components/BetaDialog';
import { trackEvent, type AnalyticsSource } from '@/lib/analytics';
import { MemoryMarquee, MemoryScenes } from '@/components/MemoryScenes';
import { useEditorialMotion } from '@/lib/useEditorialMotion';
import '@/taste.css';

// The hero reuses the exact moving landscape from the supplied Wandor prompt.
// A bundled hand-drawn ambient animation is used only if the remote host is unavailable.
const ORIGINAL_WANDOR_VIDEO = 'https://pollen-batch-41236914.figma.site/_components/v2/f0ee2dae7671c170c34f12e31c4cb41418976c98/769c564298c132f7919405cd9f17c1b1231f341d.769c5642.mp4';
const PROMPT = 'That evening by the sea... warm air, little cafés, and the kind of laughter you wish you could bottle forever.';
type Panel = 'journal' | 'account' | 'feedback' | null;

const rememberingWords = "Not every memory is a milestone. Sometimes it's the sun through the window, a conversation that lasted too long, or a place you wish you could visit again.".split(' ');

export default function Hero() {
  const store = useMomento();
  const pageRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ambientPaused, setAmbientPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEditorialMotion(pageRef);
  const fileRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [text,setText] = useState('');
  const [composePhotos,setComposePhotos] = useState<Photo[]>([]);
  const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState(false);
  const [panel,setPanel] = useState<Panel>(null);
  const [studioInitial,setStudioInitial] = useState<'list'|'editor'|'start'>('list');
  const [mobileMenu,setMobileMenu] = useState(false);
  const [useBackupVideo,setUseBackupVideo] = useState(false);
  const openJournal = (initial:'list'|'editor'|'start'='list',source:AnalyticsSource='composer') => {
    if(panel!=='journal')trackEvent('journal_opened',{source,mode:store.user?'cloud':'guest'});
    setStudioInitial(initial);setPanel('journal');setMobileMenu(false);
  };
  const startComposer=(source:AnalyticsSource)=>{
    trackEvent('hero_start_journal_clicked',{source});
    if(!store.ready||store.loading||store.canGuideFirstMemory)openJournal('start',source);
    else focusComposer();
  };
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
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setAmbientPaused(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const video = videoRef.current;
    const update = () => {
      if (!video) return;
      if (ambientPaused || document.hidden) video.pause();
      else void video.play().catch(() => {});
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [ambientPaused, useBackupVideo]);
  function scrollBehavior(): ScrollBehavior { return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'; }
  function focusComposer(){setPanel(null);setMobileMenu(false);document.getElementById('home')?.scrollIntoView({behavior:scrollBehavior()});window.setTimeout(()=>promptRef.current?.focus({preventScroll:true}),450);}
  function visitSection(section:string){setMobileMenu(false);document.getElementById(section)?.scrollIntoView({behavior:scrollBehavior()});}
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
    <main ref={pageRef} className="taste-page overflow-x-hidden w-full max-w-full">
    <section id="home" className={`hero-scene${useBackupVideo ? ' using-backup-video' : ''}${ambientPaused ? ' ambient-paused' : ''}`} aria-label="Momento homepage">
      <div className="world-motion" aria-hidden="true">
        <div className="world-still" />
        <video
          ref={videoRef}
          className="world-video"
          src={useBackupVideo ? '/momento-ambient.mp4' : ORIGINAL_WANDOR_VIDEO}
          data-fallback-src="/momento-ambient.mp4"
          onError={() => { if (!useBackupVideo) setUseBackupVideo(true); }}
          autoPlay={!ambientPaused} muted loop playsInline preload="auto"
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
        <div className="hero-content">
          <h1 className="max-w-6xl w-full">Every moment<br className="hero-heading-break"/> has a story<span className="hero-period">.</span></h1>
          <p className="hero-subtitle">A little home for the days you never want to forget.<br className="desktop-only"/> Keep the photos, places, and stories that made them yours.</p>
          <div className="taste-hero-actions">
            <button className="black-pill taste-start" onClick={() => {trackEvent('hero_start_journal_clicked',{source:'hero'});openJournal('start','hero');}}>{!store.ready||store.canGuideFirstMemory?'START YOUR JOURNAL':'OPEN YOUR JOURNAL'} <ArrowUpRight size={16}/></button>
            <button className="taste-secondary" onClick={() => visitSection('how-it-works')}>HOW IT WORKS <ArrowDownRight size={16}/></button>
          </div>
          <div className="prompt-glass">
            <label className="sr-only" htmlFor="memory-entry">Write your memory</label>
            <textarea id="memory-entry" ref={promptRef} onFocus={()=>trackEvent('memory_editor_opened',{source:'composer',mode:store.user?'cloud':'guest'})} value={text} onChange={e => setText(e.target.value)} onKeyDown={onTextareaKeyDown} spellCheck placeholder={PROMPT} aria-describedby="memory-hint" />
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={attachPhoto} className="sr-only-file" aria-label="Choose a photo" />
            <div className="prompt-bottom"><div className="prompt-attach"><button className="upload-circle" type="button" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Attach a photograph" title="Attach a photograph"><Upload size={18} strokeWidth={1.8}/></button>{composePhotos.length>0 && <span className="attached-name"><Paperclip size={13}/>{composePhotos.length} {composePhotos.length===1?'PHOTO':'PHOTOS'} <button className="remove-attachments" type="button" onClick={()=>setComposePhotos([])} aria-label="Remove attached photographs"><X size={12}/></button></span>}<span className="hint-text" id="memory-hint">{store.user?'Saved to your private account':'A moment worth keeping'}</span></div><button className="black-pill save-button" type="button" onClick={() => void saveMemory()} disabled={busy||store.loading}>{busy||store.loading ? 'SAVING...' : 'SAVE MEMORY'} <ArrowUpRight size={15}/></button></div>
          </div>
          {notice && <div role="status" aria-live="polite" className="status-message">{notice}</div>}
        </div>
      </div>
      <div className="hero-bottom-text" aria-hidden="true"><span>COLLECTED WITH CARE</span><span>EST. TODAY · MADE TO LAST</span></div>
      <a className="scroll-cue" href="#keepsakes" aria-label="Scroll to discover Momento"><span>SCROLL TO DISCOVER</span><ArrowDownRight size={16}/></a>
      <button className="taste-ambient-toggle" onClick={() => setAmbientPaused(value => !value)} aria-pressed={ambientPaused}>{ambientPaused ? 'PLAY LANDSCAPE' : 'PAUSE LANDSCAPE'}</button>
    </section>

    <section id="keepsakes" className="taste-intro paper-surface" aria-labelledby="keepsakes-heading">
      <div className="section-shell">
        <h2 id="keepsakes-heading" data-reveal>For all the <span className="taste-inline-image" aria-hidden="true"><img src="/journal-window.webp" alt="" loading="lazy"/></span><br/><em>little things</em> that mean a lot.</h2>
        <p className="taste-remembering" data-word-reveal><span className="sr-only">{rememberingWords.join(' ')}</span>{rememberingWords.map((word,index)=><span key={index} data-word aria-hidden="true">{word}{' '}</span>)}</p>
        <button className="text-arrow" onClick={()=>startComposer('intro')}>START YOUR STORY <ArrowUpRight size={18}/></button>
      </div>
    </section>

    <section className="taste-features paper-surface" aria-labelledby="features-heading">
      <div className="section-shell">
        <div className="taste-feature-heading" data-reveal><h2 id="features-heading">More than just<br/>a <em>camera roll.</em></h2><p>Keep the photos, places, and stories that made them yours.</p></div>
        <div className="taste-bento grid-flow-dense">
          <article className="taste-feature taste-feature-main" data-reveal>
            <div className="taste-feature-art"><img src="/journal-window.webp" alt="Hand-drawn scrapbook and photographs beside a sunlit window" loading="lazy"/></div>
            <div className="taste-feature-copy"><h3>Save what it felt like.</h3><p>Write the words, add up to five photographs, and hold on to the little details.</p></div>
          </article>
          <article className="taste-feature taste-feature-words" data-reveal>
            <div className="taste-written-note" aria-hidden="true">We took the long way home.<br/>I think that made it even better.</div>
            <div className="taste-feature-copy"><h3>A journal that’s yours.</h3><p>Dates, places, and a few lines. Your days become a collection you can come back to.</p></div>
          </article>
          <article className="taste-feature taste-feature-revisit" data-reveal>
            <div className="taste-feature-art"><img src="/keepsake-shelf.webp" alt="Hand-drawn albums, letters, and family keepsakes on a shelf" loading="lazy"/></div>
            <div className="taste-feature-copy"><h3>Go back for a moment.</h3><p>Find a story by its words, sort your days, and revisit somewhere wonderful.</p></div>
          </article>
        </div>
      </div>
    </section>
    <MemoryMarquee />

    <section id="illustrated-stories" className="illustrated-stories paper-surface" aria-labelledby="illustrations-heading">
      <div className="section-shell">
        <div className="illustrated-header" data-reveal>
          <div className="eyebrow"><span className="star-char">✳</span> A WORLD OF LITTLE STORIES</div>
          <h2 id="illustrations-heading">Made to <em>remember.</em></h2>
          <p>Original, hand-drawn moments. A different little world for each story you keep.</p>
        </div>
        <div data-story-stack>
        <div className="living-row">
          <div className="living-media living-journal">
            <img className="living-art" src="/memory-journal.webp" alt="Hand-drawn memory journal, postcards, tea, and an olive branch on a wooden table" loading="lazy" decoding="async" />
            <span className="print-label">A PAGE TO KEEP</span>
          </div>
          <div className="living-copy"><span className="living-index">YOUR WORDS</span><h3>Every page<br/>holds a place.</h3><p>Photographs, little notes, and all the things you thought you would never forget.</p><span className="living-note">THE LITTLE DETAILS MATTER ✳</span></div>
        </div>
        <div className="living-row living-reverse">
          <div className="living-media living-map">
            <img className="living-art" src="/memory-map.webp" alt="Hand-drawn coastal memory map with a lighthouse, village, bridge, and picture cards" loading="lazy" decoding="async" />
            <span className="print-label">SOMEWHERE, ONCE</span>
          </div>
          <div className="living-copy"><span className="living-index">YOUR PLACES</span><h3>All the places<br/>you've been.</h3><p>The long way home. The unexpected detour. Every somewhere becomes part of your story.</p><span className="living-note">COLLECT THE WAY THERE ✳</span></div>
        </div>
        <div className="living-row">
          <div className="living-media living-capsule">
            <img className="living-art" src="/time-capsule.webp" alt="Hand-drawn time capsule with keepsakes, letters, lanterns, and flowers" loading="lazy" decoding="async" />
            <span className="print-label">KEEP FOR LATER</span>
          </div>
          <div className="living-copy"><span className="living-index">YOUR KEEPSAKES</span><h3>Some things<br/>are forever.</h3><p>A place for the letters, the afternoons, and the stories that become more precious with time.</p><span className="living-note">FOR YOUR FUTURE SELF ✳</span></div>
        </div>
        </div>
      </div>
    </section>

    <section id="how-it-works" className="how-section paper-surface section-pad" aria-labelledby="how-heading">
      <div className="section-shell how-layout">
        <div className="how-art"><div className="how-photo-frame"><img src="/keepsake-terrace.webp" alt="Custom illustration of memory-filled suitcase and lanterns on a terrace"/><div className="how-photo-label"><span>A LITTLE MOMENT</span><span>TO KEEP</span></div></div><div className="how-taped-note">the days<br/>we keep. <span>↗</span></div><div className="how-washi" aria-hidden="true" /></div>
        <div className="how-copy" data-reveal><div className="eyebrow"><span className="star-char">✳</span> AS EASY AS REMEMBERING</div><h2 id="how-heading">A little space<br/>for <em>every day.</em></h2><div className="step-list"><div className="step"><span>01</span><div><h3>Write it down</h3><p>Start with a sentence, a story, or just a few words.</p></div></div><div className="step"><span>02</span><div><h3>Give it a picture</h3><p>Attach your favorite photograph from that moment.</p></div></div><div className="step"><span>03</span><div><h3>Keep it close</h3><p>Save it to your personal journal and come back whenever you like.</p></div></div></div><button className="text-arrow" onClick={() => openJournal('list','how_it_works')}>SEE YOUR JOURNAL <ArrowUpRight size={18}/></button><p className="local-note"><Check size={13}/> {store.user?'Your photos and memories are stored privately and sync across devices.':'Start privately on this device. Create a free account to sync across devices.'}</p></div>
      </div>
    </section>

    <MemoryScenes />

    <section id="our-story" className="end-section" aria-labelledby="end-heading"><div className="end-background" aria-hidden="true"/><div className="end-inner" data-reveal><span className="end-star">✳</span><div className="eyebrow">A LITTLE SPACE, JUST FOR YOU</div><h2 id="end-heading">One day, you'll be glad<br/>you <em>remembered.</em></h2><p>The little moments become the big memories.<br/>Save one today, and give your future self a story to find.</p><button className="black-pill end-cta" onClick={()=>startComposer('end')}>MAKE YOUR FIRST MEMORY <ArrowUpRight size={16}/></button></div><div className="end-scenery" aria-hidden="true"/></section>

    <section id="early-access" className="beta-section paper-surface" aria-labelledby="beta-section-title"><div className="section-shell beta-section-layout"><div data-reveal><div className="eyebrow">✳ &nbsp; HELP US WRITE THE NEXT CHAPTER</div><h2 id="beta-section-title">A little beginning.<br/><em>Made together.</em></h2><p>MOMENTO’s free beta is open. Start your private journal, keep your memories close across devices, and help us shape the next chapter.</p><div className="beta-cta-row"><button className="black-pill" onClick={()=>{if(store.user)openJournal('editor','beta');else setPanel('account');}}>{store.user?'ADD A NEW MEMORY':'GET EARLY ACCESS'} <ArrowUpRight size={16}/></button><button className="beta-feedback-cta" onClick={()=>setPanel('feedback')}><MessageCircle size={17}/> SHARE FEEDBACK <ArrowRight size={16}/></button></div><p className="beta-launch-note">{store.cloudEnabled?'FREE TO BEGIN · YOUR MEMORIES STAY PRIVATE':'FREE TO BEGIN · SAVED ON THIS DEVICE'}</p></div><div className="beta-roadmap"><span className="beta-roadmap-label">A HOME FOR YOUR MEMORIES</span><div><strong>The journal</strong><small>Write, add up to five photos, organize, edit and delete.</small><Check size={16}/></div><div><strong>Your account</strong><small>Create a profile and keep your memories personal.</small><UserRound size={16}/></div><div><strong>Private cloud</strong><small>Sign in to bring your collection with you, across devices.</small><Cloud size={16}/></div><div><strong>Free beta</strong><small>Share your ideas and help shape what comes next.</small><MessageCircle size={16}/></div></div></div></section>

    </main>

    <footer className="site-footer paper-surface"><div className="footer-inner"><button className="wordmark" onClick={focusComposer}>momento<span className="wordmark-dot">.</span></button><span>COLLECT THE DAYS. KEEP THE STORIES.</span><div className="footer-links"><button onClick={() => visitSection('keepsakes')}>DISCOVER</button><button onClick={() => visitSection('how-it-works')}>HOW IT WORKS</button><button onClick={() => openJournal('list','footer')}>YOUR JOURNAL <ArrowRight size={14}/></button><button onClick={()=>setPanel('feedback')}>BETA FEEDBACK</button></div></div><div className="footer-small"><span>MADE FOR REMEMBERING ✳</span><span>{store.user?'PRIVATE CLOUD SYNC ENABLED':'YOUR DEVICE FIRST · CLOUD SYNC AFTER SIGN IN'}</span><a href="#home">BACK TO TOP ↑</a></div></footer>

    {panel==='journal'&&<MemoryStudio store={store} initial={studioInitial} startingDraft={studioInitial==='start'?{title:'',text,date:store.dateToday(),location:'',photos:composePhotos}:undefined} onFirstSaved={()=>{setText('');setComposePhotos([]);setNotice('Your first memory is tucked away.');}} onClose={()=>setPanel(null)} onAuth={()=>setPanel('account')}/>}
    {panel==='account'&&<AccountDialog store={store} onClose={()=>setPanel(null)}/>}
    {panel==='feedback'&&<BetaDialog store={store} onClose={()=>setPanel(null)} onAuth={()=>setPanel('account')}/>}
  </div>;
}
