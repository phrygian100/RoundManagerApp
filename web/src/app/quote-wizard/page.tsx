"use client";

import { MarketingNav } from "@/components/MarketingNav";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";

interface QuoteItem {
  id: string;
  imageUrl: string;
  fileName: string;
  recurringCost: string;
  frequencyWeeks: string;
  isOneOff: boolean;
  oneOffCost: string;
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function QuoteWizardPage() {
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const newItems: QuoteItem[] = [];
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const url = URL.createObjectURL(file);
      newItems.push({
        id: generateId(),
        imageUrl: url,
        fileName: file.name,
        recurringCost: "",
        frequencyWeeks: "",
        isOneOff: false,
        oneOffCost: "",
      });
    });
    setItems((prev) => [...prev, ...newItems]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverId(null);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const updateItem = (id: string, updates: Partial<QuoteItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const removed = prev.find((i) => i.id === id);
      if (removed) URL.revokeObjectURL(removed.imageUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const hasValidItems = items.some(
    (item) =>
      (item.recurringCost && item.frequencyWeeks) ||
      (item.isOneOff && item.oneOffCost)
  );

  const totalRecurring = items.reduce((sum, item) => {
    if (item.recurringCost && item.frequencyWeeks) {
      return sum + parseFloat(item.recurringCost) || sum;
    }
    return sum;
  }, 0);

  const totalOneOff = items.reduce((sum, item) => {
    if (item.isOneOff && item.oneOffCost) {
      return sum + parseFloat(item.oneOffCost) || sum;
    }
    return sum;
  }, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <MarketingNav />

      <div className="py-10 sm:py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
              Quote Wizard
            </h1>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              Upload photos of areas to quote, set a price and frequency for
              each, then share your quote with the customer.
            </p>
          </div>

          {/* Upload Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverId("dropzone");
            }}
            onDragLeave={() => setDragOverId(null)}
            className={`relative border-2 border-dashed rounded-xl p-8 sm:p-12 text-center transition-colors mb-8 cursor-pointer ${
              dragOverId === "dropzone"
                ? "border-indigo-500 bg-indigo-50"
                : "border-gray-300 bg-white hover:border-indigo-400 hover:bg-indigo-50/30"
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <svg
              className="mx-auto h-12 w-12 text-gray-400 mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 48 48"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M28 8H12a4 4 0 00-4 4v20m0 0v4a4 4 0 004 4h24a4 4 0 004-4V24M8 32l9.172-9.172a4 4 0 015.656 0L28 28m8-4v8m-4-4h8m-12-8a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
            <p className="text-gray-700 font-medium text-lg">
              Drop images here or click to browse
            </p>
            <p className="text-gray-500 text-sm mt-1">
              Upload photos of windows, conservatories, gutters &mdash; anything
              you want to quote on
            </p>
          </div>

          {/* Items */}
          {items.length > 0 && (
            <div className="space-y-6 mb-8">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
                >
                  <div className="flex flex-col sm:flex-row">
                    {/* Image preview */}
                    <div className="relative sm:w-64 h-48 sm:h-auto flex-shrink-0 bg-gray-100">
                      <img
                        src={item.imageUrl}
                        alt={item.fileName}
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute top-2 left-2 bg-black/60 text-white text-xs font-semibold px-2 py-1 rounded">
                        #{index + 1}
                      </span>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-colors"
                        title="Remove"
                      >
                        ×
                      </button>
                    </div>

                    {/* Controls */}
                    <div className="flex-1 p-5 sm:p-6 space-y-5">
                      <p className="text-sm text-gray-500 truncate">
                        {item.fileName}
                      </p>

                      {/* Recurring Section */}
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
                          Recurring Service
                        </h3>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <div className="flex-1">
                            <label className="block text-sm text-gray-600 mb-1">
                              Cost per visit
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">
                                £
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={item.recurringCost}
                                onChange={(e) =>
                                  updateItem(item.id, {
                                    recurringCost: e.target.value,
                                  })
                                }
                                className="w-full pl-7 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                              />
                            </div>
                          </div>
                          <div className="flex-1">
                            <label className="block text-sm text-gray-600 mb-1">
                              Every
                            </label>
                            <select
                              value={item.frequencyWeeks}
                              onChange={(e) =>
                                updateItem(item.id, {
                                  frequencyWeeks: e.target.value,
                                })
                              }
                              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 bg-white"
                            >
                              <option value="">Select frequency</option>
                              {Array.from({ length: 12 }, (_, i) => i + 1).map(
                                (w) => (
                                  <option key={w} value={String(w)}>
                                    {w} {w === 1 ? "week" : "weeks"}
                                  </option>
                                )
                              )}
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-gray-200" />
                        <span className="text-xs font-medium text-gray-400 uppercase">
                          and / or
                        </span>
                        <div className="flex-1 h-px bg-gray-200" />
                      </div>

                      {/* One-Off Section */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={item.isOneOff}
                              onChange={(e) =>
                                updateItem(item.id, {
                                  isOneOff: e.target.checked,
                                })
                              }
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-gray-300 peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                          </label>
                          <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
                            One-Off
                          </h3>
                        </div>
                        {item.isOneOff && (
                          <div className="max-w-xs">
                            <label className="block text-sm text-gray-600 mb-1">
                              One-off cost
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">
                                £
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={item.oneOffCost}
                                onChange={(e) =>
                                  updateItem(item.id, {
                                    oneOffCost: e.target.value,
                                  })
                                }
                                className="w-full pl-7 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Summary */}
          {hasValidItems && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-8">
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                Quote Summary
              </h2>
              <div className="space-y-3">
                {items.map(
                  (item, index) =>
                    ((item.recurringCost && item.frequencyWeeks) ||
                      (item.isOneOff && item.oneOffCost)) && (
                      <div
                        key={item.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-2 border-b border-gray-100 last:border-0"
                      >
                        <span className="text-gray-700 font-medium">
                          Item #{index + 1}{" "}
                          <span className="text-gray-400 font-normal">
                            ({item.fileName})
                          </span>
                        </span>
                        <div className="flex flex-wrap gap-3 text-sm">
                          {item.recurringCost && item.frequencyWeeks && (
                            <span className="inline-flex items-center bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-medium">
                              £{parseFloat(item.recurringCost).toFixed(2)} every{" "}
                              {item.frequencyWeeks}{" "}
                              {item.frequencyWeeks === "1" ? "week" : "weeks"}
                            </span>
                          )}
                          {item.isOneOff && item.oneOffCost && (
                            <span className="inline-flex items-center bg-amber-50 text-amber-700 px-3 py-1 rounded-full font-medium">
                              £{parseFloat(item.oneOffCost).toFixed(2)} one-off
                            </span>
                          )}
                        </div>
                      </div>
                    )
                )}

                <div className="pt-3 mt-2 border-t border-gray-200 space-y-1">
                  {totalRecurring > 0 && (
                    <div className="flex justify-between text-gray-800">
                      <span className="font-medium">
                        Total recurring per visit
                      </span>
                      <span className="font-bold">
                        £{totalRecurring.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {totalOneOff > 0 && (
                    <div className="flex justify-between text-gray-800">
                      <span className="font-medium">Total one-off</span>
                      <span className="font-bold">
                        £{totalOneOff.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {items.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <p>Upload images above to start building your quote</p>
            </div>
          )}

          {/* Footer nav */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Link
              href="/guides"
              className="inline-flex justify-center border border-indigo-600 text-indigo-600 hover:bg-indigo-50 px-5 py-3 rounded-lg font-semibold transition-colors"
            >
              Back to Guides
            </Link>
            <Link
              href="/contact"
              className="inline-flex justify-center bg-indigo-600 text-white hover:bg-indigo-700 px-5 py-3 rounded-lg font-semibold transition-colors"
            >
              Ask a question
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div>
              <Image
                src="/logo_colourInverted.png"
                alt="Guvnor Logo"
                width={96}
                height={32}
                className="w-24"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
              <div>
                <h4 className="font-semibold mb-4">Product</h4>
                <ul className="space-y-2 text-gray-400">
                  <li>
                    <Link href="/feature-tour" className="hover:text-white">
                      Features
                    </Link>
                  </li>
                  <li>
                    <Link href="/guides" className="hover:text-white">
                      Guides
                    </Link>
                  </li>
                  <li>
                    <Link href="/pricing" className="hover:text-white">
                      Pricing
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4">Company</h4>
                <ul className="space-y-2 text-gray-400">
                  <li>
                    <Link href="/about" className="hover:text-white">
                      About
                    </Link>
                  </li>
                  <li>
                    <Link href="/contact" className="hover:text-white">
                      Contact
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4">Support</h4>
                <ul className="space-y-2 text-gray-400">
                  <li>
                    <Link href="/contact" className="hover:text-white">
                      Help Center
                    </Link>
                  </li>
                  <li>
                    <Link href="/" className="hover:text-white">
                      Sign In
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4">Legal</h4>
                <ul className="space-y-2 text-gray-400">
                  <li>
                    <Link href="/privacy-policy" className="hover:text-white">
                      Privacy Policy
                    </Link>
                  </li>
                  <li>
                    <span className="text-gray-500">Terms of Service</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2025 Guvnor. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
