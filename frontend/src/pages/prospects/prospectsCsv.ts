import { ProspectCandidate } from '@/types';

const CSV_HEADERS = [
  'Prénom',
  'Nom',
  'Email',
  'Téléphone',
  'Ville',
  'Province',
  'Code Postal',
  'Adresse',
  'CV',
  'Vidéo',
  'Date de soumission',
  'Contacté',
  'Converti',
  'Lien fiche TalentSecure',
  'Notes',
];

/**
 * Construit le CSV (BOM UTF-8 pour Excel) des prospects fournis et déclenche
 * le téléchargement dans le navigateur. Retourne le nombre de lignes exportées.
 */
export function downloadProspectsCsv(prospects: ProspectCandidate[]): number {
  const appOrigin = window.location.origin;
  const csvRows = [
    CSV_HEADERS.join(','),
    ...prospects.map((prospect: any) =>
      [
        `"${prospect.firstName || ''}"`,
        `"${prospect.lastName || ''}"`,
        `"${prospect.email || ''}"`,
        `"${prospect.phone || ''}"`,
        `"${prospect.city || ''}"`,
        `"${prospect.province || ''}"`,
        `"${prospect.postalCode || ''}"`,
        `"${prospect.streetAddress || ''}"`,
        prospect.cvUrl || prospect.cvStoragePath ? 'Oui' : 'Non',
        prospect.videoStoragePath ? 'Oui' : 'Non',
        prospect.submissionDate ? new Date(prospect.submissionDate).toLocaleDateString('fr-CA') : '',
        prospect.isContacted ? 'Oui' : 'Non',
        prospect.isConverted ? 'Oui' : 'Non',
        `"${appOrigin}/prospects/${prospect.id}"`,
        `"${(prospect.notes || '').replace(/"/g, '""')}"`,
      ].join(',')
    ),
  ];

  const csvContent = csvRows.join('\n');
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().split('T')[0];

  link.setAttribute('href', url);
  link.setAttribute('download', `prospects_${date}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return prospects.length;
}
