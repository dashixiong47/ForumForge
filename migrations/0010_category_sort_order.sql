ALTER TABLE categories ADD COLUMN sort_order INTEGER DEFAULT 0;

UPDATE categories
   SET sort_order = id * 10
 WHERE sort_order IS NULL OR sort_order = 0;
