-- Parts library seed (#pricing-fix 2026-07-02)
-- The BOM engine sizes every part from parts_pricing formulas. This table was
-- previously populated by the Microvellum pricing import and was EMPTY after
-- the move to the unified project — the engine then priced every part at its
-- fallback size (a full gable), inflating material costs 3-4x.
--
-- Formulas use the planner's variables (mm): CabWidth, CabHeight, CabDepth,
-- CarcaseThick, ToeKickHeight, DoorGap, DrawerGap, ShelfOffset, NumDoors,
-- DrawerFrontHeight, DrawerHeight (box side = face − 20, set per drawer).
-- Edging spec: len1/wid1/len2/wid2, '-' = no tape (e.g. front edge only = 'E/-/-/-').
-- Costs per part (handling/machining/assembly) are modest shop defaults —
-- tune in Admin → Pricing → Parts.

insert into public.parts_pricing
  (name, part_type, length_function, width_function, edging, handling_cost, machining_cost, assembly_cost, visibility_status)
values
-- ── Base cabinet carcase ─────────────────────────────────────────────────────
('Base Left Side',  'Base Left Side',  'CabHeight - ToeKickHeight', 'CabDepth',                    'E/-/-/-', 1.5, 2.5, 2.0, 'Available'),
('Base Right Side', 'Base Right Side', 'CabHeight - ToeKickHeight', 'CabDepth',                    'E/-/-/-', 1.5, 2.5, 2.0, 'Available'),
('Base Bottom',     'Base Bottom',     'CabWidth - 2 * CarcaseThick', 'CabDepth - 20',             'E/-/-/-', 1.5, 2.5, 2.0, 'Available'),
('Base Back',       'Base Back',       'CabWidth',                  'CabHeight - ToeKickHeight',   '',        1.0, 1.5, 1.5, 'Available'),
('Base Front Rail', 'Base Front Rail', 'CabWidth - 2 * CarcaseThick', '100',                       '',        0.5, 1.0, 1.0, 'Available'),
('Base Rear Rail',  'Base Rear Rail',  'CabWidth - 2 * CarcaseThick', '100',                       '',        0.5, 1.0, 1.0, 'Available'),
-- ── Wall / upper carcase ─────────────────────────────────────────────────────
('Wall Left Side',  'Wall Left Side',  'CabHeight', 'CabDepth',                                    'E/-/-/-', 1.5, 2.5, 2.0, 'Available'),
('Wall Right Side', 'Wall Right Side', 'CabHeight', 'CabDepth',                                    'E/-/-/-', 1.5, 2.5, 2.0, 'Available'),
('Wall Top',        'Wall Top',        'CabWidth - 2 * CarcaseThick', 'CabDepth',                  'E/-/-/-', 1.5, 2.5, 2.0, 'Available'),
('Wall Bottom',     'Wall Bottom',     'CabWidth - 2 * CarcaseThick', 'CabDepth',                  'E/-/-/-', 1.5, 2.5, 2.0, 'Available'),
('Wall Back',       'Wall Back',       'CabWidth',  'CabHeight',                                   '',        1.0, 1.5, 1.5, 'Available'),
-- ── Tall carcase ─────────────────────────────────────────────────────────────
('Tall Left Side',  'Tall Left Side',  'CabHeight - ToeKickHeight', 'CabDepth',                    'E/-/-/-', 2.0, 3.0, 2.5, 'Available'),
('Tall Right Side', 'Tall Right Side', 'CabHeight - ToeKickHeight', 'CabDepth',                    'E/-/-/-', 2.0, 3.0, 2.5, 'Available'),
('Tall Top',        'Tall Top',        'CabWidth - 2 * CarcaseThick', 'CabDepth',                  '',        1.5, 2.5, 2.0, 'Available'),
('Tall Bottom',     'Tall Bottom',     'CabWidth - 2 * CarcaseThick', 'CabDepth',                  '',        1.5, 2.5, 2.0, 'Available'),
('Tall Back',       'Tall Back',       'CabWidth',  'CabHeight - ToeKickHeight',                   '',        1.5, 2.0, 2.0, 'Available'),
-- ── Corner (Ls) carcase — pie-cut footprint; bottoms approximated at 3/4 area ─
('Ls Base Left Side',   'Ls Base Left Side',   'CabHeight - ToeKickHeight', 'CabDepth',            'E/-/-/-', 1.5, 2.5, 2.0, 'Available'),
('Ls Base Right Side',  'Ls Base Right Side',  'CabHeight - ToeKickHeight', 'CabDepth',            'E/-/-/-', 1.5, 2.5, 2.0, 'Available'),
('Ls Base Left Back',   'Ls Base Left Back',   'CabHeight - ToeKickHeight', 'CabWidth',            '',        1.5, 2.0, 2.0, 'Available'),
('Ls Base Right Back',  'Ls Base Right Back',  'CabHeight - ToeKickHeight', 'CabDepth',            '',        1.5, 2.0, 2.0, 'Available'),
('Ls Base Bottom',      'Ls Base Bottom',      '(CabWidth * 3) / 4',        'CabDepth',            'E/-/-/-', 2.0, 3.0, 2.5, 'Available'),
('Ls Upper Left Side',  'Ls Upper Left Side',  'CabHeight', 'CabDepth',                            'E/-/-/-', 1.5, 2.5, 2.0, 'Available'),
('Ls Upper Right Side', 'Ls Upper Right Side', 'CabHeight', 'CabDepth',                            'E/-/-/-', 1.5, 2.5, 2.0, 'Available'),
('Ls Upper Left Back',  'Ls Upper Left Back',  'CabHeight', 'CabWidth',                            '',        1.5, 2.0, 2.0, 'Available'),
('Ls Upper Right Back', 'Ls Upper Right Back', 'CabHeight', 'CabDepth',                            '',        1.5, 2.0, 2.0, 'Available'),
('Ls Upper Bottom',     'Ls Upper Bottom',     '(CabWidth * 3) / 4',        'CabDepth',            'E/-/-/-', 2.0, 3.0, 2.5, 'Available'),
('Ls Rail On Edge',     'Ls Rail On Edge',     'CabWidth - 2 * CarcaseThick', '100',               '',        0.5, 1.0, 1.0, 'Available'),
('Rail On Flat',        'Rail On Flat',        'CabWidth - 2 * CarcaseThick', '100',               '',        0.5, 1.0, 1.0, 'Available'),
('L Shape Shelf',       'L Shape Shelf',       '(CabWidth * 3) / 4',        'CabDepth - ShelfOffset', 'E/-/-/-', 1.5, 2.0, 1.5, 'Available'),
-- ── Shelves ──────────────────────────────────────────────────────────────────
('Adjustable Shelf', 'Adjustable Shelf', 'CabWidth - 2 * CarcaseThick', 'CabDepth - ShelfOffset - 20', 'E/-/-/-', 1.0, 1.5, 1.0, 'Available'),
('Fixed Shelf',      'Fixed Shelf',      'CabWidth - 2 * CarcaseThick', 'CabDepth - 20',              'E/-/-/-', 1.0, 1.5, 1.5, 'Available'),
-- ── Fronts (exterior material, edged all round) ─────────────────────────────
('Door',         'Door',         '(CabHeight - ToeKickHeight) - DoorGap', '(CabWidth / NumDoors) - DoorGap', 'E/E/E/E', 2.0, 6.0, 3.0, 'Available'),
('Drawer Front', 'Drawer Front', 'CabWidth - DrawerGap',                  'DrawerFrontHeight - DrawerGap',   'E/E/E/E', 2.0, 6.0, 3.0, 'Available'),
-- ── Drawer boxes (box side height = drawer face − 20mm, min 60) ─────────────
('Drawer Left Side',  'Drawer Left Side',  'CabDepth - 50',                     'DrawerHeight', 'E/-/-/-', 1.0, 2.0, 2.0, 'Available'),
('Drawer Right Side', 'Drawer Right Side', 'CabDepth - 50',                     'DrawerHeight', 'E/-/-/-', 1.0, 2.0, 2.0, 'Available'),
('Drawer Box Side',   'Drawer Box Side',   'CabDepth - 50',                     'DrawerHeight', 'E/-/-/-', 1.0, 2.0, 2.0, 'Available'),
('Drawer Back',       'Drawer Back',       'CabWidth - 2 * CarcaseThick - 26',  'DrawerHeight', '',        1.0, 1.5, 1.5, 'Available'),
('Drawer Box Back',   'Drawer Box Back',   'CabWidth - 2 * CarcaseThick - 26',  'DrawerHeight', '',        1.0, 1.5, 1.5, 'Available'),
('Drawer Bottom',     'Drawer Bottom',     'CabWidth - 2 * CarcaseThick - 26',  'CabDepth - 80', '',       1.0, 1.5, 1.5, 'Available'),
('Drawer Box Bottom', 'Drawer Box Bottom', 'CabWidth - 2 * CarcaseThick - 26',  'CabDepth - 80', '',       1.0, 1.5, 1.5, 'Available');
