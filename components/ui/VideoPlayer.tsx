'use client';

export default function VideoPlayer({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="relative w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white text-2xl min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          ✕
        </button>
        <video
          src={url}
          controls
          autoPlay
          className="w-full rounded-2xl bg-black"
          style={{ maxHeight: '70vh' }}
        />
      </div>
    </div>
  );
}
