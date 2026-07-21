"use strict";
/**
 * Bower kitchen rule pack — versioned configuration (plan §7.4/7.4.7).
 *
 * Two layers:
 *  - `bower-kitchen-layout` — cabinet compatibility, Bower business rules and
 *    ergonomic defaults. Bower-tunable; warnings/advisory, never regulatory.
 *  - jurisdiction regulatory profiles — regulated minimums. DISABLED until a
 *    qualified reviewer approves a matching profile; affected rules return
 *    `pending`, never a silently-invented national default.
 *
 * Every parameter carries its source and class. No unexplained literals.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.QLD_REGULATORY_PROFILE_DRAFT = exports.ERGONOMIC_PARAMETERS = exports.PACK_SIGN_OFF = exports.REGULATORY_PROFILE_PENDING = exports.BOWER_LAYOUT_PACK_VERSION = void 0;
exports.BOWER_LAYOUT_PACK_VERSION = 'bower-kitchen-layout@0.1.0';
exports.REGULATORY_PROFILE_PENDING = 'regulatory-profile@pending';
/**
 * Owner sign-off record. Covers the ergonomic defaults below as Bower's
 * working values, and provisionally endorses the QLD regulatory seed values
 * for design-time guidance. It does NOT substitute for qualified
 * standards-copy verification of regulated minimums — the QLD profile stays
 * draft (and regulated rules stay `pending`) until that verification is
 * recorded. Values are reviewable/editable in Admin → Design Rules; edits
 * move to DB-backed config in a later phase.
 */
exports.PACK_SIGN_OFF = {
    approvedBy: 'Ben Berthelsen',
    role: 'Bower owner',
    date: '2026-07-14',
    scope: 'ergonomic defaults (working values) + QLD regulatory seed values (provisional guidance only)',
    qualifiedVerificationOutstanding: true,
};
/** Ergonomic defaults (NKBA-derived, metric-rounded). Guidance, not statute. */
const ERGONOMIC_PARAMETER_SEEDS = [
    { parameterId: 'work-aisle-single-cook-min', class: 'ergonomic', value: 1070, unit: 'mm', source: 'NKBA 42in work aisle', bowerApproved: false },
    { parameterId: 'work-aisle-multi-cook-min', class: 'ergonomic', value: 1220, unit: 'mm', source: 'NKBA 48in work aisle', bowerApproved: false },
    { parameterId: 'walkway-min', class: 'ergonomic', value: 915, unit: 'mm', source: 'NKBA 36in walkway', bowerApproved: false },
    { parameterId: 'dw-to-sink-max', class: 'ergonomic', value: 915, unit: 'mm', source: 'NKBA 36in; Bower KRN-DW-001 adjacency remains the blocker', bowerApproved: false },
    { parameterId: 'sink-landing-primary-min', class: 'ergonomic', value: 610, unit: 'mm', source: 'NKBA 24in sink landing', bowerApproved: false },
    { parameterId: 'sink-landing-secondary-min', class: 'ergonomic', value: 460, unit: 'mm', source: 'NKBA 18in sink landing', bowerApproved: false },
    { parameterId: 'prep-bench-min-length', class: 'ergonomic', value: 915, unit: 'mm', source: 'NKBA 36in continuous prep', bowerApproved: false },
    { parameterId: 'cooktop-landing-primary-min', class: 'ergonomic', value: 380, unit: 'mm', source: 'NKBA 15in cooktop landing', bowerApproved: false },
    { parameterId: 'cooktop-landing-secondary-min', class: 'ergonomic', value: 305, unit: 'mm', source: 'NKBA 12in cooktop landing', bowerApproved: false },
    { parameterId: 'fridge-landing-min', class: 'ergonomic', value: 380, unit: 'mm', source: 'NKBA 15in fridge landing', bowerApproved: false },
    { parameterId: 'triangle-total-max', class: 'ergonomic', value: 7900, unit: 'mm', source: 'NKBA 26ft work-triangle sum (scoring only)', bowerApproved: false },
    { parameterId: 'benchtop-height-standard', class: 'ergonomic', value: 900, unit: 'mm', source: 'AU trade convention', bowerApproved: false },
    { parameterId: 'benchtop-depth-standard', class: 'ergonomic', value: 600, unit: 'mm', source: 'AU trade convention', bowerApproved: false },
    // Ergonomic working values signed off by the owner — see PACK_SIGN_OFF.
];
exports.ERGONOMIC_PARAMETERS = ERGONOMIC_PARAMETER_SEEDS.map((parameter) => ({ ...parameter, bowerApproved: true }));
exports.QLD_REGULATORY_PROFILE_DRAFT = {
    status: 'draft-pending-approval',
    profileId: 'bower-regulatory-au-qld',
    version: '0.1.0-draft',
    jurisdiction: 'AU-QLD',
    projectScopes: ['new-kitchen', 'full-kitchen-renovation'],
    standardsEditions: {
        'AS/NZS 5601.1': '2022',
        'AS/NZS 3000': '2018',
    },
    seedParameters: [
        { parameterId: 'gas-cooktop-to-rangehood-min', class: 'regulatory', value: 650, unit: 'mm', source: 'AS/NZS 5601.1:2022 cl 6.10.1.1 (trivet top to rangehood, new installation); greater of appliance/rangehood instructions applies', bowerApproved: false },
        { parameterId: 'gas-cooktop-to-exhaust-fan-min', class: 'regulatory', value: 750, unit: 'mm', source: 'AS/NZS 5601.1:2022 cl 6.10.1.1', bowerApproved: false },
        { parameterId: 'gas-cooktop-overhead-absolute-min', class: 'regulatory', value: 450, unit: 'mm', source: 'AS/NZS 5601.1:2022 (protected surfaces per Appendix C below 650mm)', bowerApproved: false },
        { parameterId: 'gas-legacy-600-appliance-only', class: 'regulatory', value: true, unit: 'flag', source: 'Legacy 600mm path applies ONLY to appliance-only changeover; never to AI-designed cabinets or renovations', bowerApproved: false },
        { parameterId: 'sink-electrical-zone-profile', class: 'regulatory', value: 'AS/NZS 3000:2018 wet-area zones — geometry and permitted protected devices to be implemented from the approved standards copy, not summaries', unit: 'flag', source: 'AS/NZS 3000:2018', bowerApproved: false },
    ],
    approvalRequired: 'A qualified reviewer must verify every value against current QLD-adopted standards copies, record approver + date, and generate the content hash before this profile can be enabled.',
};
