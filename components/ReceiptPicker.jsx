'use client';
// Choose receipt photos / PDFs (tap, camera on phones, or drag & drop). Upload happens on save.
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { useConfig } from './Providers';
import { checkFile, MAX_FILES, typeOf } from '@/lib/client/upload';
import { fileSize } from '@/lib/client/format';

function Preview({ file }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(typeOf(file))) return undefined;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  if (url) return <img src={url} alt="" />;
  return <span className="thumb-mini">{typeOf(file) === 'application/pdf' ? 'PDF' : <Icon name="file" />}</span>;
}

/**
 * files: File[]; onChange(files). progress: number[] (0..1) while uploading. disabled while saving.
 */
export default function ReceiptPicker({ files, onChange, progress, disabled = false, onError }) {
  const config = useConfig();
  const input = useRef(null);
  const camera = useRef(null);
  const [drag, setDrag] = useState(false);
  const off = !config.cloudinary || disabled;

  function add(list) {
    const next = [...files];
    for (const f of list) {
      const err = checkFile(f);
      if (err) {
        onError?.(err);
        continue;
      }
      if (next.length >= MAX_FILES) {
        onError?.(`You can attach up to ${MAX_FILES} files at a time`);
        break;
      }
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    onChange(next);
  }

  if (!config.cloudinary && !config.loading) {
    return (
      <div className="dropzone disabled">
        <Icon name="upload" size={22} />
        <p className="small" style={{ marginTop: 6 }}>
          Receipt uploads are off: Cloudinary is not configured on the server.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div
        className={`dropzone ${drag ? 'drag' : ''} ${off ? 'disabled' : ''}`}
        role="button"
        tabIndex={off ? -1 : 0}
        onClick={() => !off && input.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !off && (e.preventDefault(), input.current?.click())}
        onDragOver={(e) => {
          e.preventDefault();
          if (!off) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (!off) add([...e.dataTransfer.files]);
        }}
      >
        <div className="big">
          <Icon name="upload" size={24} />
        </div>
        <div className="strong" style={{ color: 'var(--text)' }}>
          Tap to choose bill photos or PDFs
        </div>
        <div className="xs">or drag & drop · up to {MAX_FILES} files · {config.maxFileMb || 10} MB each</div>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/*,application/pdf,.heic,.heif"
          hidden
          onChange={(e) => {
            add([...e.target.files]);
            e.target.value = '';
          }}
        />
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="btn sm" disabled={off} onClick={() => camera.current?.click()}>
          <Icon name="camera" /> Take photo
        </button>
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            add([...e.target.files]);
            e.target.value = '';
          }}
        />
        {files.length > 0 && <span className="xs muted">{files.length} selected</span>}
      </div>
      {files.length > 0 && (
        <div className="file-rows">
          {files.map((f, i) => (
            <div className="file-row" key={`${f.name}-${f.size}-${i}`}>
              <Preview file={f} />
              <div className="grow">
                <div className="small strong truncate">{f.name}</div>
                <div className="xs muted">{fileSize(f.size)}</div>
                {progress?.[i] != null && (
                  <div className="progress">
                    <span style={{ width: `${Math.round(progress[i] * 100)}%` }} />
                  </div>
                )}
              </div>
              {!disabled && (
                <button type="button" className="btn-icon sm" aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))}>
                  <Icon name="x" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
