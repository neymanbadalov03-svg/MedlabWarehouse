import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import type { ProductType } from '../types/database';

interface Product {
  id: string;
  code: string;
  name: string;
}

interface SearchableProductSelectProps {
  products: Product[];
  value: string;
  onChange: (productId: string) => void;
  productType: ProductType;
  placeholder?: string;
}

export default function SearchableProductSelect({
  products,
  value,
  onChange,
  productType,
  placeholder = 'Məhsul seçin',
}: SearchableProductSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedProduct = useMemo(() => products.find((p) => p.id === value), [products, value]);

  const displayText = selectedProduct
    ? `${selectedProduct.code} – ${selectedProduct.name}`
    : '';

  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products;

    const search = searchTerm.toLowerCase();
    return products.filter((product) =>
      product.code.toLowerCase().includes(search) ||
      product.name.toLowerCase().includes(search)
    );
  }, [products, searchTerm]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (productId: string) => {
    onChange(productId);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div ref={dropdownRef} className="relative">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="min-w-[200px] px-2 py-1 border border-gray-300 rounded text-sm bg-white cursor-pointer flex items-center justify-between hover:border-gray-400 transition-colors"
      >
        <span className={displayText ? 'text-gray-900' : 'text-gray-400'}>
          {displayText || placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-hidden">
          <div className="p-2 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Kod və ya ad ilə axtar..."
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto">
            {filteredProducts.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500 text-center">
                Məhsul tapılmadı
              </div>
            ) : (
              filteredProducts.map((product) => (
                <div
                  key={product.id}
                  onClick={() => handleSelect(product.id)}
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 transition-colors ${
                    product.id === value ? 'bg-blue-100 text-blue-900' : 'text-gray-900'
                  }`}
                >
                  <span className="font-mono font-semibold">{product.code}</span>
                  <span className="text-gray-600"> – </span>
                  <span>{product.name}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
