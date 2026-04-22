'use client';

import { useEffect } from 'react';

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
  const hasPrev = index > 0;
  const hasNext = index < media.length - 1;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onNav(index - 1);
      if (e.key === 'ArrowRight' && hasNext) onNav(index + 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [index, hasPrev, hasNext, onClose, onNav]);

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center" onClick={onClose}>
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white text-2xl w-11 h-11 flex items-center justify-center bg-black/40 rounded-full hover:bg-black/70 z-10"
      >
        ✕
      </button>

      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onNav(index - 1); }}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-white text-3xl w-12 h-12 flex items-center justify-center bg-black/40 rounded-full hover:bg-black/70 z-10"
        >
          ‹
        </button>
      )}

      <div className="max-w-4xl w-full mx-16 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {isVideo(url) ? (
          <video src={url} controls autoPlay className="max-h-[85vh] w-full rounded-lg" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="max-h-[85vh] max-w-full object-contain rounded-lg" />
        )}
      </div>

      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onNav(index + 1); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white text-3xl w-12 h-12 flex items-center justify-center bg-black/40 rounded-full hover:bg-black/70 z-10"
        >
          ›
        </button>
      )}

      {media.length > 1 && (
        <p className="absolute bottom-4 text-white text-xs opacity-50 select-none">
          {index + 1} / {media.length}
        </p>
      )}
    </div>
  );
}
