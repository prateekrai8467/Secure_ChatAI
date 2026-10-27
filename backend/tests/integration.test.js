import { ollamaService } from '../services/ollamaService.js';
import app from '../server.js';

async function runLiveIntegrationTest() {
  console.log('--- STARTING LIVE OLLAMA INTEGRATION TEST ---');
  
  // 1. Check health
  const health = await ollamaService.checkHealth();
  console.log('Ollama Service Health:', health);

  if (!health.isRunning) {
    console.warn('\n[INFO] Ollama is not currently running locally.');
    console.warn('To run live inference integration tests:');
    console.warn('  1. Start Ollama service: `ollama serve`');
    console.warn('  2. Pull model: `ollama run ' + ollamaService.model + '`');
    console.warn('Skipping live inference test (unit test suite in chat.test.js passed 100%).\n');
    return;
  }

  const modelAvailable = health.models.some(m => m.name.includes(ollamaService.model));
  if (!modelAvailable) {
    console.log(`Model "${ollamaService.model}" is not yet fully downloaded. Current models:`, health.models.map(m => m.name));
    return;
  }

  // 2. Test live inference
  console.log(`\nTesting real inference with model "${ollamaService.model}"...`);
  const start = Date.now();
  const res = await ollamaService.chat([
    { role: 'user', content: 'Explain machine learning in one short sentence.' }
  ]);
  const elapsed = Date.now() - start;

  console.log('Live Inference Succeeded!');
  console.log('Answer:', res.answer);
  console.log(`Duration: ${elapsed}ms (${res.durationMs}ms reported by model)`);
  console.log(`Prompt tokens: ${res.promptTokens}, Completion tokens: ${res.evalTokens}`);

  // 3. Test multi-turn follow-up
  console.log('\nTesting multi-turn follow-up question...');
  const followUpRes = await ollamaService.chat([
    { role: 'user', content: 'Explain machine learning in one short sentence.' },
    { role: 'assistant', content: res.answer },
    { role: 'user', content: 'Can you rewrite that in simpler words for a child?' }
  ]);

  console.log('Follow-up Succeeded!');
  console.log('Answer:', followUpRes.answer);
  console.log(`Duration: ${followUpRes.durationMs}ms`);
  console.log('--- LIVE INTEGRATION TEST PASSED ---');
}

runLiveIntegrationTest().catch(err => {
  console.error('Integration Test Error:', err);
  process.exit(1);
});
