import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUpRight, Pause, Play } from 'lucide-react';
import '@/memory-scenes.css';

const scenes = [
  {
    image: '/memory-wall.webp',
    title: 'The long way home',
    description: 'For the days when getting lost was the best part.',
    alt: 'Hand-drawn collection of photographs and travel memories on a wall',
  },
  {
    image: '/journey-map.webp',
    title: 'Somewhere in between',
    description: 'For the places you never expected to love.',
    alt: 'Vintage illustrated map tracing a journey across the coast',
  },
  {
    image: '/keepsake-shelf.webp',
    title: 'A day to keep',
    description: 'For the ordinary things that turn extraordinary.',
    alt: 'Hand-drawn shelf filled with family photographs, albums, and letters',
  },
];

const phrases = [
  'Your words.',
  'Your photographs.',
  'A life in little chapters.',
  'Save today. Revisit tomorrow.',
];

export function MemoryScenes() {
  const [activeScene, setActiveScene] = useState(0);
  const instanceId = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  function navigateScenes(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % scenes.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index + scenes.length - 1) % scenes.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = scenes.length - 1;
    else return;

    event.preventDefault();
    setActiveScene(nextIndex);
    buttons.current[nextIndex]?.focus();
  }

  return (
    <section className="taste-scenes paper-surface" aria-labelledby={`${instanceId}-heading`}>
      <div className="section-shell">
        <div className="taste-scenes-heading" data-reveal>
          <h2 id={`${instanceId}-heading`}>The moments<br />in <em>between.</em></h2>
          <p>From faraway places to right around the corner. A little inspiration for the memories you’ll collect.</p>
        </div>
        <div className="taste-scene-accordion">
          {scenes.map((scene, index) => {
            const active = activeScene === index;
            const triggerId = `${instanceId}-trigger-${index}`;
            const panelId = `${instanceId}-panel-${index}`;

            return (
              <article
                key={scene.title}
                className={`taste-scene${active ? ' taste-scene-active' : ''}`}
                aria-labelledby={triggerId}
                onPointerEnter={event => {
                  if (event.pointerType === 'mouse') setActiveScene(index);
                }}
              >
                <div className="taste-scene-image">
                  <img src={scene.image} alt={scene.alt} loading="lazy" decoding="async" />
                </div>
                <div className="taste-scene-wash" aria-hidden="true" />
                <div className="taste-scene-copy">
                  <h3>
                    <button
                      ref={element => { buttons.current[index] = element; }}
                      id={triggerId}
                      type="button"
                      aria-expanded={active}
                      aria-controls={panelId}
                      onFocus={() => setActiveScene(index)}
                      onClick={() => setActiveScene(index)}
                      onKeyDown={event => navigateScenes(event, index)}
                    >
                      <span>{scene.title}</span>
                      <ArrowUpRight size={24} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  </h3>
                  <div id={panelId} hidden={!active} className="taste-scene-description">
                    <p>{scene.description}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <p className="taste-scenes-note">A different little world for every story you keep.</p>
      </div>
    </section>
  );
}

export function MemoryMarquee() {
  const [paused, setPaused] = useState(false);

  return (
    <section className="taste-marquee" aria-label="A life in little chapters" data-paused={paused}>
      <div className="taste-marquee-track">
        {[false, true].map(duplicate => (
          <ul className="taste-marquee-group" key={String(duplicate)} aria-hidden={duplicate || undefined}>
            {phrases.map(phrase => (
              <li key={phrase}>
                <span>{phrase}</span>
                <span className="taste-marquee-dot" aria-hidden="true" />
              </li>
            ))}
          </ul>
        ))}
      </div>
      <button className="taste-marquee-toggle" type="button" onClick={() => setPaused(value => !value)}>
        {paused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}
        <span>{paused ? 'Resume motion' : 'Pause motion'}</span>
      </button>
    </section>
  );
}
