# Warehouse ERP Stock Logic Documentation

## Business Flow

The warehouse ERP system follows a strict flow for managing inventory:

1. **Goods Entry**: All products enter through the MAIN warehouse via invoices
2. **Transfers**: Products move from MAIN to SUB warehouses via transfers
3. **Inventory Counts**: Physical counts identify discrepancies
4. **Stock Adjustments**: Losses are recorded as expenses

## Stock Calculation Formula

For any product P in warehouse W, the current stock is calculated as:

```
Stock(W, P) =
  + Sum(Invoice Items where warehouse = W and product = P)
  + Sum(Transfer Items where to_warehouse = W and product = P)
  - Sum(Transfer Items where from_warehouse = W and product = P)
  - Sum(Stock Out Items where warehouse = W and product = P)
```

### Stock Out Categories

Stock out items include:
- **Transfers**: When products move to another warehouse
- **Inventory Loss**: Physical count discrepancies (xərc/sayım xərci)
- **Consumption**: Regular consumption/usage

## Database Schema

### Core Tables

1. **warehouses**: Master data for warehouse locations
2. **reagents**: Product master data for reagents
3. **consumables**: Product master data for consumables
4. **invoices**: Invoice headers (link to warehouse)
5. **invoice_items**: Invoice line items (+ stock)
6. **transfers**: Transfer headers (from → to warehouse)
7. **transfer_items**: Transfer line items (- from source, + to destination)
8. **stock_out**: Stock out headers (link to warehouse and optionally transfer)
9. **stock_out_items**: Stock out line items (- stock)
10. **inventory_count**: Inventory count headers
11. **inventory_count_items**: Count details with system vs real quantities

### Key Relationships

- `stock_out.transfer_id` → links stock-out to transfer for proper tracking
- `invoice_items.batch_date` → preserved through all movements
- Product types: `'reagent'` or `'consumable'`

## Implementation Details

### Centralized Stock Calculation

All stock calculations use the shared function:
```typescript
calculateWarehouseStock(warehouseId, productId, productType)
```

This ensures consistency across:
- Warehouse List
- Warehouse Transfer
- Inventory Count

### Stock Validation

Before transfers, the system validates:
1. Transfer quantity ≤ available stock
2. Transfer quantity > 0
3. Source ≠ destination warehouse

### Inventory Loss Process

When performing inventory count:

1. System calculates current stock (systemQty)
2. User enters physical count (realQty)
3. Loss calculated: `lossQty = systemQty - realQty`
4. If lossQty > 0:
   - Create stock_out record with reason = 'inventory_loss'
   - Create stock_out_items with lossQty
   - Stock automatically reduced

After saving, the new stock equals realQty.

### Transfer Process

When creating a transfer:

1. **Transfer record created** with from/to warehouses
2. **Transfer items added** with products and quantities
3. **Stock out created** for source warehouse:
   - Reason: 'transfer'
   - Links to transfer via transfer_id
   - Creates stock_out_items (- stock from source)
4. **Invoice created** for destination warehouse:
   - Supplier: "Daxili Transfer"
   - Creates invoice_items (+ stock to destination)

This ensures proper tracking in both warehouses.

## UI Features

### Warehouse List
- Dropdown to select warehouse
- Shows only products in selected warehouse
- Displays batch-level details
- Real-time stock calculation

### Warehouse Transfer
- Validates stock availability before transfer
- Shows available stock per batch
- "Select All" for quick selection
- Search/filter products
- Prevents negative stock

### Warehouse Exit
- Shows all stock-out movements
- Displays "From Warehouse" and "To Warehouse" for transfers
- Color-coded badges:
  - Blue: Transfer
  - Red: Inventory Loss
  - Orange: Consumption

### Inventory Count
- Loads current system stock per warehouse
- User enters real physical quantity
- Automatically calculates loss
- Creates stock-out for losses > 0
- Shows loss amount in red

## Data Consistency Rules

1. **Single Source of Truth**: Stock is always calculated, never stored
2. **No Negative Stock**: Validation prevents stock from going negative
3. **Batch Preservation**: Batch dates and prices maintained through all movements
4. **Explicit Relationships**: transfer_id links stock-outs to transfers
5. **Audit Trail**: All movements are recorded and traceable

## Error Prevention

- Transfer validation checks available stock
- Real quantity cannot exceed system quantity in counts
- Source and destination warehouses must differ
- All movements require valid warehouse references
- Batch dates required for all items

## Testing Recommendations

1. Create invoices for MAIN warehouse
2. Verify stock appears in Warehouse List
3. Transfer to SUB warehouse
4. Verify stock decreases in MAIN, increases in SUB
5. Perform inventory count with loss
6. Verify loss creates stock-out and reduces stock
7. Check Warehouse Exit shows proper transfer details
