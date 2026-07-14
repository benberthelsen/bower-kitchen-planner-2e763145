"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectRegulatoryProfile = selectRegulatoryProfile;
function selectRegulatoryProfile(context, profiles) {
    if (!context.jurisdiction || !context.projectScope) {
        return { status: 'pending', reason: 'Project jurisdiction and work scope are required' };
    }
    const on = Date.parse(`${context.effectiveOn}T00:00:00Z`);
    const profile = profiles.find(candidate => {
        if (candidate.jurisdiction !== context.jurisdiction)
            return false;
        if (!candidate.projectScopes.includes(context.projectScope))
            return false;
        if (context.regulatoryProfileId && candidate.profileId !== context.regulatoryProfileId)
            return false;
        const starts = Date.parse(`${candidate.effectiveFrom}T00:00:00Z`);
        const ends = candidate.effectiveTo ? Date.parse(`${candidate.effectiveTo}T23:59:59Z`) : Number.POSITIVE_INFINITY;
        return on >= starts && on <= ends;
    });
    return profile
        ? { status: 'matched', profile }
        : { status: 'pending', reason: 'No approved regulatory profile matches this project' };
}
