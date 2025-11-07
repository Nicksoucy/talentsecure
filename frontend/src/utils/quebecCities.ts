// Coordonnées GPS des villes du Québec
export interface CityCoordinates {
  lat: number;
  lng: number;
}

export const quebecCitiesCoordinates: { [key: string]: CityCoordinates } = {
  'Montréal': { lat: 45.5017, lng: -73.5673 },
  'Québec': { lat: 46.8139, lng: -71.2080 },
  'Laval': { lat: 45.6066, lng: -73.7124 },
  'Gatineau': { lat: 45.4765, lng: -75.7013 },
  'Longueuil': { lat: 45.5312, lng: -73.5183 },
  'Sherbrooke': { lat: 45.4042, lng: -71.8929 },
  'Saguenay': { lat: 48.4284, lng: -71.0659 },
  'Trois-Rivières': { lat: 46.3432, lng: -72.5424 },
  'Terrebonne': { lat: 45.7000, lng: -73.6333 },
  'Saint-Jean-sur-Richelieu': { lat: 45.3075, lng: -73.2625 },
  'Repentigny': { lat: 45.7425, lng: -73.4500 },
  'Brossard': { lat: 45.4667, lng: -73.4667 },
  'Drummondville': { lat: 45.8833, lng: -72.4833 },
  'Saint-Jérôme': { lat: 45.7800, lng: -74.0033 },
  'Granby': { lat: 45.4000, lng: -72.7333 },
  'Blainville': { lat: 45.6711, lng: -73.8811 },
  'Shawinigan': { lat: 46.5667, lng: -72.7500 },
  'Dollard-Des Ormeaux': { lat: 45.4942, lng: -73.8244 },
  'Rimouski': { lat: 48.4489, lng: -68.5236 },
  'Victoriaville': { lat: 46.0500, lng: -71.9667 },
  'Sorel-Tracy': { lat: 46.0333, lng: -73.1167 },
  'Joliette': { lat: 46.0167, lng: -73.4333 },
  'Saint-Hyacinthe': { lat: 45.6167, lng: -72.9500 },
  'Salaberry-de-Valleyfield': { lat: 45.2500, lng: -74.1333 },
  'Ottawa': { lat: 45.4215, lng: -75.6972 },
  'Drommundoville': { lat: 45.8833, lng: -72.4833 }, // Same as Drummondville
  'La Tuque': { lat: 47.4333, lng: -72.7833 },
  'Saint Aimable': { lat: 45.8167, lng: -73.1833 },
  'Cantonville': { lat: 45.4000, lng: -72.7333 }, // Approximation
  'Lac-Saint-Jean': { lat: 48.5500, lng: -71.6833 },
  'Ste Agathe-des-Monts': { lat: 46.0500, lng: -74.2833 },
  'Rive-Sud': { lat: 45.5000, lng: -73.4500 }, // Approximation (Longueuil area)
  'Saint-Basile-le-Grand': { lat: 45.5333, lng: -73.2833 },
  'Sherbrook': { lat: 45.4042, lng: -71.8929 }, // Same as Sherbrooke
  'Val-d\'or': { lat: 48.1000, lng: -77.7833 },
};
