import { useState, useEffect } from 'react';
import { ArrowRight, Save, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { calculateProductStockInWarehouse } from '../lib/stockCalculations';
import type { Warehouse, StockBatch } from '../types/database';
import Modal from './Modal';

interface TransferRow extends StockBatch {
  selected: boolean;
  transfer_quantity: number;
}

export default function WarehouseTransfer() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [fromWarehouse, setFromWarehouse] = useState('');
  const [toWarehouse, setToWarehouse] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [availableStock, setAvailableStock] = useState<TransferRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string; type: 'success' | 'error' | 'info' }>({ isOpen: false, title: '', message: '', type: 'info' });

  useEffect(() => {
    loadWarehouses();
  }, []);

  useEffect(() => {
    if (fromWarehouse) {
      loadWarehouseStock();
    } else {
      setAvailableStock([]);
    }
  }, [fromWarehouse]);

  const loadWarehouses = async () => {
    const { data } = await supabase.from('warehouses').select('id, name, code').order('name');
    if (data) setWarehouses(data);
  };

  const loadWarehouseStock = async () => {
    setLoading(true);

    const [reagentsRes, consumablesRes] = await Promise.all([
      supabase.from('reagents').select('id, code, name').order('code'),
      supabase.from('consumables').select('id, code, name').order('code')
    ]);

    const { data: reagents } = reagentsRes;
    const { data: consumables } = consumablesRes;

    const allProducts = [
      ...(reagents || []).map((r) => ({ ...r, type: 'reagent' as const })),
      ...(consumables || []).map((c) => ({ ...c, type: 'consumable' as const })),
    ];

    const stockItems: TransferRow[] = [];

    for (const product of allProducts) {
      const stock = await calculateProductStockInWarehouse(
        fromWarehouse,
        product.id,
        product.type
      );

      for (const batch of stock.batches) {
        if (batch.quantity > 0) {
          stockItems.push({
            product_id: product.id,
            product_code: product.code,
            product_name: product.name,
            product_type: product.type,
            batch_date: batch.batch_date,
            supplier: batch.supplier || '',
            quantity: batch.quantity,
            unit_price: batch.unit_price,
            total_price: batch.total_price,
            selected: false,
            transfer_quantity: 0,
          });
        }
      }
    }

    setAvailableStock(stockItems.sort((a, b) => a.product_code.localeCompare(b.product_code)));
    setLoading(false);
  };

  const toggleSelection = (index: number) => {
    setAvailableStock(
      availableStock.map((item, i) =>
        i === index ? { ...item, selected: !item.selected, transfer_quantity: !item.selected ? item.quantity : 0 } : item
      )
    );
  };

  const toggleSelectAll = () => {
    const filteredItems = availableStock.filter(
      (stock) =>
        stock.product_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        stock.product_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const allSelected = filteredItems.every(item => item.selected);

    setAvailableStock(
      availableStock.map((item) => {
        const isInFiltered = filteredItems.some(f => f.product_id === item.product_id && f.batch_date === item.batch_date);
        if (isInFiltered) {
          return { ...item, selected: !allSelected, transfer_quantity: !allSelected ? item.quantity : 0 };
        }
        return item;
      })
    );
  };

  const updateTransferQuantity = (index: number, quantity: number) => {
    setAvailableStock(
      availableStock.map((item, i) =>
        i === index ? { ...item, transfer_quantity: Math.min(quantity, item.quantity) } : item
      )
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const selectedItems = availableStock.filter((item) => item.selected && item.transfer_quantity > 0);

    if (!fromWarehouse || !toWarehouse || selectedItems.length === 0) {
      setModal({ isOpen: true, title: 'Xəta', message: 'Zəhmət olmasa bütün məlumatları doldurun və ən azı bir məhsul seçin', type: 'error' });
      return;
    }

    if (fromWarehouse === toWarehouse) {
      setModal({ isOpen: true, title: 'Xəta', message: 'Göndərən və qəbul edən anbar eyni ola bilməz', type: 'error' });
      return;
    }

    for (const item of selectedItems) {
      if (item.transfer_quantity > item.quantity) {
        setModal({ isOpen: true, title: 'Xəta', message: `${item.product_name} üçün transfer miqdarı mövcud stokdan çoxdur (Mövcud: ${item.quantity.toFixed(2)})`, type: 'error' });
        return;
      }

      if (item.transfer_quantity <= 0) {
        setModal({ isOpen: true, title: 'Xəta', message: `${item.product_name} üçün transfer miqdarı 0-dan böyük olmalıdır`, type: 'error' });
        return;
      }
    }

    setLoading(true);

    const totalAmount = selectedItems.reduce(
      (sum, item) => sum + item.transfer_quantity * item.unit_price,
      0
    );

    const { data: transfer, error: transferError } = await supabase
      .from('transfers')
      .insert([
        {
          from_warehouse_id: fromWarehouse,
          to_warehouse_id: toWarehouse,
          date: date,
          total_amount: totalAmount,
        },
      ])
      .select()
      .single();

    if (transferError || !transfer) {
      setModal({ isOpen: true, title: 'Xəta', message: 'Transfer yaradılarkən xəta baş verdi', type: 'error' });
      setLoading(false);
      return;
    }

    const transferItems = selectedItems.map((item) => ({
      transfer_id: transfer.id,
      product_type: item.product_type,
      product_id: item.product_id,
      batch_date: item.batch_date,
      quantity: item.transfer_quantity,
      unit_price: item.unit_price,
      total_price: item.transfer_quantity * item.unit_price,
    }));

    const { error: itemsError } = await supabase.from('transfer_items').insert(transferItems);

    if (itemsError) {
      setModal({ isOpen: true, title: 'Xəta', message: 'Transfer məhsulları əlavə edilərkən xəta baş verdi', type: 'error' });
      await supabase.from('transfers').delete().eq('id', transfer.id);
      setLoading(false);
      return;
    }

    const exitItems = selectedItems.map((item) => ({
      stockout_id: '',
      product_type: item.product_type,
      product_id: item.product_id,
      batch_date: item.batch_date,
      quantity: item.transfer_quantity,
      unit_price: item.unit_price,
      total_price: item.transfer_quantity * item.unit_price,
    }));

    const { data: stockOut } = await supabase
      .from('stock_out')
      .insert([
        {
          warehouse_id: fromWarehouse,
          date: date,
          reason: 'transfer',
          total_amount: totalAmount,
          transfer_id: transfer.id,
        },
      ])
      .select()
      .single();

    if (stockOut) {
      await supabase
        .from('stock_out_items')
        .insert(exitItems.map((item) => ({ ...item, stockout_id: stockOut.id })));
    }

    setModal({ isOpen: true, title: 'Uğurlu', message: 'Transfer uğurla həyata keçirildi', type: 'success' });
    setFromWarehouse('');
    setToWarehouse('');
    setDate(new Date().toISOString().split('T')[0]);
    setAvailableStock([]);
    setLoading(false);
  };

  const filteredStock = availableStock.filter(
    (stock) =>
      stock.product_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      stock.product_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedItems = availableStock.filter((item) => item.selected && item.transfer_quantity > 0);
  const totalTransferAmount = selectedItems.reduce(
    (sum, item) => sum + item.transfer_quantity * item.unit_price,
    0
  );

  return (
    <div className="h-full p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900">Anbarlar Arası Transfer</h2>
          <p className="text-sm text-gray-500 mt-1">Məhsulları bir anbardan digərinə köçürün</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Transfer məlumatları</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Göndərən anbar
                </label>
                <select
                  value={fromWarehouse}
                  onChange={(e) => setFromWarehouse(e.target.value)}
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

              <div className="flex items-end justify-center">
                <ArrowRight className="w-8 h-8 text-blue-600 mb-2" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Qəbul edən anbar
                </label>
                <select
                  value={toWarehouse}
                  onChange={(e) => setToWarehouse(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Seçin</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id} disabled={w.id === fromWarehouse}>
                      [{w.code}] {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Transfer tarixi
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          {fromWarehouse && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Mövcud məhsullar</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Transfer üçün məhsul və miqdarı seçin
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {filteredStock.every(item => item.selected) ? 'Seçimi ləğv et' : 'Hamısını seç'}
                  </button>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Kod və ya ad ilə axtar..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                        Seç
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Kod
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Ad
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Partiya
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Mövcud
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Vahid qiymət
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Transfer miqdarı
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                          Yüklənir...
                        </td>
                      </tr>
                    ) : filteredStock.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                          {searchTerm ? 'Nəticə tapılmadı' : 'Bu anbarda məhsul yoxdur'}
                        </td>
                      </tr>
                    ) : (
                      filteredStock.map((item, index) => {
                        const originalIndex = availableStock.findIndex(
                          (s) => s.product_id === item.product_id && s.batch_date === item.batch_date
                        );
                        return (
                        <tr key={originalIndex} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={() => toggleSelection(originalIndex)}
                              className="w-4 h-4 text-blue-600 rounded"
                            />
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-gray-900">
                            {item.product_code}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">{item.product_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {new Date(item.batch_date).toLocaleDateString('az-AZ')}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">
                            {item.quantity.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">
                            {item.unit_price.toFixed(2)} ₼
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              value={item.transfer_quantity || ''}
                              onChange={(e) =>
                                updateTransferQuantity(originalIndex, Number(e.target.value))
                              }
                              disabled={!item.selected}
                              className="w-28 px-2 py-1 border border-gray-300 rounded text-sm text-right disabled:bg-gray-100"
                              min="0"
                              max={item.quantity}
                              step="0.01"
                            />
                          </td>
                        </tr>
                      );})
                    )}
                  </tbody>
                </table>
              </div>

              {selectedItems.length > 0 && (
                <div className="p-6 border-t border-gray-200 bg-gray-50">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm text-gray-600">
                        Seçilmiş məhsul sayı: {selectedItems.length}
                      </div>
                      <div className="text-lg font-semibold text-gray-900 mt-1">
                        Ümumi məbləğ: {totalTransferAmount.toFixed(2)} ₼
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      <Save className="w-4 h-4" />
                      Transferi Təsdiqlə
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
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
