"use strict";
/**
 * AI Kitchen Designer — deterministic layout engine.
 * The harness: the AI writes KitchenSpec; this engine compiles, validates,
 * and prices it. Pure TS — safe to bundle for the browser, node tests, and
 * the Supabase edge function.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestProposalRegistry = exports.candidateSummaryFor = exports.generateCandidatePool = exports.scoreDesign = exports.briefFromWizard = exports.toRoomSpec = exports.priceDesign = exports.defaultSpecFor = exports.RESERVED_RULE_IDS = exports.RULE_INDEX = exports.RULES = exports.ruleWhy = exports.evaluateRules = exports.interiorAngles = exports.rotationFromNormal = exports.rectInsidePolygon = exports.pointInPolygon = exports.segmentToWorld = exports.polygonFromRoom = exports.validate = exports.compileSpec = exports.solveRun = void 0;
__exportStar(require("./types"), exports);
__exportStar(require("./schemas"), exports);
__exportStar(require("./geometry"), exports);
__exportStar(require("./catalogRoles"), exports);
var solveRun_1 = require("./solveRun");
Object.defineProperty(exports, "solveRun", { enumerable: true, get: function () { return solveRun_1.solveRun; } });
var compileSpec_1 = require("./compileSpec");
Object.defineProperty(exports, "compileSpec", { enumerable: true, get: function () { return compileSpec_1.compileSpec; } });
var validate_1 = require("./validate");
Object.defineProperty(exports, "validate", { enumerable: true, get: function () { return validate_1.validate; } });
var polygon_1 = require("./polygon");
Object.defineProperty(exports, "polygonFromRoom", { enumerable: true, get: function () { return polygon_1.polygonFromRoom; } });
Object.defineProperty(exports, "segmentToWorld", { enumerable: true, get: function () { return polygon_1.segmentToWorld; } });
Object.defineProperty(exports, "pointInPolygon", { enumerable: true, get: function () { return polygon_1.pointInPolygon; } });
Object.defineProperty(exports, "rectInsidePolygon", { enumerable: true, get: function () { return polygon_1.rectInsidePolygon; } });
Object.defineProperty(exports, "rotationFromNormal", { enumerable: true, get: function () { return polygon_1.rotationFromNormal; } });
Object.defineProperty(exports, "interiorAngles", { enumerable: true, get: function () { return polygon_1.interiorAngles; } });
var rules_1 = require("./rules");
Object.defineProperty(exports, "evaluateRules", { enumerable: true, get: function () { return rules_1.evaluateRules; } });
Object.defineProperty(exports, "ruleWhy", { enumerable: true, get: function () { return rules_1.ruleWhy; } });
Object.defineProperty(exports, "RULES", { enumerable: true, get: function () { return rules_1.RULES; } });
Object.defineProperty(exports, "RULE_INDEX", { enumerable: true, get: function () { return rules_1.RULE_INDEX; } });
Object.defineProperty(exports, "RESERVED_RULE_IDS", { enumerable: true, get: function () { return rules_1.RESERVED_RULE_IDS; } });
var defaultSpec_1 = require("./defaultSpec");
Object.defineProperty(exports, "defaultSpecFor", { enumerable: true, get: function () { return defaultSpec_1.defaultSpecFor; } });
var priceDesign_1 = require("./priceDesign");
Object.defineProperty(exports, "priceDesign", { enumerable: true, get: function () { return priceDesign_1.priceDesign; } });
var wizardAdapter_1 = require("./wizardAdapter");
Object.defineProperty(exports, "toRoomSpec", { enumerable: true, get: function () { return wizardAdapter_1.toRoomSpec; } });
Object.defineProperty(exports, "briefFromWizard", { enumerable: true, get: function () { return wizardAdapter_1.briefFromWizard; } });
var designScore_1 = require("./designScore");
Object.defineProperty(exports, "scoreDesign", { enumerable: true, get: function () { return designScore_1.scoreDesign; } });
var candidateGenerator_1 = require("./candidateGenerator");
Object.defineProperty(exports, "generateCandidatePool", { enumerable: true, get: function () { return candidateGenerator_1.generateCandidatePool; } });
Object.defineProperty(exports, "candidateSummaryFor", { enumerable: true, get: function () { return candidateGenerator_1.candidateSummaryFor; } });
var proposalState_1 = require("./proposalState");
Object.defineProperty(exports, "RequestProposalRegistry", { enumerable: true, get: function () { return proposalState_1.RequestProposalRegistry; } });
