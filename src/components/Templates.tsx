import { useState } from 'react';
import WarehousesTab from './templates/WarehousesTab';
import ReagentsTab from './templates/ReagentsTab';
import ConsumablesTab from './templates/ConsumablesTab';

type Tab = 'warehouses' | 'reagents' | 'consumables';

export default function Templates() {
  const [activeTab, setActiveTab] = useState<Tab>('warehouses');

  const tabs = [
    { id: 'warehouses' as Tab, name: 'Anbarlar' },
    { id: 'reagents' as Tab, name: 'Reagentlər' },
    { id: 'consumables' as Tab, name: 'Sərfiyyat malları' },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-gray-200">
        <div className="px-8 pt-6">
          <h2 className="text-2xl font-semibold text-gray-900">Şablonlar</h2>
          <p className="text-sm text-gray-500 mt-1">Anbar, reagent və sərfiyyat malları idarəetməsi</p>
        </div>

        <div className="flex gap-1 px-8 mt-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8">
        {activeTab === 'warehouses' && <WarehousesTab />}
        {activeTab === 'reagents' && <ReagentsTab />}
        {activeTab === 'consumables' && <ConsumablesTab />}
      </div>
    </div>
  );
}
