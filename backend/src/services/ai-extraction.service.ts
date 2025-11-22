import { PrismaClient, Skill, SkillLevel } from '@prisma/client';
import axios from 'axios';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

interface AIExtractionResult {
  skillId: string;
  skillName: string;
  confidence: number;
  extractedText: string;
  yearsExperience?: number;
  level?: SkillLevel;
  reasoning?: string;
  isSecurityRelated?: boolean;
}

interface AIExtractionSummary {
  candidateId: string;
  skillsFound: AIExtractionResult[];
  totalSkills: number;
  processingTimeMs: number;
  method: 'OPENAI' | 'CLAUDE';
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  success: boolean;
  errorMessage?: string;
  rawResponse?: string;
  reusedFromCache?: boolean;
}

interface ExtractedSkillFromAI {
  name: string;
  level?: string;
  yearsExperience?: number;
  confidence: number;
  reasoning?: string;
  context?: string;
  isSecurityRelated?: boolean; // Is this skill relevant to security guard positions?
}

interface CachedExtractionSummary {
  summary: AIExtractionSummary;
  expiresAt: number;
}

export class AIExtractionService {
  private openaiApiKey: string;
  private anthropicApiKey: string;

  private cvTextCache = new Map<string, { hash: string; text: string; expiresAt: number }>();
  private extractionCache = new Map<string, CachedExtractionSummary>();
  private inFlightRequests = new Map<string, Promise<AIExtractionSummary>>();
  private requestQueue: (() => void)[] = [];
  private activeRequests = 0;
  private lastRequestTimestamp = 0;

  private readonly TEXT_CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
  private readonly CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
  private readonly MAX_RETRIES = 3;
  private readonly MIN_REQUEST_INTERVAL_MS = 200; // Rate limiting
  private readonly MAX_CONCURRENT_REQUESTS = 5;

