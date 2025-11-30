import { useState, useEffect } from 'react';
import { Download, Eye, FileSpreadsheet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Modal from './Modal';
import * as XLSX from 'xlsx';

interface Count {
  id: string;
  count_code: string;
  warehouse_id: string;
  warehouse_name: string;
  date: string;
  total_loss_amount: number;
  created_at: string;
}

interface CountItem {
  product_code: string;
  product_name: string;
  product_type: string;
  system_qty: number;
  real_qty: number;
  loss_qty: number;
  loss_amount: number;
}

export default function CountList() {
  const [counts, setCounts] = useState<Count[]>([]);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string; type: 'success' | 'error' | 'info' }>({ isOpen: false, title: '', message: '', type: 'info' });

  useEffect(() => {
    loadCounts();
  }, []);

  const loadCounts = async () => {
    setLoading(true);

    const [countsRes, warehousesRes] = await Promise.all([
      supabase.from('inventory_count').select('id, count_code, warehouse_id, date, total_loss_amount, created_at').order('date', { ascending: false }),
      supabase.from('warehouses').select('id, name')
    ]);

    const countsData = countsRes.data;

    if (!countsData) {
      setLoading(false);
      return;
    }

    const { data: warehouses } = warehousesRes;
    const warehouseMap = new Map(warehouses?.map(w => [w.id, w.name]) || []);

    const enrichedCounts: Count[] = countsData.map(count => ({
      ...count,
      warehouse_name: warehouseMap.get(count.warehouse_id) || 'N/A',
    }));

    setCounts(enrichedCounts);
    setLoading(false);
  };

  const exportCountToExcel = async (count: Count) => {
    const { data: items } = await supabase
      .from('inventory_count_items')
      .select('*')
      .eq('count_id', count.id);

    if (!items || items.length === 0) {
      setModal({ isOpen: true, title: 'Xəbərdarlıq', message: 'Bu sayımda məlumat tapılmadı', type: 'info' });
      return;
    }

    const { data: reagents } = await supabase.from('reagents').select('*');
    const { data: consumables } = await supabase.from('consumables').select('*');

    const reagentMap = new Map(reagents?.map(r => [r.id, { code: r.code, name: r.name }]) || []);
    const consumableMap = new Map(consumables?.map(c => [c.id, { code: c.code, name: c.name }]) || []);

    const excelData: CountItem[] = items.map(item => {
      const productMap = item.product_type === 'reagent' ? reagentMap : consumableMap;
      const product = productMap.get(item.product_id);

      return {
        product_code: product?.code || 'N/A',
        product_name: product?.name || 'N/A',
        product_type: item.product_type === 'reagent' ? 'Reagent' : 'Sərfiyyat',
        system_qty: Number(item.system_qty),
        real_qty: Number(item.real_qty),
        loss_qty: Number(item.loss_qty),
        loss_amount: Number(item.loss_amount),
      };
    });

    const ws = XLSX.utils.json_to_sheet(excelData, {
      header: ['product_code', 'product_name', 'product_type', 'system_qty', 'real_qty', 'loss_qty', 'loss_amount'],
    });

    ws['A1'] = { v: 'Məhsul Kodu', t: 's' };
    ws['B1'] = { v: 'Məhsul Adı', t: 's' };
    ws['C1'] = { v: 'Tip', t: 's' };
    ws['D1'] = { v: 'Sistemdə Miqdar', t: 's' };
    ws['E1'] = { v: 'Faktiki Miqdar', t: 's' };
    ws['F1'] = { v: 'Xərc Miqdarı', t: 's' };
    ws['G1'] = { v: 'Xərc Məbləği (₼)', t: 's' };

    const colWidths = [
      { wch: 15 },
      { wch: 30 },
      { wch: 12 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 18 },
    ];
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sayım');

    XLSX.writeFile(wb, `Sayim_${count.count_code}_${count.date}.xlsx`, {
      bookType: 'xlsx',
      type: 'binary',
    });
  };

  const exportMonthToExcel = async () => {
    if (!selectedMonth) {
      setModal({ isOpen: true, title: 'Xəbərdarlıq', message: 'Zəhmət olmasa ay seçin', type: 'error' });
      return;
    }

    const [year, month] = selectedMonth.split('-');
    const startDate = `${year}-${month}-01`;
    const endDate = `${year}-${month}-${new Date(parseInt(year), parseInt(month), 0).getDate()}`;

    const { data: monthCounts } = await supabase
      .from('inventory_count')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (!monthCounts || monthCounts.length === 0) {
      setModal({ isOpen: true, title: 'Xəbərdarlıq', message: 'Seçilmiş ayda sayım tapılmadı', type: 'info' });
      return;
    }

    const { data: warehouses } = await supabase.from('warehouses').select('*');
    const { data: reagents } = await supabase.from('reagents').select('*');
    const { data: consumables } = await supabase.from('consumables').select('*');

    const warehouseMap = new Map(warehouses?.map(w => [w.id, w.name]) || []);
    const reagentMap = new Map(reagents?.map(r => [r.id, { code: r.code, name: r.name }]) || []);
    const consumableMap = new Map(consumables?.map(c => [c.id, { code: c.code, name: c.name }]) || []);

    const allData: any[] = [];

    for (const count of monthCounts) {
      const { data: items } = await supabase
        .from('inventory_count_items')
        .select('*')
        .eq('count_id', count.id);

      if (!items) continue;

      for (const item of items) {
        const productMap = item.product_type === 'reagent' ? reagentMap : consumableMap;
        const product = productMap.get(item.product_id);

        allData.push({
          count_code: count.count_code,
          date: new Date(count.date).toLocaleDateString('az-AZ'),
          warehouse: warehouseMap.get(count.warehouse_id) || 'N/A',
          product_code: product?.code || 'N/A',
          product_name: product?.name || 'N/A',
          product_type: item.product_type === 'reagent' ? 'Reagent' : 'Sərfiyyat',
          system_qty: Number(item.system_qty),
          real_qty: Number(item.real_qty),
          loss_qty: Number(item.loss_qty),
          loss_amount: Number(item.loss_amount),
        });
      }
    }

    const ws = XLSX.utils.json_to_sheet(allData, {
      header: ['count_code', 'date', 'warehouse', 'product_code', 'product_name', 'product_type', 'system_qty', 'real_qty', 'loss_qty', 'loss_amount'],
    });

    ws['A1'] = { v: 'Sayım Kodu', t: 's' };
    ws['B1'] = { v: 'Tarix', t: 's' };
    ws['C1'] = { v: 'Anbar', t: 's' };
    ws['D1'] = { v: 'Məhsul Kodu', t: 's' };
    ws['E1'] = { v: 'Məhsul Adı', t: 's' };
    ws['F1'] = { v: 'Tip', t: 's' };
    ws['G1'] = { v: 'Sistemdə Miqdar', t: 's' };
    ws['H1'] = { v: 'Faktiki Miqdar', t: 's' };
    ws['I1'] = { v: 'Xərc Miqdarı', t: 's' };
    ws['J1'] = { v: 'Xərc Məbləği (₼)', t: 's' };

    const colWidths = [
      { wch: 18 },
      { wch: 12 },
      { wch: 15 },
      { wch: 15 },
      { wch: 30 },
      { wch: 12 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 18 },
    ];
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${year}-${month}`);

    XLSX.writeFile(wb, `Sayimlar_${year}-${month}.xlsx`, {
      bookType: 'xlsx',
      type: 'binary',
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Aylıq hesabat üçün ay seçin
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="pt-7">
            <button
              onClick={exportMonthToExcel}
              disabled={!selectedMonth}
              className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Aylıq Hesabat (Excel)
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Sayım Siyahısı</h3>
          <p className="text-sm text-gray-500 mt-1">Bütün anbar sayımları</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Sayım Kodu
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Anbar
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Tarix
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Xərc Məbləği
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Əməliyyatlar
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    Yüklənir...
                  </td>
                </tr>
              ) : counts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    Hələ ki sayım yoxdur
                  </td>
                </tr>
              ) : (
                counts.map((count) => (
                  <tr key={count.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-mono text-gray-900">
                      {count.count_code}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {count.warehouse_name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(count.date).toLocaleDateString('az-AZ')}
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-medium text-gray-900">
                      {count.total_loss_amount.toFixed(2)} ₼
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => exportCountToExcel(count)}
                          className="p-1 text-green-600 hover:bg-green-50 rounded"
                          title="Excel-ə ixrac et"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
