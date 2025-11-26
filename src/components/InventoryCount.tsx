import { useState, useEffect } from 'react';
import { Search, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { calculateProductStockInWarehouse } from '../lib/stockCalculations';
import CountList from './CountList';
import Modal from './Modal';
import type { Warehouse, ProductType } from '../types/database';

interface CountRow {
  product_id: string;
  product_code: string;
  product_name: string;
  product_type: ProductType;
  system_qty: number;
  real_qty: number;
  loss_qty: number;
  loss_amount: number;
  unit_price: number;
}

export default function InventoryCount() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [countCode, setCountCode] = useState('');
  const [countRows, setCountRows] = useState<CountRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshListKey, setRefreshListKey] = useState(0);
  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string; type: 'success' | 'error' | 'info' }>({ isOpen: false, title: '', message: '', type: 'info' });

  useEffect(() => {
    loadWarehouses();
  }, []);

  const loadWarehouses = async () => {
    const { data } = await supabase.from('warehouses').select('*').order('name');
    if (data) setWarehouses(data);
  };

  const loadInventory = async () => {
    if (!selectedWarehouse) return;

    setLoading(true);

    const { data: reagents } = await supabase.from('reagents').select('*');
    const { data: consumables } = await supabase.from('consumables').select('*');

    const allProducts = [
      ...(reagents || []).map((r) => ({ ...r, type: 'reagent' as const })),
      ...(consumables || []).map((c) => ({ ...c, type: 'consumable' as const })),
    ];

    const rows: CountRow[] = [];

    for (const product of allProducts) {
      const stock = await calculateProductStockInWarehouse(
        selectedWarehouse,
        product.id,
        product.type
      );

      if (stock.totalQuantity > 0) {
        const avgPrice = stock.totalValue / stock.totalQuantity;

        rows.push({
          product_id: product.id,
          product_code: product.code,
          product_name: product.name,
          product_type: product.type,
          system_qty: stock.totalQuantity,
          real_qty: stock.totalQuantity,
          loss_qty: 0,
          loss_amount: 0,
          unit_price: avgPrice,
        });
      }
    }

    setCountRows(rows.sort((a, b) => a.product_code.localeCompare(b.product_code)));
    setLoading(false);
  };

  const updateRealQty = (productId: string, realQty: number) => {
    setCountRows(
      countRows.map((row) => {
        if (row.product_id !== productId) return row;

        const lossQty = row.system_qty - realQty;
        const lossAmount = lossQty * row.unit_price;

        return {
          ...row,
          real_qty: realQty,
          loss_qty: lossQty,
          loss_amount: lossAmount,
        };
      })
    );
  };

  const generateCountCode = async () => {
    const year = new Date().getFullYear();
    const { data: counts } = await supabase
      .from('inventory_count')
      .select('count_code')
      .like('count_code', `COUNT-${year}-%`)
      .order('created_at', { ascending: false })
      .limit(1);

    let nextNumber = 1;
    if (counts && counts.length > 0 && counts[0].count_code) {
      const match = counts[0].count_code.match(/COUNT-\d+-(\d+)/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }

    return `COUNT-${year}-${String(nextNumber).padStart(3, '0')}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedWarehouse || countRows.length === 0) {
      setModal({ isOpen: true, title: 'Xəbərdarlıq', message: 'Zəhmət olmasa anbar seçin və siyahını yükləyin', type: 'error' });
      return;
    }

    if (!countCode) {
      setModal({ isOpen: true, title: 'Xəbərdarlıq', message: 'Sayım kodu yaradılmadı', type: 'error' });
      return;
    }

    setLoading(true);

    const totalLossAmount = countRows.reduce((sum, row) => sum + row.loss_amount, 0);

    const { data: count, error: countError } = await supabase
      .from('inventory_count')
      .insert([
        {
          warehouse_id: selectedWarehouse,
          date: date,
          count_code: countCode,
          total_loss_amount: totalLossAmount,
        },
      ])
      .select()
      .single();

    if (countError || !count) {
      setModal({ isOpen: true, title: 'Xəta', message: 'Sayım yaradılarkən xəta baş verdi', type: 'error' });
      setLoading(false);
      return;
    }

    const items = countRows.map((row) => ({
      count_id: count.id,
      product_type: row.product_type,
      product_id: row.product_id,
      system_qty: row.system_qty,
      real_qty: row.real_qty,
      loss_qty: row.loss_qty,
      loss_amount: row.loss_amount,
    }));

    const { error: itemsError } = await supabase.from('inventory_count_items').insert(items);

    if (itemsError) {
      setModal({ isOpen: true, title: 'Xəta', message: 'Sayım məlumatları əlavə edilərkən xəta baş verdi', type: 'error' });
      await supabase.from('inventory_count').delete().eq('id', count.id);
      setLoading(false);
      return;
    }

    const lossItems = countRows.filter((row) => row.loss_qty > 0);
    if (lossItems.length > 0) {
      const lossAmount = lossItems.reduce((sum, row) => sum + row.loss_amount, 0);

      const { data: stockOut } = await supabase
        .from('stock_out')
        .insert([
          {
            warehouse_id: selectedWarehouse,
            date: date,
            reason: 'inventory_loss',
            total_amount: lossAmount,
          },
        ])
        .select()
        .single();

      if (stockOut) {
        await supabase.from('stock_out_items').insert(
          lossItems.map((row) => ({
            stockout_id: stockOut.id,
            product_type: row.product_type,
            product_id: row.product_id,
            batch_date: date,
            quantity: row.loss_qty,
            unit_price: row.unit_price,
            total_price: row.loss_amount,
          }))
        );
      }
    }

    setModal({ isOpen: true, title: 'Uğurlu', message: 'Sayım uğurla yadda saxlanıldı', type: 'success' });
    setCountRows([]);
    setCountCode('');
    setRefreshListKey(prev => prev + 1);
    setLoading(false);
  };

  const filteredRows = countRows.filter(
    (row) =>
      row.product_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.product_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalLoss = filteredRows.reduce((sum, row) => sum + row.loss_amount, 0);

  return (
    <div className="h-full p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900">Anbar Sayımı</h2>
          <p className="text-sm text-gray-500 mt-1">
            Sistemdəki məlumatları faktiki stokla müqayisə edin
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Sayım məlumatları</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Anbar seçin
                </label>
                <select
                  value={selectedWarehouse}
                  onChange={(e) => setSelectedWarehouse(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Seçin</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      [{w.code}] {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sayım tarixi
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={async () => {
                    const code = await generateCountCode();
                    setCountCode(code);
                    await loadInventory();
                  }}
                  disabled={!selectedWarehouse || loading}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  Siyahını Gətir
                </button>
              </div>
            </div>
          </div>

          {countRows.length > 0 && countCode && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="text-sm text-blue-700">
                  <span className="font-semibold">Sayım Kodu:</span> {countCode}
                </div>
              </div>

              <>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Məhsul axtar..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">Sayım cədvəli</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Faktiki qalan miqdarı daxil edin
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Kod
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Ad
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Tip
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Sistemdə
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Qalan
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Xərc
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Xərc məbləği
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredRows.map((row) => (
                        <tr key={row.product_id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm font-mono text-gray-900">
                            {row.product_code}
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">
                            {row.product_name}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                                row.product_type === 'reagent'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-green-100 text-green-700'
                              }`}
                            >
                              {row.product_type === 'reagent' ? 'Reagent' : 'Sərfiyyat'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-right font-medium text-gray-900">
                            {row.system_qty.toFixed(2)}
                          </td>
                          <td className="px-6 py-4">
                            <input
                              type="number"
                              value={row.real_qty}
                              onChange={(e) =>
                                updateRealQty(row.product_id, Number(e.target.value))
                              }
                              className="w-28 px-2 py-1 border border-gray-300 rounded text-sm text-right"
                              min="0"
                              max={row.system_qty}
                              step="0.01"
                            />
                          </td>
                          <td
                            className={`px-6 py-4 text-sm text-right font-medium ${
                              row.loss_qty > 0 ? 'text-red-600' : 'text-gray-900'
                            }`}
                          >
                            {row.loss_qty.toFixed(2)}
                          </td>
                          <td
                            className={`px-6 py-4 text-sm text-right font-medium ${
                              row.loss_amount > 0 ? 'text-red-600' : 'text-gray-900'
                            }`}
                          >
                            {row.loss_amount.toFixed(2)} ₼
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-6 border-t border-gray-200 bg-gray-50">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm text-gray-600">
                        Ümumi məhsul sayı: {filteredRows.length}
                      </div>
                      <div className="text-lg font-semibold text-gray-900 mt-1">
                        Ümumi xərc məbləği:{' '}
                        <span className={totalLoss > 0 ? 'text-red-600' : ''}>
                          {totalLoss.toFixed(2)} ₼
                        </span>
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      <Save className="w-4 h-4" />
                      Sayımı Yadda Saxla
                    </button>
                  </div>
                </div>
              </div>
            </>
            </>
          )}
        </form>

        <div className="mt-6">
          <CountList key={refreshListKey} />
        </div>
      </div>

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
