'use client';

import { useEffect } from 'react';

const IDLE_MS = 900;

// CSS no sabe cuándo se está desplazando la página: se marca <html data-scrolling> y la barra aparece y se desvanece
export default function ScrollbarFade() {
  useEffect(() => {
    const root = document.documentElement;
    let timer: number | undefined;
    const onScroll = () => {
      if (!root.hasAttribute('data-scrolling')) root.setAttribute('data-scrolling', '');
      clearTimeout(timer);
      timer = window.setTimeout(() => root.removeAttribute('data-scrolling'), IDLE_MS);
    };
    // capture: también los scroll de elementos (el calendario en horizontal), que no llegan a window
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      clearTimeout(timer);
    };
  }, []);
  return null;
}
