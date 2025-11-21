import { PrismaClient, Skill, SkillLevel, CandidateStatus } from '@prisma/client';
const pdfParse = require('pdf-parse');
import * as fs from 'fs';
import * as path from 'path';
import { LOCAL_CV_PATH, GCS_CV_BUCKET, storage, useGCS } from '../config/storage';

const prisma = new PrismaClient();

interface ExtractionResult {
  skillId: string;
  skillName: string;
  confidence: number;
  extractedText: string;
  yearsExperience?: number;
  level?: SkillLevel;
}

interface ExtractionSummary {
  candidateId: string;
  skillsFound: ExtractionResult[];
  totalSkills: number;
  processingTimeMs: number;
  method: 'REGEX';
  success: boolean;
  errorMessage?: string;
}

export class CVExtractionService {
  /**
   * Extract skills from candidate's CV text using regex/keyword matching
   */
  async extractSkillsFromText(
    candidateId: string,
    cvText: string
  ): Promise<ExtractionSummary> {
    const startTime = Date.now();

    try {
      // Normalize text for matching (lowercase, remove accents)
      const normalizedText = this.normalizeText(cvText);

      // Get all active skills with their keywords
      const skills = await prisma.skill.findMany({
        where: { isActive: true },
      });

      const extractedSkills: ExtractionResult[] = [];

      // Match each skill against the text
      for (const skill of skills) {
        const match = this.matchSkill(skill, normalizedText, cvText);
        if (match) {
          extractedSkills.push(match);
        }
      }

      // Log the extraction
      const processingTimeMs = Date.now() - startTime;
      await this.logExtraction({
        candidateId,
        method: 'REGEX',
        skillsFound: extractedSkills.length,
        processingTimeMs,
        success: true,
      });

      return {
        candidateId,
        skillsFound: extractedSkills,
        totalSkills: extractedSkills.length,
        processingTimeMs,
        method: 'REGEX',
        success: true,
      };
    } catch (error: any) {
      const processingTimeMs = Date.now() - startTime;

      // Log failed extraction
      await this.logExtraction({
        candidateId,
        method: 'REGEX',
        skillsFound: 0,
        processingTimeMs,
        success: false,
        errorMessage: error.message,
      });

      return {
        candidateId,
        skillsFound: [],
        totalSkills: 0,
        processingTimeMs,
        method: 'REGEX',
        success: false,
        errorMessage: error.message,
      };
    }
  }

