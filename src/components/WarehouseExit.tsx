import { useState, useEffect } from 'react';
import { Search, Filter } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { ProductType } from '../types/database';

interface ExitRecord {
  id: string;
  date: string;
  reason: string;
  product_code: string;
  product_name: string;
  product_type: ProductType;
  quantity: number;
  unit_price: number;
  total_price: number;
  warehouse_name: string;
  from_warehouse?: string;
  to_warehouse?: string;
  stockout_id: string;
}

export default function WarehouseExit() {
  const [exits, setExits] = useState<ExitRecord[]>([]);
  const [filteredExits, setFilteredExits] = useState<ExitRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | ProductType>('all');
  const [filterReason, setFilterReason] = useState<'all' | 'transfer' | 'consumption'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [warehouses, setWarehouses] = useState<Array<{id: string, name: string}>>([]);
  const [filterFromWarehouse, setFilterFromWarehouse] = useState('all');
  const [filterToWarehouse, setFilterToWarehouse] = useState('all');

  useEffect(() => {
    loadWarehouses();
    loadExits();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [exits, searchTerm, filterType, filterReason, startDate, endDate, filterFromWarehouse, filterToWarehouse]);

  const loadWarehouses = async () => {
    const { data } = await supabase.from('warehouses').select('id, name').order('name');
    if (data) setWarehouses(data);
  };

  const loadExits = async () => {
    setLoading(true);

    const { data: stockOuts } = await supabase
      .from('stock_out')
      .select('*, stock_out_items(*)')
      .order('date', { ascending: false });

    if (!stockOuts) {
      setLoading(false);
      return;
    }

    const { data: warehouses } = await supabase.from('warehouses').select('*');
    const { data: reagents } = await supabase.from('reagents').select('*');
    const { data: consumables } = await supabase.from('consumables').select('*');
    const { data: transfers } = await supabase.from('transfers').select('*');

    const warehouseMap = new Map(warehouses?.map((w) => [w.id, w.name]) || []);
    const reagentMap = new Map(reagents?.map((r) => [r.id, { code: r.code, name: r.name }]) || []);
    const consumableMap = new Map(
      consumables?.map((c) => [c.id, { code: c.code, name: c.name }]) || []
    );

    const exitRecords: ExitRecord[] = [];

    for (const stockOut of stockOuts) {
      let fromWarehouse = undefined;
      let toWarehouse = undefined;

      if (stockOut.reason === 'transfer' && stockOut.transfer_id) {
        const transfer = transfers?.find(t => t.id === stockOut.transfer_id);
        if (transfer) {
          fromWarehouse = warehouseMap.get(transfer.from_warehouse_id) || undefined;
          toWarehouse = warehouseMap.get(transfer.to_warehouse_id) || undefined;
        }
      }

      for (const item of stockOut.stock_out_items) {
        const productMap = item.product_type === 'reagent' ? reagentMap : consumableMap;
        const product = productMap.get(item.product_id);

        if (product) {
          exitRecords.push({
            id: item.id,
            date: stockOut.date,
            reason: stockOut.reason,
            product_code: product.code,
            product_name: product.name,
            product_type: item.product_type,
            quantity: Number(item.quantity),
            unit_price: Number(item.unit_price),
            total_price: Number(item.total_price),
            warehouse_name: warehouseMap.get(stockOut.warehouse_id) || 'N/A',
            from_warehouse: fromWarehouse,
            to_warehouse: toWarehouse,
            stockout_id: stockOut.id,
          });
        }
      }
    }

    setExits(exitRecords);
    setLoading(false);
  };

  const applyFilters = () => {
    let filtered = [...exits];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (exit) =>
          exit.product_code.toLowerCase().includes(term) ||
          exit.product_name.toLowerCase().includes(term)
      );
    }

    if (filterType !== 'all') {
      filtered = filtered.filter((exit) => exit.product_type === filterType);
    }

    if (filterReason !== 'all') {
      filtered = filtered.filter((exit) => exit.reason === filterReason);
    }

    if (startDate) {
      filtered = filtered.filter((exit) => exit.date >= startDate);
    }

    if (endDate) {
      filtered = filtered.filter((exit) => exit.date <= endDate);
    }

    if (filterFromWarehouse !== 'all') {
      filtered = filtered.filter((exit) => exit.from_warehouse === filterFromWarehouse);
    }

    if (filterToWarehouse !== 'all') {
      filtered = filtered.filter((exit) => exit.to_warehouse === filterToWarehouse);
    }

    setFilteredExits(filtered);
  };

  const totalAmount = filteredExits.reduce((sum, exit) => sum + exit.total_price, 0);

  const getReasonBadge = (reason: string) => {
    if (reason === 'transfer') {
      return (
        <span className="inline-flex px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-700">
          Transfer
        </span>
      );
    }
    if (reason === 'inventory_loss') {
      return (
        <span className="inline-flex px-2 py-1 text-xs font-medium rounded bg-red-100 text-red-700">
          Sayım Xərci
        </span>
      );
    }
    if (reason === 'invoice_return') {
      return (
        <span className="inline-flex px-2 py-1 text-xs font-medium rounded bg-purple-100 text-purple-700">
          Qaimə Geri Qaytarma
        </span>
      );
    }
    return (
      <span className="inline-flex px-2 py-1 text-xs font-medium rounded bg-orange-100 text-orange-700">
        Sərfiyyat
      </span>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-gray-200 p-6">
        <h2 className="text-2xl font-semibold text-gray-900">Anbardan Çıxış</h2>
        <p className="text-sm text-gray-500 mt-1">Bütün çıxış əməliyyatlarının siyahısı</p>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Məhsul axtarışı</label>
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

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Məhsul tipi</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">Bütün tiplər</option>
              <option value="reagent">Reagent</option>
              <option value="consumable">Sərfiyyat</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Çıxış səbəbi</label>
            <select
              value={filterReason}
              onChange={(e) => setFilterReason(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">Bütün səbəblər</option>
              <option value="transfer">Transfer</option>
              <option value="consumption">Sərfiyyat</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Başlanğıc tarix</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Son tarix</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Haradan (Transfer)</label>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <select
                value={filterFromWarehouse}
                onChange={(e) => setFilterFromWarehouse(e.target.value)}
                className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
              >
                <option value="all">Seçin - Hamısı</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.name}>[{w.code}] {w.name}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Haraya (Transfer)</label>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <select
                value={filterToWarehouse}
                onChange={(e) => setFilterToWarehouse(e.target.value)}
                className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
              >
                <option value="all">Seçin - Hamısı</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.name}>[{w.code}] {w.name}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {filteredExits.length > 0 && (
          <div className="mt-4 flex gap-6">
            <div className="text-sm">
              <span className="text-gray-500">Ümumi çıxış: </span>
              <span className="font-semibold text-gray-900">{filteredExits.length}</span>
            </div>
            <div className="text-sm">
              <span className="text-gray-500">Ümumi məbləğ: </span>
              <span className="font-semibold text-gray-900">{totalAmount.toFixed(2)} ₼</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Yüklənir...</div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Tarix
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Çıxış tipi
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Kod
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Ad
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Tip
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Anbar
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Haradan
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Haraya
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Miqdar
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Vahid qiymət
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Məbləğ
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredExits.map((exit) => (
                    <tr key={exit.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {new Date(exit.date).toLocaleDateString('az-AZ')}
                      </td>
                      <td className="px-6 py-4 text-sm">{getReasonBadge(exit.reason)}</td>
                      <td className="px-6 py-4 text-sm font-mono text-gray-900">
                        {exit.product_code}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {exit.product_name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                            exit.product_type === 'reagent'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {exit.product_type === 'reagent' ? 'Reagent' : 'Sərfiyyat'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{exit.warehouse_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {exit.from_warehouse || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {exit.to_warehouse || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">
                        {exit.quantity.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">
                        {exit.unit_price.toFixed(2)} ₼
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-medium text-gray-900">
                        {exit.total_price.toFixed(2)} ₼
                      </td>
                    </tr>
                  ))}
                  {filteredExits.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-6 py-8 text-center text-gray-500">
                        {exits.length === 0
                          ? 'Hələ ki çıxış əməliyyatı yoxdur'
                          : 'Nəticə tapılmadı'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
