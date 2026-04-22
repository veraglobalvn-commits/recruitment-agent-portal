'use client';

import { useEffect, useRef } from 'react';

function isVideo(url: string) {
  return /\.(mp4|webm|mov)$/i.test(url);
}

interface Props {
  media: string[];
  index: number;
  onClose: () => void;
  onNav: (idx: number) => void;
}

export default function MediaViewer({ media, index, onClose, onNav }: Props) {
  const url = media[index];
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onNav(index - 1);
      if (e.key === 'ArrowRight' && index < media.length - 1) onNav(index + 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [index, media.length, onClose, onNav]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) < 50) return;
    if (delta > 0 && index < media.length - 1) onNav(index + 1);
    if (delta < 0 && index > 0) onNav(index - 1);
    touchStartX.current = null;
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white text-2xl w-11 h-11 flex items-center justify-center bg-black/50 rounded-full z-10"
      >
        ✕
      </button>

      <div className="w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {isVideo(url) ? (
          <video src={url} controls autoPlay className="w-full h-full object-contain" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="w-full h-full object-contain" />
        )}
      </div>

      {media.length > 1 && (
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-xs bg-black/40 px-3 py-1 rounded-full select-none">
          {index + 1} / {media.length}
        </p>
      )}
    </div>
  );
}
