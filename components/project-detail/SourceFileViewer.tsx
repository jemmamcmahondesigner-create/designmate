'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

type ProjectReference = {
  id: string
  label: string
  url: string | null
  file_name: string | null
  storage_path: string | null
  file_type: string | null
}

type Props = {
  reference: ProjectReference
  onClose: () => void
}

export function SourceFileViewer({ reference, onClose }: Props) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (typeof document === 'undefined') return null

  const fileType = reference.file_type ?? 'other'
  const url = reference.url

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 600,
        background: 'rgba(41, 33, 28, 0.88)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-label={`Preview: ${reference.label}`}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          background: 'rgba(41, 33, 28, 0.72)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <span style={{
          fontSize: 14,
          fontWeight: 600,
          color: '#fff',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          maxWidth: 'calc(100% - 120px)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {reference.label}
        </span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'rgba(255,255,255,0.7)',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                textDecoration: 'none',
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              Open ↗
            </a>
          )}
          <button
            onClick={onClose}
            aria-label="Close preview"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.7)',
              fontSize: 20,
              lineHeight: 1,
              padding: '4px 8px',
              borderRadius: 4,
              fontFamily: 'Plus Jakarta Sans, sans-serif',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 56,
          width: '100%',
          height: 'calc(100vh - 56px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          boxSizing: 'border-box',
        }}
        onClick={e => e.stopPropagation()}
      >
        {url && fileType === 'image' && (
          <img
            src={url}
            alt={reference.label}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              borderRadius: 8,
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          />
        )}

        {url && fileType === 'pdf' && (
          <iframe
            src={url}
            title={reference.label}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              borderRadius: 8,
              background: '#fff',
            }}
          />
        )}

        {url && (fileType === 'spreadsheet' || fileType === 'document' || fileType === 'other') && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 20,
            color: '#fff',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
          }}>
            <div style={{
              width: 80,
              height: 80,
              borderRadius: 16,
              background: 'rgba(255,255,255,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
            }}>
              {fileType === 'spreadsheet' ? '📊' : fileType === 'document' ? '📄' : '📁'}
            </div>
            <p style={{ fontSize: 16, fontWeight: 600, margin: 0, color: '#fff' }}>
              {reference.label}
            </p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', margin: 0, textAlign: 'center', maxWidth: 320 }}>
              This file type can&apos;t be previewed in the browser.
            </p>
            <a
              href={url}
              download={reference.file_name ?? reference.label}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                background: '#ffe96c',
                color: '#2a221b',
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
              }}
            >
              Download file
            </a>
          </div>
        )}

        {!url && (
          <div style={{
            color: 'rgba(255,255,255,0.5)',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            fontSize: 14,
          }}>
            File not available.
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
