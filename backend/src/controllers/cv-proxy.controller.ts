import { Request, Response } from 'express';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import logger from '../config/logger';

// Same-origin proxy for CV downloads. The frontend hits this endpoint instead
// of fetching the GHL/CDN URL directly because docx-preview needs to read the
// file as bytes via fetch(), which is blocked by CORS on cross-origin
// responses (GHL doesn't send Access-Control-Allow-Origin).
//
// Allowlist of known CV/file hosting providers. We allow whole domains rather
// than specific hostnames because CDNs use rotating subdomains (S3 region
// endpoints, GCS bucket subdomains, R2 account subdomains, etc.). Anything
// outside this set is rejected to keep this from becoming a generic outbound
// proxy if an admin JWT ever leaks.
const ALLOWED_DOMAIN_SUFFIXES = [
    // GoHighLevel API + CDNs
    '.gohighlevel.com',
    '.leadconnectorhq.com',
    // AWS S3 (any region: us-east-1.amazonaws.com, us-east-2.amazonaws.com, etc.)
    '.amazonaws.com',
    // Google Cloud Storage + Firebase Storage
    '.googleapis.com',
    // Cloudflare R2 (one subdomain per account)
    '.r2.cloudflarestorage.com',
    // CDNs sometimes used in front of these
    '.cloudfront.net',
    '.b-cdn.net',
    '.azureedge.net',
];

const ALLOWED_EXACT_HOSTS = new Set([
    'storage.googleapis.com',
    'firebasestorage.googleapis.com',
    'media.gohighlevel.com',
    'app.gohighlevel.com',
]);

function isAllowedHost(hostname: string): boolean {
    const h = hostname.toLowerCase();
    if (ALLOWED_EXACT_HOSTS.has(h)) return true;
    return ALLOWED_DOMAIN_SUFFIXES.some((suffix) => h.endsWith(suffix));
}

const MAX_REDIRECTS = 5;

// GHL and S3 almost always respond 302 → signed CDN URL. Node's bare https.get
// does not follow redirects, so we have to walk the chain ourselves. Every hop
// is allowlist-checked, so a redirect to an arbitrary attacker host is still
// rejected.
function fetchWithRedirects(
    targetUrl: string,
    res: Response,
    redirectsLeft: number,
): void {
    let parsed: URL;
    try {
        parsed = new URL(targetUrl);
    } catch {
        if (!res.headersSent) res.status(400).json({ error: 'URL invalide' });
        return;
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        if (!res.headersSent) {
            res.status(400).json({ error: 'Seules les URLs http(s) sont acceptées' });
        }
        return;
    }

    if (!isAllowedHost(parsed.hostname)) {
        logger.warn(`[cv-proxy] host refusé: ${parsed.hostname} (URL: ${targetUrl})`);
        if (!res.headersSent) {
            res.status(403).json({ error: `Host non autorisé: ${parsed.hostname}` });
        }
        return;
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const upstream = client.get(targetUrl, (upRes) => {
        const status = upRes.statusCode ?? 0;

        if (status >= 300 && status < 400 && upRes.headers.location) {
            if (redirectsLeft <= 0) {
                upRes.resume();
                if (!res.headersSent) {
                    res.status(502).json({ error: 'Trop de redirections' });
                }
                return;
            }
            const next = new URL(upRes.headers.location, targetUrl).toString();
            upRes.resume();
            fetchWithRedirects(next, res, redirectsLeft - 1);
            return;
        }

        if (status >= 400) {
            upRes.resume();
            logger.warn(`[cv-proxy] upstream ${status} pour ${targetUrl}`);
            if (!res.headersSent) {
                res.status(502).json({ error: `Upstream a retourné ${status}` });
            }
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
        logger.error(`[cv-proxy] erreur fetch ${targetUrl}: ${err.message}`);
        if (!res.headersSent) {
            res.status(502).json({ error: `Échec du fetch upstream: ${err.message}` });
        }
    });

    upstream.setTimeout(30_000, () => {
        upstream.destroy(new Error('Timeout upstream'));
    });
}

export const proxyCv = (req: Request, res: Response) => {
    const rawUrl = req.query.url;
    if (typeof rawUrl !== 'string' || !rawUrl) {
        return res.status(400).json({ error: 'Paramètre url manquant' });
    }
    fetchWithRedirects(rawUrl, res, MAX_REDIRECTS);
};
