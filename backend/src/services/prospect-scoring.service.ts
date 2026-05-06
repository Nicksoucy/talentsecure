import axios from 'axios';
import { createHash } from 'crypto';
import { prisma } from '../config/database';
import { cvExtractionService } from './cv-extraction.service';
import logger from '../config/logger';

// Bumping this version triggers a re-score of every existing analysis
// next time the batch endpoint is called with no filter — that's the
// point of versioning the rubric: we can iterate on the prompt and
// re-baseline historical data without manual SQL.
const RUBRIC_VERSION = 'v1';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

const PRICING: Record<string, { input: number; output: number }> = {
    'claude-haiku-4-5-20251001': { input: 1 / 1_000_000, output: 5 / 1_000_000 },
    'claude-sonnet-4-6': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
    'claude-opus-4-7': { input: 15 / 1_000_000, output: 75 / 1_000_000 },
};

export type WorkEnvironmentType =
    | 'AIRPORT' | 'GOVERNMENT' | 'CASINO' | 'BANK_VALUES' | 'HEALTHCARE'
    | 'EVENT_VENUE' | 'INDUSTRIAL' | 'RETAIL' | 'CORRECTIONAL'
    | 'EDUCATION' | 'HOSPITALITY' | 'CANNABIS' | 'MILITARY_POLICE'
    | 'DIPLOMATIC' | 'OTHER';

export interface WorkEnvironment {
    type: WorkEnvironmentType;
    label: string;
    yearsApprox: number | null;
    employer: string | null;
}

export type ProspectTier = 'gold' | 'silver' | 'bronze' | 'reject';
export type ProspectRecommendation = 'INTERVIEW_PRIORITY' | 'INTERVIEW' | 'REVIEW' | 'REJECT';

export interface ProspectAnalysisResult {
    score: number;
    tier: ProspectTier;
    recommendation: ProspectRecommendation;
    summary: string;
    strengths: string[];
    redFlags: string[];
    workEnvironments: WorkEnvironment[];
    reasoning: string;
}

