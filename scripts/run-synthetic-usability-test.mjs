#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split('=');
  return [key, rest.join('=') || true];
}));
const dryRun = args.has('--dry-run');
const requireMailtrap = !args.has('--allow-database-sink-only');
const maxPersonas = Math.min(100, Math.max(1, Number(args.get('--max-personas') ?? 100)));
const personaIdFilter = args.get('--persona-id')
  ? String(args.get('--persona-id')).toUpperCase()
  : null;
const testRunId = String(args.get('--test-run-id') ?? 'BOWER-UX-20260725-01').toUpperCase();
const outputDir = path.resolve(String(args.get('--output-dir') ?? path.join('outputs', 'synthetic-usability', testRunId)));

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const pad = value => String(value).padStart(3, '0');
const choose = (values, index) => values[index % values.length];

async function loadEnvFile(file) {
  const values = {};
  const text = await fs.readFile(file, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function buildPersonas() {
  const roles = [
    ...Array(25).fill('Homeowner / owner-builder'),
    ...Array(15).fill('DIY user / skilled handyman'),
    ...Array(15).fill('Builder / site manager'),
    ...Array(15).fill('Cabinetmaker / joiner / installer'),
    ...Array(10).fill('Interior designer / drafter'),
    ...Array(10).fill('Investor / developer'),
    ...Array(5).fill('Architect / building designer'),
    ...Array(5).fill('Property / holiday-home manager'),
  ];
  const device = [
    ...Array(50).fill('mobile'),
    ...Array(40).fill('desktop'),
    ...Array(10).fill('tablet'),
  ];
  const locations = [
    'Port Douglas', 'Mossman', 'Cairns', 'Palm Cove', 'Mareeba',
    'Atherton', 'Daintree', 'Cooktown', 'Innisfail', 'Tully',
  ];
  const budgets = ['Under $10k', '$10k–$20k', '$20k–$35k', '$35k–$50k', '$50k+'];
  const experience = ['First renovation', 'One prior renovation', 'Several projects', 'Industry professional'];
  const urgency = ['Researching only', '3–6 months', '1–3 months', 'Within 4 weeks'];
  const roomTypes = ['Kitchen', 'Kitchenette', 'Laundry', 'Butler pantry', 'Holiday-unit kitchen'];
  const confidence = ['Low', 'Medium', 'High'];
  const connection = ['Fast fixed broadband', 'Typical mobile data', 'Slow / intermittent mobile data'];
  const accessibility = [
    'None stated', 'None stated', 'None stated', 'None stated', 'Keyboard-only',
    'Low vision / 200% zoom', 'Colour-vision deficiency', 'Reduced fine-motor control',
    'Screen-reader review', 'Benefits from plain-language prompts',
  ];
  const secondary = [
    'Internal design starter', 'Flatpack service page', 'Custom service page',
    'Quote form', 'Showrooms / finish builder', 'Appliances-to-quote path',
    'Trade signup', 'Trade login',
  ];
  const shapes = ['single-wall', 'l-shape', 'u-shape', 'galley'];
  const finishes = ['do-designer-white', 'do-natural-oak', 'do-stone-grey', 'do-charcoal', 'do-spotted-gum'];
  const benchtops = ['egger-premium-white', 'egger-white-carrara', 'egger-concrete-chicago-light', 'egger-halifax-oak-nat'];
  const handles = ['handle-bar-ss', 'handle-bar-bk', 'handle-bar-go', 'handle-lip-ss', 'handle-none'];
  const firstNames = [
    'Alex', 'Sam', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Cameron',
    'Drew', 'Hayden', 'Emerson', 'Quinn', 'Parker', 'Reese', 'Rowan', 'Charlie', 'Skyler', 'Bailey',
  ];

  return roles.map((role, index) => {
    const number = index + 1;
    const personaId = `SYN-P${pad(number)}`;
    const shape = choose(shapes, index);
    const width = 3000 + (index % 9) * 250;
    const depth = 2600 + (index % 8) * 250;
    const allowedWalls = shape === 'single-wall' ? ['N']
      : shape === 'l-shape' ? ['N', 'E']
      : shape === 'u-shape' ? ['N', 'E', 'W']
      : ['N', 'S'];
    const digitalConfidence = choose(confidence, index * 2 + 1);
    const accessibilityNeed = choose(accessibility, index * 3);
    const priorities = [
      choose(['storage', 'bench-space', 'entertaining', 'baking', 'budget'], index),
      choose(['bench-space', 'storage', 'budget', 'entertaining'], index + 1),
    ].filter((value, pos, all) => all.indexOf(value) === pos);
    const budget = choose(budgets, index * 2);
    const syntheticName = `${choose(firstNames, index)} Test ${pad(number)}`;

    return {
      personaId,
      role,
      syntheticName,
      syntheticEmail: `${personaId.toLowerCase()}@synthetic.bower.test`,
      age: 24 + ((index * 7) % 53),
      location: choose(locations, index * 3),
      budget,
      renovationExperience: choose(experience, index + Math.floor(index / 7)),
      urgency: choose(urgency, index * 3),
      roomType: choose(roomTypes, index * 2),
      digitalConfidence,
      connection: choose(connection, index * 5),
      accessibilityNeed,
      device: device[(index * 37) % 100],
      primaryJourney: 'Homepage → route choice → room → cooking → style → lead gate → AI design → 3D/review → price → lead handoff',
      secondaryJourney: choose(secondary, index * 5),
      scenarioFlags: {
        unclearMeasurements: index % 7 === 0,
        incompleteInformation: index % 9 === 0,
        lowBudget: budget === 'Under $10k',
        remoteLocation: ['Daintree', 'Cooktown'].includes(choose(locations, index * 3)),
        keyboardOnly: accessibilityNeed === 'Keyboard-only',
        slowConnection: choose(connection, index * 5).startsWith('Slow'),
        backtracking: index % 4 === 0,
      },
      designInput: {
        mode: 'generate',
        shape,
        history: [],
        brief: {
          room: {
            width,
            depth,
            height: 2400 + (index % 4) * 100,
            shape: 'Rectangle',
            cutoutWidth: 0,
            cutoutDepth: 0,
            openings: index % 3 === 0
              ? [{ id: `door-${number}`, wall: 'S', type: 'door', offsetMm: 200, widthMm: 820, heightMm: 2040, swing: 'in-left' }]
              : [],
            services: [
              { id: `drain-${number}`, wall: 'N', type: 'drain', offsetMm: Math.min(width - 500, 1200 + (index % 4) * 300), heightMm: 450 },
              { id: `gpo-${number}`, wall: 'N', type: 'gpo', offsetMm: Math.min(width - 300, 2100 + (index % 3) * 250), heightMm: 1100 },
            ],
          },
          household: {
            size: 1 + (index % 6),
            cooks: choose(['rare', 'daily', 'entertainer'], index),
          },
          priorities,
          appliances: {
            oven: index % 5 === 0 ? '900' : '600',
            cooktop: index % 4 === 0 ? 'gas' : 'induction',
            dishwasher: index % 11 !== 0,
            fridgeWidthMm: 700 + (index % 4) * 100,
            microwave: choose(['built-in', 'benchtop', 'none'], index),
          },
          island: shape === 'single-wall' ? 'no' : choose(['want', 'no', 'if-it-fits'], index),
          styleWords: choose([
            'light coastal, practical and easy to clean',
            'warm timber, simple contemporary lines',
            'durable trade-friendly finishes with strong storage',
            'calm neutral palette suitable for a holiday rental',
            'premium dark cabinetry with a stone-look benchtop',
          ], index),
          styleIds: {
            finishId: choose(finishes, index),
            benchtopId: choose(benchtops, index * 2),
            handleId: choose(handles, index * 3),
          },
          budgetBand: budget === 'Under $10k' || budget === '$10k–$20k'
            ? 'value'
            : budget === '$50k+' ? 'premium' : 'mid',
          allowedWalls,
        },
      },
    };
  });
}

function inferredSessionMetrics(persona, aiMs, totalMs, success) {
  const devicePenalty = persona.device === 'mobile' ? 8 : persona.device === 'tablet' ? 4 : 0;
  const confidencePenalty = persona.digitalConfidence === 'Low' ? 10 : persona.digitalConfidence === 'Medium' ? 4 : 0;
  const accessPenalty = persona.accessibilityNeed === 'None stated' ? 0 : 7;
  const slowPenalty = persona.scenarioFlags.slowConnection ? 12 : 0;
  const effort = Math.min(100, 38 + devicePenalty + confidencePenalty + accessPenalty + slowPenalty);
  return {
    completion: success,
    elapsed_seconds: Math.round(totalMs / 1000),
    ai_generation_seconds: Math.round(aiMs / 1000),
    action_count: 24 + (persona.scenarioFlags.backtracking ? 5 : 0) + (persona.scenarioFlags.incompleteInformation ? 3 : 0),
    errors: success ? 0 : 1,
    backtracks: persona.scenarioFlags.backtracking ? 2 : 0,
    clarity_score_5: Math.max(1, Math.round((92 - effort) / 18)),
    effort_score_5: Math.max(1, Math.round((105 - effort) / 20)),
    confidence_score_5: Math.max(1, Math.round((96 - confidencePenalty - accessPenalty) / 20)),
    trust_score_5: persona.role.includes('professional') || persona.role.includes('Builder') || persona.role.includes('Cabinetmaker') ? 3 : 4,
    evidence_class: 'synthetic-inference',
  };
}

function syntheticReactions(persona, options) {
  const range = options?.[0]?.priceBand;
  const reactions = [
    `I can see how the room questions shape the result, but I want clearer guidance when my measurements are only approximate.`,
    `The three-option result is useful because I can compare layout priorities instead of starting from a blank 3D canvas.`,
  ];
  if (persona.device === 'mobile') reactions.push('On a phone I need the progress, back action and main button to remain visible without crowding the design.');
  if (persona.scenarioFlags.lowBudget) reactions.push('I need the estimate to explain what is included before I decide whether this is within reach.');
  if (persona.role.includes('Builder') || persona.role.includes('Cabinetmaker')) reactions.push('I want dimensions, assumptions and exclusions exposed before treating this as a trade-ready brief.');
  if (range) reactions.push(`The shown band of $${range.lowAud.toLocaleString('en-AU')}–$${range.highAud.toLocaleString('en-AU')} feels indicative; inclusion and GST labels will decide whether I trust it.`);
  return reactions;
}

async function postJson(url, key, secret, payload, timeoutMs = 360_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        'x-bower-synthetic-secret': secret,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 1000) }; }
    if (!response.ok) {
      const error = new Error(`${response.status} ${data?.error ?? response.statusText}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function writeProgress(personas, results) {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'personas.json'), JSON.stringify(personas, null, 2));
  await fs.writeFile(path.join(outputDir, 'session-results.json'), JSON.stringify(results, null, 2));
}

async function runPersona(persona, config, priorResults) {
  const startedAt = new Date();
  const common = { testRunId, personaId: persona.personaId };
  const controlPayload = {
    action: 'upsert-session',
    syntheticTest: common,
    session: {
      persona_profile: persona,
      device: persona.device,
      primary_journey: persona.primaryJourney,
      secondary_journey: persona.secondaryJourney,
      status: 'running',
      started_at: startedAt.toISOString(),
    },
  };
  await postJson(config.controlUrl, config.key, config.secret, controlPayload, 60_000);

  const aiStart = Date.now();
  const aiResult = await postJson(config.aiUrl, config.key, config.secret, {
    ...persona.designInput,
    syntheticTest: common,
  });
  const aiMs = Date.now() - aiStart;
  const option = aiResult.options?.[0];
  if (!option?.proposalId || !aiResult.session?.id) throw new Error('AI result did not include a stored proposal/session');
  const low = Number(option.priceBand?.lowAud ?? 0);
  const high = Number(option.priceBand?.highAud ?? 0);
  const midpoint = Math.round((low + high) / 2);

  const submissionKey = randomUUID();
  const job = {
    name: `${persona.personaId} Synthetic ${persona.roomType}`,
    notes: [
      `Contact: ${persona.syntheticName}`,
      `Email: ${persona.syntheticEmail}`,
      'Phone: 0000 000 000',
      `Synthetic test run: ${testRunId}`,
      `Persona: ${persona.personaId}`,
    ].join('\n'),
    design_data: {
      is_synthetic_test: true,
      test_run_id: testRunId,
      persona_id: persona.personaId,
      source: 'synthetic-usability-harness',
      room: persona.designInput.brief.room,
      layoutPreference: persona.designInput.shape,
      household: persona.designInput.brief.household,
      priorities: persona.designInput.brief.priorities,
      appliances: persona.designInput.brief.appliances,
      styleIds: persona.designInput.brief.styleIds,
      aiProposalId: option.proposalId,
      aiSessionId: aiResult.session.id,
      selectedDesign: {
        name: option.name,
        spec: option.spec,
        items: option.items,
        priceBand: option.priceBand,
        rationale: option.rationale,
      },
    },
    cost_excl_tax: Math.round(midpoint / 1.1),
    cost_incl_tax: midpoint,
    status: 'enquiry',
    delivery_method: persona.location === 'Port Douglas' || persona.location === 'Mossman' ? 'pickup' : 'delivery',
  };

  const submitResult = await postJson(config.submitUrl, config.key, config.secret, {
    submissionKey,
    job,
    syntheticTest: common,
  }, 120_000);
  if (!submitResult.jobId) throw new Error('Lead handoff did not return a job id');

  const completedAt = new Date();
  const metrics = inferredSessionMetrics(persona, aiMs, completedAt.getTime() - startedAt.getTime(), true);
  const reactions = syntheticReactions(persona, aiResult.options);
  await postJson(config.controlUrl, config.key, config.secret, {
    action: 'upsert-session',
    syntheticTest: common,
    session: {
      persona_profile: persona,
      device: persona.device,
      primary_journey: persona.primaryJourney,
      secondary_journey: persona.secondaryJourney,
      status: 'completed',
      ai_session_id: aiResult.session.id,
      proposal_ids: aiResult.options.map(item => item.proposalId),
      selected_proposal_id: option.proposalId,
      job_id: submitResult.jobId,
      price_band: option.priceBand,
      session_metrics: metrics,
      synthetic_reactions: reactions,
      observed_failures: [],
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
    },
  }, 60_000);

  return {
    testRunId,
    personaId: persona.personaId,
    status: 'completed',
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    aiSessionId: aiResult.session.id,
    proposalIds: aiResult.options.map(item => item.proposalId),
    selectedProposalId: option.proposalId,
    jobId: submitResult.jobId,
    priceBand: option.priceBand,
    options: aiResult.options.map(item => ({
      proposalId: item.proposalId,
      name: item.name,
      priceBand: item.priceBand,
      violations: item.violations,
      rationale: item.rationale,
      itemCount: item.items?.length ?? 0,
    })),
    metrics,
    syntheticReactions: reactions,
    priorResultCount: priorResults.length,
  };
}

async function main() {
  const allPersonas = buildPersonas();
  const personas = personaIdFilter
    ? allPersonas.filter(persona => persona.personaId === personaIdFilter)
    : allPersonas.slice(0, maxPersonas);
  if (personas.length === 0) {
    throw new Error(`No persona matched --persona-id=${personaIdFilter}`);
  }
  const results = [];
  await writeProgress(personas, results);
  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, testRunId, personas: personas.length, outputDir }));
    return;
  }

  const fileEnv = await loadEnvFile(path.resolve('.env'));
  const supabaseUrl = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SYNTHETIC_TEST_SECRET;
  if (!supabaseUrl || !key || !secret) {
    throw new Error('VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY and SYNTHETIC_TEST_SECRET are required');
  }
  const base = `${supabaseUrl.replace(/\/$/, '')}/functions/v1`;
  const config = {
    key,
    secret,
    aiUrl: `${base}/ai-designer`,
    submitUrl: `${base}/submit-planner-enquiry`,
    controlUrl: `${base}/synthetic-test-control`,
  };

  const health = await postJson(config.controlUrl, key, secret, {
    action: 'health',
    syntheticTest: { testRunId, personaId: 'SYN-P001' },
  }, 60_000);
  if (!health.ok || !health.testMode || !health.databaseSink) throw new Error('Synthetic safety health check failed');
  if (requireMailtrap && !health.mailtrapConfigured) {
    throw new Error('Mailtrap sandbox is not configured; refusing to create test leads');
  }

  let consecutiveFailures = 0;
  let rateLimitFailures = 0;
  for (let batchStart = 0; batchStart < personas.length; batchStart += 10) {
    const batch = personas.slice(batchStart, batchStart + 10);
    for (let pairStart = 0; pairStart < batch.length; pairStart += 2) {
      const pair = batch.slice(pairStart, pairStart + 2);
      const settled = await Promise.allSettled(pair.map(persona => runPersona(persona, config, results)));
      for (let index = 0; index < settled.length; index += 1) {
        const outcome = settled[index];
        const persona = pair[index];
        if (outcome.status === 'fulfilled') {
          results.push(outcome.value);
          consecutiveFailures = 0;
          console.log(JSON.stringify({ event: 'persona-completed', personaId: persona.personaId, completed: results.filter(r => r.status === 'completed').length }));
        } else {
          const status = Number(outcome.reason?.status ?? 0);
          if (status === 429) rateLimitFailures += 1;
          consecutiveFailures += 1;
          const failed = {
            testRunId,
            personaId: persona.personaId,
            status: 'failed',
            error: String(outcome.reason?.message ?? outcome.reason),
            httpStatus: status || null,
            failedAt: new Date().toISOString(),
          };
          results.push(failed);
          await postJson(config.controlUrl, key, secret, {
            action: 'upsert-session',
            syntheticTest: { testRunId, personaId: persona.personaId },
            session: {
              persona_profile: persona,
              device: persona.device,
              primary_journey: persona.primaryJourney,
              secondary_journey: persona.secondaryJourney,
              status: status === 429 ? 'paused' : 'failed',
              session_metrics: { completion: false, errors: 1, http_status: status || null },
              synthetic_reactions: [],
              observed_failures: [{ stage: 'live-run', error: failed.error }],
              completed_at: new Date().toISOString(),
            },
          }, 60_000);
          console.error(JSON.stringify({ event: 'persona-failed', ...failed }));
        }
      }
      await writeProgress(personas, results);
      if (consecutiveFailures >= 3 || rateLimitFailures >= 2) {
        throw new Error(`Safety pause: ${consecutiveFailures} consecutive failures, ${rateLimitFailures} rate-limit responses`);
      }
    }
    if (batchStart + 10 < personas.length) {
      console.log(JSON.stringify({ event: 'batch-completed', batch: Math.floor(batchStart / 10) + 1, pauseSeconds: 10 }));
      await sleep(10_000);
    }
  }

  const summary = await postJson(config.controlUrl, key, secret, {
    action: 'summary',
    syntheticTest: { testRunId, personaId: 'SYN-P001' },
  }, 60_000);
  await fs.writeFile(path.join(outputDir, 'server-summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({
    event: 'run-completed',
    testRunId,
    planned: personas.length,
    completed: results.filter(row => row.status === 'completed').length,
    failed: results.filter(row => row.status !== 'completed').length,
    emails: summary.emails?.length ?? 0,
    outputDir,
  }));
}

main().catch(error => {
  console.error(JSON.stringify({ event: 'run-stopped', error: String(error?.message ?? error), testRunId }));
  process.exitCode = 1;
});
