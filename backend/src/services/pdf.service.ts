import PDFDocument from 'pdfkit';
import { PDFDocument as PDFLib, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

interface CandidateData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  city?: string;
  province?: string;
  globalRating?: number;
  professionalismRating?: number;
  communicationRating?: number;
  appearanceRating?: number;
  motivationRating?: number;
  experienceRating?: number;
  hasVehicle?: boolean;
  canTravelKm?: number;
  hasBSP?: boolean;
  hasDriverLicense?: boolean;
  languages?: Array<{
    language: string;
    level: string;
    canRead: boolean;
    canWrite: boolean;
    canSpeak: boolean;
  }>;
  experiences?: Array<{
    companyName: string;
    position: string;
    startDate: Date;
    endDate?: Date;
    isCurrent: boolean;
    description?: string;
  }>;
  availabilities?: Array<{
    type: string;
    isAvailable: boolean;
  }>;
  certifications?: Array<{
    name: string;
    issuingOrg?: string;
  }>;
  strengths?: string;
  weaknesses?: string;
  hrNotes?: string;
  cvUrl?: string;
  cvStoragePath?: string;
}

interface CatalogueData {
  id: string;
  title: string;
  customMessage?: string;
  includeSummary: boolean;
  includeDetails: boolean;
  includeVideo: boolean;
  includeExperience: boolean;
  includeSituation: boolean;
  includeCV: boolean;
  client: {
    name: string;
    companyName?: string;
    email: string;
    phone?: string;
    address?: string;
    city?: string;
    province?: string;
  };
  items: Array<{
    order: number;
    candidate: CandidateData;
  }>;
  createdAt: Date;
}