const SYSTEM_PROMPT = `Tu es un expert en recrutement pour une agence de placement spécialisée en sécurité privée au Québec.

Ton rôle : analyser un CV de candidat potentiel (pas encore interviewé) et produire un score 0-100, identifier les forces, les drapeaux rouges, et les environnements de travail antérieurs détectés.

RUBRIQUE DE NOTATION (sur 100):

CRÉDENTIELS DURS (max +60):
- BSP valide (Bureau de la sécurité privée): +20
- ≥ 2 ans d'expérience en sécurité privée: +15
- Bilingue français/anglais: +10
- ASP construction (santé-sécurité au travail): +5
- RCR/RCP/DEA à jour: +5
- Permis de conduire + véhicule personnel: +5

ENVIRONNEMENTS DE TRAVAIL DÉTECTÉS (max +25, somme des bonus):
- AIRPORT (Trudeau YUL, Mirabel, Pearson, ADM): +10 (clearance Transport Canada)
- MILITARY_POLICE (FAC, SPVM, SQ, GRC, ex-policier, ex-militaire): +10
- DIPLOMATIC (ambassades, consulats, dignitaires): +10
- GOVERNMENT (édifices fédéraux/provinciaux, palais de justice): +8
- CASINO (Loto-Québec, Mohawk, Kahnawake): +6
- BANK_VALUES (Brink's, GardaWorld Cash, transport de valeurs): +6
- HEALTHCARE (hôpital, CHSLD, CIUSSS, CISSS): +5
- EVENT_VENUE (Centre Bell, festivals, stades): +5
- CORRECTIONAL (Bordeaux, Leclerc, centres de détention): +5
- INDUSTRIAL (chantiers, raffineries, mines): +3
- EDUCATION (universités, cégeps, écoles): +2
- HOSPITALITY (hôtels, condos haut de gamme): +2
- CANNABIS (SQDC, producteurs licenciés): +2
- RETAIL (centres commerciaux, magasins): +1

SIGNAUX QUALITATIFS (max +15):
- Employeurs reconnus en sécurité (Garda, GardaWorld, Securitas, BEST, Allied, Commissionaires): +5 par employeur, max +10
- Stabilité (durée moyenne d'emploi > 18 mois): +5

PÉNALITÉS (drapeaux rouges, à soustraire):
- Trou inexpliqué > 6 mois: -10
- Multiples emplois courts (< 3 mois consécutifs): -10
- Expérience totale < 1 an: -15
- Aucune mention de BSP nulle part: -20
- CV incomplet, illisible ou peu structuré: -5

CORRESPONDANCE TIER (basée sur le score final, plafonné 0-100):
- Score >= 75 -> "gold" -> "INTERVIEW_PRIORITY"
- Score 50-74 -> "silver" -> "INTERVIEW"
- Score 25-49 -> "bronze" -> "REVIEW"
- Score < 25 -> "reject" -> "REJECT"

DÉTECTION DES ENVIRONNEMENTS - mots-clés à reconnaître:
- AIRPORT: Trudeau, YUL, Mirabel, Pearson, ADM, "Aéroports de Montréal", screening passagers, douanes, contrôle bagages, zone réglementée
- CASINO: Loto-Québec, Casino de Montréal, Mont-Tremblant, Charlevoix, Mohawk, Kahnawake
- BANK_VALUES: Brink's, GardaWorld Cash, Garda Cash, transport de valeurs, ATM, distributeur automatique
- GOVERNMENT: ministère, palais de justice, édifice fédéral, édifice provincial, parlement
- HEALTHCARE: hôpital, CHSLD, CIUSSS, CISSS, CHUM, MUHC, Maisonneuve-Rosemont, Sacré-Coeur, urgences
- EVENT_VENUE: Centre Bell, Stade Olympique, Stade Saputo, festival, FEQ, Osheaga, Igloofest
- MILITARY_POLICE: Forces armées canadiennes, FAC, CAF, SPVM, SQ, GRC, RCMP, ex-policier, ex-militaire
- DIPLOMATIC: ambassade, consulat, dignitaire, protection rapprochée, VIP
- CORRECTIONAL: établissement de détention, prison, Bordeaux, Leclerc, Cowansville, Donnacona
- CANNABIS: SQDC, Société québécoise du cannabis, producteur licencié, Health Canada cannabis
- INDUSTRIAL: chantier, usine, raffinerie, mine, pétrochimie, papetière
- EDUCATION: université, cégep, collège, école secondaire, campus
- HOSPITALITY: hôtel, condos haut de gamme, concierge sécurité, resort
- RETAIL: centre commercial, magasin, Carrefour Laval, Galeries d'Anjou, Promenades

CONSIGNES IMPORTANTES:
- Sois précis : copie le NOM EXACT de l'employeur et du lieu depuis le CV.
- yearsApprox = nombre d'années à CET environnement spécifique (pas la carrière totale). null si pas clair.
- Tous les champs texte EN FRANÇAIS.
- summary: 2-3 phrases percutantes décrivant le profil.
- reasoning: 2-4 phrases expliquant comment tu es arrivé au score.
- Ne fabrique JAMAIS une certification (BSP, ASP, etc.) qui n'est pas mentionnée.
- Si le CV est très court (< 200 caractères de contenu), c'est un drapeau rouge "CV incomplet".

Tu DOIS appeler l'outil submit_cv_analysis avec le résultat structuré.`;

