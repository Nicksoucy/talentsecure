import React from 'react';
import GeoPointsMap from './GeoPointsMap';
import type { EmployeeDivision } from '@/types';

/**
 * Carte des agents (employés) ACTIFS : pins verts à l'adresse exacte (libellé =
 * noms des agents), repli secteur postal / centre-ville, recherche par rayon
 * « trouver les agents proches d'un site ». Voir GeoPointsMap pour le composant
 * générique partagé.
 */
interface EmployeesMapProps {
  /** Métier affiché (agents de sécurité ou signaleurs) ; absent = tous. */
  division?: EmployeeDivision;
  onNearbySelect?: (
    center: { lat: number; lng: number },
    radiusKm: number,
    label?: string
  ) => void;
}

const EmployeesMap: React.FC<EmployeesMapProps> = ({ division, onNearbySelect }) => {
  const q = division ? `?division=${division}` : '';
  const flaggers = division === 'SIGNALISATION';
  return (
    <GeoPointsMap
      pointsUrl={`/api/employees/stats/map-points${q}`}
      listUrl={`/api/employees${q}`}
      unitSingular={flaggers ? 'signaleur' : 'agent'}
      unitPlural={flaggers ? 'signaleurs' : 'agents'}
      sitesUrl="/api/mandates/stats/map-points"
      contracts
      onNearbySelect={onNearbySelect}
    />
  );
};

export default EmployeesMap;
