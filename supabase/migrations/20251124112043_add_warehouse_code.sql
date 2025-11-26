/*
  # Add warehouse code column

  1. Changes
    - Add `code` column to `warehouses` table
      - Type: text
      - Required: yes
      - Unique: yes
    - Add unique constraint on code
    - Generate default codes for existing warehouses

  2. Notes
    - Existing warehouses will receive auto-generated codes (WH001, WH002, etc.)
    - Future warehouses must provide a unique code
*/

-- Add code column (initially nullable to allow updates)
ALTER TABLE warehouses 
ADD COLUMN IF NOT EXISTS code text;

-- Generate unique codes for existing warehouses
DO $$
DECLARE
  warehouse_record RECORD;
  counter INTEGER := 1;
BEGIN
  FOR warehouse_record IN 
    SELECT id FROM warehouses WHERE code IS NULL ORDER BY created_at
  LOOP
    UPDATE warehouses 
    SET code = 'WH' || LPAD(counter::text, 3, '0')
    WHERE id = warehouse_record.id;
    counter := counter + 1;
  END LOOP;
END $$;

-- Make code column required and unique
ALTER TABLE warehouses 
ALTER COLUMN code SET NOT NULL;

-- Add unique constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'warehouses_code_unique'
  ) THEN
    ALTER TABLE warehouses 
    ADD CONSTRAINT warehouses_code_unique UNIQUE (code);
  END IF;
END $$;