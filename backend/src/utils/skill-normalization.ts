export const skillSynonyms: Record<string, string[]> = {
  'microsoft excel': ['excel', 'ms excel', 'excel avance', 'excel avance'],
  'microsoft office': ['office', 'suite office', 'ms office'],
  'microsoft word': ['word', 'ms word'],
  'powerpoint': ['ms powerpoint', 'ppt', 'pptx'],
  'javascript': ['js', 'java script', 'ecmascript'],
  'typescript': ['ts'],
  'node.js': ['node', 'nodejs'],
  'python': ['py', 'python3'],
  'sap': ['sap erp'],
  'oracle': ['oracle ebs'],
  'microsoft project': ['ms project'],
  'bsp': ['bureau de la securite privee'],
  'premiers secours': ['premiers soins', 'first aid', 'secourisme'],
  'rcr': ['reanimation cardio respiratoire', 'cpr'],
};

const typos: Record<string, string> = {
  javascrpit: 'javascript',
  paython: 'python',
  microsft: 'microsoft',
  exell: 'excel',
  mangement: 'management',
};

const normalizeAccent = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const fixCommonTypos = (name: string): string => {
  const key = normalizeAccent(name.trim());
  return typos[key] ?? key;
};

export const normalizeSkillName = (name: string): string => {
  if (!name) {
    return '';
  }
  const fixed = fixCommonTypos(name);
  for (const [canonical, synonyms] of Object.entries(skillSynonyms)) {
    if (canonical === fixed) {
      return canonical;
    }
    if (synonyms.some((syn) => normalizeAccent(syn) === fixed)) {
      return canonical;
    }
  }
  return fixed;
};

export const dedupeSkillsByName = <T extends { skillName: string; confidence?: number }>(skills: T[]): T[] => {
  const map = new Map<string, T>();
  skills.forEach((skill) => {
    const key = normalizeSkillName(skill.skillName);
    const existing = map.get(key);
    if (!existing || (skill.confidence ?? 0) > (existing.confidence ?? 0)) {
      map.set(key, skill);
    }
  });
  return Array.from(map.values());
};
