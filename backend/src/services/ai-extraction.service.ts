import { PrismaClient, Skill, SkillLevel } from '@prisma/client';
import axios from 'axios';

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

export class AIExtractionService {
  private openaiApiKey: string;
  private anthropicApiKey: string;

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
        'OPENAI_API_KEY non configurée',
        Date.now() - startTime
      );
    }

    try {
      // Get available skills for context
      const skills = await this.getAvailableSkills();
      const prompt = this.buildExtractionPrompt(cvText, skills);

      // Call OpenAI API
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model,
          messages: [
            {
              role: 'system',
              content: this.getSystemPrompt(),
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.1, // Low temperature for consistent results
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const usage = response.data.usage;
      const content = response.data.choices[0].message.content;
      const parsedSkills = JSON.parse(content);

      // Calculate cost
      const pricing = this.PRICING[model];
      const totalCost =
        usage.prompt_tokens * pricing.input + usage.completion_tokens * pricing.output;

      // Match extracted skills with database
      const matchedSkills = await this.matchAISkillsWithDatabase(
        parsedSkills.skills || [],
        skills
      );

      const processingTimeMs = Date.now() - startTime;

      // Log extraction
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
      };
    } catch (error: any) {
      const processingTimeMs = Date.now() - startTime;
      return this.createErrorSummary(
        candidateId,
        'OPENAI',
        model,
        error.message,
        processingTimeMs
      );
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
        'ANTHROPIC_API_KEY non configurée',
        Date.now() - startTime
      );
    }

    try {
      // Get available skills for context
      const skills = await this.getAvailableSkills();
      const prompt = this.buildExtractionPrompt(cvText, skills);

      // Call Claude API
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model,
          max_tokens: 4096,
          temperature: 0.1,
          system: this.getSystemPrompt(),
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        },
        {
          headers: {
            'x-api-key': this.anthropicApiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
        }
      );

      const usage = response.data.usage;
      const content = response.data.content[0].text;

      // Extract JSON from response (Claude may wrap it in markdown)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonContent = jsonMatch ? jsonMatch[0] : content;
      const parsedSkills = JSON.parse(jsonContent);

      // Calculate cost
      const pricing = this.PRICING[model];
      const totalCost =
        usage.input_tokens * pricing.input + usage.output_tokens * pricing.output;

      // Match extracted skills with database
      const matchedSkills = await this.matchAISkillsWithDatabase(
        parsedSkills.skills || [],
        skills
      );

      const processingTimeMs = Date.now() - startTime;

      // Log extraction
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
      };
    } catch (error: any) {
      const processingTimeMs = Date.now() - startTime;
      return this.createErrorSummary(candidateId, 'CLAUDE', model, error.message, processingTimeMs);
    }
  }

  /**
   * Get system prompt for AI
   */
  private getSystemPrompt(): string {
    return `Tu es un expert RH spécialisé dans l'analyse de CVs et l'extraction de compétences.

Ton rôle est d'analyser un CV et d'identifier toutes les compétences pertinentes du candidat.

Pour chaque compétence trouvée, fournis:
- name: Nom exact de la compétence
- level: Niveau (BEGINNER, INTERMEDIATE, ADVANCED, EXPERT, ou UNKNOWN)
- yearsExperience: Nombre d'années d'expérience (si mentionné)
- confidence: Score de confiance 0-1 (à quel point tu es certain que le candidat possède cette compétence)
- reasoning: Courte explication de pourquoi tu as identifié cette compétence
- context: Citation exacte du CV qui démontre cette compétence
- isSecurityRelated: true si la compétence est spécifiquement liée aux agents de sécurité/sécurité privée, false sinon

IMPORTANT: isSecurityRelated devrait être true SEULEMENT pour les compétences directement liées au métier d'agent de sécurité (BSP, surveillance, patrouille, premiers soins, contrôle d'accès, etc.). Les compétences générales ou liées à d'autres industries doivent être marquées false.

Réponds UNIQUEMENT avec du JSON valide dans ce format:
{
  "skills": [
    {
      "name": "BSP",
      "level": "ADVANCED",
      "yearsExperience": 5,
      "confidence": 0.95,
      "reasoning": "Certification BSP mentionnée explicitement",
      "context": "Détenteur du permis BSP depuis 5 ans",
      "isSecurityRelated": true
    },
    {
      "name": "Service à la clientèle",
      "level": "INTERMEDIATE",
      "yearsExperience": 3,
      "confidence": 0.85,
      "reasoning": "Expérience en service à la clientèle mentionnée",
      "context": "3 ans d'expérience en service à la clientèle",
      "isSecurityRelated": false
    }
  ]
}`;
  }

  /**
   * Build extraction prompt with available skills context
   */
  private buildExtractionPrompt(cvText: string, skills: Skill[]): string {
    const skillsByCategory = this.groupSkillsByCategory(skills);

    return `Analyse ce CV et identifie TOUTES les compétences du candidat.

Voici les catégories de compétences disponibles:

${Object.entries(skillsByCategory)
  .map(([category, categorySkills]) => {
    return `**${category}:**\n${categorySkills.map((s) => `- ${s.name}`).join('\n')}`;
  })
  .join('\n\n')}

Tu peux aussi identifier des compétences qui ne sont pas dans cette liste si elles sont clairement mentionnées.

**CV À ANALYSER:**

${cvText}

**IMPORTANT:**
- Sois précis dans l'évaluation du niveau
- Base le niveau sur les années d'expérience si disponibles
- Fournis un score de confiance réaliste (0.5-1.0)
- Cite le contexte exact du CV
- N'invente pas de compétences qui ne sont pas mentionnées

Réponds avec JSON valide uniquement.`;
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

  /**
   * Normalize skill level
   */
  private normalizeLevel(level?: string): SkillLevel {
    if (!level) return 'UNKNOWN';
    const upper = level.toUpperCase();
    if (['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT', 'UNKNOWN'].includes(upper)) {
      return upper as SkillLevel;
    }
    return 'UNKNOWN';
  }

  /**
   * Create error summary
   */
  private createErrorSummary(
    candidateId: string,
    method: 'OPENAI' | 'CLAUDE',
    model: string,
    errorMessage: string,
    processingTimeMs: number
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