export class PDFService {
  /**
   * Generate a professional catalogue PDF
   */
  static async generateCataloguePDF(
    catalogue: CatalogueData,
    outputPath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 },
          info: {
            Title: catalogue.title,
            Author: 'TalentSecure',
            Subject: `Catalogue de candidats pour ${catalogue.client.companyName || catalogue.client.name}`,
          },
        });

        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        // Header
        this.addHeader(doc, catalogue);

        // Client Information
        this.addClientInfo(doc, catalogue.client);

        // Custom Message
        if (catalogue.customMessage) {
          this.addCustomMessage(doc, catalogue.customMessage);
        }

        // Table of Contents
        this.addTableOfContents(doc, catalogue.items);

        // Candidates
        catalogue.items.forEach((item, index) => {
          doc.addPage();
          this.addCandidateSection(doc, item.candidate, index + 1, catalogue);
        });

        // Footer on last page
        this.addFooter(doc);

        doc.end();

        stream.on('finish', resolve);
        stream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Add header to the document
   */
  private static addHeader(doc: typeof PDFDocument, catalogue: CatalogueData) {
    // Title
    doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .fillColor('#1976d2')
      .text('TalentSecure', { align: 'center' });

    doc
      .fontSize(18)
      .fillColor('#333')
      .text(catalogue.title, { align: 'center' });

    doc.moveDown(0.5);

    // Date
    doc
      .fontSize(10)
      .fillColor('#666')
      .text(`Généré le ${new Date(catalogue.createdAt).toLocaleDateString('fr-CA')}`, {
        align: 'center',
      });

    doc.moveDown(2);

    // Horizontal line
    doc
      .strokeColor('#1976d2')
      .lineWidth(2)
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .stroke();

    doc.moveDown(1);
  }

  /**
   * Add client information
   */
  private static addClientInfo(
    doc: typeof PDFDocument,
    client: CatalogueData['client']
  ) {
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#333').text('Client:');
    doc.moveDown(0.5);

    doc.fontSize(12).font('Helvetica');

    if (client.companyName) {
      doc.text(`Entreprise: ${client.companyName}`);
    }
    doc.text(`Contact: ${client.name}`);
    doc.text(`Email: ${client.email}`);
    if (client.phone) doc.text(`Téléphone: ${client.phone}`);
    if (client.city && client.province) {
      doc.text(`Localisation: ${client.city}, ${client.province}`);
    }

    doc.moveDown(1.5);
  }

  /**
   * Add custom message
   */
  private static addCustomMessage(doc: typeof PDFDocument, message: string) {
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#333')
      .text('Message personnalisé:');
    doc.moveDown(0.5);

    doc
      .fontSize(11)
      .font('Helvetica')
      .fillColor('#555')
      .text(message, { align: 'justify' });

    doc.moveDown(1.5);
  }

  /**
   * Add table of contents
   */
  private static addTableOfContents(
    doc: typeof PDFDocument,
    items: CatalogueData['items']
  ) {
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor('#333')
      .text('Candidats inclus dans ce catalogue:');
    doc.moveDown(0.5);

    doc.fontSize(11).font('Helvetica');

    items.forEach((item, index) => {
      const candidate = item.candidate;
      const rating = candidate.globalRating
        ? ` - Note: ${candidate.globalRating}/10`
        : '';
      doc.text(
        `${index + 1}. ${candidate.firstName} ${candidate.lastName}${rating}`
      );
    });

    doc.moveDown(1);
  }

  /**
   * Add candidate section
   */
  private static addCandidateSection(
    doc: typeof PDFDocument,
    candidate: CandidateData,
    number: number,
    catalogue: CatalogueData
  ) {
    const pageTop = 50;
    let currentY = pageTop;

    // Candidate header with number and name
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .fillColor('#1976d2')
      .text(
        `Candidat #${number}: ${candidate.firstName} ${candidate.lastName}`,
        50,
        currentY
      );
    currentY = doc.y + 10;

    // Contact info
    doc.fontSize(10).font('Helvetica').fillColor('#666');
    if (candidate.email) doc.text(`Email: ${candidate.email}`, 50, currentY);
    currentY = doc.y;
    if (candidate.phone) doc.text(`Téléphone: ${candidate.phone}`, 50, currentY);
    currentY = doc.y;
    if (candidate.city) {
      doc.text(
        `Localisation: ${candidate.city}, ${candidate.province || 'QC'}`,
        50,
        currentY
      );
      currentY = doc.y;
    }

    doc.moveDown(1);
    currentY = doc.y;

    // Ratings section
    if (catalogue.includeSummary && candidate.globalRating) {
      this.addRatingsSection(doc, candidate);
      currentY = doc.y;
    }

    // Transport & Mobility
    if (candidate.hasVehicle !== undefined || candidate.canTravelKm) {
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#333').text('Transport:');
      doc.fontSize(10).font('Helvetica').fillColor('#555');
      if (candidate.hasVehicle !== undefined) {
        doc.text(
          `Véhicule: ${candidate.hasVehicle ? 'Oui ✓' : 'Non'}`
        );
      }
      if (candidate.canTravelKm) {
        doc.text(`Peut se déplacer jusqu'à: ${candidate.canTravelKm} km`);
      }
      currentY = doc.y;
    }

    // Certifications
    if (candidate.hasBSP || candidate.hasDriverLicense) {
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#333').text('Certifications:');
      doc.fontSize(10).font('Helvetica').fillColor('#555');
      if (candidate.hasBSP) doc.text('✓ Permis BSP');
      if (candidate.hasDriverLicense) doc.text('✓ Permis de conduire');
      currentY = doc.y;
    }

    // Languages
    if (
      catalogue.includeDetails &&
      candidate.languages &&
      candidate.languages.length > 0
    ) {
      this.addLanguagesSection(doc, candidate.languages);
      currentY = doc.y;
    }

    // Availabilities
    if (candidate.availabilities && candidate.availabilities.length > 0) {
      this.addAvailabilitiesSection(doc, candidate.availabilities);
      currentY = doc.y;
    }

    // Experiences
    if (
      catalogue.includeExperience &&
      candidate.experiences &&
      candidate.experiences.length > 0
    ) {
      // Check if we need a new page
      if (doc.y > 600) {
        doc.addPage();
        currentY = pageTop;
      }
      this.addExperiencesSection(doc, candidate.experiences);
      currentY = doc.y;
    }

    // Strengths & Weaknesses
    if (catalogue.includeDetails) {
      if (candidate.strengths) {
        if (doc.y > 650) doc.addPage();
        doc.moveDown(0.5);
        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .fillColor('#333')
          .text('Forces:');
        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor('#555')
          .text(candidate.strengths, { align: 'justify' });
        currentY = doc.y;
      }

      if (candidate.weaknesses) {
        if (doc.y > 700) doc.addPage();
        doc.moveDown(0.5);
        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .fillColor('#333')
          .text('Points à améliorer:');
        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor('#555')
          .text(candidate.weaknesses, { align: 'justify' });
        currentY = doc.y;
      }
    }

    // HR Notes
    if (candidate.hrNotes && catalogue.includeDetails) {
      if (doc.y > 700) doc.addPage();
      doc.moveDown(0.5);
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .fillColor('#333')
        .text('Notes RH:');
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#555')
        .text(candidate.hrNotes, { align: 'justify' });
    }

    // CV Note
    if (catalogue.includeCV && (candidate.cvUrl || candidate.cvStoragePath)) {
      doc.moveDown(1);
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#1976d2')
        .text('📄 CV disponible en annexe');
    }
  }

  /**
   * Add ratings section
   */
  private static addRatingsSection(
    doc: typeof PDFDocument,
    candidate: CandidateData
  ) {
    doc.moveDown(0.5);
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#333')
      .text('Évaluations:');
    doc.moveDown(0.3);

    const ratings = [
      { label: 'Global', value: candidate.globalRating },
      { label: 'Professionnalisme', value: candidate.professionalismRating },
      { label: 'Communication', value: candidate.communicationRating },
      { label: 'Présentation', value: candidate.appearanceRating },
      { label: 'Motivation', value: candidate.motivationRating },
      { label: 'Expérience', value: candidate.experienceRating },
    ];

    ratings.forEach((rating) => {
      if (rating.value) {
        doc.fontSize(10).font('Helvetica').fillColor('#555');
        const stars = '★'.repeat(Math.round(rating.value));
        const emptyStars = '☆'.repeat(10 - Math.round(rating.value));
        doc.text(`${rating.label}: ${stars}${emptyStars} (${rating.value}/10)`);
      }
    });

    doc.moveDown(0.5);
  }

  /**
   * Add languages section
   */
  private static addLanguagesSection(
    doc: typeof PDFDocument,
    languages: CandidateData['languages']
  ) {
    doc.moveDown(0.5);
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#333')
      .text('Langues:');
    doc.fontSize(10).font('Helvetica').fillColor('#555');

    languages?.forEach((lang) => {
      const skills = [];
      if (lang.canSpeak) skills.push('Parler');
      if (lang.canRead) skills.push('Lire');
      if (lang.canWrite) skills.push('Écrire');
      doc.text(`• ${lang.language} (${lang.level}) - ${skills.join(', ')}`);
    });

    doc.moveDown(0.5);
  }

  /**
   * Add availabilities section
   */
  private static addAvailabilitiesSection(
    doc: typeof PDFDocument,
    availabilities: CandidateData['availabilities']
  ) {
    doc.moveDown(0.5);
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#333')
      .text('Disponibilités:');
    doc.fontSize(10).font('Helvetica').fillColor('#555');

    const available = availabilities?.filter((a) => a.isAvailable);
    if (available && available.length > 0) {
      available.forEach((avail) => {
        const label = avail.type.replace('_', ' ');
        doc.text(`✓ ${label}`);
      });
    } else {
      doc.text('Non spécifié');
    }

    doc.moveDown(0.5);
  }

  /**
   * Add experiences section
   */
  private static addExperiencesSection(
    doc: typeof PDFDocument,
    experiences: CandidateData['experiences']
  ) {
    doc.moveDown(0.5);
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#333')
      .text('Expérience professionnelle:');
    doc.moveDown(0.3);

    experiences?.slice(0, 3).forEach((exp) => {
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#555');
      doc.text(`${exp.position} - ${exp.companyName}`);

      doc.fontSize(9).font('Helvetica').fillColor('#666');
      const startDate = new Date(exp.startDate).toLocaleDateString('fr-CA', {
        year: 'numeric',
        month: 'short',
      });
      const endDate = exp.isCurrent
        ? 'Présent'
        : exp.endDate
        ? new Date(exp.endDate).toLocaleDateString('fr-CA', {
            year: 'numeric',
            month: 'short',
          })
        : '';
      doc.text(`${startDate} - ${endDate}`);

      if (exp.description) {
        doc
          .fontSize(9)
          .fillColor('#555')
          .text(exp.description, { align: 'justify' });
      }
      doc.moveDown(0.5);
    });

    doc.moveDown(0.3);
  }

  /**
   * Add footer
   */
  private static addFooter(doc: typeof PDFDocument) {
    doc.moveDown(2);
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#999')
      .text('---', { align: 'center' });
    doc.text('Document généré par TalentSecure', { align: 'center' });
    doc.text(
      `Le ${new Date().toLocaleDateString('fr-CA')} à ${new Date().toLocaleTimeString('fr-CA')}`,
      { align: 'center' }
    );
  }

  /**
   * Merge CV PDFs with the catalogue (if includeCV is true)
   */
  static async mergeCVs(
    cataloguePdfPath: string,
    cvPaths: string[]
  ): Promise<Buffer> {
    try {
      // Load the main catalogue PDF
      const cataloguePdfBytes = fs.readFileSync(cataloguePdfPath);
      const pdfDoc = await PDFLib.load(cataloguePdfBytes);

      // Add each CV as separate pages
      for (const cvPath of cvPaths) {
        if (fs.existsSync(cvPath)) {
          try {
            const cvBytes = fs.readFileSync(cvPath);
            const cvPdf = await PDFLib.load(cvBytes);
            const copiedPages = await pdfDoc.copyPages(
              cvPdf,
              cvPdf.getPageIndices()
            );
            copiedPages.forEach((page) => pdfDoc.addPage(page));
          } catch (error) {
            console.error(`Error merging CV from ${cvPath}:`, error);
            // Continue with other CVs even if one fails
          }
        }
      }

      return Buffer.from(await pdfDoc.save());
    } catch (error) {
      console.error('Error merging CVs:', error);
      throw error;
    }
  }
}
