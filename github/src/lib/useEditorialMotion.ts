import { type RefObject } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(useGSAP, ScrollTrigger);

/** Keep marketing motion scoped and restore normal document flow on resize. */
export function useEditorialMotion(root: RefObject<HTMLElement>) {
  useGSAP(() => {
    const page = root.current;
    if (!page) return;
    const media = gsap.matchMedia();

    media.add('(prefers-reduced-motion: no-preference)', () => {
      page.querySelectorAll<HTMLElement>('[data-reveal]').forEach(element => {
        gsap.fromTo(element, { autoAlpha: 0, y: 24 }, {
          autoAlpha: 1, y: 0, duration: .85, ease: 'power2.out',
          scrollTrigger: { trigger: element, start: 'top 92%', once: true },
        });
      });
      page.querySelectorAll<HTMLElement>('[data-word-reveal]').forEach(paragraph => {
        gsap.fromTo(paragraph.querySelectorAll('[data-word]'), { opacity: .25 }, {
          opacity: 1, stagger: .12, ease: 'none',
          scrollTrigger: { trigger: paragraph, start: 'top 88%', end: 'bottom 52%', scrub: .6 },
        });
      });
    });

    media.add('(min-width: 900px) and (min-height: 650px) and (prefers-reduced-motion: no-preference)', () => {
      const stack = page.querySelector<HTMLElement>('[data-story-stack]');
      if (!stack) return;
      const cards = Array.from(stack.querySelectorAll<HTMLElement>('.living-row'));
      const cardHeight = Math.max(...cards.map(card => card.offsetHeight));
      gsap.set(stack, { height: cardHeight + 44, overflow: 'hidden' });
      gsap.set(cards, { position: 'absolute', top: 0, left: 0, width: '100%' });
      cards.forEach((card, index) => gsap.set(card, { zIndex: index + 1, y: index ? cardHeight + 100 : 0 }));
      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: stack, start: 'top 12%', end: () => `+=${window.innerHeight * 1.65}`,
          pin: true, scrub: .8, anticipatePin: 1, invalidateOnRefresh: true,
        },
      });
      cards.slice(1).forEach((card, index) => {
        timeline.to(cards[index], { scale: .96, y: -12, duration: 1, ease: 'none' })
          .to(card, { y: (index + 1) * 14, duration: 1, ease: 'none' }, '<');
      });
    });

    // Fonts can change card heights after the first frame.
    let alive = true;
    void document.fonts.ready.then(() => { if (alive) ScrollTrigger.refresh(); });
    return () => { alive = false; media.revert(); };
  }, { scope: root });
}
