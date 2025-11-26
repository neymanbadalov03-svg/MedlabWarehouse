import { useState, useEffect } from 'react';
import { Eye, RotateCcw, Search, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { calculateProductStockInWarehouse } from '../lib/stockCalculations';
import Modal from './Modal';
import * as XLSX from 'xlsx';

interface Invoice {
  id: string;
  invoice_code: string;
  supplier: string;
  date: string;
  warehouse_id: string;
  warehouse_name: string;
  status: string;
  total_amount: number;
  created_at: string;
}

interface InvoiceItem {
  product_type: 'reagent' | 'consumable';
  product_id: string;
  product_name: string;
  product_code?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface Props {
  warehouseId?: string;
  onInvoiceChange?: () => void;
}

export default function InvoiceList({ warehouseId, onInvoiceChange }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title: string; message: string; type: 'success' | 'error' | 'info' }>({ isOpen: false, title: '', message: '', type: 'info' });

  useEffect(() => {
    loadInvoices();
  }, [warehouseId]);

  const loadInvoices = async () => {
    setLoading(true);

    let query = supabase
      .from('invoices')
      .select('*')
      .order('date', { ascending: false });

    if (warehouseId) {
      query = query.eq('warehouse_id', warehouseId);
    }

    const { data: invoicesData } = await query;

    if (!invoicesData) {
      setLoading(false);
      return;
    }

    const { data: warehouses } = await supabase.from('warehouses').select('*');
    const warehouseMap = new Map(warehouses?.map(w => [w.id, w.name]) || []);

    const enrichedInvoices: Invoice[] = [];

    for (const invoice of invoicesData) {
      const { data: items } = await supabase
        .from('invoice_items')
        .select('total_price')
        .eq('invoice_id', invoice.id);

      const totalAmount = (items || []).reduce((sum, item) => sum + Number(item.total_price), 0);

      enrichedInvoices.push({
        ...invoice,
        warehouse_name: warehouseMap.get(invoice.warehouse_id) || 'N/A',
        total_amount: totalAmount,
      });
    }

    setInvoices(enrichedInvoices);
    setLoading(false);
  };

  const viewInvoice = async (invoice: Invoice) => {
    setSelectedInvoice(invoice);

    const { data: items } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', invoice.id);

    if (!items) return;

    const { data: reagents } = await supabase.from('reagents').select('*');
    const { data: consumables } = await supabase.from('consumables').select('*');

    const reagentMap = new Map(reagents?.map(r => [r.id, r.name]) || []);
    const consumableMap = new Map(consumables?.map(c => [c.id, c.name]) || []);

    const enrichedItems: InvoiceItem[] = items.map(item => ({
      product_type: item.product_type,
      product_id: item.product_id,
      product_name: item.product_type === 'reagent'
        ? reagentMap.get(item.product_id) || 'N/A'
        : consumableMap.get(item.product_id) || 'N/A',
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      total_price: Number(item.total_price),
    }));

    setInvoiceItems(enrichedItems);
    setShowModal(true);
  };

  const returnInvoice = async (invoice: Invoice) => {
    if (!confirm(`${invoice.invoice_code} qaiməsini geri qaytarmaq istədiyinizdən əminsiniz? Bu əməliyyat stokdan məhsulları çıxaracaq.`)) {
      return;
    }

    setLoading(true);

    const { data: items } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', invoice.id);

    if (!items || items.length === 0) {
      setLoading(false);
      return;
    }

    for (const item of items) {
      const stock = await calculateProductStockInWarehouse(
        invoice.warehouse_id,
        item.product_id,
        item.product_type
      );

      if (stock.totalQuantity < Number(item.quantity)) {
        setAlertModal({
          isOpen: true,
          title: 'Xəta',
          message: `"${item.product_type === 'reagent' ? 'Reagent' : 'Sərfiyyat'}" üçün kifayət qədər stok yoxdur. Lazım: ${item.quantity}, Mövcud: ${stock.totalQuantity.toFixed(2)}`,
          type: 'error'
        });
        setLoading(false);
        return;
      }
    }

    const totalAmount = items.reduce((sum, item) => sum + Number(item.total_price), 0);

    const { data: stockOut, error: stockOutError } = await supabase
      .from('stock_out')
      .insert([
        {
          warehouse_id: invoice.warehouse_id,
          date: new Date().toISOString().split('T')[0],
          reason: 'invoice_return',
          total_amount: totalAmount,
        },
      ])
      .select()
      .single();

    if (stockOutError || !stockOut) {
      setAlertModal({ isOpen: true, title: 'Xəta', message: 'Geri qaytarma əməliyyatı yaradılarkən xəta baş verdi', type: 'error' });
      setLoading(false);
      return;
    }

    const stockOutItems = items.map(item => ({
      stockout_id: stockOut.id,
      product_type: item.product_type,
      product_id: item.product_id,
      batch_date: item.batch_date,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.total_price,
    }));

    const { error: itemsError } = await supabase
      .from('stock_out_items')
      .insert(stockOutItems);

    if (itemsError) {
      setAlertModal({ isOpen: true, title: 'Xəta', message: 'Məhsullar geri qaytarılarkən xəta baş verdi', type: 'error' });
      await supabase.from('stock_out').delete().eq('id', stockOut.id);
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase
      .from('invoices')
      .update({ status: 'returned' })
      .eq('id', invoice.id);

    if (updateError) {
      setAlertModal({ isOpen: true, title: 'Xəta', message: 'Qaimə statusu yenilənərkən xəta baş verdi', type: 'error' });
      setLoading(false);
      return;
    }

    setAlertModal({ isOpen: true, title: 'Uğurlu', message: 'Qaimə uğurla geri qaytarıldı', type: 'success' });
    loadInvoices();
    if (onInvoiceChange) onInvoiceChange();
    setLoading(false);
  };

  const filteredInvoices = invoices.filter(
    invoice => {
      const matchesSearch = invoice.invoice_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        invoice.supplier.toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      if (startDate && new Date(invoice.date) < new Date(startDate)) return false;
      if (endDate && new Date(invoice.date) > new Date(endDate)) return false;

      return true;
    }
  );

  const exportToExcel = async () => {
    if (filteredInvoices.length === 0) return;

    const { data: reagents } = await supabase.from('reagents').select('*');
    const { data: consumables } = await supabase.from('consumables').select('*');

    const reagentMap = new Map(reagents?.map(r => [r.id, { code: r.code, name: r.name }]) || []);
    const consumableMap = new Map(consumables?.map(c => [c.id, { code: c.code, name: c.name }]) || []);

    const exportData: any[] = [];

    for (const invoice of filteredInvoices) {
      const { data: items } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoice.id);

      if (items && items.length > 0) {
        for (const item of items) {
          const productMap = item.product_type === 'reagent' ? reagentMap : consumableMap;
          const product = productMap.get(item.product_id);

          exportData.push({
            'Qaimə Kodu': invoice.invoice_code,
            'Giriş Tarixi': new Date(invoice.date).toLocaleDateString('az-AZ'),
            'Firma Adı': invoice.supplier,
            'Anbar': invoice.warehouse_name,
            'Məhsul Kodu': product?.code || 'N/A',
            'Məhsul Adı': product?.name || 'N/A',
            'Tip': item.product_type === 'reagent' ? 'Reagent' : 'Sərfiyyat',
            'Miqdar': Number(item.quantity),
            'Vahid Qiymət (₼)': Number(item.unit_price),
            'Məhsul Məbləği (₼)': Number(item.total_price),
            'Status': invoice.status === 'active' ? 'Aktiv' : 'Geri qaytarılıb',
          });
        }
      }
    }

    const ws = XLSX.utils.json_to_sheet(exportData);

    const colWidths = [
      { wch: 15 },
      { wch: 12 },
      { wch: 25 },
      { wch: 20 },
      { wch: 15 },
      { wch: 30 },
      { wch: 12 },
      { wch: 10 },
      { wch: 15 },
      { wch: 18 },
      { wch: 18 },
    ];
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Qaimələr');

    const fileName = `Qaime_Siyahisi_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName, { bookType: 'xlsx', type: 'binary' });
  };

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Qaimə siyahısı</h3>
            {filteredInvoices.length > 0 && (
              <button
                onClick={exportToExcel}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                Excel
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Başlanğıc tarix
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Son tarix
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Qaimə kodu və ya firma ilə axtar..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Qaimə kodu
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Firma
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Tarix
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Anbar
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Məbləğ
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Əməliyyatlar
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    Yüklənir...
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    {searchTerm ? 'Nəticə tapılmadı' : 'Hələ ki qaimə yoxdur'}
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-mono text-gray-900">
                      {invoice.invoice_code}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{invoice.supplier}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(invoice.date).toLocaleDateString('az-AZ')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {invoice.warehouse_name}
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-medium text-gray-900">
                      {invoice.total_amount.toFixed(2)} ₼
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                          invoice.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {invoice.status === 'active' ? 'Aktiv' : 'Geri qaytarılıb'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => viewInvoice(invoice)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          title="Bax"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {invoice.status === 'active' && (
                          <button
                            onClick={() => returnInvoice(invoice)}
                            disabled={loading}
                            className="p-1 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                            title="Geri qaytarma"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900">
                Qaimə Detalları: {selectedInvoice.invoice_code}
              </h3>
              <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Firma:</span>{' '}
                  <span className="font-medium">{selectedInvoice.supplier}</span>
                </div>
                <div>
                  <span className="text-gray-500">Tarix:</span>{' '}
                  <span className="font-medium">
                    {new Date(selectedInvoice.date).toLocaleDateString('az-AZ')}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Anbar:</span>{' '}
                  <span className="font-medium">{selectedInvoice.warehouse_name}</span>
                </div>
                <div>
                  <span className="text-gray-500">Status:</span>{' '}
                  <span
                    className={`font-medium ${
                      selectedInvoice.status === 'active' ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {selectedInvoice.status === 'active' ? 'Aktiv' : 'Geri qaytarılıb'}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-6 overflow-auto max-h-[60vh]">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Məhsul
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Tip
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Miqdar
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Vahid qiymət
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Ümumi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {invoiceItems.map((item, index) => (
                    <tr key={index}>
                      <td className="px-4 py-3 text-sm text-gray-900">{item.product_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                            item.product_type === 'reagent'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {item.product_type === 'reagent' ? 'Reagent' : 'Sərfiyyat'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">
                        {item.quantity.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">
                        {item.unit_price.toFixed(2)} ₼
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                        {item.total_price.toFixed(2)} ₼
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-900">
                      Ümumi məbləğ:
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                      {selectedInvoice.total_amount.toFixed(2)} ₼
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => {
                  setShowModal(false);
                  setSelectedInvoice(null);
                  setInvoiceItems([]);
                }}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                Bağla
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
    </>
  );
}
