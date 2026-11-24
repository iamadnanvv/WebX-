import { formatAED, formatINR } from '../lib/money.ts';
import { useAuth } from '../context/AuthContext.tsx';

interface CurrencyDualDisplayProps {
  aedAmount: string | number;
  inrAmount: string | number | null | undefined;
  rate?: string | number | null;
  rateDate?: string;
  showRateLabel?: boolean;
  align?: 'left' | 'right';
  tone?: 'neutral' | 'credit' | 'debit';
  size?: 'sm' | 'md' | 'lg';
}

export function CurrencyDualDisplay({
  aedAmount,
  inrAmount,
  rate,
  rateDate,
  showRateLabel = false,
  align = 'left',
  tone = 'neutral',
  size = 'md',
}: CurrencyDualDisplayProps) {
  const { primaryCurrency } = useAuth();

  const aedFormatted = formatAED(aedAmount);
  const inrAvailable = inrAmount !== null && inrAmount !== undefined && inrAmount !== '';
  const inrFormatted = inrAvailable ? formatINR(inrAmount) : 'INR rate unavailable';

  const primaryText = primaryCurrency === 'AED' ? aedFormatted : inrFormatted;
  const secondaryText = primaryCurrency === 'AED' ? inrFormatted : aedFormatted;

  const toneClass =
    tone === 'credit'
      ? 'text-emerald-700'
      : tone === 'debit'
        ? 'text-red-700'
        : 'text-slate-900';

  const primarySizeClass =
    size === 'lg'
      ? 'text-xl font-semibold'
      : size === 'sm'
        ? 'text-xs font-medium'
        : 'text-sm font-semibold';

  const alignClass = align === 'right' ? 'text-right items-end' : 'text-left items-start';

  return (
    <div className={`flex flex-col ${alignClass}`}>
      <span className={`font-mono tabular-nums ${primarySizeClass} ${toneClass}`}>
        {primaryText}
      </span>
      <span className="font-mono tabular-nums text-xs text-slate-500">
        {secondaryText}
      </span>
      {showRateLabel && rate && rateDate && (
        <span className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
          Rate: 1 AED = ₹{Number(rate).toFixed(2)} on {rateDate}
        </span>
      )}
    </div>
  );
}
