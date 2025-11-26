/*
  # Add Invoice Status and Count Code

  ## Changes
  
  1. Schema Updates
    - Add `status` column to `invoices` table to track invoice state (active/returned)
    - Add `count_code` column to `inventory_count` table for unique count identification
    
  2. Purpose
    - Track invoice returns for proper stock management
    - Provide unique identifiers for inventory counts
    - Enable invoice reversal without data loss
    
  3. Data Integrity
    - Default status is 'active' for all invoices
    - Count codes are required for proper audit trails
    - Existing records are updated safely
*/

-- Add status column to invoices table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'status'
  ) THEN
    ALTER TABLE invoices ADD COLUMN status text DEFAULT 'active' CHECK (status IN ('active', 'returned'));
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
  END IF;
END $$;

-- Add count_code column to inventory_count table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_count' AND column_name = 'count_code'
  ) THEN
    ALTER TABLE inventory_count ADD COLUMN count_code text;
    CREATE INDEX IF NOT EXISTS idx_inventory_count_code ON inventory_count(count_code);
  END IF;
END $$;

-- Update existing invoices to have active status
UPDATE invoices SET status = 'active' WHERE status IS NULL;

-- Update existing inventory counts with generated count codes if needed
DO $$
DECLARE
  rec RECORD;
  counter INTEGER := 1;
BEGIN
  FOR rec IN SELECT id FROM inventory_count WHERE count_code IS NULL ORDER BY created_at
  LOOP
    UPDATE inventory_count 
    SET count_code = 'COUNT-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(counter::TEXT, 3, '0')
    WHERE id = rec.id;
    counter := counter + 1;
  END LOOP;
END $$;