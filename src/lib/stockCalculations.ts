import { supabase } from './supabase';
import type { ProductType } from '../types/database';

export interface StockCalculationResult {
  totalQuantity: number;
  totalValue: number;
  batches: Array<{
    batch_date: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    supplier?: string;
  }>;
}

export async function calculateProductStockInWarehouse(
  warehouseId: string,
  productId: string,
  productType: ProductType
): Promise<StockCalculationResult> {
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, supplier')
    .eq('warehouse_id', warehouseId)
    .eq('status', 'active');

  const invoiceMap = new Map<string, string>();
  const invoiceIds = (invoices || []).map(inv => {
    invoiceMap.set(inv.id, inv.supplier || '');
    return inv.id;
  });

  const { data: entries } = invoiceIds.length > 0
    ? await supabase
        .from('invoice_items')
        .select('quantity, unit_price, batch_date, invoice_id')
        .eq('product_type', productType)
        .eq('product_id', productId)
        .in('invoice_id', invoiceIds)
    : { data: [] };

  const [
    { data: transfersIn },
    { data: stockOuts },
    { data: transfersOut }
  ] = await Promise.all([
    supabase
      .from('transfers')
      .select('id')
      .eq('to_warehouse_id', warehouseId),
    supabase
      .from('stock_out')
      .select('id')
      .eq('warehouse_id', warehouseId)
      .neq('reason', 'transfer'),
    supabase
      .from('transfers')
      .select('id')
      .eq('from_warehouse_id', warehouseId)
  ]);

  const transferInIds = (transfersIn || []).map(t => t.id);
  const stockOutIds = (stockOuts || []).map(so => so.id);
  const transferOutIds = (transfersOut || []).map(t => t.id);

  const [
    { data: transferItemsIn },
    { data: stockOutItems },
    { data: transferItemsOut }
  ] = await Promise.all([
    transferInIds.length > 0
      ? supabase
          .from('transfer_items')
          .select('quantity, unit_price, batch_date')
          .eq('product_type', productType)
          .eq('product_id', productId)
          .in('transfer_id', transferInIds)
      : Promise.resolve({ data: [] }),
    stockOutIds.length > 0
      ? supabase
          .from('stock_out_items')
          .select('quantity, batch_date')
          .eq('product_type', productType)
          .eq('product_id', productId)
          .in('stockout_id', stockOutIds)
      : Promise.resolve({ data: [] }),
    transferOutIds.length > 0
      ? supabase
          .from('transfer_items')
          .select('quantity, batch_date')
          .eq('product_type', productType)
          .eq('product_id', productId)
          .in('transfer_id', transferOutIds)
      : Promise.resolve({ data: [] })
  ]);

  const batchMap = new Map<string, {
    quantity: number;
    price: number;
    invoiceIds: Set<string>;
  }>();

  (entries || []).forEach((entry) => {
    const key = `${entry.batch_date}_${entry.unit_price}`;
    if (!batchMap.has(key)) {
      batchMap.set(key, { quantity: 0, price: entry.unit_price, invoiceIds: new Set() });
    }
    const current = batchMap.get(key)!;
    current.quantity += Number(entry.quantity);
    current.invoiceIds.add(entry.invoice_id);
  });

  (transferItemsIn || []).forEach((transfer) => {
    const key = `${transfer.batch_date}_${transfer.unit_price}`;
    if (!batchMap.has(key)) {
      batchMap.set(key, { quantity: 0, price: transfer.unit_price, invoiceIds: new Set() });
    }
    const current = batchMap.get(key)!;
    current.quantity += Number(transfer.quantity);
  });

  const exitMap = new Map<string, number>();

  (stockOutItems || []).forEach((exit) => {
    const current = exitMap.get(exit.batch_date) || 0;
    exitMap.set(exit.batch_date, current + Number(exit.quantity));
  });

  (transferItemsOut || []).forEach((exit) => {
    const current = exitMap.get(exit.batch_date) || 0;
    exitMap.set(exit.batch_date, current + Number(exit.quantity));
  });

  const batches = [];
  let totalQuantity = 0;
  let totalValue = 0;

  for (const [key, value] of batchMap) {
    const [batchDate] = key.split('_');
    const exitQty = exitMap.get(batchDate) || 0;
    const netQty = value.quantity - exitQty;

    if (netQty > 0) {
      const invoiceIds = Array.from(value.invoiceIds);
      const supplier = invoiceIds.length > 0 ? invoiceMap.get(invoiceIds[0]) || '' : '';

      batches.push({
        batch_date: batchDate,
        quantity: netQty,
        unit_price: value.price,
        total_price: netQty * value.price,
        supplier,
      });

      totalQuantity += netQty;
      totalValue += netQty * value.price;
    }
  }

  return {
    totalQuantity,
    totalValue,
    batches: batches.sort((a, b) => b.batch_date.localeCompare(a.batch_date)),
  };
}

export async function validateStockAvailability(
  warehouseId: string,
  productId: string,
  productType: ProductType,
  requestedQuantity: number
): Promise<{ available: boolean; currentStock: number }> {
  const stock = await calculateProductStockInWarehouse(warehouseId, productId, productType);

  return {
    available: stock.totalQuantity >= requestedQuantity,
    currentStock: stock.totalQuantity,
  };
}

export interface StockConsistencyIssue {
  warehouse_id: string;
  warehouse_name: string;
  product_id: string;
  product_code: string;
  product_name: string;
  product_type: ProductType;
  calculated_stock: number;
  issue: string;
}

export async function validateStockConsistency(): Promise<StockConsistencyIssue[]> {
  const issues: StockConsistencyIssue[] = [];

  const { data: warehouses } = await supabase.from('warehouses').select('*');
  const { data: reagents } = await supabase.from('reagents').select('*');
  const { data: consumables } = await supabase.from('consumables').select('*');

  if (!warehouses || !reagents || !consumables) return issues;

  const allProducts = [
    ...reagents.map(r => ({ ...r, type: 'reagent' as const })),
    ...consumables.map(c => ({ ...c, type: 'consumable' as const })),
  ];

  for (const warehouse of warehouses) {
    for (const product of allProducts) {
      const stock = await calculateProductStockInWarehouse(
        warehouse.id,
        product.id,
        product.type
      );

      if (stock.totalQuantity < 0) {
        issues.push({
          warehouse_id: warehouse.id,
          warehouse_name: warehouse.name,
          product_id: product.id,
          product_code: product.code,
          product_name: product.name,
          product_type: product.type,
          calculated_stock: stock.totalQuantity,
          issue: 'Negative stock detected',
        });
      }
    }
  }

  return issues;
}
