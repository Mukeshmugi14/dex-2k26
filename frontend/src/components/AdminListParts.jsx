import { useEffect, useState } from "react";
import "./AdminListParts.css";

// Pagination bar: "Showing 1–20 of 250 · Previous 1 2 3 … Next".
export function AdminPagination({ page, pages, total, limit, onChange, label = "records" }) {
  if (!total) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const numbers = [];
  for (let n = Math.max(1, page - 2); n <= Math.min(pages, page + 2); n += 1) numbers.push(n);
  return <nav className="admin-pagination" aria-label="Pagination">
    <span>Showing {from}–{to} of {total} {label}</span>
    {pages > 1 ? <div>
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1}>Previous</button>
      {numbers[0] > 1 ? <><button type="button" onClick={() => onChange(1)}>1</button>{numbers[0] > 2 ? <em>…</em> : null}</> : null}
      {numbers.map((n) => <button type="button" key={n} className={n === page ? "active" : ""} aria-current={n === page ? "page" : undefined} onClick={() => onChange(n)}>{n}</button>)}
      {numbers[numbers.length - 1] < pages ? <>{numbers[numbers.length - 1] < pages - 1 ? <em>…</em> : null}<button type="button" onClick={() => onChange(pages)}>{pages}</button></> : null}
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= pages}>Next</button>
    </div> : null}
  </nav>;
}

// Lightweight placeholder shown while a list loads.
export function AdminSkeleton({ rows = 5, variant = "rows" }) {
  return <div className={`admin-skeleton admin-skeleton-${variant}`} aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }, (_, index) => <div key={index} className="admin-skeleton-item"><i /><i /><i /></div>)}
  </div>;
}

// Debounced value for search boxes, so typing doesn't fire a request per keystroke.
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// Client-side paging for small lists that are already fully loaded.
export function usePagedList(items, limit = 24, resetKey = "") {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [resetKey]);
  const pages = Math.max(Math.ceil(items.length / limit), 1);
  const current = Math.min(page, pages);
  return { pageItems: items.slice((current - 1) * limit, current * limit), page: current, pages, total: items.length, limit, setPage };
}
