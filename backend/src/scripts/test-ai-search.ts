import { aiExtractionService } from '../services/ai-extraction.service';
import dotenv from 'dotenv';

dotenv.config();

async function testAISearch() {
    const query = "Agent de sécurité à Montréal disponible 24/7 avec permis de conduire";
    console.log(`Testing AI Search with query: "${query}"`);

    try {
        // Check if API key is present
        if (!process.env.OPENAI_API_KEY) {
            console.warn('⚠️ OPENAI_API_KEY not found in environment. Skipping actual API call.');
            return;
        }

        const result = await aiExtractionService.parseSearchQuery(query);
        console.log('✅ AI Search Result:', JSON.stringify(result, null, 2));

        // Validation
        const valid =
            result.cities.includes('Montréal') &&
            result.availability.includes('24/7') &&
            result.certifications.includes('Permis de conduire'); // "avec permis" implies driver license based on prompt

        if (valid) {
            console.log('✅ Test PASSED: All expected filters found.');
        } else {
            console.error('❌ Test FAILED: Missing expected filters.');
        }

    } catch (error) {
        console.error('❌ Error during test:', error);
    }
}

testAISearch();
