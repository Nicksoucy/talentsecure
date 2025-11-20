import { Request, Response, NextFunction } from 'express';
import { Parser } from 'json2csv';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { buildExtractedSkillsFilters, fetchExtractedSkillsResults } from '../services/skill-search.service';

const flattenResults = (results: any[]) => {
  return results.flatMap((skill) => {
    if (!skill.candidates.length) {
      return [
        {
          skillId: skill.skillId,
          skillName: skill.skillName,
          category: skill.category,
          totalCandidates: skill.totalCandidates,
          candidateId: '',
          candidateName: '',
          candidateEmail: '',
          candidatePhone: '',
          city: '',
          province: '',
          status: '',
          confidence: '',
          level: '',
          yearsExperience: '',
          source: '',
          isVerified: '',
        },
      ];
    }

    return skill.candidates.map((cs: any) => {
      const candidate = cs.candidate;
      const fullName = candidate ? `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() : '';
      return {
        skillId: skill.skillId,
        skillName: skill.skillName,
        category: skill.category,
        totalCandidates: skill.totalCandidates,
        candidateId: cs.candidateId,
        candidateName: fullName,
        candidateEmail: candidate?.email || '',
        candidatePhone: candidate?.phone || '',
        city: candidate?.city || '',
        province: candidate?.province || '',
        status: candidate?.status || '',
        confidence: typeof cs.confidence === 'number' ? cs.confidence : '',
        level: cs.level,
        yearsExperience: cs.yearsExperience ?? '',
        source: cs.source,
        isVerified: cs.isVerified ? 'true' : 'false',
      };
    });
  });
};

const getFileName = (prefix: string, extension: string) => {
  const date = new Date().toISOString().split('T')[0];
  return `${prefix}-${date}.${extension}`;
};

export const exportSkillsCsv = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = buildExtractedSkillsFilters(req.query);
    const { results } = await fetchExtractedSkillsResults(filters);
    const rows = flattenResults(results);

    const parser = new Parser({
      fields: [
        { label: 'Skill ID', value: 'skillId' },
        { label: 'Skill Name', value: 'skillName' },
        { label: 'Category', value: 'category' },
        { label: 'Total Candidates', value: 'totalCandidates' },
        { label: 'Candidate ID', value: 'candidateId' },
        { label: 'Candidate Name', value: 'candidateName' },
        { label: 'Candidate Email', value: 'candidateEmail' },
        { label: 'Candidate Phone', value: 'candidatePhone' },
        { label: 'City', value: 'city' },
        { label: 'Province', value: 'province' },
        { label: 'Status', value: 'status' },
        { label: 'Confidence', value: 'confidence' },
        { label: 'Level', value: 'level' },
        { label: 'Years Experience', value: 'yearsExperience' },
        { label: 'Source', value: 'source' },
        { label: 'Verified', value: 'isVerified' },
      ],
      withBOM: true,
    });

    const csv = parser.parse(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${getFileName('skills-export', 'csv')}"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
};

export const exportSkillsExcel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = buildExtractedSkillsFilters(req.query, { defaultLimit: 1000, maxLimit: 5000 });
    const { results } = await fetchExtractedSkillsResults(filters);
    const rows = flattenResults(results);

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Competences');
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${getFileName('skills-export', 'xlsx')}"`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

export const exportSkillsPdf = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = buildExtractedSkillsFilters(req.query, { defaultLimit: 500, maxLimit: 1000 });
    const { results } = await fetchExtractedSkillsResults(filters);

    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${getFileName('skills-export', 'pdf')}"`);
      res.send(pdfBuffer);
    });

    doc.fontSize(18).text('Export des compétences', { align: 'left' });
    doc.moveDown();

    results.forEach((skill) => {
      doc.fontSize(14).fillColor('#111827').text(skill.skillName);
      doc.fontSize(10).fillColor('#6B7280').text(`Catégorie: ${skill.category} • Candidats: ${skill.totalCandidates}`);
      doc.moveDown(0.5);

      skill.candidates.slice(0, 5).forEach((candidate) => {
        const candidateName = `${candidate.candidate?.firstName || ''} ${candidate.candidate?.lastName || ''}`.trim();
        doc.fontSize(10).fillColor('#111827').text(`- ${candidateName || 'Candidat'} (${candidate.candidate?.city || 'Ville inconnue'})`);
        doc.fontSize(9).fillColor('#6B7280').text(
          `  Niveau: ${candidate.level} | Exp: ${candidate.yearsExperience || '-'} ans | Confiance: ${
            typeof candidate.confidence === 'number' ? Math.round(candidate.confidence * 100) + '%' : 'N/A'
          }`
        );
      });

      if (skill.candidates.length > 5) {
        doc.fontSize(9).fillColor('#9CA3AF').text(`  ... ${skill.candidates.length - 5} candidats supplémentaires`);
      }

      doc.moveDown();
    });

    doc.end();
  } catch (error) {
    next(error);
  }
};
