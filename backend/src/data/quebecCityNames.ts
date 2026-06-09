/**
 * Liste élargie de municipalités/arrondissements du Québec — NOMS SEULEMENT
 * (sans coordonnées). Sert uniquement à l'auto-correction des fautes
 * d'orthographe (cityNormalize.ts) : ces noms deviennent des cibles de
 * correspondance exacte + approximative (Levenshtein), en plus du seed à
 * coordonnées (data/quebecCities.ts).
 *
 * ⚠️ Chaque nom doit être ORTHOGRAPHIÉ CORRECTEMENT (un nom fautif deviendrait
 * une cible de correction erronée). Liste curée de municipalités QC réelles.
 *
 * Le géocodage (coordonnées pour la carte) reste géré à la demande par
 * cityGeocode.service.ts ; ce fichier n'a pas besoin de coords.
 */
export const additionalQuebecCityNames: string[] = [
  // --- Montérégie ---
  'Saint-Bruno-de-Montarville', 'Boucherville', 'Saint-Lambert', 'Chambly',
  'Carignan', 'Marieville', 'Mont-Saint-Hilaire', 'Otterburn Park',
  'McMasterville', 'La Prairie', 'Candiac', 'Delson', 'Sainte-Catherine',
  'Saint-Philippe', 'Saint-Mathieu', 'Mercier', 'Léry', 'Beauharnois',
  'Saint-Rémi', 'Napierville', 'Lacolle', 'Hemmingford', 'Huntingdon',
  'Ormstown', 'Saint-Chrysostome', 'Coteau-du-Lac', 'Les Cèdres',
  'Saint-Zotique', 'Rigaud', 'Pincourt', 'Saint-Lazare', 'Hudson',
  'Varennes', 'Verchères', 'Contrecœur', 'Richelieu', 'Saint-Jean-Baptiste',
  'Acton Vale', 'Saint-Pie', 'Saint-Damase', 'Sainte-Madeleine',
  'Saint-Denis-sur-Richelieu', 'Saint-Hubert', 'Greenfield Park',
  // --- Laurentides ---
  'Saint-Colomban', 'Prévost', 'Sainte-Anne-des-Plaines', 'Saint-Joseph-du-Lac',
  'Oka', 'Pointe-Calumet', 'Sainte-Marthe-sur-le-Lac', 'Saint-Placide',
  'Lachute', 'Brownsburg-Chatham', 'Morin-Heights', 'Piedmont', 'Val-Morin',
  'Val-David', 'Saint-Faustin-Lac-Carré', 'Labelle', 'Rivière-Rouge',
  'Mont-Laurier', 'Sainte-Sophie', 'Saint-Hippolyte',
  // --- Lanaudière ---
  "L'Assomption", 'Charlemagne', 'Saint-Sulpice', "L'Épiphanie", 'Lavaltrie',
  'Lanoraie', 'Berthierville', 'Saint-Charles-Borromée', 'Notre-Dame-des-Prairies',
  'Crabtree', 'Saint-Thomas', 'Sainte-Mélanie', 'Saint-Félix-de-Valois',
  'Saint-Jean-de-Matha', 'Chertsey', 'Saint-Donat', 'Saint-Esprit',
  'Sainte-Julienne', "Saint-Roch-de-l'Achigan",
  // --- Estrie ---
  'Coaticook', 'Cookshire-Eaton', 'East Angus', 'Windsor', 'Val-des-Sources',
  'Richmond', 'Lac-Mégantic', 'North Hatley', "Ayer's Cliff", 'Stanstead',
  'Bromont', 'Cowansville', 'Farnham', 'Bedford', 'Sutton', 'Lac-Brome',
  'Waterloo',
  // --- Centre-du-Québec ---
  'Bécancour', 'Nicolet', 'Plessisville', 'Princeville', 'Warwick',
  'Kingsey Falls', 'Daveluyville', "Saint-Léonard-d'Aston",
  // --- Mauricie ---
  'Louiseville', 'Yamachiche', 'Saint-Tite', 'Sainte-Anne-de-la-Pérade',
  'Notre-Dame-du-Mont-Carmel',
  // --- Capitale-Nationale ---
  'Beauport', 'Charlesbourg', 'Sainte-Foy', 'Cap-Rouge', "L'Ancienne-Lorette",
  'Saint-Augustin-de-Desmaures', 'Stoneham-et-Tewkesbury', 'Shannon',
  'Sainte-Brigitte-de-Laval', 'Boischatel', "L'Ange-Gardien", 'Château-Richer',
  'Sainte-Anne-de-Beaupré', 'Beaupré', 'Baie-Saint-Paul', 'La Malbaie',
  'Clermont', 'Donnacona', 'Pont-Rouge', 'Saint-Raymond', 'Neuville',
  'Saint-Marc-des-Carrières',
  // --- Chaudière-Appalaches ---
  'Sainte-Marie', 'Saint-Joseph-de-Beauce', 'Beauceville', 'Montmagny',
  'Saint-Jean-Port-Joli', 'Lac-Etchemin', 'Sainte-Claire', 'Saint-Henri',
  'Charny', 'Saint-Romuald', 'Saint-Lambert-de-Lauzon', 'Saint-Apollinaire',
  'Laurier-Station', 'Saint-Agapit',
  // --- Saguenay–Lac-Saint-Jean ---
  'Chicoutimi', 'Jonquière', 'La Baie', 'Dolbeau-Mistassini', 'Roberval',
  'Saint-Félicien', 'Normandin', 'Métabetchouan-Lac-à-la-Croix', 'Hébertville',
  'Saint-Honoré', 'Saint-Ambroise', 'Larouche', 'Saint-Prime', 'Saint-Bruno',
  // --- Bas-Saint-Laurent ---
  'Mont-Joli', 'Amqui', 'Trois-Pistoles', 'Témiscouata-sur-le-Lac',
  'Pohénégamook', 'La Pocatière', 'Saint-Pascal',
  // --- Gaspésie ---
  'Chandler', 'Carleton-sur-Mer', 'New Richmond', 'Bonaventure',
  'Sainte-Anne-des-Monts', 'Percé',
  // --- Côte-Nord ---
  'Port-Cartier', 'Havre-Saint-Pierre',
  // --- Abitibi-Témiscamingue ---
  'Amos', 'La Sarre', 'Malartic', 'Senneterre', 'Ville-Marie',
  // --- Outaouais ---
  'Cantley', 'Chelsea', 'Val-des-Monts', 'Thurso', 'Papineauville',
  'Maniwaki', 'Fort-Coulonge',
  // --- Montréal / West Island / Laval ---
  'Pierrefonds', 'Pointe-Claire', 'Dorval', 'Kirkland', 'Beaconsfield',
  "Baie-d'Urfé", 'Sainte-Anne-de-Bellevue', 'Senneville', 'Mont-Royal',
  'Outremont', 'Westmount', 'Roxboro',
];
