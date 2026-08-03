-- #308: drop the near-duplicate Green (old slot 6) from the project palette —
-- Lime (5) and Emerald bracket it. Colours are stored INDICES, and this is a
-- mid-spectrum removal (the palette file forbids reshuffles for exactly this
-- reason), so the data shifts with it: everything above Green slides down one,
-- and projects that HAD Green keep index 6 — which is now Emerald, the nearest
-- neighbour. Single plain statement (MySQL 8 + MariaDB safe, #184 discipline).
UPDATE projects SET color = color - 1 WHERE color >= 7;
