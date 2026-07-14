/**
 * MV XML export smoke test — exercises the XML-building logic from the
 * export-microvellum-xml edge function against sample planner data and
 * checks the output matches the structure of Microvellum's official
 * XML import samples (Root/Project/Walls/Products/Prompts).
 *
 * Build + run:
 *   npx esbuild scripts/mv-xml-builder.ts --bundle --format=esm --outfile=.tmp-snap-test/mv.mjs --platform=node
 *   node scripts/mv-xml-smoke.mjs
 *
 * (The builder logic is duplicated inline here from the edge function's
 * pure section so it can run without Deno.)
 */

function escapeXml(v) {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
const num = (v, f = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : f);

// --- sample planner data: room with a base cabinet on the back wall and a
// pie-cut corner in the back-right (rotation 90) ---
const room = {
  name: 'Kitchen',
  config: { width: 3600, depth: 2400, height: 2400 },
  dimensions: { toeKickHeight: 135 },
  materialDefaults: { doorStyle: 'Melamine' },
  cabinets: [
    {
      definitionId: 'base_1_door', productName: 'Base 1 Door', category: 'Base', cabinetNumber: 'C01',
      dimensions: { width: 600, height: 870, depth: 575 },
      position: { x: 1300, y: 0, z: 297.5, rotation: 0 },
      construction: { hingeSide: 'Right' },
    },
    {
      definitionId: 'base_corner_pie_cut_2_door', productName: '2 Door Pie Cut Corner Base', category: 'Base', cabinetNumber: 'C02',
      dimensions: { width: 900, height: 870, depth: 900 },
      position: { x: 3140, y: 0, z: 460, rotation: 90 },
      construction: { cabinetDepthLeft: 555, cabinetDepthRight: 555 },
    },
  ],
};

// --- replicate the edge function's product XML builder ---
const wallId = (n) => `WALL.R1.${String(n).padStart(3, '0')}`;
const wallFor = { 0: wallId(1), 90: wallId(2), 180: wallId(3), 270: wallId(4) };
const cornerWalls = { 0: `${wallId(1)}|${wallId(4)}`, 90: `${wallId(2)}|${wallId(1)}`, 180: `${wallId(3)}|${wallId(2)}`, 270: `${wallId(4)}|${wallId(3)}` };

const products = room.cabinets.map((cab, i) => {
  const { width, depth, height } = cab.dimensions;
  const rot = ((Math.round(num(cab.position.rotation)) % 360) + 360) % 360;
  const cx = cab.position.x, cz = cab.position.z;
  let xo, yo;
  if (rot === 90) { xo = cx + depth / 2; yo = cz - width / 2; }
  else if (rot === 180) { xo = cx + width / 2; yo = cz + depth / 2; }
  else if (rot === 270) { xo = cx - depth / 2; yo = cz + width / 2; }
  else { xo = cx - width / 2; yo = cz - depth / 2; }
  const corner = /corner|pie[-_ ]?cut|blind/i.test(cab.definitionId);
  const prompts = [];
  const add = (n, v) => prompts.push(`          <Prompt Name="${n}">\n            <Value>${v}</Value>\n          </Prompt>`);
  add('Toe_Kick_Height', 135);
  if (corner) { add('Cabinet_Depth_Left', cab.construction?.cabinetDepthLeft ?? 575); add('Cabinet_Depth_Right', cab.construction?.cabinetDepthRight ?? 575); }
  if (cab.construction?.hingeSide) add('Face_Options', cab.construction.hingeSide === 'Right' ? 'Right Swing' : 'Left Swing');
  add('Door_Type', 'Melamine');
  return `      <Product Name="${escapeXml(cab.productName)}">
        <Quantity>1</Quantity>
        <Height>${height}</Height>
        <Width>${width}</Width>
        <Depth>${depth}</Depth>
        <ItemNumber>1.${String(i + 1).padStart(2, '0')}</ItemNumber>
        <Angle>${rot}</Angle>
        <XOrigin>${Math.round(xo)}</XOrigin>
        <YOrigin>${Math.round(yo)}</YOrigin>
        <ZOrigin>0</ZOrigin>
        <LinkIDSpecificationGroup>Metric Decorative Laminate</LinkIDSpecificationGroup>
        <LinkIDLocation>Kitchen</LinkIDLocation>
        <LinkIDWall>${corner ? cornerWalls[rot] : wallFor[rot]}</LinkIDWall>
        <Prompts>
${prompts.join('\n')}
        </Prompts>
      </Product>`;
});

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Root Application="Microvellum" ApplicationVersion="7.0">
  <Project Name="Test Job">
    <JobNumber>1</JobNumber>
    <Category>Estimates</Category>
    <Locations>
      <Location Name="Kitchen"></Location>
    </Locations>
    <Products>
${products.join('\n')}
    </Products>
  </Project>
</Root>`;

// --- assertions against MV sample structure ---
let failures = 0;
const check = (name, cond) => { if (!cond) failures++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); };

check('Root tag with Application="Microvellum"', xml.includes('<Root Application="Microvellum" ApplicationVersion="7.0">'));
check('Project element present', /<Project Name="[^"]+">/.test(xml));
check('library product name used', xml.includes('<Product Name="2 Door Pie Cut Corner Base">'));
check('numeric W/H/D on product element', /<Width>900<\/Width>/.test(xml) && /<Height>870<\/Height>/.test(xml));
check('Cabinet_Depth_Left prompt (MV name)', xml.includes('<Prompt Name="Cabinet_Depth_Left">'));
check('corner links two walls pipe-separated', xml.includes('<LinkIDWall>WALL.R1.002|WALL.R1.001</LinkIDWall>'));
check('base links one wall', xml.includes('<LinkIDWall>WALL.R1.001</LinkIDWall>'));
check('Face_Options Right Swing', xml.includes('<Value>Right Swing</Value>'));
check('corner origin: XOrigin = x + depth/2 (3590)', xml.includes('<XOrigin>3590</XOrigin>'));
check('corner origin: YOrigin = z - width/2 (10)', xml.includes('<YOrigin>10</YOrigin>'));
check('base origin: XOrigin = x - width/2 (1000)', xml.includes('<XOrigin>1000</XOrigin>'));
check('no legacy MicrovellumJob schema', !xml.includes('<MicrovellumJob'));

console.log(failures === 0 ? '\nMV XML structure smoke test passed.' : `\n${failures} check(s) FAILED.`);
if (failures > 0) { console.log('\n----- generated XML -----\n' + xml); }
process.exit(failures === 0 ? 0 : 1);
