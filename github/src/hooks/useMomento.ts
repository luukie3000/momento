import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, cloudEnabled, dateToday, getLocalMemories, saveLocal, deleteLocal, loadCloudMemories, createCloudMemory, updateCloudMemory, deleteCloudMemory, importGuestMemories, type Memory, type MemoryDraft } from '../lib/momento';
import { trackEvent, rememberGuestMemory, recordMemoryCreated, type AnalyticsSource } from '../lib/analytics';
export type Profile = {display_name:string;bio:string};
function uuid() {return typeof crypto.randomUUID==='function'?crypto.randomUUID():'10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(Number(c)^(crypto.getRandomValues(new Uint8Array(1))[0]&(15>>(Number(c)/4)))).toString(16));}
export function useMomento() {
  const [user,setUser]=useState<User|null>(null);
  const [ready,setReady]=useState(false);
  const [memories,setMemories]=useState<Memory[]>([]);
  const [drafts,setDrafts]=useState<Memory[]>([]);
  const [profile,setProfile]=useState<Profile>({display_name:'',bio:''});
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const refresh=useCallback(async (account:User|null) => {
    setLoading(true);setError('');
    try {
      const local=await getLocalMemories();setDrafts(local);
      if(local.length>0)rememberGuestMemory();
      if (account && supabase) {
        const [remote,profileResult]=await Promise.all([
          loadCloudMemories(account.id),
          supabase.from('profiles').select('display_name,bio').eq('id',account.id).maybeSingle(),
        ]);
        if(profileResult.error) throw profileResult.error;
        setMemories(remote);
        setProfile({display_name:profileResult.data?.display_name || account.user_metadata?.display_name || '',bio:profileResult.data?.bio || ''});
      } else {setMemories(local);setProfile({display_name:'',bio:''});}
    } catch(e) {setError(e instanceof Error?e.message:'Could not load your journal.');}
    finally {setLoading(false);}
  },[]);
  useEffect(()=>{
    let alive=true;
    const listener=supabase?.auth.onAuthStateChange((_event,session)=>{
      if(!alive)return;
      setUser(session?.user || null);
      // Do not call the Supabase client synchronously inside this auth callback.
      window.setTimeout(()=>{if(alive)void refresh(session?.user||null);},0);
    });
    if(!supabase) {void refresh(null).then(()=>{if(alive)setReady(true);});}
    else void supabase.auth.getSession().then(({data})=>{if(alive){setUser(data.session?.user||null);return refresh(data.session?.user||null);}}).finally(()=>{if(alive)setReady(true);});
    return ()=>{alive=false;listener?.data.subscription.unsubscribe();};
  },[refresh]);
  async function save(draft:MemoryDraft,current?:Memory,source:AnalyticsSource='journal') {
    setLoading(true);setError('');
    try {
      let result:Memory;
      if(user&&supabase) result=current ? await updateCloudMemory(user.id,current,draft) : await createCloudMemory(user.id,draft);
      else {
        result={id:current?.id || uuid(),...draft,createdAt:current?.createdAt||new Date().toISOString()};
        await saveLocal(result);
      }
      setMemories(old=>[result,...old.filter(m=>m.id!==result.id)].sort((a,b)=>b.date.localeCompare(a.date)));
      if(!user)setDrafts(old=>[result,...old.filter(m=>m.id!==result.id)]);
      const mode=user?'cloud':'guest';
      if(current){
        trackEvent('memory_edited',{mode,photo_count:result.photos.length});
        if(result.photos.some(p=>!current.photos.some(previous=>previous.id===p.id)))
          trackEvent('memory_photos_added',{mode,photo_count:result.photos.length});
      }else recordMemoryCreated({mode,photoCount:result.photos.length,source,memoryId:result.id,userId:user?.id,hadMemories:memories.length>0});
      return result;
    } catch(e) {setError(e instanceof Error?e.message:'Could not save memory.');throw e;}
    finally {setLoading(false);}
  }
  async function remove(memory:Memory) {
    setLoading(true);setError('');
    try {
      if(user&&supabase) await deleteCloudMemory(user.id,memory);
      else await deleteLocal(memory.id);
      setMemories(old=>old.filter(m=>m.id!==memory.id));
      if(!user)setDrafts(old=>old.filter(m=>m.id!==memory.id));
      trackEvent('memory_deleted',{mode:user?'cloud':'guest',photo_count:memory.photos.length});
    } catch(e) {setError(e instanceof Error?e.message:'Could not delete memory.');throw e;}
    finally {setLoading(false);}
  }
  async function signUp(email:string,password:string,name:string) {
    if(!supabase) throw new Error('Cloud accounts are not configured. Add your Supabase keys.');
    const {data,error:authError}=await supabase.auth.signUp({email,password,options:{data:{display_name:name},emailRedirectTo:window.location.origin}});
    if(authError)throw authError;
    // Supabase can return an obfuscated user for a duplicate registration.
    if(data.user && data.user.identities?.length!==0)
      trackEvent('signup_completed',{source:'account',confirmation_required:!data.session});
    return {confirmEmail:!data.session};
  }
  async function signIn(email:string,password:string) {
    if(!supabase) throw new Error('Cloud accounts are not configured.');
    const {error:authError}=await supabase.auth.signInWithPassword({email,password});
    if(authError)throw authError;
    trackEvent('login_completed',{source:'account',mode:'cloud'});
  }
  async function signOut(){
    if(!supabase)return;
    const {error:authError}=await supabase.auth.signOut();
    if(authError)throw authError;
    trackEvent('logout',{source:'account'});
    const guest=await getLocalMemories();setMemories(guest);setDrafts(guest);setUser(null);
  }
  async function updateProfile(next:Profile){
    if(!user||!supabase)throw new Error('Sign in to update your profile.');
    const {error:dbError}=await supabase.from('profiles').upsert({id:user.id,display_name:next.display_name.trim(),bio:next.bio.trim()});
    if(dbError)throw dbError;
    setProfile(next);
  }
  async function importDrafts(onProgress:(done:number,total:number)=>void){
    if(!user)throw new Error('Sign in to sync guest memories.');
    setLoading(true);
    trackEvent('guest_memories_import_started',{source:'account',mode:'cloud',memory_count:drafts.length});
    let created=0;
    try {const total=await importGuestMemories(user.id,drafts,onProgress,memory=>{
      recordMemoryCreated({mode:'cloud',photoCount:memory.photos.length,source:'import',memoryId:memory.id,userId:user.id,hadMemories:memories.length+created>0});created++;
    });await refresh(user);
      trackEvent('guest_memories_import_completed',{source:'account',mode:'cloud',memory_count:total});
      return total;}
    finally{setLoading(false);}
  }
  async function feedback(message:string,rating:number){
    if(!user||!supabase)throw new Error('Sign in to send beta feedback.');
    const {error:dbError}=await supabase.from('beta_feedback').insert({user_id:user.id,message:message.trim(),rating});
    if(dbError)throw dbError;
    trackEvent('beta_feedback_submitted',{source:'beta',mode:'cloud'});
  }
  return {user,ready,cloudEnabled,memories,drafts,profile,loading,error,clearError:()=>setError(''),refresh:()=>refresh(user),save,remove,signUp,signIn,signOut,updateProfile,importDrafts,feedback,dateToday};
}
export type MomentoStore=ReturnType<typeof useMomento>;
