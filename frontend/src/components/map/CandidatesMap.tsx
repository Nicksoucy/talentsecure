import React from 'react';
import GeoPointsMap from './GeoPointsMap';

/**
 * Carte des candidats actifs (admin) : points par secteur de code postal
 * (FSA, repli centre-ville), recherche par code postal/ville, dépôt d'un point
 * et rayon. Voir GeoPointsMap pour le composant générique partagé.
 */
interface CandidatesMapProps {
  onNearbySelect?: (
    center: { lat: number; lng: number },
    radiusKm: number,
    label?: string
  ) => void;
}

const CandidatesMap: React.FC<CandidatesMapProps> = ({ onNearbySelect }) => (
  <GeoPointsMap
    pointsUrl="/api/candidates/stats/map-points"
    listUrl="/api/candidates"
    unitSingular="candidat"
    unitPlural="candidats"
    sitesUrl="/api/mandates/stats/map-points"
    onNearbySelect={onNearbySelect}
  />
);

export default CandidatesMap;
