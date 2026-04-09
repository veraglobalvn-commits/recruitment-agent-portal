'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function OrderDetail() {
  const params = useParams();
  const router = useRouter();
  const orderId = decodeURIComponent(params.id as string);

  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (!orderId) return;
    fetchCandidates();
  }, [orderId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadMsg(null);

        const reader = new FileReader();
    reader.onloadend = async () => {
      // BƯỚC NÉN ẢNH TRƯỚC KHI GỬI ĐI ĐỂ KHÔNG LỖI ĐƯỜNG TRUYỀN
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const maxWidth = 1500; // Giới hạn chiều rộng tối đa
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Lấy lại dữ liệu base64 ĐÃ ĐƯỢC NÉN
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1]; 

        try {
          const res = await fetch(process.env.NEXT_PUBLIC_N8N_UPLOAD_URL || '', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId, image_base64: compressedBase64 })
          });
          const result = await res.json();
          
          if (result.success) {
            setUploadMsg('✅ Passport processed successfully!');
            fetchCandidates();
          } else {
            setUploadMsg('❌ Failed to process passport.');
          }
        } catch (err) {
          setUploadMsg('❌ Upload failed. Network error.');
        } finally {
          setIsUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    };
