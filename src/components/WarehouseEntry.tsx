import { useState, useEffect } from 'react';
import Modal from './Modal';
import SearchableProductSelect from './SearchableProductSelect';
import BulkImport from './BulkImport';
import { Plus, Trash2, Save, Upload } from 'lucide-react';
import { supabase } from '../lib/supabase';
import InvoiceList from './InvoiceList';
import type { Warehouse, Reagent, Consumable, ProductType } from '../types/database';

interface ProductRow {
  id: string;
  product_type: ProductType;
  product_id: string;
  product_code: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export default function WarehouseEntry() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [reagents, setReagents] = useState<Reagent[]>([]);
  const [consumables, setConsumables] = useState<Consumable[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [invoiceCode, setInvoiceCode] = useState('');
  const [supplier, setSupplier] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string; type: 'success' | 'error' | 'info' }>({ isOpen: false, title: '', message: '', type: 'info' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [warehousesRes, reagentsRes, consumablesRes] = await Promise.all([
      supabase.from('warehouses').select('id, name, code').order('name'),
      supabase.from('reagents').select('id, code, name').order('code'),
      supabase.from('consumables').select('id, code, name').order('code'),
    ]);

    if (warehousesRes.data) setWarehouses(warehousesRes.data);
    if (reagentsRes.data) setReagents(reagentsRes.data);
    if (consumablesRes.data) setConsumables(consumablesRes.data);
  };

  const addRow = () => {
    setRows([
      ...rows,
      {
        id: crypto.randomUUID(),
        product_type: 'reagent',
        product_id: '',
        product_code: '',
        product_name: '',
        quantity: 0,
        unit_price: 0,
        total_price: 0,
      },
    ]);
  };

  const updateRow = (id: string, field: keyof ProductRow, value: any) => {
    setRows(
      rows.map((row) => {
        if (row.id !== id) return row;

        const updated = { ...row, [field]: value };

        if (field === 'product_type' || field === 'product_id') {
          if (field === 'product_type') {
            updated.product_id = '';
            updated.product_code = '';
            updated.product_name = '';
          }

          if (updated.product_id && updated.product_type) {
            const products = updated.product_type === 'reagent' ? reagents : consumables;
            const product = products.find((p) => p.id === updated.product_id);
            if (product) {
              updated.product_code = product.code;
              updated.product_name = product.name;
            }
          }
        }

        if (field === 'quantity' || field === 'unit_price') {
          updated.total_price = Number(updated.quantity) * Number(updated.unit_price);
        }

        return updated;
      })
    );
  };

  const removeRow = (id: string) => {
    setRows(rows.filter((row) => row.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedWarehouse || !invoiceCode || !supplier || rows.length === 0) {
      setModal({ isOpen: true, title: 'Xəta', message: 'Zəhmət olmasa bütün məlumatları doldurun', type: 'error' });
      return;
    }

    const invalidRows = rows.filter((r) => !r.product_id || r.quantity <= 0 || r.unit_price < 0);
    if (invalidRows.length > 0) {
      setModal({ isOpen: true, title: 'Xəta', message: 'Bütün məhsul sətirləri düzgün doldurulmalıdır', type: 'error' });
      return;
    }

    setLoading(true);

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert([
        {
          invoice_code: invoiceCode,
          supplier: supplier,
          date: date,
          warehouse_id: selectedWarehouse,
        },
      ])
      .select()
      .single();

    if (invoiceError || !invoice) {
      setModal({ isOpen: true, title: 'Xəta', message: 'Qaimə yaradılarkən xəta baş verdi', type: 'error' });
      setLoading(false);
      return;
    }

    const items = rows.map((row) => ({
      invoice_id: invoice.id,
      product_type: row.product_type,
      product_id: row.product_id,
      quantity: row.quantity,
      unit_price: row.unit_price,
      total_price: row.total_price,
      batch_date: date,
    }));

    const { error: itemsError } = await supabase.from('invoice_items').insert(items);

    if (itemsError) {
      setModal({ isOpen: true, title: 'Xəta', message: 'Məhsullar əlavə edilərkən xəta baş verdi', type: 'error' });
      await supabase.from('invoices').delete().eq('id', invoice.id);
      setLoading(false);
      return;
    }

    setModal({ isOpen: true, title: 'Uğurlu', message: 'Qaimə uğurla yadda saxlanıldı', type: 'success' });
    setInvoiceCode('');
    setSupplier('');
    setDate(new Date().toISOString().split('T')[0]);
    setRows([]);
    setRefreshKey(prev => prev + 1);
    setLoading(false);
  };

  const totalAmount = rows.reduce((sum, row) => sum + row.total_price, 0);

  return (
    <div className="h-full p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Anbara Giriş</h2>
            <p className="text-sm text-gray-500 mt-1">Yeni qaimə əlavə edin</p>
          </div>
          <button
            onClick={() => setShowBulkImport(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Kütləvi İdxal (Excel)
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Qaimə məlumatları</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Qaimə kodu
                </label>
                <input
                  type="text"
                  value={invoiceCode}
                  onChange={(e) => setInvoiceCode(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Q-001"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Firma adı
                </label>
                <input
                  type="text"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Təchizatçı firma"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Giriş tarixi
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Anbar
                </label>
                <select
                  value={selectedWarehouse}
                  onChange={(e) => setSelectedWarehouse(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Anbar seçin</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      [{w.code}] {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">Məhsul siyahısı</h3>
              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Sətir əlavə et
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Tip
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Məhsul
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Kod
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Miqdar
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Vahid qiymət
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Ümumi
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Əməliyyat
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {rows.map((row) => {
                    const products = row.product_type === 'reagent' ? reagents : consumables;
                    return (
                      <tr key={row.id}>
                        <td className="px-4 py-3">
                          <select
                            value={row.product_type}
                            onChange={(e) =>
                              updateRow(row.id, 'product_type', e.target.value as ProductType)
                            }
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                          >
                            <option value="reagent">Reagent</option>
                            <option value="consumable">Sərfiyyat</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <SearchableProductSelect
                            products={products}
                            value={row.product_id}
                            onChange={(productId) => updateRow(row.id, 'product_id', productId)}
                            productType={row.product_type}
                            placeholder="Məhsul seçin"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-gray-600">
                          {row.product_code || '-'}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            value={row.quantity || ''}
                            onChange={(e) =>
                              updateRow(row.id, 'quantity', Number(e.target.value))
                            }
                            className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                            min="0"
                            step="0.01"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            value={row.unit_price || ''}
                            onChange={(e) =>
                              updateRow(row.id, 'unit_price', Number(e.target.value))
                            }
                            className="w-28 px-2 py-1 border border-gray-300 rounded text-sm"
                            min="0"
                            step="0.01"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {row.total_price.toFixed(2)} ₼
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                        Məhsul əlavə etmək üçün "Sətir əlavə et" düyməsini klikləyin
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {rows.length > 0 && (
              <div className="p-6 border-t border-gray-200 bg-gray-50">
                <div className="flex justify-between items-center">
                  <div className="text-lg font-semibold text-gray-900">
                    Ümumi məbləğ: {totalAmount.toFixed(2)} ₼
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    Qaiməni yadda saxla
                  </button>
                </div>
              </div>
            )}
          </div>
        </form>

        <div className="mt-6">
          <InvoiceList
            key={refreshKey}
            warehouseId={selectedWarehouse || undefined}
            onInvoiceChange={() => setRefreshKey(prev => prev + 1)}
          />
        </div>
      </div>

      {showBulkImport && (
        <BulkImport
          onClose={() => setShowBulkImport(false)}
          onSuccess={() => setRefreshKey(prev => prev + 1)}
        />
      )}

      <Modal
        isOpen={modal.isOpen}
        onClose={() => setModal({ ...modal, isOpen: false })}
        title={modal.title}
        message={modal.message}
        type={modal.type}
      />
    </div>
  );
}
