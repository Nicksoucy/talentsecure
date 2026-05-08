import { useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, Alert, Typography } from '@mui/material';
import api from '@/services/api';

interface CVPreviewProps {
    url: string;
    fileName?: string;
}

// We always fetch the file first and route based on the response Content-Type,
// not the URL extension. URLs like /api/candidates/:id/cv/download have no
// extension, so the old extension-only detection failed for the candidate
// detail page; sniffing the actual MIME works for both shapes (extensionless
// backend endpoints and direct .docx/.pdf URLs from GHL etc.).
//
// docx-preview's fetch() can't read cross-origin bytes (CORS), so we route
// every external URL through the same-origin /api/prospects/cv-proxy backend.
function isSameOrigin(url: string): boolean {
    try {
        return new URL(url, window.location.href).origin === window.location.origin;
    } catch {
        return false;
    }
}

type Kind = 'pdf' | 'docx' | 'doc' | 'unsupported';

// Detect by Content-Type first (cheap), then URL extension, then fall back to
// magic bytes — the only reliable signal when the upstream CDN serves a
// generic application/octet-stream and the URL is opaque (e.g. GHL files
// stored as /files/<uuid> with no extension and a token query).
//
// Magic bytes:
//   PDF  : 25 50 44 46                 ("%PDF")
//   DOCX : 50 4B 03 04                 (ZIP local file header — DOCX is a zip)
//   DOC  : D0 CF 11 E0 A1 B1 1A E1     (OLE compound document, legacy Word)
function pickKind(contentType: string, url: string, head: Uint8Array): Kind {
    const ct = contentType.toLowerCase();
    const lowerUrl = url.split('?')[0].toLowerCase();

    // Magic bytes win over content-type and URL extension. CDNs lie about MIME
    // (octet-stream, sometimes text/html) and URLs lie about extension (GHL
    // serves files at /files/<uuid> with no extension), but the file's first
    // bytes are ground truth.
    if (head.length >= 4) {
        if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) {
            return 'pdf';
        }
        if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
            // ZIP-based — assume DOCX. docx-preview will throw if it's actually
            // xlsx / pptx / odt and we'll surface that as "Aperçu indisponible".
            return 'docx';
        }
        if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) {
            return 'doc';
        }
    }

    // Magic bytes didn't match — fall back to MIME and URL hints.
    if (ct.includes('pdf') || lowerUrl.endsWith('.pdf')) return 'pdf';
    if (ct.includes('wordprocessingml') || lowerUrl.endsWith('.docx')) return 'docx';
    if (ct.includes('msword') || lowerUrl.endsWith('.doc')) return 'doc';

    return 'unsupported';
}

