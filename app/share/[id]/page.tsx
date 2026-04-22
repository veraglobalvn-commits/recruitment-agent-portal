'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import MediaViewer from '@/components/ui/MediaViewer';

interface ShareOrder {
  id: string;
  company_name: string | null;
  en_company_name: string | null;
  job_type: string | null;
  job_type_en: string | null;
  total_labor: number | null;
  salary_usd: number | null;
  meal: string | null;
  meal_en: string | null;
  dormitory: string | null;
  dormitory_en: string | null;
  probation: string | null;
  probation_en: string | null;
  companies: {
    company_media: string[] | null;
    avatar_url: string | null;
    en_company_name: string | null;
    en_industry: string | null;
    industry: string | null;
  } | null;
}

function isVideo(url: string) {
  return /\.(mp4|webm|mov)$/i.test(url);
}

function MediaGallery({ media, onSelect }: { media: string[]; onSelect: (i: number) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -280 : 280, behavior: 'smooth' });
  };

  if (media.length === 0) return null;

  return (
    <div className="mb-6">
      <p className="text-sm font-semibold text-gray-700 mb-3">Company Media</p>
      <div className="relative">
        {media.length > 2 && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-white/80 rounded-full shadow flex items-center justify-center text-gray-600 hover:bg-white"
          >
            ‹
          </button>
        )}
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto scroll-smooth pb-1"
          style={{ scrollbarWidth: 'none' }}
        >
          {media.map((url, i) => (
            <div
              key={i}
              className="relative flex-shrink-0 w-[200px] h-[140px] rounded-2xl overflow-hidden bg-gray-100 cursor-pointer group"
              onClick={() => onSelect(i)}
            >
              {isVideo(url) ? (
                <div className="w-full h-full bg-gray-900 flex flex-col items-center justify-center">
                  <span className="text-white text-3xl group-hover:scale-110 transition-transform">▶</span>
                  <span className="text-gray-400 text-[10px] mt-1 font-medium">VIDEO</span>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" />
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-2xl" />
            </div>
          ))}
        </div>
        {media.length > 2 && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-white/80 rounded-full shadow flex items-center justify-center text-gray-600 hover:bg-white"
          >
            ›
          </button>
        )}
      </div>
    </div>
  );
}

export default function SharePage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<ShareOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/share/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok) { setNotFound(true); return; }
        setOrder(await res.json());
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 animate-pulse">
            <div className="flex gap-3">
              {[1, 2, 3].map(i => <div key={i} className="w-[200px] h-[140px] bg-gray-200 rounded-2xl flex-shrink-0" />)}
            </div>
            <div className="h-6 bg-gray-200 rounded w-2/3" />
            {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-4 bg-gray-100 rounded w-full" />)}
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-gray-500 text-sm">Đơn hàng không tồn tại hoặc đã bị xoá.</p>
        </div>
      </div>
    );
  }

  const rawMedia: string[] = order.companies?.company_media ?? [];
  const fallbackMedia = order.companies?.avatar_url ? [order.companies.avatar_url] : [];
  const displayMedia = rawMedia.length > 0 ? rawMedia : fallbackMedia;

  // Prefer EN company name from companies table, then from order, then VN fallback
  const companyName = order.companies?.en_company_name || order.en_company_name || order.company_name || '—';
  const jobType = order.job_type_en || order.job_type || '—';
  const meal = order.meal_en || order.meal;
  const dormitory = order.dormitory_en || order.dormitory;
  const probation = order.probation_en || order.probation;

  const industry = order.companies?.en_industry || order.companies?.industry;

  const infoItems = [
    { label: 'Total worker', value: order.total_labor != null ? String(order.total_labor) : null },
    { label: 'Job Type', value: jobType },
    { label: 'Industry', value: industry },
    { label: 'Salary', value: order.salary_usd ? `${order.salary_usd} USD` : null },
    { label: 'Meal', value: meal },
    { label: 'Dormitory', value: dormitory },
    { label: 'Probation (EN)', value: probation },
  ].filter(item => item.value);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {viewerIndex !== null && (
        <MediaViewer
          media={displayMedia}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onNav={setViewerIndex}
        />
      )}

      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          {displayMedia.length > 0 && (
            <MediaGallery media={displayMedia} onSelect={setViewerIndex} />
          )}

          <h1 className="text-lg font-bold text-green-800 mb-4">{companyName}</h1>

          <ul className="space-y-2.5">
            {infoItems.map(({ label, value }) => (
              <li key={label} className="flex gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-gray-400 mt-1.5 flex-shrink-0" />
                <span>
                  <span className="font-semibold text-gray-800">{label}:</span>{' '}
                  <span className="text-gray-600">{value}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">Vera Global Manpower</p>
      </div>
    </div>
  );
}
