/**
 * Fond de carte partagé par les 4 cartes de l'application.
 *
 * Tout ce qui concerne le fond de carte vit ici : pour changer de fournisseur,
 * il suffit de modifier ce fichier, les cartes n'ont pas à bouger.
 *
 * Historique : on utilisait CARTO Positron (basemaps.cartocdn.com). Depuis le
 * 2026-09-23, CARTO exige une clé et tamponne « API KEY REQUIRED » sur chaque
 * tuile servie sans clé. On est passé aux tuiles publiques d'OpenStreetMap.
 *
 * Ces tuiles sont servies par des serveurs financés par des dons. Pour un outil
 * d'entreprise c'est toléré, pas un droit : leur politique dit que l'accès peut
 * être retiré en tout temps. Si les cartes se remplissent un jour d'images
 * « Access blocked », c'est le signal qu'il faut changer de fournisseur — et
 * tout se joue alors dans ce fichier.
 *
 * Attention si on change d'URL :
 *  - pas de {s} : la politique d'OpenStreetMap demande l'hôte unique.
 *  - pas de {r} : Leaflet le remplace par « @2x » sur les écrans Retina, et
 *    OpenStreetMap ne sert pas de tuiles double résolution (404 sur tous les Mac).
 */
export const BASEMAP_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * Note : on a essayé de décolorer le fond en gris (l'ancien look CARTO). Écarté,
 * la carte en couleurs a été préférée. Si jamais on veut y revenir, la recette
 * testée est de poser, sur le calque des tuiles UNIQUEMENT, le style
 * `filter: grayscale(1) brightness(1.12) contrast(0.82)`. Sur `.leaflet-tile-pane`
 * et jamais plus haut : les épingles, pastilles de grappes et cercles vivent dans
 * d'autres calques et se feraient décolorer avec.
 */
