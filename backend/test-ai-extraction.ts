import { aiExtractionService } from './src/services/ai-extraction.service';
import { cvExtractionService } from './src/services/cv-extraction.service';

const candidateId = '5bddd80b-094d-4803-a8c8-f2bc144a548d';

async function testAIExtraction() {
  console.log('\n=== TEST EXTRACTION AI ===\n');
  console.log(`Candidat ID: ${candidateId}`);
  console.log('Modèle: GPT-3.5-Turbo (le moins cher)\n');

  try {
    // Step 1: Get candidate text
    console.log('Étape 1: Extraction du texte du candidat...');
    const cvText = await cvExtractionService.getCandidateText(candidateId);
    console.log(`✅ Texte extrait: ${cvText.length} caractères`);
    console.log('\n--- APERÇU DU TEXTE ---');
    console.log(cvText.substring(0, 500) + '...\n');

    // Step 2: Extract with OpenAI
    console.log('Étape 2: Extraction avec OpenAI GPT-3.5-Turbo...');
    const extraction = await aiExtractionService.extractWithOpenAI(
      candidateId,
      cvText,
      'gpt-3.5-turbo'
    );

    if (extraction.success) {
      console.log('✅ Extraction réussie!\n');
      console.log('--- RÉSULTATS ---');
      console.log(`Compétences trouvées: ${extraction.totalSkills}`);
      console.log(`Temps de traitement: ${extraction.processingTimeMs}ms`);
      console.log(`Tokens utilisés: ${extraction.promptTokens + extraction.completionTokens}`);
      console.log(`  - Prompt: ${extraction.promptTokens}`);
      console.log(`  - Completion: ${extraction.completionTokens}`);
      console.log(`Coût estimé: $${extraction.totalCost.toFixed(6)}\n`);

      if (extraction.skillsFound.length > 0) {
        console.log('--- COMPÉTENCES IDENTIFIÉES ---');
        extraction.skillsFound.forEach((skill, i) => {
          console.log(`${i + 1}. ${skill.skillName}`);
          console.log(`   Niveau: ${skill.level || 'N/A'}`);
          console.log(`   Confiance: ${(skill.confidence * 100).toFixed(0)}%`);
          console.log(`   Expérience: ${skill.yearsExperience ? skill.yearsExperience + ' ans' : 'N/A'}`);
          if (skill.reasoning) {
            console.log(`   Raison: ${skill.reasoning}`);
          }
          console.log('');
        });
      } else {
        console.log('⚠️ Aucune compétence trouvée');
      }
    } else {
      console.error('❌ Extraction échouée!');
      console.error(`Erreur: ${extraction.errorMessage}`);
    }
  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
    console.error(error.stack);
  }
}

testAIExtraction()
  .then(() => {
    console.log('\n✅ Test terminé!');
    process.exit(0);
  })
  .catch((e) => {
    console.error('❌ Test échoué:', e);
    process.exit(1);
  });
