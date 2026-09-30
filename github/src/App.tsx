import Hero from '@/components/Hero';
import { Analytics } from '@vercel/analytics/react';
import { useEffect } from 'react';
import { trackPageView } from './lib/analytics';

export default function App() {
  useEffect(()=>{trackPageView();},[]);
  return <div><Hero /><Analytics /></div>;
}
