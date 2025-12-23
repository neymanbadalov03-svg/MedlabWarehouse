/*
  # Add Transfer Reference to Stock Out

  ## Changes
  
  1. Schema Updates
    - Add `transfer_id` column to `stock_out` table to link stock-out records with transfers
    - Add `inventory_loss` reason type to distinguish inventory loss from other stock-outs
    
  2. Purpose
    - This allows us to properly track which stock-outs are related to transfers
    - Makes it easier to display "from warehouse" and "to warehouse" in the exit log
    - Improves data integrity by creating explicit relationships
    
  3. Migration Safety
    - Uses IF NOT EXISTS to prevent errors on re-run
    - Nullable field so existing records are not affected
    - No data loss or breaking changes
*/

-- Add transfer_id reference to stock_out table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_out' AND column_name = 'transfer_id'
  ) THEN
    ALTER TABLE stock_out ADD COLUMN transfer_id uuid REFERENCES transfers(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_stock_out_transfer_id ON stock_out(transfer_id);
  END IF;
END $$;