import { useState } from 'react';
import Decimal from 'decimal.js';
import { ArrowLeftRight } from 'lucide-react';
import { formatAED, formatINR } from '../lib/money.ts';
import { useAuth } from '../context/AuthContext.tsx';

export function CurrencyConverterWidget({ compact = false }: { compact?: boolean }) {
  const { rateInfo } = useAuth();
  const [direction, setDirection] = useState<'AED_TO_INR' | 'INR_TO_AED'>('AED_TO_INR');
  const [amountInput, setAmountInput] = useState('1000');

  const rateAvailable = Boolean(rateInfo?.rateAvailable && rateInfo?.rate);
  const rate = rateAvailable && rateInfo?.rate ? new Decimal(rateInfo.rate) : null;
  const rateDate = rateInfo?.rateDate || '—';

  let convertedDisplay = '';
  let numericValid = false;
  if (rate) {
    try {
      if (amountInput.trim() !== '' && Number(amountInput) >= 0) {
        const val = new Decimal(amountInput);
        numericValid = true;
        if (direction === 'AED_TO_INR') {
          convertedDisplay = formatINR(val.mul(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
        } else {
          convertedDisplay = formatAED(val.div(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
        }
      }
    } catch {
      numericValid = false;
    }
  }

  return (
    <div
      className={
        compact
          ? 'w-72 p-4 bg-white border border-slate-200 rounded-lg shadow-lg'
          : 'bg-white border border-slate-200 rounded-lg p-5'
      }
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Currency Converter</h3>
          <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
            {rateAvailable && rateInfo?.rate
              ? `Rate: 1 AED = ₹${Number(rateInfo.rate).toFixed(4)} on ${rateDate}`
              : 'Live rate unavailable'}
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            setDirection((d) => (d === 'AED_TO_INR' ? 'INR_TO_AED' : 'AED_TO_INR'))
          }
          title="Swap AED / INR direction"
          className="p-2 rounded-md border border-slate-200 text-slate-600 hover:text-blue-700 hover:border-blue-300 transition-colors shrink-0"
        >
          <ArrowLeftRight className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            {direction === 'AED_TO_INR' ? 'Amount in AED' : 'Amount in INR (₹)'}
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500">
              {direction === 'AED_TO_INR' ? 'AED' : '₹'}
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="w-full pl-11 pr-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2.5">
          <div className="text-xs text-slate-500 mb-0.5">
            {direction === 'AED_TO_INR' ? 'Converted Value (INR)' : 'Converted Value (AED)'}
          </div>
          <div className="text-base font-semibold font-mono tabular-nums text-slate-900">
            {!rateAvailable
              ? 'Rate unavailable'
              : numericValid
                ? convertedDisplay
                : '—'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Source: {rateInfo?.source || 'UNAVAILABLE'} · Asia/Dubai (GST)
          </div>
        </div>
      </div>
    </div>
  );
}