export default function CVPreview({ url, fileName }: CVPreviewProps) {
    const docxContainerRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState<string>('');
    const [kind, setKind] = useState<Kind | null>(null);
    const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        let createdBlobUrl: string | null = null;

        setStatus('loading');
        setErrorMsg('');
        setKind(null);
        setPdfBlobUrl(null);

        (async () => {
            try {
                let blob: Blob;
                if (isSameOrigin(url)) {
                    const res = await fetch(url, { credentials: 'include' });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    blob = await res.blob();
                } else {
                    const res = await api.get('/api/prospects/cv-proxy', {
                        params: { url },
                        responseType: 'arraybuffer',
                    });
                    const ct = (res.headers['content-type'] as string | undefined) || 'application/octet-stream';
                    blob = new Blob([res.data], { type: ct });
                }
                if (cancelled) return;

                // Read the first 8 bytes for magic-byte detection. blob.slice
                // is cheap; arrayBuffer() reads only the slice, not the whole
                // file again.
                const headBuf = await blob.slice(0, 8).arrayBuffer();
                if (cancelled) return;
                const head = new Uint8Array(headBuf);

                const detected = pickKind(blob.type || '', url, head);
                setKind(detected);

                if (detected === 'unsupported') {
                    // Debug aid: log what the file actually looks like so we
                    // can extend pickKind when a new format shows up in prod.
                    const headHex = Array.from(head)
                        .map((b) => b.toString(16).padStart(2, '0'))
                        .join(' ');
                    // eslint-disable-next-line no-console
                    console.warn(
                        `[CVPreview] format non reconnu — content-type=${blob.type || '(vide)'}, ` +
                        `url=${url}, magic=${headHex}, taille=${blob.size}o`,
                    );
                }

                if (detected === 'pdf') {
                    // Re-type the blob to application/pdf before handing it
                    // to URL.createObjectURL — otherwise an iframe pointed at
                    // a blob: URL whose type is application/octet-stream (the
                    // GHL CDN's default) downloads the file instead of
                    // rendering it inline. Blob.slice(0, size, type) is a
                    // view, not a copy — no bytes get duplicated.
                    const pdfBlob = blob.type === 'application/pdf'
                        ? blob
                        : blob.slice(0, blob.size, 'application/pdf');
                    createdBlobUrl = URL.createObjectURL(pdfBlob);
                    if (cancelled) {
                        URL.revokeObjectURL(createdBlobUrl);
                        return;
                    }
                    setPdfBlobUrl(createdBlobUrl);
                    setStatus('ready');
                    return;
                }

                if (detected === 'docx') {
                    // Wait one frame so the ref is mounted before docx-preview writes into it.
                    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
                    if (cancelled || !docxContainerRef.current) return;

                    const { renderAsync } = await import('docx-preview');
                    docxContainerRef.current.innerHTML = '';
                    await renderAsync(blob, docxContainerRef.current, undefined, {
                        inWrapper: true,
                        ignoreWidth: false,
                        ignoreHeight: false,
                    });
                    if (!cancelled) setStatus('ready');
                    return;
                }

                // Legacy .doc or unknown — show the friendly fallback below.
                setStatus('ready');
            } catch (err: any) {
                if (cancelled) return;
                // axios with responseType:'arraybuffer' returns the error body
                // as an ArrayBuffer too, so err.response.data is bytes — not a
                // parsed object. Decode it to text and try to pull the JSON
                // `error` field out so the user sees the actual reason from the
                // proxy (e.g. "Host non autorisé: foo.com") instead of just
                // "Request failed with status code 403".
                let upstreamErr: string | undefined;
                const data = err?.response?.data;
                if (data instanceof ArrayBuffer) {
                    try {
                        const text = new TextDecoder().decode(data);
                        upstreamErr = JSON.parse(text)?.error;
                    } catch {
                        // not JSON — leave upstreamErr undefined
                    }
                } else if (typeof data === 'object' && data?.error) {
                    upstreamErr = data.error;
                }

                const msg = upstreamErr
                    ? `Proxy: ${upstreamErr}`
                    : err?.message?.includes('Failed to fetch')
                        ? 'Aperçu bloqué (CORS ou réseau).'
                        : err?.message || 'Erreur de chargement';
                setErrorMsg(msg);
                setStatus('error');
            }
        })();

        return () => {
            cancelled = true;
            if (createdBlobUrl) URL.revokeObjectURL(createdBlobUrl);
        };
    }, [url]);

    if (status === 'error') {
        return (
            <Box sx={{ p: 3 }}>
                <Alert severity="warning">
                    Aperçu indisponible : {errorMsg}<br />
                    Utilisez le bouton <strong>Télécharger</strong> pour consulter le fichier.
                </Alert>
            </Box>
        );
    }

    if (kind === 'pdf' && pdfBlobUrl) {
        return (
            <iframe
                src={pdfBlobUrl}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title={fileName || 'CV'}
            />
        );
    }

    if (kind === 'doc') {
        return (
            <Box sx={{ p: 3 }}>
                <Alert severity="info">
                    Le format <strong>.doc</strong> (Word 97-2003) n'est pas supporté en aperçu.
                    Utilisez le bouton <strong>Télécharger</strong> pour consulter le fichier.
                </Alert>
            </Box>
        );
    }

    if (kind === 'unsupported' && status === 'ready') {
        return (
            <Box sx={{ p: 3 }}>
                <Alert severity="info">
                    Format non reconnu. Utilisez <strong>Télécharger</strong>.
                </Alert>
            </Box>
        );
    }

    // docx render path: container always mounted so the ref is valid for renderAsync.
    return (
        <Box sx={{ position: 'relative', height: '100%' }}>
            <Box
                ref={docxContainerRef}
                sx={{
                    height: '100%',
                    overflow: 'auto',
                    bgcolor: 'grey.100',
                    p: 2,
                    '& .docx-wrapper': {
                        background: 'transparent',
                        padding: 0,
                    },
                    '& .docx': {
                        margin: '0 auto',
                        background: 'white',
                        boxShadow: 1,
                    },
                }}
            />
            {status === 'loading' && (
                <Box
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 2,
                        bgcolor: 'rgba(255,255,255,0.85)',
                        zIndex: 1,
                    }}
                >
                    <CircularProgress />
                    <Typography variant="body2" color="text.secondary">
                        Chargement de l'aperçu…
                    </Typography>
                </Box>
            )}
        </Box>
    );
}
