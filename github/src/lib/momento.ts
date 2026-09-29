import { createClient } from '@supabase/supabase-js';

// Supabase publishable credentials are intentionally public client configuration.
// The database uses row-level security and a private photo bucket to protect user data.
// Vercel VITE_ environment variables take precedence if set.
const cloudUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mhhcbbpungjmytrnkpic.supabase.co';
const cloudPublishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_50qzbB6isAAcYksWD3gLxw_IyGGqxbb';
export const cloudEnabled = Boolean(cloudUrl && cloudPublishableKey);
export const supabase = cloudEnabled
  ? createClient(cloudUrl, cloudPublishableKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
    })
  : null;
export type Photo = { id: string; name: string; src: string; path?: string };
export type Memory = {
  id: string;
  title: string;
  text: string;
  date: string;
  location: string;
  photos: Photo[];
  createdAt: string;
};
export type MemoryDraft = Pick<Memory, 'title' | 'text' | 'date' | 'location' | 'photos'>;
export const DRAFTS_KEY = 'momento-memories-v2';
const OLD_KEY = 'momento-memories-v1';
const FALLBACK_KEY = 'momento-fallback-v2';
const DB = 'momento-guest-journal';
const STORE = 'entries';

const uuid = () => typeof crypto.randomUUID==='function' ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16));
export function dateToday() {const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; }

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB not supported')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' }); };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}
async function allGuest(): Promise<Memory[]> {
  const db = await openDatabase();
  try {
    return await new Promise<Memory[]>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly');
      const req = transaction.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as Memory[]);
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}
async function putGuest(memory: Memory): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(memory);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
async function delGuest(id: string): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
function getFallback(): Memory[] {
  try { return JSON.parse(localStorage.getItem(FALLBACK_KEY) || '[]') as Memory[]; } catch { return []; }
}
function putFallback(memory: Memory) {
  const rest = getFallback().filter(m => m.id !== memory.id);
  localStorage.setItem(FALLBACK_KEY, JSON.stringify([memory, ...rest]));
}
function oldMemories(): Memory[] {
  try {
    const old = JSON.parse(localStorage.getItem(OLD_KEY) || '[]') as {id:string;text:string;date:string;image?:string;photoName?:string}[];
    return Array.isArray(old) ? old.filter(m => m && m.id && m.date).map(m => ({
      id: m.id, title: m.text?.split(/[.!?\n]/)[0].slice(0, 60) || 'A little moment', text: m.text || '', date: m.date,
      location: '', photos: m.image ? [{ id: uuid(), name: m.photoName || 'Photo', src: m.image }] : [],
      createdAt: `${m.date}T12:00:00.000Z`,
    })) : [];
  } catch { return []; }
}
export async function getLocalMemories(): Promise<Memory[]> {
  let entries: Memory[];
  try {
    const dbRecords = await allGuest();
    entries = [...dbRecords, ...getFallback().filter(m => !dbRecords.some(d => d.id === m.id))];
  } catch { entries = getFallback(); }
  // A previous MOMENTO journal remains available as guest drafts, never silently uploaded to cloud.
  const converted = oldMemories().filter(m => !entries.some(e => e.id === m.id));
  if (converted.length) {
    for (const m of converted) { try { await putGuest(m); } catch { putFallback(m); } }
    localStorage.removeItem(OLD_KEY);
  }
  return [...entries, ...converted].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function saveLocal(memory: Memory) {
  try { await putGuest(memory); } catch { putFallback(memory); }
}
export async function deleteLocal(id: string) {
  try { await delGuest(id); } catch { localStorage.setItem(FALLBACK_KEY, JSON.stringify(getFallback().filter(m => m.id !== id))); }
}

export function photoFromFile(file: File): Promise<Photo> {
  return new Promise((resolve, reject) => {
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { reject(new Error('Please use a JPG, PNG, or WebP image.')); return; }
    if (file.size > 12 * 1024 * 1024) { reject(new Error('Each photo must be smaller than 12 MB.')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(img.width * scale));
        canvas.height = Math.max(1, Math.floor(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Cannot process image.');
        ctx.fillStyle = '#fff9ee'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({ id: uuid(), name: file.name, src: canvas.toDataURL('image/jpeg', .76) });
      } catch (e) { reject(e); }
      finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image could not be opened.')); };
    img.src = url;
  });
}

const BUCKET = 'memory-photos';
function requiredClient() { if (!supabase) throw new Error('Cloud is not configured. See README.md.'); return supabase; }
function uploadedBlob(dataUri: string) {
  const [meta, encoded] = dataUri.split(',');
  const mime = /^data:([^;]+)/.exec(meta)?.[1] || 'image/jpeg';
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i=0; i<binary.length; i++) bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes], {type:mime});
}
async function signPhoto(path: string): Promise<string> {
  const {data,error} = await requiredClient().storage.from(BUCKET).createSignedUrl(path, 3600);
  if(error) throw error;
  return data.signedUrl;
}
export async function loadCloudMemories(userId: string): Promise<Memory[]> {
  const client = requiredClient();
  const {data,error} = await client.from('memories').select('id,title,body,memory_date,location,created_at,memory_photos(id,object_path,file_name)').eq('user_id',userId).order('memory_date', {ascending:false});
  if (error) throw error;
  type Row = {id:string;title:string;body:string|null;memory_date:string;location:string|null;created_at:string;memory_photos:{id:string;object_path:string;file_name:string}[]};
  return Promise.all(((data || []) as Row[]).map(async (m:Row) => {
    const photos = await Promise.all((m.memory_photos || []).map(async (p:{id:string;object_path:string;file_name:string}) => {
      let src = '';
      try { src = await signPhoto(p.object_path); } catch { /* Private image remains recoverable after reconnect. */ }
      return {id:p.id, name:p.file_name, path:p.object_path, src};
    }));
    return {id:m.id,title:m.title,text:m.body || '',date:m.memory_date,location:m.location || '',photos,createdAt:m.created_at} as Memory;
  }));
}
async function uploadPhotos(userId:string,memoryId:string,photos:Photo[]): Promise<Photo[]> {
  const client=requiredClient();
  const done:Photo[]=[];
  try {
    for(const photo of photos) {
      if(photo.path) { done.push(photo); continue; }
      if(!photo.src.startsWith('data:')) throw new Error('This photo cannot be uploaded. Please reattach it.');
      const path=`${userId}/${memoryId}/${uuid()}.jpg`;
      const {error:uploadError} = await client.storage.from(BUCKET).upload(path,uploadedBlob(photo.src),{contentType:'image/jpeg',upsert:false,cacheControl:'3600'});
      if(uploadError) throw uploadError;
      done.push({...photo,path});
      const {error:dbError} = await client.from('memory_photos').insert({user_id:userId,memory_id:memoryId,id:photo.id,object_path:path,file_name:photo.name});
      if(dbError) throw dbError;
    }
    return Promise.all(done.map(async p => p.path ? {...p,src:await signPhoto(p.path)} : p));
  } catch (error) {
    const newPaths=done.filter(p=>p.path && !photos.find(original=>original.path===p.path)).map(p=>p.path!);
    if(newPaths.length) await client.storage.from(BUCKET).remove(newPaths);
    throw error;
  }
}
export async function createCloudMemory(userId:string,draft:MemoryDraft):Promise<Memory> {
  const client=requiredClient(); const id=uuid();
  const {data,error}=await client.from('memories').insert({id,user_id:userId,title:draft.title,body:draft.text,memory_date:draft.date,location:draft.location}).select('created_at').single();
  if(error) throw error;
  try {
    const photos=await uploadPhotos(userId,id,draft.photos);
    return {id,...draft,photos,createdAt:data.created_at};
  } catch(e) { await client.from('memories').delete().eq('id',id).eq('user_id',userId); throw e; }
}
export async function updateCloudMemory(userId:string,current:Memory,draft:MemoryDraft):Promise<Memory> {
  const client=requiredClient();
  const newPhotos=draft.photos.filter(p=>!p.path);
  const added=await uploadPhotos(userId,current.id,newPhotos);
  const {error}=await client.from('memories').update({title:draft.title,body:draft.text,memory_date:draft.date,location:draft.location}).eq('id',current.id).eq('user_id',userId);
  if(error) { if(added.length) { await client.from('memory_photos').delete().in('id',added.map(p=>p.id)); await client.storage.from(BUCKET).remove(added.map(p=>p.path!)); } throw error; }
  const kept=new Set(draft.photos.filter(p=>p.path).map(p=>p.id));
  const removed=current.photos.filter(p=>p.path&&!kept.has(p.id));
  if(removed.length) {
    const {error:dbError}=await client.from('memory_photos').delete().in('id',removed.map(p=>p.id)).eq('user_id',userId);
    if(dbError) throw dbError;
    await client.storage.from(BUCKET).remove(removed.map(p=>p.path!));
  }
  return {...current,...draft,photos:[...draft.photos.filter(p=>p.path),...added]};
}
export async function deleteCloudMemory(userId:string,memory:Memory) {
  const client=requiredClient();
  const paths=memory.photos.map(p=>p.path).filter((p):p is string=>!!p);
  const {error}=await client.from('memories').delete().eq('id',memory.id).eq('user_id',userId);
  if(error) throw error;
  if(paths.length) { const {error:storageError}=await client.storage.from(BUCKET).remove(paths); if(storageError) console.warn('Old photo cleanup pending:',storageError.message); }
}
export async function importGuestMemories(userId:string,guest:Memory[],progress:(done:number,total:number)=>void):Promise<number> {
  let imported=0;
  for(const memory of guest) {
    await createCloudMemory(userId,{title:memory.title,text:memory.text,date:memory.date,location:memory.location,photos:memory.photos.map(p=>({...p,path:undefined}))});
    await deleteLocal(memory.id); imported++; progress(imported,guest.length);
  }
  return imported;
}
