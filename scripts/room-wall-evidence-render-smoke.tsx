import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RoomDocumentEditor from '../src/components/roomDocument/RoomDocumentEditor';
import type { RoomDocumentV1 } from '../src/lib/roomDocument';

const document: RoomDocumentV1 = {
  version: 1, id: 'provisional-room', revision: 0,
  corners: [
    { id: 'a', xMm: 0, zMm: 0 }, { id: 'b', xMm: 3000, zMm: 0 },
    { id: 'c', xMm: 3000, zMm: 2000 }, { id: 'd', xMm: 0, zMm: 2000 },
    { id: 'e', xMm: 0, zMm: 500 },
  ],
  walls: [
    { id: 'site', startCornerId: 'a', endCornerId: 'b',
      geometryEvidence: { source: 'inferred', reason: 'Angle remains estimated.' },
      lengthEvidence: { valueMm: 3000, source: 'measured' } },
    { id: 'photo', startCornerId: 'b', endCornerId: 'c',
      geometryEvidence: { source: 'observed' }, lengthEvidence: { valueMm: 2000, source: 'observed' } },
    { id: 'guess', startCornerId: 'c', endCornerId: 'd',
      geometryEvidence: { source: 'inferred', uncertaintyMm: 350 },
      lengthEvidence: { valueMm: 3000, source: 'inferred' } },
    { id: 'unchecked', startCornerId: 'd', endCornerId: 'e' },
  ],
  chains: [{ id: 'open-run', wallIds: ['site', 'photo', 'guess', 'unchecked'], closed: false }],
  openings: [], services: [], objects: [],
  capture: { captureId: 'scanner-run' },
};

const markup = renderToStaticMarkup(<RoomDocumentEditor document={document} onChange={() => {}} />);
const wallMarkup = (number: number) => markup.match(new RegExp(`<g[^>]*aria-label="Select wall ${number},[\\s\\S]*?<\\/g>`))?.[0] ?? '';
assert.match(wallMarkup(1), /Wall position and angle inferred/);
assert.match(wallMarkup(1), /stroke-dasharray="9 6"/);
assert.match(wallMarkup(1), /1 · 3000 mm/, 'site-measured length remains unqualified');
assert.match(wallMarkup(2), /Wall position and angle observed/);
assert.doesNotMatch(wallMarkup(2), /stroke-dasharray=/);
assert.match(wallMarkup(3), /3 · ~3000 mm/);
assert.match(wallMarkup(4), /Wall position and angle unverified/);
assert.match(wallMarkup(4), /stroke-dasharray="3 6"/);
assert.match(markup, /wall survey is open/);
assert.doesNotMatch(markup, /<polygon\b/, 'an open chain must not render a floor polygon');

console.log('room wall evidence render passed');
