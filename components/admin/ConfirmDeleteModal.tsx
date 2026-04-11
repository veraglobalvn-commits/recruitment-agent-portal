'use client';

import { useState } from 'react';

interface ConfirmDeleteModalProps {
  title: string;
  description: string;
  itemName: string;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmDeleteModal({ title, description, itemName, onConfirm, onClose }: ConfirmDeleteModalProps) {
  const [input, setInput] = useState('');
  const canConfirm = input.trim().toLowerCase() === 'xoá';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-xl p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4 sm:hidden" />
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-red-600 text-base">{title}</h3>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>
        <p className="text-sm text-gray-600 mb-4">{description}</p>
        <div className="mb-4">
          <label className="block text-xs text-gray-500 mb-1">
            Gõ <span className="font-bold text-red-600">xoá</span> để xác nhận
          </label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="xoá"
            autoFocus
            className="w-full text-sm border border-red-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-400 min-h-[44px]"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-xl text-sm min-h-[44px]"
          >
            Huỷ
          </button>
          <button
            onClick={() => { if (canConfirm) onConfirm(); }}
            disabled={!canConfirm}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl text-sm min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Xoá {itemName}
          </button>
        </div>
      </div>
    </div>
  );
}
