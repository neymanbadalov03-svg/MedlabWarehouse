/*
  # Warehouse ERP System - Complete Database Schema

  ## Overview
  This migration creates a comprehensive warehouse management system with support for:
  - Multiple warehouses
  - Reagents and consumables management
  - Invoice-based stock entries with batch tracking
  - Inter-warehouse transfers
  - Stock exits and consumption
  - Inventory counting and loss tracking

  ## Tables Created

  ### 1. Warehouses
  - Stores warehouse master data
  - Fields: id, name, address, created_at

  ### 2. Reagents
  - Master data for reagent products
  - Fields: id, name, code, created_at

  ### 3. Consumables
  - Master data for consumable products
  - Fields: id, name, code, created_at

  ### 4. Invoices
  - Header data for warehouse entries
  - Fields: id, invoice_code, supplier, date, warehouse_id, created_at

  ### 5. InvoiceItems
  - Line items for each invoice with batch tracking
  - Fields: id, invoice_id, product_type, product_id, quantity, unit_price, total_price, batch_date, created_at

  ### 6. Transfers
  - Header data for inter-warehouse transfers
  - Fields: id, from_warehouse_id, to_warehouse_id, date, total_amount, created_at

  ### 7. TransferItems
  - Line items for transfers with batch preservation
  - Fields: id, transfer_id, product_type, product_id, batch_date, quantity, unit_price, total_price

  ### 8. StockOut
  - Header data for stock exits
  - Fields: id, warehouse_id, date, reason, total_amount, created_at

  ### 9. StockOutItems
  - Line items for stock exits
  - Fields: id, stockout_id, product_type, product_id, batch_date, quantity, unit_price, total_price

  ### 10. InventoryCount
  - Header data for inventory counts
  - Fields: id, warehouse_id, date, total_loss_amount, created_at

  ### 11. InventoryCountItems
  - Line items for inventory counts showing system vs actual quantities
  - Fields: id, count_id, product_type, product_id, system_qty, real_qty, loss_qty, loss_amount

  ## Security
  - RLS enabled on all tables
  - Public access for demo purposes (can be restricted later)

  ## Important Notes
  1. Batch dates are preserved throughout all operations
  2. Product types are stored as text: 'reagent' or 'consumable'
  3. All monetary values use numeric type for precision
  4. Timestamps use timestamptz for timezone awareness
*/

-- Create Warehouses table
CREATE TABLE IF NOT EXISTS warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  created_at timestamptz DEFAULT now()
);

-- Create Reagents table
CREATE TABLE IF NOT EXISTS reagents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create Consumables table
CREATE TABLE IF NOT EXISTS consumables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create Invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_code text NOT NULL,
  supplier text NOT NULL,
  date date NOT NULL,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Create InvoiceItems table
CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_type text NOT NULL CHECK (product_type IN ('reagent', 'consumable')),
  product_id uuid NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL CHECK (unit_price >= 0),
  total_price numeric NOT NULL CHECK (total_price >= 0),
  batch_date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create Transfers table
CREATE TABLE IF NOT EXISTS transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  date date NOT NULL,
  total_amount numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CHECK (from_warehouse_id != to_warehouse_id)
);

-- Create TransferItems table
CREATE TABLE IF NOT EXISTS transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
  product_type text NOT NULL CHECK (product_type IN ('reagent', 'consumable')),
  product_id uuid NOT NULL,
  batch_date date NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL CHECK (unit_price >= 0),
  total_price numeric NOT NULL CHECK (total_price >= 0)
);

-- Create StockOut table
CREATE TABLE IF NOT EXISTS stock_out (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  date date NOT NULL,
  reason text NOT NULL,
  total_amount numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create StockOutItems table
CREATE TABLE IF NOT EXISTS stock_out_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stockout_id uuid NOT NULL REFERENCES stock_out(id) ON DELETE CASCADE,
  product_type text NOT NULL CHECK (product_type IN ('reagent', 'consumable')),
  product_id uuid NOT NULL,
  batch_date date NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL CHECK (unit_price >= 0),
  total_price numeric NOT NULL CHECK (total_price >= 0)
);