  /**
   * Normalize text for matching (lowercase, remove accents)
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^\w\s]/g, ' ') // Remove special chars except spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Match a skill against normalized text
   */
  private matchSkill(
    skill: Skill,
    normalizedText: string,
    originalText: string
  ): ExtractionResult | null {
    let bestMatch: { keyword: string; index: number } | null = null;
    let highestConfidence = 0;

    // Try to match each keyword
    for (const keyword of skill.keywords) {
      const normalizedKeyword = this.normalizeText(keyword);

      // Word boundary regex to avoid partial matches
      const regex = new RegExp(`\\b${this.escapeRegex(normalizedKeyword)}\\b`, 'g');
      const matches = normalizedText.match(regex);

      if (matches && matches.length > 0) {
        // Calculate confidence based on number of matches
        const confidence = Math.min(0.5 + matches.length * 0.1, 1.0);

        if (confidence > highestConfidence) {
          highestConfidence = confidence;
          const index = normalizedText.indexOf(normalizedKeyword);
          bestMatch = { keyword, index };
        }
      }
    }

    if (!bestMatch) {
      return null;
    }

    // Extract context around the match (20 chars before and after)
    const contextStart = Math.max(0, bestMatch.index - 20);
    const contextEnd = Math.min(normalizedText.length, bestMatch.index + bestMatch.keyword.length + 20);
    const extractedText = originalText.substring(contextStart, contextEnd).trim();

    // Try to extract years of experience
    const yearsExperience = this.extractYearsExperience(normalizedText, bestMatch.index);

    // Determine skill level based on years of experience
    const level = this.determineSkillLevel(yearsExperience);

    return {
      skillId: skill.id,
      skillName: skill.name,
      confidence: highestConfidence,
      extractedText: extractedText || bestMatch.keyword,
      yearsExperience,
      level,
    };
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Try to extract years of experience from context
   * Looks for patterns like "5 ans", "3 années", "2+ years", etc.
   */
  private extractYearsExperience(text: string, position: number): number | undefined {
    // Look in context around the match (100 chars before and after)
    const contextStart = Math.max(0, position - 100);
    const contextEnd = Math.min(text.length, position + 100);
    const context = text.substring(contextStart, contextEnd);

    // Patterns for years of experience
    const patterns = [
      /(\d+)\s*(?:\+)?\s*(?:ans?|annees?|years?)/i,
      /(?:ans?|annees?|years?)\s*:\s*(\d+)/i,
      /experience\s*:\s*(\d+)/i,
      /(\d+)\s*(?:ans?|annees?|years?)\s*(?:d')?experience/i,
    ];

    for (const pattern of patterns) {
      const match = context.match(pattern);
      if (match && match[1]) {
        const years = parseInt(match[1], 10);
        if (years >= 0 && years <= 50) {
          return years;
        }
      }
    }

    return undefined;
  }

  /**
   * Determine skill level based on years of experience
   */
  private determineSkillLevel(yearsExperience?: number): SkillLevel {
    if (!yearsExperience) {
      return 'UNKNOWN';
    }

    if (yearsExperience < 1) {
      return 'BEGINNER';
    } else if (yearsExperience < 3) {
      return 'INTERMEDIATE';
    } else if (yearsExperience < 5) {
      return 'ADVANCED';
    } else {
      return 'EXPERT';
    }
  }

  /**
   * Log extraction to database
   */
  private async logExtraction(data: {
    candidateId: string;
    method: string;
    skillsFound: number;
    processingTimeMs: number;
    success: boolean;
    errorMessage?: string;
  }): Promise<void> {
    try {
      await prisma.cvExtractionLog.create({
        data: {
          candidateId: data.candidateId,
          extractionMethod: data.method,
          skillsFound: data.skillsFound,
          processingTimeMs: data.processingTimeMs,
          success: data.success,
          errorMessage: data.errorMessage,
        },
      });
    } catch (error) {
      console.error('Failed to log extraction:', error);
    }
  }

  /**
   * Save extracted skills to candidate
   * If the candidateId is a prospect, auto-convert to candidate first
   */
  async saveExtractedSkills(
    candidateId: string,
    extractedSkills: ExtractionResult[],
    overwrite: boolean = false,
    isProspect: boolean = false,
    userId?: string
  ): Promise<{ added: number; skipped: number; updated: number }> {
    // If this is a prospect, convert to candidate first
    if (isProspect && userId) {
      await this.convertProspectToCandidate(candidateId, userId);
    }

    let added = 0;
    let skipped = 0;
    let updated = 0;

    for (const skill of extractedSkills) {
      // Check if candidate already has this skill
      const existing = await prisma.candidateSkill.findUnique({
        where: {
          candidateId_skillId: {
            candidateId,
            skillId: skill.skillId,
          },
        },
      });

      if (existing) {
        if (overwrite) {
          // Update if new confidence is higher
          if (skill.confidence > (existing.confidence || 0)) {
            await prisma.candidateSkill.update({
              where: { id: existing.id },
              data: {
                level: skill.level || 'UNKNOWN',
                yearsExperience: skill.yearsExperience,
                extractedText: skill.extractedText,
                source: 'REGEX_EXTRACTED',
                confidence: skill.confidence,
              },
            });
            updated++;
          } else {
            skipped++;
          }
        } else {
          skipped++;
        }
      } else {
        // Create new candidate skill
        await prisma.candidateSkill.create({
          data: {
            candidateId,
            skillId: skill.skillId,
            level: skill.level || 'UNKNOWN',
            yearsExperience: skill.yearsExperience,
            extractedText: skill.extractedText,
            source: 'REGEX_EXTRACTED',
            confidence: skill.confidence,
            isVerified: false,
          },
        });
        added++;
      }
    }

    return { added, skipped, updated };
  }

  /**
   * Extract text from PDF file
   */
  private async extractTextFromPDF(filePath: string): Promise<string> {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.warn(`PDF file not found: ${filePath}`);
        return '';
      }

      // Read PDF file
      const dataBuffer = fs.readFileSync(filePath);

      // Parse PDF
      const data = await pdfParse(dataBuffer);

      return data.text || '';
    } catch (error: any) {
      console.error(`Error extracting text from PDF ${filePath}:`, error.message);
      return '';
    }
  }

