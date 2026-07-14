"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sha256Canonical = sha256Canonical;
exports.canonicalRuleResultProjection = canonicalRuleResultProjection;
exports.fingerprintRuleResults = fingerprintRuleResults;
const canonicalize_1 = __importDefault(require("canonicalize"));
const encoder = new TextEncoder();
async function sha256Canonical(payload) {
    const canonical = (0, canonicalize_1.default)(payload);
    if (typeof canonical !== 'string')
        throw new Error('Payload cannot be canonicalized');
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(canonical));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
function canonicalRuleResultProjection(results) {
    return [...results]
        .sort((a, b) => `${a.stage}:${a.ruleId}`.localeCompare(`${b.stage}:${b.ruleId}`))
        .map(result => ({
        ruleId: result.ruleId,
        rulePackVersion: result.rulePackVersion,
        stage: result.stage,
        severity: result.severity,
        status: result.status,
        entityIds: [...result.entityIds].sort(),
        measured: result.measured,
        required: result.required,
        repairOperationIds: result.repairOptions.map(option => option.operation.operationId).sort(),
        exceptionDecision: result.exception
            ? { accepted: true, policyCode: result.exception.policyCode }
            : { accepted: false },
    }));
}
async function fingerprintRuleResults(results) {
    return sha256Canonical({ fingerprintVersion: 1, results: canonicalRuleResultProjection(results) });
}
