const PAGE_SIZE_CHOICES = [25, 50, 100];

export default function AdminPagination({ page, pageSize, totalCount, onPageChange, onPageSizeChange, pageSizeChoices = PAGE_SIZE_CHOICES }) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="management-pagination">
      <label>
        Per page
        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
          {pageSizeChoices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
        </select>
      </label>
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        Previous
      </button>
      <span>
        Page {page} of {totalPages} ({totalCount} total)
      </span>
      <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        Next
      </button>
    </div>
  );
}
