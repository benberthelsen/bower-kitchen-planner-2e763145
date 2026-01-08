-- 1. Create "Countertops" category
UPDATE microvellum_products 
SET spec_group = 'Countertops' 
WHERE name ILIKE '%countertop%';

-- 2. Move appliances to "Appliances" category
UPDATE microvellum_products 
SET spec_group = 'Appliances' 
WHERE name IN ('Dishwasher', 'Dryer', 'Freestanding Range', 'Fridge', 
               'Integrated Dishwasher', 'Range Hood', 'Washing Machine')
  AND (spec_group = 'Base Cabinets' OR spec_group IS NULL);

-- 3. Create "Props" category for non-cabinet decorative items
UPDATE microvellum_products 
SET spec_group = 'Props' 
WHERE name IN ('Bar Stools', 'Book', 'Chair', 'Cookware', 'Dishes', 
               'Glasses', 'Ladder', 'Plants', 'Sofa', 'Table Set', 
               'Toilet', 'TV', 'Material Trolly', 'Bathroom Fixture')
  AND (spec_group = 'Base Cabinets' OR spec_group IS NULL);

-- 4. Move trim/finishing products to "Parts"
UPDATE microvellum_products 
SET spec_group = 'Parts' 
WHERE name IN ('Backsplash', 'Pelmet', 'Valance', 'Corbels', 'Soffit',
               'Finished Leg', 'Finished Leg With Radius', 
               'Bracket Array', 'Bracket Single', 'Box End',
               'Extruded Crown', 'Extruded Valance', 'Stemware Rack',
               'Wine Rack Diamond Stack', 'Mitered Shelf', 'Ellipse',
               'Round Top', 'Curved Part', 'Template',
               'Shelves with Shelf Std', 'Cabinet Faces Only')
  AND (spec_group = 'Base Cabinets' OR spec_group IS NULL);

-- 5. Create "Master Cabinets" category for flexible/parametric cabinets
UPDATE microvellum_products 
SET spec_group = 'Master Cabinets' 
WHERE name ILIKE 'master%' 
  AND name NOT ILIKE '%corner%'
  AND name NOT ILIKE '%blind%'
  AND spec_group IN ('Base Cabinets', 'Upper Cabinets');

-- 6. Create "Master Corner Cabinets" for master corner products
UPDATE microvellum_products 
SET spec_group = 'Master Corner Cabinets' 
WHERE (name ILIKE 'master%corner%' OR name ILIKE 'master%blind%');

-- 7. Move extruded parts to "Parts"
UPDATE microvellum_products 
SET spec_group = 'Parts' 
WHERE name ILIKE 'extruded%part%' 
  AND (spec_group = 'Base Cabinets' OR spec_group IS NULL);

-- 8. Move pocket door products to "Accessories"
UPDATE microvellum_products 
SET spec_group = 'Accessories' 
WHERE name ILIKE '%pocket door%' 
  AND (spec_group = 'Base Cabinets' OR spec_group IS NULL);

-- 9. Move test/diagnostic products to "Parts"
UPDATE microvellum_products 
SET spec_group = 'Parts' 
WHERE name ILIKE '%diagnostic%' 
  OR name ILIKE '%pricing%cost%' 
  OR name ILIKE '%pricing%prime%';