const ANALYSIS_TOOL = {
    name: 'submit_cv_analysis',
    description: "Soumettre l'analyse structurée du CV d'un prospect.",
    input_schema: {
        type: 'object',
        properties: {
            score: { type: 'integer', minimum: 0, maximum: 100 },
            tier: { type: 'string', enum: ['gold', 'silver', 'bronze', 'reject'] },
            recommendation: {
                type: 'string',
                enum: ['INTERVIEW_PRIORITY', 'INTERVIEW', 'REVIEW', 'REJECT'],
            },
            summary: { type: 'string', description: '2-3 phrases en français' },
            strengths: { type: 'array', items: { type: 'string' } },
            redFlags: { type: 'array', items: { type: 'string' } },
            workEnvironments: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        type: {
                            type: 'string',
                            enum: [
                                'AIRPORT', 'GOVERNMENT', 'CASINO', 'BANK_VALUES', 'HEALTHCARE',
                                'EVENT_VENUE', 'INDUSTRIAL', 'RETAIL', 'CORRECTIONAL',
                                'EDUCATION', 'HOSPITALITY', 'CANNABIS', 'MILITARY_POLICE',
                                'DIPLOMATIC', 'OTHER',
                            ],
                        },
                        label: { type: 'string' },
                        yearsApprox: { type: ['number', 'null'] },
                        employer: { type: ['string', 'null'] },
                    },
                    required: ['type', 'label'],
                },
            },
            reasoning: { type: 'string' },
        },
        required: [
            'score', 'tier', 'recommendation', 'summary',
            'strengths', 'redFlags', 'workEnvironments', 'reasoning',
        ],
    },
};

class ProspectScoringService {
    private apiKey: string;

    constructor() {
        this.apiKey = process.env.ANTHROPIC_API_KEY || '';
    }

    /**
     * Analyze a single prospect CV. Upserts the result into ProspectAnalysis.
     * If a prior analysis exists with the same rubric+model+cvHash, it is
     * returned without re-billing Claude (cheap reuse).
     */
    async analyzeProspect(
        prospectId: string,
        options: { model?: string; force?: boolean } = {},
    ): Promise<ProspectAnalysisResult & { totalCost: number; reusedFromCache: boolean }> {
        if (!this.apiKey) {
            throw new Error('ANTHROPIC_API_KEY non configurée');
        }

        const model = options.model || DEFAULT_MODEL;
        const force = options.force || false;

        const cvText = await cvExtractionService.getCandidateText(prospectId, true);
        if (!cvText || cvText.length < 50) {
            throw new Error('CV insuffisant pour analyse (texte trop court ou indisponible)');
        }
        const cvHash = createHash('sha256').update(cvText).digest('hex');

        if (!force) {
            const existing = await prisma.prospectAnalysis.findUnique({ where: { prospectId } });
            if (
                existing &&
                existing.rubricVersion === RUBRIC_VERSION &&
                existing.model === model &&
                existing.cvHash === cvHash
            ) {
                return {
                    score: existing.score,
                    tier: existing.tier as ProspectTier,
                    recommendation: existing.recommendation as ProspectRecommendation,
                    summary: existing.summary,
                    strengths: existing.strengths,
                    redFlags: existing.redFlags,
                    workEnvironments: existing.workEnvironments as unknown as WorkEnvironment[],
                    reasoning: existing.reasoning,
                    totalCost: 0,
                    reusedFromCache: true,
                };
            }
        }

        const startTime = Date.now();
        let response;
        try {
            response = await axios.post(
                'https://api.anthropic.com/v1/messages',
                {
                    model,
                    max_tokens: 2048,
                    temperature: 0.1,
                    // Cache the rubric prompt — for batch runs this drops the cost
                    // of input tokens by ~90% on the second+ call within 5 minutes.
                    system: [
                        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
                    ],
                    tools: [ANALYSIS_TOOL],
                    tool_choice: { type: 'tool', name: 'submit_cv_analysis' },
                    messages: [
                        { role: 'user', content: `Analyse ce CV de candidat potentiel:\n\n${cvText}` },
                    ],
                },
                {
                    headers: {
                        'x-api-key': this.apiKey,
                        'anthropic-version': '2023-06-01',
                        'Content-Type': 'application/json',
                    },
                    timeout: 60_000,
                },
            );
        } catch (err: any) {
            const detail = err?.response?.data?.error?.message || err?.message || 'Erreur inconnue';
            throw new Error(`Appel Claude échoué: ${detail}`);
        }

        const usage = response.data.usage || { input_tokens: 0, output_tokens: 0 };
        const blocks = response.data.content || [];
        const toolUseBlock = blocks.find((b: any) => b.type === 'tool_use');
        if (!toolUseBlock || toolUseBlock.name !== 'submit_cv_analysis') {
            throw new Error("Claude n'a pas appelé l'outil submit_cv_analysis");
        }
        const result = toolUseBlock.input as ProspectAnalysisResult;

        const pricing = PRICING[model] || PRICING[DEFAULT_MODEL];
        const totalCost = usage.input_tokens * pricing.input + usage.output_tokens * pricing.output;
        const processingTimeMs = Date.now() - startTime;

        const persisted = {
            score: result.score,
            tier: result.tier,
            recommendation: result.recommendation,
            summary: result.summary,
            strengths: result.strengths,
            redFlags: result.redFlags,
            workEnvironments: result.workEnvironments as unknown as object,
            reasoning: result.reasoning,
            rubricVersion: RUBRIC_VERSION,
            model,
            cvHash,
            promptTokens: usage.input_tokens,
            completionTokens: usage.output_tokens,
            totalCost,
            processingTimeMs,
        };

        await prisma.prospectAnalysis.upsert({
            where: { prospectId },
            create: { prospectId, ...persisted },
            update: persisted,
        });

        return { ...result, totalCost, reusedFromCache: false };
    }

