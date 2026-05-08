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

function pickKind(contentType: string, url: string): Kind {
    const ct = contentType.toLowerCase();
    const lowerUrl = url.split('?')[0].toLowerCase();

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

                const detected = pickKind(blob.type || '', url);
                setKind(detected);

                if (detected === 'pdf') {
                    createdBlobUrl = URL.createObjectURL(blob);
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
                const upstreamErr = err?.response?.data?.error;
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