-- Create InventoryCount table
CREATE TABLE IF NOT EXISTS inventory_count (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  date date NOT NULL,
  total_loss_amount numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create InventoryCountItems table
CREATE TABLE IF NOT EXISTS inventory_count_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id uuid NOT NULL REFERENCES inventory_count(id) ON DELETE CASCADE,
  product_type text NOT NULL CHECK (product_type IN ('reagent', 'consumable')),
  product_id uuid NOT NULL,
  system_qty numeric NOT NULL CHECK (system_qty >= 0),
  real_qty numeric NOT NULL CHECK (real_qty >= 0),
  loss_qty numeric NOT NULL,
  loss_amount numeric NOT NULL
);

-- Enable Row Level Security
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE reagents ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumables ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_out ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_out_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_count ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_count_items ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (for demo purposes)
CREATE POLICY "Allow public select on warehouses"
  ON warehouses FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert on warehouses"
  ON warehouses FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update on warehouses"
  ON warehouses FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete on warehouses"
  ON warehouses FOR DELETE
  USING (true);

CREATE POLICY "Allow public select on reagents"
  ON reagents FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert on reagents"
  ON reagents FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update on reagents"
  ON reagents FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete on reagents"
  ON reagents FOR DELETE
  USING (true);

CREATE POLICY "Allow public select on consumables"
  ON consumables FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert on consumables"
  ON consumables FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update on consumables"
  ON consumables FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete on consumables"
  ON consumables FOR DELETE
  USING (true);

CREATE POLICY "Allow public select on invoices"
  ON invoices FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert on invoices"
  ON invoices FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update on invoices"
  ON invoices FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete on invoices"
  ON invoices FOR DELETE
  USING (true);

CREATE POLICY "Allow public select on invoice_items"
  ON invoice_items FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert on invoice_items"
  ON invoice_items FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update on invoice_items"
  ON invoice_items FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete on invoice_items"
  ON invoice_items FOR DELETE
  USING (true);

CREATE POLICY "Allow public select on transfers"
  ON transfers FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert on transfers"
  ON transfers FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update on transfers"
  ON transfers FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete on transfers"
  ON transfers FOR DELETE
  USING (true);

CREATE POLICY "Allow public select on transfer_items"
  ON transfer_items FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert on transfer_items"
  ON transfer_items FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update on transfer_items"
  ON transfer_items FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete on transfer_items"
  ON transfer_items FOR DELETE
  USING (true);

CREATE POLICY "Allow public select on stock_out"
  ON stock_out FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert on stock_out"
  ON stock_out FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update on stock_out"
  ON stock_out FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete on stock_out"
  ON stock_out FOR DELETE
  USING (true);

CREATE POLICY "Allow public select on stock_out_items"
  ON stock_out_items FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert on stock_out_items"
  ON stock_out_items FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update on stock_out_items"
  ON stock_out_items FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete on stock_out_items"
  ON stock_out_items FOR DELETE
  USING (true);

CREATE POLICY "Allow public select on inventory_count"
  ON inventory_count FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert on inventory_count"
  ON inventory_count FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update on inventory_count"
  ON inventory_count FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete on inventory_count"
  ON inventory_count FOR DELETE
  USING (true);

CREATE POLICY "Allow public select on inventory_count_items"
  ON inventory_count_items FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert on inventory_count_items"
  ON inventory_count_items FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update on inventory_count_items"
  ON inventory_count_items FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete on inventory_count_items"
  ON inventory_count_items FOR DELETE
  USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON invoice_items(product_type, product_id);
CREATE INDEX IF NOT EXISTS idx_transfer_items_transfer_id ON transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_transfer_items_product ON transfer_items(product_type, product_id);
CREATE INDEX IF NOT EXISTS idx_stock_out_items_stockout_id ON stock_out_items(stockout_id);
CREATE INDEX IF NOT EXISTS idx_stock_out_items_product ON stock_out_items(product_type, product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_count_items_count_id ON inventory_count_items(count_id);
CREATE INDEX IF NOT EXISTS idx_reagents_code ON reagents(code);
CREATE INDEX IF NOT EXISTS idx_consumables_code ON consumables(code);