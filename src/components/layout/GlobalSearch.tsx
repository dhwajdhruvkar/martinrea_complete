import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, Search } from 'lucide-react';
import { useInvoicesList } from '@/hooks/useInvoices';
import { StatusBadge } from '@/components/invoices/StatusBadge';
import { cn, formatCurrency } from '@/lib/utils';

const MAX_SUGGESTIONS = 6;

export function GlobalSearch() {
  const navigate = useNavigate();
  const { invoices } = useInvoicesList();
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const term = q.trim().toLowerCase();

  const results = useMemo(() => {
    if (!term) return [];
    return invoices
      .filter(
        (i) =>
          i.invoiceNumber.toLowerCase().includes(term) ||
          i.supplierName.toLowerCase().includes(term) ||
          (i.poNumber?.toLowerCase().includes(term) ?? false) ||
          (i.supplierId?.toLowerCase().includes(term) ?? false),
      )
      .slice(0, MAX_SUGGESTIONS);
  }, [term, invoices]);

  const open = focused && term.length > 0;
  const rowCount = results.length + 1; // last row = "search all"

  function close() {
    setFocused(false);
    setActive(0);
  }

  function openInvoice(id: string) {
    setQ('');
    close();
    navigate(`/invoices/${id}`);
  }

  function searchAll() {
    if (!term) return;
    close();
    navigate(`/invoices?q=${encodeURIComponent(q.trim())}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      close();
      (e.target as HTMLInputElement).blur();
      return;
    }
    if (!open) {
      if (e.key === 'Enter') searchAll();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % rowCount);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + rowCount) % rowCount);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active < results.length) openInvoice(results[active].id);
      else searchAll();
    }
  }

  return (
    <div className="relative ml-6 hidden flex-1 max-w-md md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
      <input
        id="global-search"
        type="text"
        autoComplete="off"
        value={q}
        placeholder="Search invoices, suppliers, POs…"
        className="h-9 w-full rounded-md border border-line bg-canvas pl-9 pr-16 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
        onFocus={() => {
          if (closeTimer.current) clearTimeout(closeTimer.current);
          setFocused(true);
        }}
        onBlur={() => {
          // Delay so a click on a suggestion registers before we close.
          closeTimer.current = setTimeout(() => setFocused(false), 120);
        }}
        onKeyDown={onKeyDown}
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 select-none items-center gap-0.5 rounded border border-line bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink-muted md:inline-flex">
        ⌘K
      </kbd>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-lg border border-line bg-white shadow-elevated">
          {results.length > 0 ? (
            <ul className="max-h-[320px] overflow-y-auto py-1">
              {results.map((inv, idx) => (
                <li key={inv.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      openInvoice(inv.id);
                    }}
                    onMouseEnter={() => setActive(idx)}
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-2 text-left',
                      idx === active ? 'bg-canvas' : 'bg-white',
                    )}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10.5px] font-semibold text-ink-muted">
                      {inv.supplierName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-ink">
                        {inv.invoiceNumber}
                        <span className="ml-1.5 font-normal text-ink-muted">
                          · {inv.supplierName}
                        </span>
                      </p>
                      <p className="truncate text-[11.5px] text-ink-subtle">
                        {inv.poNumber ? `${inv.poNumber} · ` : ''}
                        {formatCurrency(Number(inv.totalAmount), inv.currency)}
                      </p>
                    </div>
                    <StatusBadge status={inv.status} size="sm" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-3 text-[12.5px] text-ink-muted">
              No invoices match “{q.trim()}”.
            </p>
          )}

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              searchAll();
            }}
            onMouseEnter={() => setActive(results.length)}
            className={cn(
              'flex w-full items-center gap-2 border-t border-line px-3 py-2.5 text-left text-[12.5px] font-medium text-brand',
              active === results.length ? 'bg-brand-50' : 'bg-white',
            )}
          >
            <Search className="h-3.5 w-3.5" />
            Search all invoices for “{q.trim()}”
            <CornerDownLeft className="ml-auto h-3.5 w-3.5 text-ink-subtle" />
          </button>
        </div>
      )}
    </div>
  );
}