  // Pricing (as of Jan 2025 - may need updates)
  private readonly PRICING = {
    'gpt-4': { input: 0.03 / 1000, output: 0.06 / 1000 },
    'gpt-4-turbo': { input: 0.01 / 1000, output: 0.03 / 1000 },
    'gpt-3.5-turbo': { input: 0.0005 / 1000, output: 0.0015 / 1000 },
    'claude-3-opus': { input: 0.015 / 1000, output: 0.075 / 1000 },
    'claude-3-sonnet': { input: 0.003 / 1000, output: 0.015 / 1000 },
    'claude-3-haiku': { input: 0.00025 / 1000, output: 0.00125 / 1000 },
  };

  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    this.anthropicApiKey = process.env.ANTHROPIC_API_KEY || '';
  }

  /**
   * Extract skills using OpenAI
   */
  async extractWithOpenAI(
    candidateId: string,
    cvText: string,
    model: 'gpt-4' | 'gpt-4-turbo' | 'gpt-3.5-turbo' = 'gpt-3.5-turbo'
  ): Promise<AIExtractionSummary> {
    const startTime = Date.now();

    if (!this.openaiApiKey) {
      return this.createErrorSummary(
        candidateId,
        'OPENAI',
        model,
        'OPENAI_API_KEY non configuree',
        Date.now() - startTime
      );
    }

    try {
      return await this.runExtractionWithCache({
        candidateId,
        method: 'OPENAI',
        model,
        cvText,
        startTime,
        runner: (cvHash) => this.performOpenAIExtraction(candidateId, cvText, model, startTime, cvHash),
      });
    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      const cvHash = error?.cvHash || this.computeCvHash(cvText);
      const errorMessage = error?.error?.message || error?.message || 'Erreur lors de l\'extraction OpenAI';
      return this.createErrorSummary(candidateId, 'OPENAI', model, errorMessage, elapsed, cvHash);
    }
  }



  /**
   * Extract skills using Claude
   */
  async extractWithClaude(
    candidateId: string,
    cvText: string,
    model: 'claude-3-opus' | 'claude-3-sonnet' | 'claude-3-haiku' = 'claude-3-haiku'
  ): Promise<AIExtractionSummary> {
    const startTime = Date.now();

    if (!this.anthropicApiKey) {
      return this.createErrorSummary(
        candidateId,
        'CLAUDE',
        model,
        'ANTHROPIC_API_KEY non configuree',
        Date.now() - startTime
      );
    }

    try {
      return await this.runExtractionWithCache({
        candidateId,
        method: 'CLAUDE',
        model,
        cvText,
        startTime,
        runner: (cvHash) => this.performClaudeExtraction(candidateId, cvText, model, startTime, cvHash),
      });
    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      const cvHash = error?.cvHash || this.computeCvHash(cvText);
      const errorMessage = error?.error?.message || error?.message || 'Erreur lors de l\'extraction Claude';
      return this.createErrorSummary(candidateId, 'CLAUDE', model, errorMessage, elapsed, cvHash);
    }
  }



  /**
   * Get system prompt for AI
   */
  private getSystemPrompt(): string {
    return `Tu es un expert RH spécialisé dans l'analyse de CVs et l'extraction de compétences.

Ton rôle est d'analyser un CV et d'identifier toutes les compétences pertinentes du candidat.

🎯 PRIORITÉ ABSOLUE : Cherche ACTIVEMENT les compétences NON-SÉCURITÉ, notamment :
- Métiers manuels : Soudure (TIG, MIG, ARC), Construction, Mécanique, Plomberie, Électricité, Menuiserie
- Équipements : Chariot élévateur, Machinerie lourde, Grue, Nacelle
- Petite enfance : CPE, Garderie, Éducation à l'enfance
- Administration : Bureautique, Comptabilité, Gestion
- Langues : Français, Anglais, Espagnol, etc. (avec niveau si mentionné)
- Informatique : Logiciels, Programmation, Réseaux
- Certifications professionnelles (HORS sécurité)

Pour chaque compétence trouvée, fournis:
- name: Nom exact de la compétence
- category: Catégorie (TECHNICAL, CERTIFICATION, LANGUAGE, TOOL_EQUIPMENT, INDUSTRY, OTHER)
- level: Niveau (BEGINNER, INTERMEDIATE, ADVANCED, EXPERT, ou UNKNOWN)
- yearsExperience: Nombre d'années d'expérience (si mentionné)
- confidence: Score de confiance 0-1 (à quel point tu es certain que le candidat possède cette compétence)
- reasoning: Courte explication de pourquoi tu as identifié cette compétence
- context: Citation exacte du CV qui démontre cette compétence
- isSecurityRelated: true si la compétence est spécifiquement liée aux agents de sécurité/sécurité privée, false sinon

⚠️ IMPORTANT - Définition de isSecurityRelated:
- TRUE uniquement pour: BSP, Gardiennage, Surveillance, Patrouille, Contrôle d'accès, Secourisme (RCR/DEA), SSIAP, Agent de prévention
- FALSE pour TOUT le reste, même si le candidat a travaillé en sécurité (ex: si un agent de sécurité sait souder, la soudure est FALSE)

📊 Catégories:
- TECHNICAL: Métiers manuels, construction, mécanique, soudure
- TOOL_EQUIPMENT: Chariot élévateur, machinerie, équipements spécialisés
- LANGUAGE: Toutes les langues
- CERTIFICATION: Certifications professionnelles (incluant sécurité si applicable)
- INDUSTRY: Connaissances sectorielles spécifiques
- OTHER: Tout ce qui ne rentre pas ailleurs

Réponds UNIQUEMENT avec du JSON valide dans ce format:
{
  "skills": [
    {
      "name": "Chariot élévateur",
      "category": "TOOL_EQUIPMENT",
      "level": "ADVANCED",
      "yearsExperience": 4,
      "confidence": 0.95,
      "reasoning": "Certification et expérience mentionnées",
      "context": "Cariste certifié avec 4 ans d'expérience",
      "isSecurityRelated": false
    },
    {
      "name": "Anglais",
      "category": "LANGUAGE",
      "level": "INTERMEDIATE",
      "yearsExperience": null,
      "confidence": 0.85,
      "reasoning": "Niveau intermédiaire mentionné",
      "context": "Anglais intermédiaire parlé et écrit",
      "isSecurityRelated": false
    },
    {
      "name": "Soudure MIG",
      "category": "TECHNICAL",
      "level": "EXPERT",
      "yearsExperience": 8,
      "confidence": 0.92,
      "reasoning": "Expérience significative en soudure",
      "context": "Soudeur MIG certifié, 8 ans d'expérience",
      "isSecurityRelated": false
    },
    {
      "name": "BSP",
      "category": "CERTIFICATION",
      "level": "ADVANCED",
      "yearsExperience": 5,
      "confidence": 0.95,
      "reasoning": "Certification BSP mentionnée explicitement",
      "context": "Détenteur du permis BSP depuis 5 ans",
      "isSecurityRelated": true
    }
  ]
}`;
  }

  /**
   * Build extraction prompt with available skills context
   */
  private buildExtractionPrompt(cvText: string, skills: Skill[]): string {
    const skillsByCategory = this.groupSkillsByCategory(skills);

    return `Analyse ce CV et identifie TOUTES les compÃ©tences du candidat.

Voici les catÃ©gories de compÃ©tences disponibles:

${Object.entries(skillsByCategory)
        .map(([category, categorySkills]) => {
          return `**${category}:**\n${categorySkills.map((s) => `- ${s.name}`).join('\n')}`;
        })
        .join('\n\n')}

Tu peux aussi identifier des compÃ©tences qui ne sont pas dans cette liste si elles sont clairement mentionnÃ©es.

**CV Ã€ ANALYSER:**

${cvText}

**IMPORTANT:**
- Sois prÃ©cis dans l'Ã©valuation du niveau
- Base le niveau sur les annÃ©es d'expÃ©rience si disponibles
- Fournis un score de confiance rÃ©aliste (0.5-1.0)
- Cite le contexte exact du CV
- N'invente pas de compÃ©tences qui ne sont pas mentionnÃ©es

RÃ©ponds avec JSON valide uniquement.`;
  }

  /**
   * Get available skills from database
   */
  private async getAvailableSkills(): Promise<Skill[]> {
    return prisma.skill.findMany({
      where: { isActive: true },
      orderBy: { category: 'asc' },
    });
  }

  /**
   * Group skills by category
   */
  private groupSkillsByCategory(skills: Skill[]): Record<string, Skill[]> {
    return skills.reduce((acc, skill) => {
      if (!acc[skill.category]) {
        acc[skill.category] = [];
      }
      acc[skill.category].push(skill);
      return acc;
    }, {} as Record<string, Skill[]>);
  }

  /**
   * Match AI-extracted skills with database
   */
  private async matchAISkillsWithDatabase(
    aiSkills: ExtractedSkillFromAI[],
    availableSkills: Skill[]
  ): Promise<AIExtractionResult[]> {
    const matched: AIExtractionResult[] = [];

    for (const aiSkill of aiSkills) {
      // Try exact match first
      let dbSkill = availableSkills.find(
        (s) => s.name.toLowerCase() === aiSkill.name.toLowerCase()
      );

      // Try fuzzy match with keywords
      if (!dbSkill) {
        dbSkill = availableSkills.find((s) =>
          s.keywords.some((k) => k.toLowerCase() === aiSkill.name.toLowerCase())
        );
      }

      // Try partial match
      if (!dbSkill) {
        dbSkill = availableSkills.find(
          (s) =>
            s.name.toLowerCase().includes(aiSkill.name.toLowerCase()) ||
            aiSkill.name.toLowerCase().includes(s.name.toLowerCase())
        );
      }

      if (dbSkill) {
        matched.push({
          skillId: dbSkill.id,
          skillName: dbSkill.name,
          confidence: aiSkill.confidence,
          extractedText: aiSkill.context || aiSkill.name,
          yearsExperience: aiSkill.yearsExperience,
          level: this.normalizeLevel(aiSkill.level),
          reasoning: aiSkill.reasoning,
          isSecurityRelated: aiSkill.isSecurityRelated ?? dbSkill.isSecurityRelated,
        });
      }
    }

    return matched;
  }

  private normalizeLevel(level?: string): SkillLevel {
    if (!level) return 'UNKNOWN';
    const upper = level.toUpperCase();
    if (['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT', 'UNKNOWN'].includes(upper)) {
      return upper as SkillLevel;
    }
    return 'UNKNOWN';
  }

  private async performOpenAIExtraction(
    candidateId: string,
    cvText: string,
    model: 'gpt-4' | 'gpt-4-turbo' | 'gpt-3.5-turbo',
    startTime: number,
    cvHash: string
  ): Promise<AIExtractionSummary> {
    const skills = await this.getAvailableSkills();
    const prompt = this.buildExtractionPrompt(cvText, skills);

    const response = await this.withRetries(() =>
      this.scheduleRequest(() =>
        axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model,
            messages: [
              { role: 'system', content: this.getSystemPrompt() },
              { role: 'user', content: prompt },
            ],
            temperature: 0.1,
            response_format: { type: 'json_object' },
          },
          {
            headers: {
              'Authorization': `Bearer ${this.openaiApiKey}`,
              'Content-Type': 'application/json',
            },
          }
        )
      )
    );

    const usage = response.data.usage;
    const content = response.data.choices[0].message.content;
    const parsedSkills = JSON.parse(content);
    const pricing = this.PRICING[model];
    const totalCost =
      usage.prompt_tokens * pricing.input + usage.completion_tokens * pricing.output;
    const matchedSkills = await this.matchAISkillsWithDatabase(parsedSkills.skills || [], skills);
    const processingTimeMs = Date.now() - startTime;

    await this.logExtraction({
      candidateId,
      method: 'OPENAI',
      model,
      skillsFound: matchedSkills.length,
      processingTimeMs,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalCost,
      success: true,
      rawResponse: content,
      cvChecksum: cvHash,
    });

    return {
      candidateId,
      skillsFound: matchedSkills,
      totalSkills: matchedSkills.length,
      processingTimeMs,
      method: 'OPENAI',
      model,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalCost,
      success: true,
      rawResponse: content,
      reusedFromCache: false,
    };
  }

  private async performClaudeExtraction(
    candidateId: string,
    cvText: string,
    model: 'claude-3-opus' | 'claude-3-sonnet' | 'claude-3-haiku',
    startTime: number,
    cvHash: string
  ): Promise<AIExtractionSummary> {
    const skills = await this.getAvailableSkills();
    const prompt = this.buildExtractionPrompt(cvText, skills);

    const response = await this.withRetries(() =>
      this.scheduleRequest(() =>
        axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model,
            max_tokens: 4096,
            temperature: 0.1,
            system: this.getSystemPrompt(),
            messages: [{ role: 'user', content: prompt }],
          },
          {
            headers: {
              'x-api-key': this.anthropicApiKey,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json',
            },
          }
        )
      )
    );

    const usage = response.data.usage;
    const content = response.data.content?.[0]?.text || response.data.content;
    const parsedSkills = JSON.parse(content);
    const pricing = this.PRICING[model];
    const totalCost = usage.input_tokens * pricing.input + usage.output_tokens * pricing.output;
    const matchedSkills = await this.matchAISkillsWithDatabase(parsedSkills.skills || [], skills);
    const processingTimeMs = Date.now() - startTime;

    await this.logExtraction({
      candidateId,
      method: 'CLAUDE',
      model,
      skillsFound: matchedSkills.length,
      processingTimeMs,
      promptTokens: usage.input_tokens,
      completionTokens: usage.output_tokens,
      totalCost,
      success: true,
      rawResponse: content,
      cvChecksum: cvHash,
    });

    return {
      candidateId,
      skillsFound: matchedSkills,
      totalSkills: matchedSkills.length,
      processingTimeMs,
      method: 'CLAUDE',
      model,
      promptTokens: usage.input_tokens,
      completionTokens: usage.output_tokens,
      totalCost,
      success: true,
      rawResponse: content,
      reusedFromCache: false,
    };
  }

  private async runExtractionWithCache(options: {
    candidateId: string;
    method: 'OPENAI' | 'CLAUDE';
    model: string;
    cvText: string;
    startTime: number;
    runner: (cvHash: string) => Promise<AIExtractionSummary>;
  }): Promise<AIExtractionSummary> {
    const cvHash = this.computeCvHash(options.cvText);
    this.cacheCvText(options.candidateId, cvHash, options.cvText);

    const cacheKey = this.getCacheKey(options.candidateId, options.model, options.method, cvHash);
    const cached = this.getCachedSummary(cacheKey);
    if (cached) {
      return { ...cached.summary, reusedFromCache: true };
    }

    const persisted = await this.tryReuseExtractionFromLogs(
      options.candidateId,
      options.method,
      options.model,
      cvHash,
      options.startTime
    );
    if (persisted) {
      this.cacheSummary(cacheKey, persisted);
      return persisted;
    }

    if (this.inFlightRequests.has(cacheKey)) {
      return this.inFlightRequests.get(cacheKey)!;
    }

    const task = (async () => {
      const summary = await options.runner(cvHash);
      this.cacheSummary(cacheKey, summary);
      return summary;
    })().catch((error) => {
      throw { error, cvHash };
    });

    this.inFlightRequests.set(cacheKey, task);

    try {
      return await task;
    } finally {
      this.inFlightRequests.delete(cacheKey);
    }
  }

  private async tryReuseExtractionFromLogs(
    candidateId: string,
    method: 'OPENAI' | 'CLAUDE',
    model: string,
    cvHash: string,
    startTime: number
  ): Promise<AIExtractionSummary | null> {
    try {
      const log = await prisma.cvExtractionLog.findFirst({
        where: {
          candidateId,
          extractionMethod: method,
          aiModel: model,
          // cvChecksum: cvHash, // Not supported in DB yet
          success: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!log || !log.rawResponse) {
        return null;
      }

      const parsed = JSON.parse(log.rawResponse);
      const skills = await this.getAvailableSkills();
      const matchedSkills = await this.matchAISkillsWithDatabase(parsed.skills || [], skills);

      return {
        candidateId,
        skillsFound: matchedSkills,
        totalSkills: matchedSkills.length,
        processingTimeMs: Date.now() - startTime,
        method,
        model,
        promptTokens: log.promptTokens || 0,
        completionTokens: log.completionTokens || 0,
        totalCost: 0,
        success: true,
        rawResponse: log.rawResponse,
        reusedFromCache: true,
      };
    } catch (error) {
      console.warn('Impossible de reutiliser une extraction cachee', error);
      return null;
    }
  }

  private computeCvHash(cvText: string): string {
    return createHash('sha256').update(cvText).digest('hex');
  }

  private cacheCvText(candidateId: string, hash: string, text: string): void {
    this.cvTextCache.set(candidateId, {
      hash,
      text,
      expiresAt: Date.now() + this.TEXT_CACHE_TTL_MS,
    });
  }

  private getCacheKey(
    candidateId: string,
    model: string,
    method: 'OPENAI' | 'CLAUDE',
    cvHash: string
  ): string {
    return `${candidateId}:${model}:${method}:${cvHash}`;
  }

  private getCachedSummary(key: string): CachedExtractionSummary | null {
    const entry = this.extractionCache.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt < Date.now()) {
      this.extractionCache.delete(key);
      return null;
    }
    return entry;
  }

  private cacheSummary(key: string, summary: AIExtractionSummary): void {
    this.extractionCache.set(key, {
      summary,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });
  }

  private async withRetries<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    let lastError: unknown;
    while (attempt < this.MAX_RETRIES) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        attempt += 1;
        if (attempt >= this.MAX_RETRIES || !this.shouldRetry(error)) {
          throw error;
        }
        const delayMs = Math.min(1000 * Math.pow(2, attempt), 5000);
        await this.delay(delayMs);
      }
    }
    throw lastError;
  }

  private shouldRetry(error: any): boolean {
    const status = error?.response?.status;
    if (!status) {
      return true;
    }
    return [408, 425, 429, 500, 502, 503, 504].includes(status);
  }

  private async scheduleRequest<T>(task: () => Promise<T>): Promise<T> {
    await this.acquireSlot();
    try {
      const now = Date.now();
      const waitTime = Math.max(0, this.lastRequestTimestamp + this.MIN_REQUEST_INTERVAL_MS - now);
      if (waitTime > 0) {
        await this.delay(waitTime);
      }
      this.lastRequestTimestamp = Date.now();
      return await task();
    } finally {
      this.releaseSlot();
    }
  }

  private acquireSlot(): Promise<void> {
    if (this.activeRequests < this.MAX_CONCURRENT_REQUESTS) {
      this.activeRequests += 1;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.requestQueue.push(() => {
        this.activeRequests += 1;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    const next = this.requestQueue.shift();
    if (next) {
      next();
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  /**
   * Create error summary
   */
  private createErrorSummary(
    candidateId: string,
    method: 'OPENAI' | 'CLAUDE',
    model: string,
    errorMessage: string,
    processingTimeMs: number,
    cvHash?: string
  ): AIExtractionSummary {
    // Log error
    this.logExtraction({
      candidateId,
      method,
      model,
      skillsFound: 0,
      processingTimeMs,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
      success: false,
      errorMessage,
    });

    return {
      candidateId,
      skillsFound: [],
      totalSkills: 0,
      processingTimeMs,
      method,
      model,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
      success: false,
      errorMessage,
    };
  }

  /**
   * Log AI extraction
   */
  private async logExtraction(data: {
    candidateId: string;
    method: string;
    model: string;
    skillsFound: number;
    processingTimeMs: number;
    promptTokens: number;
    completionTokens: number;
    totalCost: number;
    success: boolean;
    errorMessage?: string;
    rawResponse?: string;
    cvChecksum?: string;
  }): Promise<void> {
    try {
      await prisma.cvExtractionLog.create({
        data: {
          candidateId: data.candidateId,
          extractionMethod: data.method,
          aiModel: data.model,
          skillsFound: data.skillsFound,
          processingTimeMs: data.processingTimeMs,
          promptTokens: data.promptTokens,
          completionTokens: data.completionTokens,
          totalCost: data.totalCost,
          success: data.success,
          errorMessage: data.errorMessage,
          rawResponse: data.rawResponse,
        },
      });
    } catch (error) {
      console.error('Failed to log AI extraction:', error);
    }
  }
}

export const aiExtractionService = new AIExtractionService();



