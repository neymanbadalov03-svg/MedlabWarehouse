import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, ChevronRight, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { calculateProductStockInWarehouse } from '../lib/stockCalculations';
import * as XLSX from 'xlsx';
import type { StockSummary, StockBatch } from '../types/database';

interface Warehouse {
  id: string;
  name: string;
  address: string | null;
}

interface StockSummaryWithWarehouse extends StockSummary {
  warehouse_id?: string;
  warehouse_name?: string;
}

export default function WarehouseList() {
  const [stocks, setStocks] = useState<StockSummaryWithWarehouse[]>([]);
  const [selectedStock, setSelectedStock] = useState<StockSummaryWithWarehouse | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [productsCache, setProductsCache] = useState<{
    reagents: any[];
    consumables: any[];
  } | null>(null);
  const [batchSize] = useState(15);
  const [displayedCount, setDisplayedCount] = useState(0);

  useEffect(() => {
    loadWarehouses();
  }, []);

  useEffect(() => {
    if (selectedWarehouse) {
      loadStocks();
    } else {
      setStocks([]);
    }
  }, [selectedWarehouse]);

  const loadWarehouses = async () => {
    const { data } = await supabase
      .from('warehouses')
      .select('id, name, address, code')
      .order('name');

    if (data && data.length > 0) {
      setWarehouses(data);
      setSelectedWarehouse(data[0].id);
    }
  };

  const loadProductsCache = useCallback(async () => {
    if (productsCache) return productsCache;

    const [reagentsRes, consumablesRes] = await Promise.all([
      supabase.from('reagents').select('id, code, name'),
      supabase.from('consumables').select('id, code, name')
    ]);

    const cache = {
      reagents: reagentsRes.data || [],
      consumables: consumablesRes.data || []
    };

    setProductsCache(cache);
    return cache;
  }, [productsCache]);

  const loadStocks = async () => {
    if (!selectedWarehouse) return;

    setLoading(true);
    setStocks([]);
    setDisplayedCount(0);

    const cache = await loadProductsCache();

    const allProducts = [
      ...cache.reagents.map((r) => ({ ...r, type: 'reagent' as const })),
      ...cache.consumables.map((c) => ({ ...c, type: 'consumable' as const })),
    ];

    const processProductBatch = async (products: typeof allProducts) => {
      const results: StockSummaryWithWarehouse[] = [];

      if (selectedWarehouse === 'all') {
        for (const warehouse of warehouses) {
          const batchResults = await Promise.all(
            products.map((product) =>
              calculateProductStockInWarehouse(warehouse.id, product.id, product.type).then((stock) => ({
                product,
                stock,
                warehouse,
              }))
            )
          );

          for (const { product, stock, warehouse } of batchResults) {
            if (stock.totalQuantity > 0) {
              const batches: StockBatch[] = stock.batches.map(batch => ({
                product_id: product.id,
                product_code: product.code,
                product_name: product.name,
                product_type: product.type,
                batch_date: batch.batch_date,
                supplier: batch.supplier || '',
                quantity: batch.quantity,
                unit_price: batch.unit_price,
                total_price: batch.total_price,
              }));

              const lastDate = batches.length > 0 ? batches[0].batch_date : '';

              results.push({
                product_id: product.id,
                product_code: product.code,
                product_name: product.name,
                product_type: product.type,
                total_quantity: stock.totalQuantity,
                total_amount: stock.totalValue,
                last_entry_date: lastDate,
                batches,
                warehouse_id: warehouse.id,
                warehouse_name: warehouse.name,
              });
            }
          }
        }
      } else {
        const batchResults = await Promise.all(
          products.map((product) =>
            calculateProductStockInWarehouse(selectedWarehouse, product.id, product.type).then((stock) => ({
              product,
              stock,
            }))
          )
        );

        for (const { product, stock } of batchResults) {
          if (stock.totalQuantity > 0) {
            const batches: StockBatch[] = stock.batches.map(batch => ({
              product_id: product.id,
              product_code: product.code,
              product_name: product.name,
              product_type: product.type,
              batch_date: batch.batch_date,
              supplier: batch.supplier || '',
              quantity: batch.quantity,
              unit_price: batch.unit_price,
              total_price: batch.total_price,
            }));

            const lastDate = batches.length > 0 ? batches[0].batch_date : '';

            results.push({
              product_id: product.id,
              product_code: product.code,
              product_name: product.name,
              product_type: product.type,
              total_quantity: stock.totalQuantity,
              total_amount: stock.totalValue,
              last_entry_date: lastDate,
              batches,
            });
          }
        }
      }

      return results;
    };

    const processBatches = async () => {
      let allResults: StockSummaryWithWarehouse[] = [];

      for (let i = 0; i < allProducts.length; i += batchSize) {
        const batch = allProducts.slice(i, i + batchSize);
        const batchResults = await processProductBatch(batch);
        allResults = [...allResults, ...batchResults];

        const sorted = allResults.sort((a, b) => {
          const warehouseCompare = (a.warehouse_name || '').localeCompare(b.warehouse_name || '');
          if (warehouseCompare !== 0) return warehouseCompare;
          return a.product_code.localeCompare(b.product_code);
        });

        setStocks(sorted);
        setDisplayedCount(allResults.length);
      }

      setLoading(false);
    };

    processBatches();
  };

  const filteredStocks = useMemo(() => {
    if (!searchTerm) return stocks;

    const term = searchTerm.toLowerCase();
    return stocks.filter(
      (stock) =>
        stock.product_code.toLowerCase().includes(term) ||
        stock.product_name.toLowerCase().includes(term) ||
        (stock.warehouse_name || '').toLowerCase().includes(term)
    );
  }, [stocks, searchTerm]);

  const exportToExcel = () => {
    if (!selectedWarehouse || filteredStocks.length === 0) return;

    const isAllWarehouses = selectedWarehouse === 'all';
    const exportData = filteredStocks.map((stock) => ({
      warehouse: stock.warehouse_name || '',
      product_code: stock.product_code,
      product_name: stock.product_name,
      product_type: stock.product_type === 'reagent' ? 'Reagent' : 'Sərfiyyat',
      quantity: stock.total_quantity,
      unit_price: stock.batches.length > 0 ? stock.batches[0].unit_price : 0,
      total_value: stock.total_amount,
    }));

    const headers = isAllWarehouses
      ? ['Anbar', 'Məhsul Kodu', 'Məhsul Adı', 'Tip', 'Miqdar', 'Vahid Qiymət (₼)', 'Ümumi Dəyər (₼)']
      : ['Məhsul Kodu', 'Məhsul Adı', 'Tip', 'Miqdar', 'Vahid Qiymət (₼)', 'Ümumi Dəyər (₼)'];

    const dataForSheet = exportData.map((row) => {
      if (isAllWarehouses) {
        return {
          Anbar: row.warehouse,
          'Məhsul Kodu': row.product_code,
          'Məhsul Adı': row.product_name,
          Tip: row.product_type,
          Miqdar: row.quantity,
          'Vahid Qiymət (₼)': row.unit_price,
          'Ümumi Dəyər (₼)': row.total_value,
        };
      } else {
        return {
          'Məhsul Kodu': row.product_code,
          'Məhsul Adı': row.product_name,
          Tip: row.product_type,
          Miqdar: row.quantity,
          'Vahid Qiymət (₼)': row.unit_price,
          'Ümumi Dəyər (₼)': row.total_value,
        };
      }
    });

    const ws = XLSX.utils.json_to_sheet(dataForSheet);

    const colWidths = isAllWarehouses
      ? [{ wch: 20 }, { wch: 15 }, { wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 18 }]
      : [{ wch: 15 }, { wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 18 }];

    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stok Siyahisi');

    const warehouseName = isAllWarehouses
      ? 'Butun_Anbarlar'
      : warehouses.find((w) => w.id === selectedWarehouse)?.name || 'Anbar';

    const fileName = `Anbar_Siyahisi_${warehouseName}_${new Date().toISOString().split('T')[0]}.xlsx`;

    XLSX.writeFile(wb, fileName, { bookType: 'xlsx', type: 'binary' });
  };

  return (
    <div className="h-full flex">
      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b border-gray-200 p-6">
          <h2 className="text-2xl font-semibold text-gray-900">Anbar Siyahısı</h2>
          <p className="text-sm text-gray-500 mt-1">Bütün məhsulların stok vəziyyəti</p>

          <div className="mt-4 mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Anbar seçin
            </label>
            <select
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Anbar seçin...</option>
              <option value="all">Bütün Anbarlar</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  [{warehouse.code}] {warehouse.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Kod və ya ad ilə axtar..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {selectedWarehouse && (
              <button
                onClick={exportToExcel}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                Excel
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {loading && stocks.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="text-gray-500 mb-2">Məhsullar yüklənir...</div>
                <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto"></div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {selectedWarehouse === 'all' && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Anbar
                        </th>
                      )}
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
                        Miqdar
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Məbləğ
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Son giriş
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                        Detal
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredStocks.map((stock, index) => (
                      <tr
                        key={`${stock.warehouse_id || ''}-${stock.product_id}-${index}`}
                        className={`hover:bg-gray-50 cursor-pointer ${
                          selectedStock?.product_id === stock.product_id && selectedStock?.warehouse_id === stock.warehouse_id ? 'bg-blue-50' : ''
                        }`}
                        onClick={() => setSelectedStock(stock)}
                      >
                        {selectedWarehouse === 'all' && (
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {stock.warehouse_name}
                          </td>
                        )}
                        <td className="px-6 py-4 text-sm font-mono text-gray-900">
                          {stock.product_code}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {stock.product_name}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                              stock.product_type === 'reagent'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {stock.product_type === 'reagent' ? 'Reagent' : 'Sərfiyyat'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-right font-medium text-gray-900">
                          {stock.total_quantity.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-sm text-right font-medium text-gray-900">
                          {stock.total_amount.toFixed(2)} ₼
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {new Date(stock.last_entry_date).toLocaleDateString('az-AZ')}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <ChevronRight className="w-5 h-5 text-gray-400 mx-auto" />
                        </td>
                      </tr>
                    ))}
                    {filteredStocks.length === 0 && (
                      <tr>
                        <td colSpan={selectedWarehouse === 'all' ? 8 : 7} className="px-6 py-8 text-center text-gray-500">
                          {searchTerm ? 'Nəticə tapılmadı' : 'Stokda məhsul yoxdur'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {loading && stocks.length > 0 && (
                <div className="bg-blue-50 border-t border-gray-200 px-6 py-3 text-sm text-blue-700 flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                  Daha çox məhsul yüklənir... ({displayedCount} göstərildi)
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {selectedStock && (
        <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Partiya Detalları</h3>
            <p className="text-sm text-gray-500 mt-1">{selectedStock.product_name}</p>
            <p className="text-xs font-mono text-gray-500">{selectedStock.product_code}</p>
          </div>

          <div className="flex-1 overflow-auto p-6">
            <div className="space-y-4">
              {selectedStock.batches.map((batch, index) => (
                <div
                  key={index}
                  className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="text-xs text-gray-500">Giriş tarixi</div>
                      <div className="text-sm font-medium text-gray-900">
                        {new Date(batch.batch_date).toLocaleDateString('az-AZ')}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Miqdar</div>
                      <div className="text-sm font-semibold text-gray-900">
                        {batch.quantity.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {batch.supplier && (
                    <div className="mb-2">
                      <div className="text-xs text-gray-500">Təchizatçı</div>
                      <div className="text-sm text-gray-900">{batch.supplier}</div>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-2 border-t border-gray-300">
                    <div>
                      <div className="text-xs text-gray-500">Vahid qiymət</div>
                      <div className="text-sm text-gray-900">{batch.unit_price.toFixed(2)} ₼</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Ümumi</div>
                      <div className="text-sm font-semibold text-gray-900">
                        {batch.total_price.toFixed(2)} ₼
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-6 border-t border-gray-200 bg-gray-50">
            <div className="flex justify-between items-center">
              <div className="text-sm font-medium text-gray-700">Ümumi stok</div>
              <div className="text-lg font-semibold text-gray-900">
                {selectedStock.total_quantity.toFixed(2)}
              </div>
            </div>
            <div className="flex justify-between items-center mt-2">
              <div className="text-sm font-medium text-gray-700">Ümumi dəyər</div>
              <div className="text-lg font-semibold text-gray-900">
                {selectedStock.total_amount.toFixed(2)} ₼
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
