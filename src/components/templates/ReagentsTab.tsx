import { useState, useEffect, useRef } from 'react';
import { Plus, Pencil, Trash2, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';
import type { Reagent } from '../../types/database';

export default function ReagentsTab() {
  const [reagents, setReagents] = useState<Reagent[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importStatus, setImportStatus] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadReagents();
  }, []);

  const loadReagents = async () => {
    const { data, error } = await supabase
      .from('reagents')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setReagents(data);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;

    setLoading(true);

    if (editingId) {
      const { error } = await supabase
        .from('reagents')
        .update({ name: name.trim(), code: code.trim() })
        .eq('id', editingId);

      if (!error) {
        setEditingId(null);
        setName('');
        setCode('');
        loadReagents();
      }
    } else {
      const { error } = await supabase
        .from('reagents')
        .insert([{ name: name.trim(), code: code.trim() }]);

      if (!error) {
        setName('');
        setCode('');
        loadReagents();
      }
    }

    setLoading(false);
  };

  const handleEdit = (reagent: Reagent) => {
    setEditingId(reagent.id);
    setName(reagent.name);
    setCode(reagent.code);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu reagenti silmək istədiyinizdən əminsiniz?')) return;

    const { error } = await supabase.from('reagents').delete().eq('id', id);

    if (!error) {
      loadReagents();
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName('');
    setCode('');
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setImportStatus('Yüklənir...');

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      if (jsonData.length === 0) {
        setImportStatus('Xəta: Excel faylında məlumat tapılmadı');
        setLoading(false);
        return;
      }

      const firstRow = jsonData[0];
      const hasCodeColumn = 'code' in firstRow || 'Code' in firstRow || 'Kod' in firstRow;
      const hasNameColumn = 'name' in firstRow || 'Name' in firstRow || 'Ad' in firstRow;

      if (!hasCodeColumn || !hasNameColumn) {
        setImportStatus('Xəta: Excel faylında "code" və "name" sütunları olmalıdır');
        setLoading(false);
        return;
      }

      let imported = 0;
      let updated = 0;
      let skipped = 0;

      for (const row of jsonData) {
        const reagentCode = (row.code || row.Code || row.Kod || '').toString().trim();
        const reagentName = (row.name || row.Name || row.Ad || '').toString().trim();

        if (!reagentCode || !reagentName) {
          skipped++;
          continue;
        }

        const { data: existing } = await supabase
          .from('reagents')
          .select('id')
          .eq('code', reagentCode)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('reagents')
            .update({ name: reagentName })
            .eq('id', existing.id);
          updated++;
        } else {
          await supabase
            .from('reagents')
            .insert([{ code: reagentCode, name: reagentName }]);
          imported++;
        }
      }

      setImportStatus(`Uğurlu: ${imported} əlavə edildi, ${updated} yeniləndi, ${skipped} atlandı`);
      loadReagents();
    } catch (error) {
      setImportStatus('Xəta: Excel faylı oxunarkən problem yarandı');
    }

    setLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {editingId ? 'Reagenti Redaktə Et' : 'Yeni Reagent'}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reagent kodu
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Məsələn: RG001"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reagent adı
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Reagent adı"
                required
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Plus className="w-4 h-4" />
                {editingId ? 'Yadda Saxla' : 'Reagent Əlavə Et'}
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

          <div className="mt-6 pt-6 border-t border-gray-200">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Excel-dən İdxal</h4>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImportExcel}
              className="hidden"
              id="reagent-file-upload"
            />
            <label
              htmlFor="reagent-file-upload"
              className="flex items-center justify-center gap-2 w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <Upload className="w-4 h-4" />
              Reagent Excel Faylı Seçin
            </label>
            {importStatus && (
              <p className={`mt-2 text-sm ${
                importStatus.startsWith('Xəta') ? 'text-red-600' : 'text-green-600'
              }`}>
                {importStatus}
              </p>
            )}
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ad</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tarix</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Əməliyyat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {reagents.map((reagent, index) => (
                  <tr key={reagent.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{index + 1}</td>
                    <td className="px-6 py-4 text-sm font-mono text-gray-900">{reagent.code}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{reagent.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(reagent.created_at).toLocaleDateString('az-AZ')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleEdit(reagent)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(reagent.id)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {reagents.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      Hələ ki reagent əlavə edilməyib
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
