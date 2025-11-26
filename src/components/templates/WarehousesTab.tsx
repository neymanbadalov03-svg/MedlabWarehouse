import { useState, useEffect, useRef } from 'react';
import { Plus, Pencil, Trash2, Upload, Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';
import type { Warehouse } from '../../types/database';

export default function WarehousesTab() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadWarehouses();
  }, []);

  const loadWarehouses = async () => {
    const { data, error } = await supabase
      .from('warehouses')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setWarehouses(data);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;

    setLoading(true);
    setError('');

    if (editingId) {
      const { error: updateError } = await supabase
        .from('warehouses')
        .update({ name: name.trim(), code: code.trim(), address: address.trim() || null })
        .eq('id', editingId);

      if (updateError) {
        if (updateError.code === '23505') {
          setError('Bu kod artıq mövcuddur. Unikal kod daxil edin.');
        } else {
          setError('Xəta baş verdi.');
        }
      } else {
        setEditingId(null);
        setName('');
        setCode('');
        setAddress('');
        loadWarehouses();
      }
    } else {
      const { error: insertError } = await supabase
        .from('warehouses')
        .insert([{ name: name.trim(), code: code.trim(), address: address.trim() || null }]);

      if (insertError) {
        if (insertError.code === '23505') {
          setError('Bu kod artıq mövcuddur. Unikal kod daxil edin.');
        } else {
          setError('Xəta baş verdi.');
        }
      } else {
        setName('');
        setCode('');
        setAddress('');
        loadWarehouses();
      }
    }

    setLoading(false);
  };

  const handleEdit = (warehouse: Warehouse) => {
    setEditingId(warehouse.id);
    setName(warehouse.name);
    setCode(warehouse.code || '');
    setAddress(warehouse.address || '');
    setError('');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu anbarı silmək istədiyinizdən əminsiniz?')) return;

    const { error } = await supabase.from('warehouses').delete().eq('id', id);

    if (!error) {
      loadWarehouses();
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName('');
    setCode('');
    setAddress('');
    setError('');
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        warehouse_code: 'WH001',
        product_type: 'reagent',
        product_code: 'RG001',
        product_name: 'Test Reagent',
        quantity: 100,
        unit_price: 25.50
      },
      {
        warehouse_code: 'WH001',
        product_type: 'consumable',
        product_code: 'SM001',
        product_name: 'Test Consumable',
        quantity: 50,
        unit_price: 10.00
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Initial Stock');
    XLSX.writeFile(wb, 'initial_stock_template.xlsx');
  };

  const handleUploadInitialStock = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setUploadStatus('Yüklənir...');

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      if (jsonData.length === 0) {
        setUploadStatus('Xəta: Excel faylında məlumat tapılmadı');
        setLoading(false);
        return;
      }

      const requiredColumns = ['warehouse_code', 'product_type', 'product_code', 'product_name', 'quantity', 'unit_price'];
      const firstRow = jsonData[0];
      const missingColumns = requiredColumns.filter(col => !(col in firstRow));

      if (missingColumns.length > 0) {
        setUploadStatus(`Xəta: Aşağıdakı sütunlar əksikdir: ${missingColumns.join(', ')}`);
        setLoading(false);
        return;
      }

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      const currentDate = new Date().toISOString().split('T')[0];

      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const rowNum = i + 2;

        const warehouseCode = (row.warehouse_code || '').toString().trim();
        const productType = (row.product_type || '').toString().trim().toLowerCase();
        const productCode = (row.product_code || '').toString().trim();
        const productName = (row.product_name || '').toString().trim();
        const quantity = Number(row.quantity);
        const unitPrice = Number(row.unit_price);

        if (!warehouseCode || !productType || !productCode || !productName || !quantity || !unitPrice) {
          skipped++;
          errors.push(`Sətir ${rowNum}: Boş məlumat`);
          continue;
        }

        if (productType !== 'reagent' && productType !== 'consumable') {
          skipped++;
          errors.push(`Sətir ${rowNum}: Tip 'reagent' və ya 'consumable' olmalıdır`);
          continue;
        }

        const { data: warehouse } = await supabase
          .from('warehouses')
          .select('id')
          .eq('code', warehouseCode)
          .maybeSingle();

        if (!warehouse) {
          skipped++;
          errors.push(`Sətir ${rowNum}: Anbar kodu tapılmadı: ${warehouseCode}`);
          continue;
        }

        const tableName = productType === 'reagent' ? 'reagents' : 'consumables';
        let { data: product } = await supabase
          .from(tableName)
          .select('id')
          .eq('code', productCode)
          .maybeSingle();

        if (!product) {
          const { data: newProduct, error: createError } = await supabase
            .from(tableName)
            .insert([{ code: productCode, name: productName }])
            .select('id')
            .single();

          if (createError || !newProduct) {
            skipped++;
            errors.push(`Sətir ${rowNum}: Məhsul yaradıla bilmədi`);
            continue;
          }
          product = newProduct;
        }

        const { data: invoice, error: invoiceError } = await supabase
          .from('invoices')
          .insert([{
            invoice_code: `INIT-${Date.now()}-${i}`,
            supplier: 'Initial Stock Upload',
            date: currentDate,
            warehouse_id: warehouse.id,
            status: 'active'
          }])
          .select('id')
          .single();

        if (invoiceError || !invoice) {
          skipped++;
          errors.push(`Sətir ${rowNum}: Qaimə yaradıla bilmədi`);
          continue;
        }

        const totalPrice = quantity * unitPrice;
        const { error: itemError } = await supabase
          .from('invoice_items')
          .insert([{
            invoice_id: invoice.id,
            product_type: productType,
            product_id: product.id,
            quantity: quantity,
            unit_price: unitPrice,
            total_price: totalPrice,
            batch_date: currentDate
          }]);

        if (itemError) {
          await supabase.from('invoices').delete().eq('id', invoice.id);
          skipped++;
          errors.push(`Sətir ${rowNum}: Məhsul əlavə edilmədi`);
          continue;
        }

        imported++;
      }

      let statusMsg = `Uğurlu: ${imported} məhsul əlavə edildi`;
      if (skipped > 0) {
        statusMsg += `, ${skipped} atlandı`;
      }
      if (errors.length > 0 && errors.length <= 5) {
        statusMsg += `\n\nXətalar:\n${errors.join('\n')}`;
      } else if (errors.length > 5) {
        statusMsg += `\n\n${errors.length} xəta`;
      }

      setUploadStatus(statusMsg);
      loadWarehouses();
    } catch (error) {
      setUploadStatus('Xəta: Excel faylı oxunarkən problem yarandı');
    }

    setLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {editingId ? 'Anbarı Redaktə Et' : 'Yeni Anbar'}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Anbar kodu *
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Məsələn: WH001"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Anbar adı *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Məsələn: Əsas Anbar"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ünvan
              </label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Anbar ünvanı"
              />
            </div>

            {error && (
              <div className="text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Plus className="w-4 h-4" />
                {editingId ? 'Yadda Saxla' : 'Anbarı Əlavə Et'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Ləğv Et
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            İlkin Stok Yüklənməsi
          </h3>

          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-3">
                Excel faylı ilə çoxsaylı məhsulu birbaşa anbarlara əlavə edin.
              </p>

              <button
                onClick={handleDownloadTemplate}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors mb-3"
              >
                <Download className="w-4 h-4" />
                Nümunə Excel Şablonu Yüklə
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleUploadInitialStock}
                className="hidden"
                id="initial-stock-upload"
              />
              <label
                htmlFor="initial-stock-upload"
                className="flex items-center justify-center gap-2 w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-colors"
              >
                <Upload className="w-5 h-5" />
                Excel Faylı Seçin
              </label>
            </div>

            {uploadStatus && (
              <div className={`p-3 rounded-lg text-sm whitespace-pre-line ${
                uploadStatus.startsWith('Xəta') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
              }`}>
                {uploadStatus}
              </div>
            )}

            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <h4 className="text-sm font-semibold text-blue-900 mb-2">Excel Formatı:</h4>
              <ul className="text-xs text-blue-800 space-y-1">
                <li>• <strong>warehouse_code</strong> - Anbar kodu (məs: WH001)</li>
                <li>• <strong>product_type</strong> - reagent və ya consumable</li>
                <li>• <strong>product_code</strong> - Məhsul kodu</li>
                <li>• <strong>product_name</strong> - Məhsul adı</li>
                <li>• <strong>quantity</strong> - Miqdar</li>
                <li>• <strong>unit_price</strong> - Vahid qiymət</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kod</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Anbar adı</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ünvan</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tarix</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Əməliyyat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {warehouses.map((warehouse, index) => (
                  <tr key={warehouse.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{index + 1}</td>
                    <td className="px-6 py-4 text-sm font-mono text-gray-900">{warehouse.code}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{warehouse.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{warehouse.address || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(warehouse.created_at).toLocaleDateString('az-AZ')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleEdit(warehouse)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(warehouse.id)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {warehouses.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      Hələ ki anbar əlavə edilməyib
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
