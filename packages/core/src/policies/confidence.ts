import type { Reserve, EvidenceRef, Reputation } from '../entities/index.js';

/**
 * Calculate confidence for a reserve based on evidence and reputation
 */
export function calculateReserveConfidence(
  evidence: EvidenceRef[],
  reputations: Map<string, Reputation>
): number {
  if (evidence.length === 0) {
    return 0.3; // low confidence for no evidence
  }

  let totalWeight = 0;
  let weightedConfidence = 0;

  for (const e of evidence) {
    // Base weight from relevance
    let weight = e.relevance;

    // Boost weight based on source's reputation if available
    if (e.addedBy) {
      const rep = reputations.get(e.addedBy);
      if (rep) {
        weight *= 0.5 + 0.5 * rep.overallConfidence;
      }
    }

    // Recency boost (newer evidence weighted higher)
    const addedAtDate = typeof e.addedAt === 'string' ? new Date(e.addedAt) : e.addedAt;
    const ageMs = Date.now() - addedAtDate.getTime();
    const ageWeeks = ageMs / (7 * 24 * 60 * 60 * 1000);
    const recencyFactor = Math.max(0.5, 1 - ageWeeks * 0.05); // decay 5% per week
    weight *= recencyFactor;

    weightedConfidence += weight * e.relevance;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0.3;

  // Normalize and clamp
  const rawConfidence = weightedConfidence / totalWeight;

  // Multiple sources boost confidence
  const sourceBoost = Math.min(1, 0.7 + 0.1 * evidence.length);

  return Math.min(1, Math.max(0, rawConfidence * sourceBoost));
}

/**
 * Calculate overall answer confidence from multiple reserves
 */
export function calculateAnswerConfidence(
  reserves: Reserve[],
  relevances: number[]
): { confidence: number; explanation: string } {
  if (reserves.length === 0) {
    return {
      confidence: 0.1,
      explanation: 'No relevant knowledge found in the vault.',
    };
  }

  let totalWeight = 0;
  let weightedConfidence = 0;

  for (let i = 0; i < reserves.length; i++) {
    const weight = relevances[i] || 0.5;
    weightedConfidence += weight * reserves[i].confidence;
    totalWeight += weight;
  }

  const confidence = totalWeight > 0 ? weightedConfidence / totalWeight : 0.3;

  // Generate explanation
  const highConfidenceCount = reserves.filter((r) => r.confidence > 0.7).length;
  const lowConfidenceCount = reserves.filter((r) => r.confidence < 0.4).length;

  let explanation: string;
  if (confidence > 0.8) {
    explanation = `High confidence: based on ${reserves.length} reserves with strong evidence.`;
  } else if (confidence > 0.6) {
    explanation = `Moderate confidence: ${highConfidenceCount} strong sources, ${lowConfidenceCount} weaker sources.`;
  } else if (confidence > 0.4) {
    explanation = `Low-moderate confidence: limited or dated evidence available.`;
  } else {
    explanation = `Low confidence: sparse or uncertain information in the vault.`;
  }

  return { confidence, explanation };
}
