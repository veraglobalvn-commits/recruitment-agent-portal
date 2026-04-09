'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function OrderDetail() {
  const params = useParams();
  const router = useRouter();
  const orderId = decodeURIComponent(params.id as string);

  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    const fetchCandidates = async () => {
      try {
        const res = await fetch(process.env.NEXT_PUBLIC_N8N_CANDIDATES_URL || '', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: orderId })
        });
        const result = await res.json();
        setCandidates(result.candidates || []);
      } catch (err) { console.error(err); } 
      finally { setLoading(false); }
    };
    fetchCandidates();
  }, [orderId]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-100"><p>Loading candidates...</p></div>;

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <button onClick={() => router.back()} className="mb-6 text-blue-600 hover:underline font-semibold flex items-center gap-2">
          {'<-'} Back to Dashboard
        </button>

        <div className="bg-white p-6 rounded-lg shadow mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">{orderId}</h1>
          <div className="flex gap-2">
            <button className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded hover:bg-blue-200">📄 Demand Letter</button>
            <button className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded hover:bg-blue-200">📋 List</button>
            <button className="text-sm bg-green-100 text-green-700 px-3 py-1 rounded hover:bg-green-200">📤 Submit Passport</button>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">👥 CANDIDATES IN THIS ORDER</h2>
          {candidates.length === 0 ? (
            <p className="text-gray-500 text-sm">No candidates found for this order.</p>
          ) : (
            <div className="space-y-4">
              {candidates.map((c: any, idx: number) => (
                <div key={idx} className="border p-4 rounded-lg hover:bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-gray-800">{c.full_name}</h3>
                    <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">{c.id_ld}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm text-gray-600">
                    <p>PP No: <span className="font-semibold text-gray-800">{c.pp_no || 'N/A'}</span></p>
                    <p>DOB: <span className="font-semibold text-gray-800">{c.dob || 'N/A'}</span></p>
                    <p>DOI: <span className="font-semibold text-gray-800">{c.pp_doi || 'N/A'}</span></p>
                    <p>DOE: <span className="font-semibold text-gray-800">{c.pp_doe || 'N/A'}</span></p>
                    <p>POB: <span className="font-semibold text-gray-800">{c.pob || 'N/A'}</span></p>
                    <p>Phone: <span className="font-semibold text-gray-800">{c.phone || 'N/A'}</span></p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {c.passport_link ? (
                      <a href={c.passport_link} target="_blank" className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded hover:bg-gray-200">📷 View Passport</a>
                    ) : (
                      <span className="text-xs bg-gray-50 text-gray-400 px-2 py-1 rounded">No Passport</span>
                    )}
                    <span className="text-xs text-gray-500">Visa: {c.visa_status || 'Pending'}</span>
                    <div className="flex gap-1">
                      <button className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200">Passed</button>
                      <button className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200">Failed</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
