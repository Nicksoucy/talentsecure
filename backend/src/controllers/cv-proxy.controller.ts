import { Request, Response } from 'express';
import https from 'https';
import { URL } from 'url';

// Same-origin proxy for CV downloads. The frontend hits this endpoint instead
// of fetching the GHL/CDN URL directly because docx-preview needs to read the
// file as bytes via fetch(), which is blocked by CORS on cross-origin
// responses (GHL doesn't send Access-Control-Allow-Origin).
//
// SSRF guard: only the small set of hosts we actually use to store CVs is
// allowed. Anything else is rejected — without this, an authenticated admin
// could turn this into a generic outbound proxy (fine in itself, but it
// becomes a useful pivot if the JWT ever leaks).
const ALLOWED_HOSTS = new Set([
    // GoHighLevel
    'storage.googleapis.com',
    'api.leadconnectorhq.com',
    'app.leadconnectorhq.com',
    'media.gohighlevel.com',
    // GHL underlying S3 buckets (common patterns)
    'msgsndr.s3.amazonaws.com',
    'msgsndr.s3.us-east-2.amazonaws.com',
    'highlevel-backend.s3.amazonaws.com',
    'highlevel-backend-prod.s3.amazonaws.com',
    // Firebase / Google
    'firebase-storage.googleapis.com',
    'firebasestorage.googleapis.com',
    // Cloudflare R2 (used in production for own uploads — see cv.service.ts)
    'r2.cloudflarestorage.com',
]);

function isAllowedHost(hostname: string): boolean {
    if (ALLOWED_HOSTS.has(hostname)) return true;
    // Allow any *.r2.cloudflarestorage.com subdomain (each R2 bucket gets its own).
    if (hostname.endsWith('.r2.cloudflarestorage.com')) return true;
    return false;
}

export const proxyCv = (req: Request, res: Response) => {
    const rawUrl = req.query.url;
    if (typeof rawUrl !== 'string' || !rawUrl) {
        return res.status(400).json({ error: 'Paramètre url manquant' });
    }

    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return res.status(400).json({ error: 'URL invalide' });
    }

    if (parsed.protocol !== 'https:') {
        return res.status(400).json({ error: 'Seules les URLs https sont acceptées' });
    }

    if (!isAllowedHost(parsed.hostname)) {
        return res.status(403).json({
            error: `Host non autorisé: ${parsed.hostname}`,
        });
    }

    const upstream = https.get(rawUrl, (upRes) => {
        if (!upRes.statusCode || upRes.statusCode >= 400) {
            res.status(502).json({
                error: `Upstream a retourné ${upRes.statusCode}`,
            });
            upRes.resume();
            return;
        }

        const ct = upRes.headers['content-type'];
        if (ct) res.setHeader('Content-Type', ct);
        const cl = upRes.headers['content-length'];
        if (cl) res.setHeader('Content-Length', cl);
        // Short cache so repeated previews of the same CV in a session don't
        // round-trip to GHL every time.
        res.setHeader('Cache-Control', 'private, max-age=300');

        upRes.pipe(res);
    });

    upstream.on('error', (err) => {
        if (!res.headersSent) {
            res.status(502).json({ error: `Échec du fetch upstream: ${err.message}` });
        }
    });

    upstream.setTimeout(30_000, () => {
        upstream.destroy(new Error('Timeout upstream'));
    });
};
