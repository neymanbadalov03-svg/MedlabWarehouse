export type ProductType = 'reagent' | 'consumable';

export interface Warehouse {
  id: string;
  name: string;
  address: string | null;
  created_at: string;
}

export interface Reagent {
  id: string;
  name: string;
  code: string;
  created_at: string;
}

export interface Consumable {
  id: string;
  name: string;
  code: string;
  created_at: string;
}

export interface Invoice {
  id: string;
  invoice_code: string;
  supplier: string;
  date: string;
  warehouse_id: string;
  created_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  product_type: ProductType;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  batch_date: string;
  created_at: string;
}

export interface Transfer {
  id: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  date: string;
  total_amount: number;
  created_at: string;
}

export interface TransferItem {
  id: string;
  transfer_id: string;
  product_type: ProductType;
  product_id: string;
  batch_date: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface StockOut {
  id: string;
  warehouse_id: string;
  date: string;
  reason: string;
  total_amount: number;
  created_at: string;
}

export interface StockOutItem {
  id: string;
  stockout_id: string;
  product_type: ProductType;
  product_id: string;
  batch_date: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface InventoryCount {
  id: string;
  warehouse_id: string;
  date: string;
  total_loss_amount: number;
  created_at: string;
}

export interface InventoryCountItem {
  id: string;
  count_id: string;
  product_type: ProductType;
  product_id: string;
  system_qty: number;
  real_qty: number;
  loss_qty: number;
  loss_amount: number;
}

export interface Product {
  id: string;
  name: string;
  code: string;
  type: ProductType;
}

export interface StockBatch {
  product_id: string;
  product_code: string;
  product_name: string;
  product_type: ProductType;
  batch_date: string;
  supplier: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface StockSummary {
  product_id: string;
  product_code: string;
  product_name: string;
  product_type: ProductType;
  total_quantity: number;
  total_amount: number;
  last_entry_date: string;
  batches: StockBatch[];
}
