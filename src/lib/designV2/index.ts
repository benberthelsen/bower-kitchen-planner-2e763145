export * from './contracts';
export * from './fingerprint';
export * from './catalogCapabilities';
export * from './regulatoryProfiles';
export * from './rulePack';
export * from './evaluateKitchenRules';
// The single unified rules pipeline (geometric evaluator + policy layer).
// Callers use evaluateDesign() rather than validate()/evaluateKitchenRules()
// directly — this is what makes the two layers one system.
export * from './evaluateDesign';
