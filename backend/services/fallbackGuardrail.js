/**
 * Heuristic & Regex Fallback Guardrail Scanner.
 * Operates when the Python machine learning microservice is unreachable,
 * guaranteeing continuous zero-trust protection.
 */

const INJECTION_PATTERNS = [
  {
    regex: /\b(?:ignore|disregard|forget|cancel|override|stop following)\s+(?:all\s+)?(?:previous|prior|initial|past|every)\s+(?:instructions|directions|rules|guidelines|constraints|prompts?)\b/i,
    classification: 'direct_injection',
    baseScore: 0.95,
    token: 'ignore previous instructions'
  },
  {
    regex: /\b(?:reset\s+all\s+system\s+guardrails|disregard\s+system\s+guidelines|bypass\s+all\s+safety\s+filters)\b/i,
    classification: 'direct_injection',
    baseScore: 0.92,
    token: 'bypass safety filters'
  },
  {
    regex: /(?:###\s*system\s+override|<system>|\[system\s+instruction\]|--- begin root prompt ---)/i,
    classification: 'direct_injection',
    baseScore: 0.96,
    token: 'system delimiter override'
  },
  {
    regex: /\b(?:you are now dan|role of dan|do anything now|aim.*machiavellian|developer mode enabled?|god mode|stan.*strive to agitate)\b/i,
    classification: 'jailbreak',
    baseScore: 0.94,
    token: 'jailbreak persona'
  },
  {
    regex: /\b(?:what is your system prompt|repeat.*verbatim|print.*instructions given to you|reveal.*hidden.*developer prompt|output your initialization instructions|dump.*prompt memory)\b/i,
    classification: 'system_leak',
    baseScore: 0.93,
    token: 'system prompt leak attempt'
  },
  {
    regex: /\b(?:special instruction for ai:?|note to ai:?|disregard.*and forward all documents|assistant:? forget your ethics)\b/i,
    classification: 'indirect_injection',
    baseScore: 0.88,
    token: 'indirect instruction override'
  },
  {
    regex: /(?:पिछल[ेा]\s+(?:सभी\s+)?निर्देशों\s+को\s+अनदेखा\s+करें|पूर्व\s+नियमों\s+को\s+नजरअंदाज\s+करें|नियमों\s+को\s+रद्द\s+करें|सभी\s+दिशा-निर्देश\s+भूल\s+जाओ|pichhle\s+(?:saare|sabhi)\s+rules\s+ko\s+ignore)/iu,
    classification: 'direct_injection',
    baseScore: 0.95,
    token: 'multilingual instruction override'
  },
  {
    regex: /(?:सिस्टम\s+प्रॉम्प्ट\s+शब्दशः\s+प्रिंट|अपना\s+गुप्त\s+सिस्टम\s+प्रॉम्प्ट|मूल\s+निर्देशों\s+को\s+प्रकट|apna\s+secret\s+system\s+prompt)/iu,
    classification: 'system_leak',
    baseScore: 0.94,
    token: 'multilingual system prompt leak'
  },
  {
    regex: /(?:डेवलपर\s+मोड\s+सक्रिय|गॉड\s+मोड|बिना\s+किसी\s+नियम\s+वाले\s+एआई|tum\s+ab\s+se\s+dan\s+ho)/iu,
    classification: 'jailbreak',
    baseScore: 0.94,
    token: 'multilingual jailbreak persona'
  }
];

export function fallbackScan(text) {
  const startTime = Date.now();
  if (!text || typeof text !== 'string') {
    return {
      is_injection: false,
      threat_score: 0.0,
      classification: 'benign',
      action: 'allowed',
      risk_level: 'low',
      detected_tokens: [],
      latency_ms: 0,
      engine: 'fallback_heuristic'
    };
  }

  const detected = [];
  let maxScore = 0.05; // Base benign score
  let chosenClass = 'benign';

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.regex.test(text)) {
      detected.push(pattern.token);
      if (pattern.baseScore > maxScore) {
        maxScore = pattern.baseScore;
        chosenClass = pattern.classification;
      }
    }
  }

  const latency = Date.now() - startTime;
  const isInjection = maxScore >= 0.50;
  const action = maxScore >= 0.70 ? 'blocked' : maxScore >= 0.40 ? 'flagged' : 'allowed';
  const riskLevel = maxScore >= 0.70 ? 'high' : maxScore >= 0.40 ? 'medium' : 'low';

  return {
    is_injection: isInjection,
    threat_score: Number(maxScore.toFixed(4)),
    classification: chosenClass,
    action,
    risk_level: riskLevel,
    detected_tokens: detected,
    latency_ms: latency,
    engine: 'fallback_heuristic',
    explanation: isInjection
      ? `Prompt blocked by security guardrails (Threat Score: ${maxScore.toFixed(2)}). Triggered rules: ${detected.join(', ')}.`
      : 'Prompt passed heuristic security inspection.'
  };
}