  /**
   * Get CV file from storage (local or cloud)
   */
  private async getCVFilePath(cvStoragePath: string): Promise<string | null> {
    if (!cvStoragePath) {
      return null;
    }

    try {
      if (useGCS && storage) {
        // Download from Google Cloud Storage to temp file
        const tempDir = path.join(__dirname, '../../temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        const tempFilePath = path.join(tempDir, `temp_${Date.now()}_${path.basename(cvStoragePath)}`);
        const bucket = storage.bucket(GCS_CV_BUCKET);
        const file = bucket.file(cvStoragePath);

        await file.download({ destination: tempFilePath });
        return tempFilePath;
      } else {
        // Local storage
        const localPath = path.join(LOCAL_CV_PATH, cvStoragePath);
        if (fs.existsSync(localPath)) {
          return localPath;
        }
        return null;
      }
    } catch (error: any) {
      console.error(`Error retrieving CV file ${cvStoragePath}:`, error.message);
      return null;
    }
  }

  /**
   * Clean up temporary file
   */
  private cleanupTempFile(filePath: string): void {
    try {
      if (filePath && fs.existsSync(filePath) && filePath.includes('/temp/')) {
        fs.unlinkSync(filePath);
      }
    } catch (error: any) {
      console.error(`Error cleaning up temp file ${filePath}:`, error.message);
    }
  }

  /**
   * Extract text from candidate/prospect data including PDF CV files
   */
  async getCandidateText(candidateId: string, isProspect: boolean = false): Promise<string> {
    if (isProspect) {
      // Handle prospects differently - they only have basic info and CV
      const prospect = await prisma.prospectCandidate.findUnique({
        where: { id: candidateId },
      });

      if (!prospect) {
        throw new Error('Prospect non trouvé');
      }

      const textParts: string[] = [];

      // Basic info
      textParts.push(`${prospect.firstName} ${prospect.lastName}`);
      if (prospect.email) textParts.push(`Email: ${prospect.email}`);
      if (prospect.phone) textParts.push(`Téléphone: ${prospect.phone}`);
      if (prospect.city && prospect.province) {
        textParts.push(`Ville: ${prospect.city}, ${prospect.province}`);
      }

      // Extract text from CV PDF file
      let tempFilePath: string | null = null;
      try {
        if (prospect.cvStoragePath) {
          tempFilePath = await this.getCVFilePath(prospect.cvStoragePath);

          if (tempFilePath && tempFilePath.toLowerCase().endsWith('.pdf')) {
            const pdfText = await this.extractTextFromPDF(tempFilePath);
            if (pdfText && pdfText.length > 0) {
              textParts.push('\n=== CONTENU DU CV PDF ===\n');
              textParts.push(pdfText);
            }
          }
        }
      } catch (error: any) {
        console.error(`Error extracting PDF text for prospect ${candidateId}:`, error.message);
      } finally {
        if (tempFilePath) {
          await this.cleanupTempFile(tempFilePath);
        }
      }

      return textParts.join('\n');
    }

    // Original candidate logic
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        experiences: true,
        certifications: true,
        languages: true,
      },
    });

    if (!candidate) {
      throw new Error('Candidat non trouvé');
    }

    // Build text from all candidate data
    const textParts: string[] = [];

    // Basic info
    textParts.push(`${candidate.firstName} ${candidate.lastName}`);
    textParts.push(`Ville: ${candidate.city}, ${candidate.province}`);

    // HR Notes and strengths/weaknesses
    if (candidate.hrNotes) {
      textParts.push(`Notes RH: ${candidate.hrNotes}`);
    }
    if (candidate.strengths) {
      textParts.push(`Forces: ${candidate.strengths}`);
    }
    if (candidate.weaknesses) {
      textParts.push(`Faiblesses: ${candidate.weaknesses}`);
    }

    // Interview details (if stored as JSON)
    if (candidate.interviewDetails) {
      textParts.push(JSON.stringify(candidate.interviewDetails));
    }

    // Experiences
    for (const exp of candidate.experiences) {
      textParts.push(`Experience: ${exp.position} chez ${exp.companyName}`);
      if (exp.description) {
        textParts.push(exp.description);
      }
      if (exp.responsibilities) {
        textParts.push(exp.responsibilities);
      }
      if (exp.durationMonths) {
        textParts.push(`Durée: ${exp.durationMonths} mois (${Math.floor(exp.durationMonths / 12)} ans)`);
      }
    }

    // Certifications
    for (const cert of candidate.certifications) {
      textParts.push(`Certification: ${cert.name}`);
      if (cert.issuingOrg) {
        textParts.push(`Émis par: ${cert.issuingOrg}`);
      }
    }

    // Special certifications
    if (candidate.hasBSP) {
      textParts.push('BSP - Bureau de la Sécurité Privée');
      if (candidate.bspNumber) {
        textParts.push(`Numéro BSP: ${candidate.bspNumber}`);
      }
    }

    if (candidate.hasDriverLicense) {
      textParts.push('Permis de conduire');
      if (candidate.driverLicenseClass) {
        textParts.push(`Classe: ${candidate.driverLicenseClass}`);
      }
    }

    // Languages
    for (const lang of candidate.languages) {
      textParts.push(`Langue: ${lang.language} - Niveau: ${lang.level}`);
    }

    // Extract text from CV PDF file
    let tempFilePath: string | null = null;
    try {
      if (candidate.cvStoragePath) {
        tempFilePath = await this.getCVFilePath(candidate.cvStoragePath);

        if (tempFilePath && tempFilePath.toLowerCase().endsWith('.pdf')) {
          const pdfText = await this.extractTextFromPDF(tempFilePath);
          if (pdfText && pdfText.length > 0) {
            textParts.push('\n=== CONTENU DU CV PDF ===\n');
            textParts.push(pdfText);
          }
        }
      }
    } catch (error: any) {
      console.error(`Error extracting PDF text for candidate ${candidateId}:`, error.message);
    } finally {
      // Clean up temp file if it was downloaded from cloud
      if (tempFilePath && useGCS) {
        this.cleanupTempFile(tempFilePath);
      }
    }

    return textParts.join('\n');
  }

  /**
   * Convert prospect to candidate
   * This is called automatically when extracting skills from a prospect
   */
  private async convertProspectToCandidate(prospectId: string, userId: string): Promise<void> {
    const prospect = await prisma.prospectCandidate.findUnique({
      where: { id: prospectId },
    });

    if (!prospect) {
      throw new Error('Prospect not found');
    }

    // Check if already converted
    if (prospect.isConverted) {
      return; // Already converted, nothing to do
    }

    // Create candidate from prospect
    const candidate = await prisma.candidate.create({
      data: {
        id: prospect.id, // Use same ID
        firstName: prospect.firstName,
        lastName: prospect.lastName,
        email: prospect.email,
        phone: prospect.phone || '',
        city: prospect.city || '',
        province: prospect.province || 'QC',
        postalCode: prospect.postalCode || '',
        address: prospect.streetAddress || '',
        cvStoragePath: prospect.cvStoragePath,
        status: CandidateStatus.EN_ATTENTE, // Initial status - waiting for evaluation
        isActive: true,
        isDeleted: false,
        createdById: userId, // Required field
      },
    });

    // Mark prospect as converted
    await prisma.prospectCandidate.update({
      where: { id: prospectId },
      data: {
        isConverted: true,
        convertedAt: new Date(),
        convertedToId: candidate.id,
      },
    });

    console.log(`✅ Prospect ${prospectId} converted to candidate ${candidate.id}`);
  }
}

export const cvExtractionService = new CVExtractionService();
