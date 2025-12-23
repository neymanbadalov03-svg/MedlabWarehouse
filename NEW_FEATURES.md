# New Features Documentation

## Summary of Changes

All requested features have been successfully implemented for the Warehouse ERP system.

## 1. Invoice Management with Return Functionality

### Database Changes
- Added `status` column to `invoices` table with values: 'active' | 'returned'
- Added `transfer_id` column to `stock_out` table for better tracking
- All existing invoices automatically set to 'active' status

### Features Implemented

#### Invoice List Component (`InvoiceList.tsx`)
- Displays all warehouse entry invoices with filtering by warehouse
- Shows invoice code, supplier, date, warehouse, total amount, and status
- Search functionality by invoice code or supplier name
- Status badge indicators (green for active, red for returned)

#### Invoice Return Functionality
- "Return" button for each active invoice
- Validates stock availability before allowing return
- Prevents negative stock situations
- Creates stock-out record with reason 'invoice_return'
- Automatically updates invoice status to 'returned'
- Shows purple badge in Warehouse Exit screen for returns

#### Integration
- Invoice list automatically shown in Warehouse Entry screen
- Refreshes automatically when new invoices are added
- Filtered by selected warehouse

## 2. Inventory Count Enhancements

### Database Changes
- Added `count_code` column to `inventory_count` table
- Auto-generates count codes in format: `COUNT-YYYY-###`
- Existing counts automatically assigned unique codes

### Features Implemented

#### Count Code Generation
- Automatic generation of unique count codes
- Format: `COUNT-2024-001`, `COUNT-2024-002`, etc.
- Increments automatically based on year
- Displayed prominently during count process

#### Count List Component (`CountList.tsx`)
- Shows all inventory counts with:
  - Count code
  - Warehouse name
  - Date
  - Total loss amount
  - Export action button

### Excel Export Functionality

#### Single Count Export
- UTF-8 encoded Excel files
- Columns included:
  - Məhsul Kodu (Product Code)
  - Məhsul Adı (Product Name)
  - Tip (Type - Reagent/Sərfiyyat)
  - Sistemdə Miqdar (System Quantity)
  - Faktiki Miqdar (Real Quantity)
  - Xərc Miqdarı (Loss Quantity)
  - Xərc Məbləği (Loss Amount)
- Proper column widths for readability
- File naming: `Sayim_[COUNT-CODE]_[DATE].xlsx`

#### Monthly Export
- Select any month to export all counts
- Includes all counts from that month in one file
- Additional columns:
  - Sayım Kodu (Count Code)
  - Tarix (Date)
  - Anbar (Warehouse)
  - All product and quantity details
- File naming: `Sayimlar_YYYY-MM.xlsx`

## 3. Stock Calculation Improvements

### Returned Invoice Handling
- Stock calculations now exclude returned invoices
- Only 'active' invoices contribute to stock
- Ensures accurate stock after invoice returns

### Data Consistency Validation

#### New Function: `validateStockConsistency()`
Located in `/src/lib/stockCalculations.ts`

Features:
- Checks all products across all warehouses
- Detects negative stock situations
- Returns detailed issue reports including:
  - Warehouse information
  - Product details
  - Calculated stock amount
  - Issue description

Can be called manually for diagnostics:
```typescript
import { validateStockConsistency } from './lib/stockCalculations';

const issues = await validateStockConsistency();
if (issues.length > 0) {
  console.log('Stock inconsistencies found:', issues);
}
```

### Transfer Logic Verification
- Transfers correctly deduct from source warehouse
- Transfers correctly add to destination warehouse
- Batch information preserved through transfers
- Stock-out records properly linked to transfers via `transfer_id`

## 4. Stock Calculation Formula

The system now uses a consistent formula across all screens:

```
Stock(Warehouse, Product) =
  + Sum(Active Invoice Items)
  + Sum(Transfer Items IN)
  - Sum(Transfer Items OUT)
  - Sum(Stock Out Items - all types)
```

Stock out items include:
- Transfers (with transfer_id reference)
- Inventory losses (from counts)
- Invoice returns (when invoices are returned)
- Regular consumption

## 5. UI Enhancements

### Warehouse Entry Screen
- Added invoice list below entry form
- View and return invoices directly
- Real-time status updates

### Inventory Count Screen
- Count code displayed prominently
- Count list below count form
- Quick export buttons

### Warehouse Exit Screen
- New badge type for invoice returns (purple)
- Proper "From/To" warehouse display for transfers

## 6. File Structure

New Files Created:
- `/src/components/InvoiceList.tsx` - Invoice management component
- `/src/components/CountList.tsx` - Count list and export component
- `/NEW_FEATURES.md` - This documentation file

Modified Files:
- `/src/components/WarehouseEntry.tsx` - Integrated invoice list
- `/src/components/InventoryCount.tsx` - Added count codes and list
- `/src/components/WarehouseExit.tsx` - Added invoice return badge
- `/src/lib/stockCalculations.ts` - Updated to exclude returned invoices, added validation
- `/supabase/migrations/` - New migration for status and count_code fields

## 7. Dependencies Added

- `xlsx` (v0.18.5) - For Excel export functionality with UTF-8 support

## 8. Data Migration

All existing data has been automatically updated:
- Existing invoices set to 'active' status
- Existing counts assigned sequential count codes
- No data loss or breaking changes

## 9. Testing Recommendations

1. **Invoice Returns**
   - Create invoice with products
   - Verify stock increases
   - Return the invoice
   - Verify stock decreases correctly
   - Attempt to return when insufficient stock (should block)

2. **Inventory Counts**
   - Create count with loss
   - Verify count code generated
   - Export to Excel and verify UTF-8 encoding
   - Export monthly report with multiple counts

3. **Stock Consistency**
   - Perform transfers
   - Check warehouse list shows correct quantities
   - Perform inventory count
   - Verify all screens show consistent stock

4. **Data Validation**
   - Call `validateStockConsistency()` function
   - Should return empty array if all stock is consistent

## 10. Known Limitations

- Excel exports use client-side generation (no server processing)
- Invoice returns require full stock availability (partial returns not supported)
- Count codes are year-based (resets numbering each year)

## 11. Future Enhancements (Optional)

- Partial invoice returns
- Batch-level tracking in Excel exports
- Stock consistency dashboard
- Automated consistency checks on schedule
- Email notifications for negative stock
