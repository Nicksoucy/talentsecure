import React from 'react';
import GeoPointsMap from './GeoPointsMap';

/**
 * Carte des agents (employés) ACTIFS : pins verts à l'adresse exacte (libellé =
 * noms des agents), repli secteur postal / centre-ville, recherche par rayon
 * « trouver les agents proches d'un site ». Voir GeoPointsMap pour le composant
 * générique partagé.
 */
interface EmployeesMapProps {
  onNearbySelect?: (
    center: { lat: number; lng: number },
    radiusKm: number,
    label?: string
  ) => void;
}

const EmployeesMap: React.FC<EmployeesMapProps> = ({ onNearbySelect }) => (
  <GeoPointsMap
    pointsUrl="/api/employees/stats/map-points"
    listUrl="/api/employees"
    unitSingular="agent"
    unitPlural="agents"
    onNearbySelect={onNearbySelect}
  />
);

export default EmployeesMap;
