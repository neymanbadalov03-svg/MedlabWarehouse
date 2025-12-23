import { useState, useRef } from 'react';
import { Upload, Download, X, AlertCircle, CheckCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';

interface ParsedRow {
  rowNumber: number;
  warehouse_code: string;
  warehouse_name: string;
  type: string;
  code: string;
  name: string;
  qty: number;
  unit_price: number;
  isValid: boolean;
  errors: string[];
}

interface ImportSummary {
  totalRows: number;
  productsCreated: number;
  itemsImported: number;
  rowsSkipped: number;
  errors: string[];
}

export default function BulkImport({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'complete'>('upload');
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [importDate, setImportDate] = useState(new Date().toISOString().split('T')[0]);
  const [supplier, setSupplier] = useState('Bulk Import');
  const [allowCreateWarehouses, setAllowCreateWarehouses] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const requiredColumns = ['warehouse_code', 'warehouse_name', 'type', 'code', 'name', 'qty', 'unit_price'];

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        warehouse_code: 'WH001',
        warehouse_name: 'Əsas Anbar',
        type: 'reagent',
        code: 'R001',
        name: 'Sodium Chloride',
        qty: 50,
        unit_price: 12.50
      },
      {
        warehouse_code: 'WH001',
        warehouse_name: 'Əsas Anbar',
        type: 'consumable',
        code: 'C001',
        name: 'Test Tubes',
        qty: 100,
        unit_price: 5.00
      },
      {
        warehouse_code: 'WH002',
        warehouse_name: 'İkinci Anbar',
        type: 'reagent',
        code: 'R002',
        name: 'Ethanol 96%',
        qty: 25,
        unit_price: 18.75
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bulk Import');
    XLSX.writeFile(wb, 'bulk_import_template.xlsx');
  };

  const validateRow = (row: any, rowNum: number): ParsedRow => {
    const errors: string[] = [];

    const warehouseCode = (row.warehouse_code || '').toString().trim();
    const warehouseName = (row.warehouse_name || '').toString().trim();
    const type = (row.type || '').toString().trim().toLowerCase();
    const code = (row.code || '').toString().trim();
    const name = (row.name || '').toString().trim();
    const qty = Number(row.qty);
    const unitPrice = Number(row.unit_price);

    if (!warehouseCode) errors.push('Anbar kodu boşdur');
    if (!type) errors.push('Tip boşdur');
    if (!code) errors.push('Məhsul kodu boşdur');
    if (!qty && qty !== 0) errors.push('Miqdar boşdur');

    if (type && type !== 'reagent' && type !== 'consumable') {
      errors.push('Tip "reagent" və ya "consumable" olmalıdır');
    }

    if (isNaN(qty) || qty < 0) {
      errors.push('Miqdar 0 və ya müsbət ədəd olmalıdır');
    }

    if (isNaN(unitPrice) || unitPrice < 0) {
      errors.push('Vahid qiymət 0 və ya müsbət ədəd olmalıdır');
    }

    return {
      rowNumber: rowNum,
      warehouse_code: warehouseCode,
      warehouse_name: warehouseName,
      type,
      code,
      name,
      qty,
      unit_price: unitPrice,
      isValid: errors.length === 0,
      errors
    };
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      if (jsonData.length === 0) {
        alert('Excel faylında məlumat tapılmadı');
        return;
      }

      const firstRow = jsonData[0];
      const normalizedKeys = Object.keys(firstRow).map(k => k.toLowerCase().trim());
      const missingColumns = requiredColumns.filter(col => !normalizedKeys.includes(col.toLowerCase()));

      if (missingColumns.length > 0) {
        alert(`Aşağıdakı sütunlar əksikdir: ${missingColumns.join(', ')}`);
        return;
      }

      const normalizedData = jsonData.map(row => {
        const normalizedRow: any = {};
        Object.keys(row).forEach(key => {
          const normalizedKey = key.toLowerCase().trim();
          normalizedRow[normalizedKey] = row[key];
        });
        return normalizedRow;
      });

      const parsed = normalizedData.slice(0, 100).map((row, idx) => validateRow(row, idx + 2));
      setParsedData(parsed);
      setStep('preview');
    } catch (error) {
      alert('Excel faylı oxunarkən xəta baş verdi');
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImport = async () => {
    setStep('importing');
    setProgress(0);

    const validRows = parsedData.filter(row => row.isValid);
    if (validRows.length === 0) {
      alert('İdxal ediləcək etibarlı sətir yoxdur');
      setStep('preview');
      return;
    }

    const summary: ImportSummary = {
      totalRows: parsedData.length,
      productsCreated: 0,
      itemsImported: 0,
      rowsSkipped: parsedData.length - validRows.length,
      errors: []
    };

    try {
      const { data: allWarehouses } = await supabase.from('warehouses').select('*');
      const warehouseMap = new Map(allWarehouses?.map(w => [w.code, w]) || []);

      const { data: allReagents } = await supabase.from('reagents').select('*');
      const reagentMap = new Map(allReagents?.map(r => [r.code, r]) || []);

      const { data: allConsumables } = await supabase.from('consumables').select('*');
      const consumableMap = new Map(allConsumables?.map(c => [c.code, c]) || []);

      const groupedByWarehouse = new Map<string, ParsedRow[]>();
      for (const row of validRows) {
        if (!groupedByWarehouse.has(row.warehouse_code)) {
          groupedByWarehouse.set(row.warehouse_code, []);
        }
        groupedByWarehouse.get(row.warehouse_code)!.push(row);
      }

      let processedCount = 0;
      const totalToProcess = validRows.length;

      for (const [warehouseCode, rows] of groupedByWarehouse.entries()) {
        const warehouse = warehouseMap.get(warehouseCode);

        if (!warehouse) {
          if (allowCreateWarehouses) {
            const warehouseName = rows[0].warehouse_name || warehouseCode;
            const { data: newWarehouse, error } = await supabase
              .from('warehouses')
              .insert([{ code: warehouseCode, name: warehouseName }])
              .select()
              .single();

            if (error || !newWarehouse) {
              summary.errors.push(`Anbar yaradıla bilmədi: ${warehouseCode}`);
              summary.rowsSkipped += rows.length;
              processedCount += rows.length;
              continue;
            }
            warehouseMap.set(warehouseCode, newWarehouse);
          } else {
            summary.errors.push(`Anbar tapılmadı: ${warehouseCode}`);
            summary.rowsSkipped += rows.length;
            processedCount += rows.length;
            continue;
          }
        }

        const warehouseId = warehouseMap.get(warehouseCode)!.id;
        const timestamp = Date.now();
        const invoiceCode = `BULK-IMPORT-${timestamp}-${warehouseCode}`;

        const { data: invoice, error: invoiceError } = await supabase
          .from('invoices')
          .insert([{
            invoice_code: invoiceCode,
            supplier: supplier,
            date: importDate,
            warehouse_id: warehouseId,
            status: 'active'
          }])
          .select()
          .single();

        if (invoiceError || !invoice) {
          summary.errors.push(`Qaimə yaradıla bilmədi: ${warehouseCode}`);
          summary.rowsSkipped += rows.length;
          processedCount += rows.length;
          continue;
        }

        for (const row of rows) {
          try {
            let productId: string | null = null;

            if (row.type === 'reagent') {
              let reagent = reagentMap.get(row.code);
              if (!reagent) {
                const { data: newReagent, error } = await supabase
                  .from('reagents')
                  .insert([{ code: row.code, name: row.name }])
                  .select()
                  .single();

                if (!error && newReagent) {
                  reagentMap.set(row.code, newReagent);
                  reagent = newReagent;
                  summary.productsCreated++;
                }
              }
              productId = reagent?.id || null;
            } else {
              let consumable = consumableMap.get(row.code);
              if (!consumable) {
                const { data: newConsumable, error } = await supabase
                  .from('consumables')
                  .insert([{ code: row.code, name: row.name }])
                  .select()
                  .single();

                if (!error && newConsumable) {
                  consumableMap.set(row.code, newConsumable);
                  consumable = newConsumable;
                  summary.productsCreated++;
                }
              }
              productId = consumable?.id || null;
            }

            if (!productId) {
              summary.errors.push(`Sətir ${row.rowNumber}: Məhsul yaradıla bilmədi`);
              summary.rowsSkipped++;
              processedCount++;
              continue;
            }

            const totalPrice = row.qty * row.unit_price;
            const { error: itemError } = await supabase
              .from('invoice_items')
              .insert([{
                invoice_id: invoice.id,
                product_type: row.type,
                product_id: productId,
                quantity: row.qty,
                unit_price: row.unit_price,
                total_price: totalPrice,
                batch_date: importDate
              }]);

            if (itemError) {
              summary.errors.push(`Sətir ${row.rowNumber}: Məhsul əlavə edilmədi`);
              summary.rowsSkipped++;
            } else {
              summary.itemsImported++;
            }
          } catch (error) {
            summary.errors.push(`Sətir ${row.rowNumber}: Gözlənilməz xəta`);
            summary.rowsSkipped++;
          }

          processedCount++;
          setProgress(Math.round((processedCount / totalToProcess) * 100));
        }
      }

      setImportSummary(summary);
      setStep('complete');
    } catch (error) {
      alert('İdxal zamanı xəta baş verdi');
      setStep('preview');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">
            Kütləvi İdxal (Excel)
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {step === 'upload' && (
            <div className="space-y-6">
              <div>
                <p className="text-sm text-gray-600 mb-4">
                  Excel faylı vasitəsilə çoxsaylı məhsulu anbara əlavə edin.
                </p>

                <button
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors mb-4"
                >
                  <Download className="w-4 h-4" />
                  Nümunə Excel Şablonu Yüklə
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="bulk-import-file"
                />
                <label
                  htmlFor="bulk-import-file"
                  className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-colors"
                >
                  <Upload className="w-12 h-12 text-gray-400 mb-3" />
                  <p className="text-sm text-gray-600">Excel faylı seçin və ya buraya sürüyün</p>
                  <p className="text-xs text-gray-500 mt-1">Maksimum 10 MB, .xlsx və ya .xls</p>
                </label>
              </div>

              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="text-sm font-semibold text-blue-900 mb-2">Tələb olunan sütunlar:</h4>
                <ul className="text-xs text-blue-800 space-y-1">
                  <li>• <strong>warehouse_code</strong> - Anbar kodu (məs: WH001)</li>
                  <li>• <strong>warehouse_name</strong> - Anbar adı</li>
                  <li>• <strong>type</strong> - reagent və ya consumable</li>
                  <li>• <strong>code</strong> - Məhsul kodu</li>
                  <li>• <strong>name</strong> - Məhsul adı</li>
                  <li>• <strong>qty</strong> - Miqdar</li>
                  <li>• <strong>unit_price</strong> - Vahid qiymət</li>
                </ul>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex gap-4 mb-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Giriş tarixi
                  </label>
                  <input
                    type="date"
                    value={importDate}
                    onChange={(e) => setImportDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Təchizatçı
                  </label>
                  <input
                    type="text"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <input
                  type="checkbox"
                  id="allow-create-warehouses"
                  checked={allowCreateWarehouses}
                  onChange={(e) => setAllowCreateWarehouses(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="allow-create-warehouses" className="text-sm text-gray-700">
                  Mövcud olmayan anbarları avtomatik yarat
                </label>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  Ümumi sətir: <strong>{parsedData.length}</strong> |
                  Etibarlı: <strong className="text-green-600">{parsedData.filter(r => r.isValid).length}</strong> |
                  Xətalı: <strong className="text-red-600">{parsedData.filter(r => !r.isValid).length}</strong>
                </p>
              </div>

              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">#</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Anbar</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Tip</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Kod</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Ad</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Miqdar</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Qiymət</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Xətalar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {parsedData.map((row, idx) => (
                      <tr key={idx} className={row.isValid ? 'bg-white' : 'bg-red-50'}>
                        <td className="px-3 py-2 text-gray-600">{row.rowNumber}</td>
                        <td className="px-3 py-2">
                          {row.isValid ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-red-600" />
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{row.warehouse_code}</td>
                        <td className="px-3 py-2">{row.type}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
                        <td className="px-3 py-2">{row.name}</td>
                        <td className="px-3 py-2 text-right">{row.qty}</td>
                        <td className="px-3 py-2 text-right">{row.unit_price.toFixed(2)}</td>
                        <td className="px-3 py-2 text-xs text-red-600">
                          {row.errors.join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-full max-w-md">
                <p className="text-center text-gray-700 mb-4">İdxal edilir...</p>
                <div className="w-full bg-gray-200 rounded-full h-4">
                  <div
                    className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-center text-sm text-gray-600 mt-2">{progress}%</p>
              </div>
            </div>
          )}

          {step === 'complete' && importSummary && (
            <div className="space-y-4">
              <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
                <h3 className="text-lg font-semibold text-green-900 mb-4">İdxal tamamlandı</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Ümumi sətir:</p>
                    <p className="text-2xl font-bold text-gray-900">{importSummary.totalRows}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">İdxal edildi:</p>
                    <p className="text-2xl font-bold text-green-600">{importSummary.itemsImported}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Yaradılan məhsul:</p>
                    <p className="text-2xl font-bold text-blue-600">{importSummary.productsCreated}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Atlanan:</p>
                    <p className="text-2xl font-bold text-red-600">{importSummary.rowsSkipped}</p>
                  </div>
                </div>
              </div>

              {importSummary.errors.length > 0 && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <h4 className="text-sm font-semibold text-red-900 mb-2">Xətalar:</h4>
                  <ul className="text-xs text-red-800 space-y-1 max-h-48 overflow-y-auto">
                    {importSummary.errors.map((error, idx) => (
                      <li key={idx}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                onClick={() => {
                  onSuccess();
                  onClose();
                }}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Bağla
              </button>
            </div>
          )}
        </div>

        {step === 'preview' && (
          <div className="p-6 border-t border-gray-200 flex gap-3">
            <button
              onClick={() => setStep('upload')}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Geri
            </button>
            <button
              onClick={handleImport}
              disabled={parsedData.filter(r => r.isValid).length === 0}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              İdxal Et
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
