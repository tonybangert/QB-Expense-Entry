import { useState, useRef, useCallback } from 'react';
import { Upload } from 'lucide-react';
import clsx from 'clsx';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'application/pdf'];

export default function DropZone({ onFile, disabled }) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef();

  const validate = useCallback((file) => {
    setError('');
    if (!ACCEPTED.includes(file.type)) {
      setError(`Unsupported file type: ${file.type || 'unknown'}`);
      return false;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File exceeds 10 MB limit');
      return false;
    }
    return true;
  }, []);

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && validate(file)) onFile(file);
  }

  function handleChange(e) {
    const file = e.target.files?.[0];
    if (file && validate(file)) onFile(file);
    e.target.value = '';
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={clsx(
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition',
          dragging
            ? 'border-indigo-500 bg-indigo-50'
            : 'border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50/50',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <Upload size={32} className={dragging ? 'text-indigo-500' : 'text-slate-400'} />
        <p className="mt-3 text-sm font-medium text-slate-700">
          {dragging ? 'Drop file here' : 'Drag & drop a receipt, or click to browse'}
        </p>
        <p className="mt-1 text-xs text-slate-400">JPEG, PNG, WebP, HEIC, PDF — up to 10 MB</p>
      </div>
      <input ref={inputRef} type="file" accept={ACCEPTED.join(',')} onChange={handleChange} className="hidden" />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
