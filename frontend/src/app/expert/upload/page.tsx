'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { fetchWithAuth, API_BASE_URL } from '@/lib/apiClient';
import TableSchemaPicker, { SchemaChoice } from '@/components/TableSchemaPicker';
import {
  UploadCloud,
  FileText,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react';

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
];

const ACCEPTED_EXT = '.pdf,.docx,.pptx,.xlsx,.txt';

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [schema, setSchema] = useState<SchemaChoice>({});

  const pickFile = (f: File) => {
    setError('');
    setSuccess('');
    if (!ACCEPTED_TYPES.includes(f.type)) {
      setError(`Unsupported type: ${f.type}. Use PDF, DOCX, PPTX, XLSX or TXT.`);
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      setError('File exceeds 50 MB limit.');
      return;
    }
    setFile(f);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }, []);

  const handleSubmit = async () => {
    if (!file) return;
    setError('');
    setSuccess('');
    setUploading(true);

    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);
      if (schema.templateId) formData.append('templateId', schema.templateId);
      if (schema.columns?.length) formData.append('columns', schema.columns.join(','));

      const res = await fetch(`${API_BASE_URL}/documents/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.message || `Upload failed (${res.status})`);
        return;
      }

      const doc = await res.json();
      setSuccess(`Document #${doc.id} uploaded. Tables are being extracted in the background.`);
      setFile(null);
      setTimeout(() => router.push('/expert/library'), 1500);
    } catch {
      setError('Failed to connect to the server.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-8 animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-bold text-white">Upload Document</h1>
        <p className="text-neutral-400 mt-1">
          Upload PDF, DOCX, PPTX, XLSX or TXT — text is extracted automatically.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all ${
          dragging
            ? 'border-teal-400 bg-teal-500/10'
            : 'border-neutral-700 hover:border-neutral-500 hover:bg-neutral-900/40'
        }`}
      >
        <UploadCloud size={40} className={dragging ? 'text-teal-400' : 'text-neutral-500'} />
        <p className="mt-3 text-neutral-300 font-medium">
          Drag & drop a file here, or <span className="text-teal-400">browse</span>
        </p>
        <p className="mt-1 text-neutral-500 text-sm">PDF · DOCX · PPTX · XLSX · TXT — max 50 MB</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXT}
          className="hidden"
          onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])}
        />
      </div>

      {/* Selected file */}
      {file && (
        <div className="flex items-center justify-between bg-neutral-900/60 border border-white/10 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <FileText size={20} className="text-teal-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-white text-sm font-medium truncate">{file.name}</p>
              <p className="text-neutral-500 text-xs">{formatBytes(file.size)}</p>
            </div>
          </div>
          <button
            onClick={() => setFile(null)}
            className="text-neutral-500 hover:text-red-400 transition-colors ml-3 flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Table extraction schema */}
      <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-5">
        <TableSchemaPicker accent="#10b981" onChange={setSchema} />
      </div>

      {/* Feedback */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-sm">
          <CheckCircle size={16} />
          {success}
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!file || uploading}
        className="flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl shadow-lg shadow-teal-500/20 transition-all hover:scale-105 active:scale-95"
      >
        {uploading ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Extracting text…
          </>
        ) : (
          <>
            <UploadCloud size={18} />
            Upload & Extract
          </>
        )}
      </button>
    </div>
  );
}
