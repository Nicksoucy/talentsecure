import React from 'react';
import GeoPointsMap from './GeoPointsMap';

/**
 * Carte des Candidats Potentiels (admin) : points par secteur de code postal
 * (FSA, repli centre-ville), recherche par code postal/ville, dépôt d'un point
 * et rayon. Voir GeoPointsMap pour le composant générique partagé.
 */
interface ProspectsMapClusteredProps {
  onNearbySelect?: (
    center: { lat: number; lng: number },
    radiusKm: number,
    label?: string
  ) => void;
}

const ProspectsMapClustered: React.FC<ProspectsMapClusteredProps> = ({ onNearbySelect }) => (
  <GeoPointsMap
    pointsUrl="/api/prospects/stats/map-points"
    listUrl="/api/prospects"
    unitSingular="CV"
    unitPlural="CV"
    onNearbySelect={onNearbySelect}
  />
);

export default ProspectsMapClustered;
