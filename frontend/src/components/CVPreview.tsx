import { useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, Alert, Typography } from '@mui/material';
import api from '@/services/api';

interface CVPreviewProps {
    url: string;
    fileName?: string;
}

// docx-preview's fetch() can't read the GHL CDN bytes directly because of CORS,
// so we route the download through our backend proxy at /api/prospects/cv-proxy.
// The axios interceptor on `api` attaches the JWT, the backend allowlist on
// proxyCv checks the upstream host, and we get back the raw file bytes on the
// same origin — no CORS issue, no public open proxy.
function isSameOrigin(url: string): boolean {
    try {
        return new URL(url, window.location.href).origin === window.location.origin;
    } catch {
        return false;
    }
}

type FileKind = 'pdf' | 'docx' | 'doc' | 'unknown';

function detectKind(url: string): FileKind {
    const path = url.split('?')[0].toLowerCase();
    if (path.endsWith('.pdf')) return 'pdf';
    if (path.endsWith('.docx')) return 'docx';
    if (path.endsWith('.doc')) return 'doc';
    return 'unknown';
}

export default function CVPreview({ url, fileName }: CVPreviewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState<string>('');
    const kind = detectKind(url);

    useEffect(() => {
        if (kind === 'pdf' || kind === 'doc') {
            setStatus('ready');
            return;
        }

        let cancelled = false;
        setStatus('loading');
        setErrorMsg('');

        (async () => {
            try {
                let blob: Blob;
                if (isSameOrigin(url)) {
                    // Local upload (R2 signed URL on our own bucket, dev /uploads/, etc.)
                    const res = await fetch(url);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    blob = await res.blob();
                } else {
                    // External CDN (GHL etc.) — go through the same-origin backend
                    // proxy so the response carries no CORS restriction.
                    const res = await api.get('/api/prospects/cv-proxy', {
                        params: { url },
                        responseType: 'arraybuffer',
                    });
                    const ct = (res.headers['content-type'] as string | undefined)
                        || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                    blob = new Blob([res.data], { type: ct });
                }
                if (cancelled) return;

                // Wait one frame so the ref is mounted before docx-preview writes into it.
                await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
                if (cancelled || !containerRef.current) return;

                const { renderAsync } = await import('docx-preview');
                containerRef.current.innerHTML = '';
                await renderAsync(blob, containerRef.current, undefined, {
                    inWrapper: true,
                    ignoreWidth: false,
                    ignoreHeight: false,
                });
                if (!cancelled) setStatus('ready');
            } catch (err: any) {
                if (cancelled) return;
                const upstreamErr = err?.response?.data?.error;
                const msg = upstreamErr
                    ? `Proxy: ${upstreamErr}`
                    : err?.message?.includes('Failed to fetch')
                        ? 'Aperçu bloqué par la politique CORS du fournisseur du fichier.'
                        : err?.message || 'Erreur de chargement';
                setErrorMsg(msg);
                setStatus('error');
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [url, kind]);

    if (kind === 'pdf') {
        return (
            <iframe
                src={url}
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
                    Utilisez le bouton <strong>Télécharger</strong> pour le consulter.
                </Alert>
            </Box>
        );
    }

    return (
        <Box sx={{ position: 'relative', height: '100%' }}>
            <Box
                ref={containerRef}
                sx={{
                    height: '100%',
                    overflow: 'auto',
                    bgcolor: 'grey.100',
                    p: 2,
                    display: status === 'error' ? 'none' : 'block',
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
            {status === 'error' && (
                <Box sx={{ p: 3 }}>
                    <Alert severity="warning">
                        Aperçu indisponible : {errorMsg}<br />
                        Utilisez le bouton <strong>Télécharger</strong> ci-dessous pour consulter le fichier.
                    </Alert>
                </Box>
            )}
        </Box>
    );
}