    /**
     * Batch-analyze prospects. Default scope is "every prospect that has no
     * analysis yet, sorted by most recently submitted first" — the use case
     * the user described as "une fois par mois on regarde le batch des CVs
     * non encore évalués".
     */
    async analyzeBatch(options: {
        prospectIds?: string[];
        limit?: number;
        force?: boolean;
        model?: string;
    } = {}) {
        const { force = false, model = DEFAULT_MODEL } = options;
        const limit = Math.min(options.limit || 50, 200);

        let prospects: { id: string }[];
        if (options.prospectIds && options.prospectIds.length > 0) {
            prospects = await prisma.prospectCandidate.findMany({
                where: { id: { in: options.prospectIds }, isDeleted: false },
                select: { id: true },
                take: limit,
            });
        } else {
            prospects = await prisma.prospectCandidate.findMany({
                where: {
                    isDeleted: false,
                    ...(force ? {} : { analysis: { is: null } }),
                },
                select: { id: true },
                orderBy: { createdAt: 'desc' },
                take: limit,
            });
        }

        let analyzed = 0;
        let failed = 0;
        let totalCost = 0;
        const failures: Array<{ id: string; error: string }> = [];

        const CONCURRENCY = 3;
        for (let i = 0; i < prospects.length; i += CONCURRENCY) {
            const slice = prospects.slice(i, i + CONCURRENCY);
            const results = await Promise.allSettled(
                slice.map((p) => this.analyzeProspect(p.id, { model, force })),
            );
            for (let j = 0; j < results.length; j++) {
                const r = results[j];
                if (r.status === 'fulfilled') {
                    analyzed += 1;
                    totalCost += r.value.totalCost;
                } else {
                    failed += 1;
                    const errMsg = r.reason?.message || 'erreur inconnue';
                    failures.push({ id: slice[j].id, error: errMsg });
                    logger.warn('Prospect analysis failed', {
                        prospectId: slice[j].id,
                        error: errMsg,
                    });
                }
            }
        }

        return {
            requested: prospects.length,
            analyzed,
            failed,
            totalCost: Number(totalCost.toFixed(6)),
            failures,
            rubricVersion: RUBRIC_VERSION,
            model,
        };
    }
}

export const prospectScoringService = new ProspectScoringService();
