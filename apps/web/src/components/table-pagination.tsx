"use client";

import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

import {
  Pagination,
  PaginationButton,
  PaginationItem,
  PaginationList,
} from "@cogito-app/ui/components/selia/pagination";
import { Text } from "@cogito-app/ui/components/selia/text";

type TablePaginationProps = {
  targetId?: string;
  label: string;
  pageSize: number;
  page: number;
  itemCount?: number;
  hasNext: boolean;
  isFetching: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

/**
 * Shared pagination chrome for server-paginated tables.
 *
 * `hasNext` is deliberately supplied by the caller because collections use
 * both offset pagination (fetching one sentinel row) and cursor pagination.
 */
export function TablePagination({
  targetId,
  label,
  pageSize,
  page,
  itemCount,
  hasNext,
  isFetching,
  onPrevious,
  onNext,
}: TablePaginationProps) {
  const firstItem = page * pageSize + 1;
  const lastItem = page * pageSize + (itemCount ?? pageSize);
  const rangeLabel =
    itemCount === 0
      ? `No ${label} on this page`
      : `Showing ${firstItem}–${lastItem} ${label}`;

  function changePage(change: () => void) {
    change();
    if (!targetId) return;

    requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      if (!target) return;

      target.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    });
  }

  const previousDisabled = page === 0 || isFetching;
  const nextDisabled = !hasNext || isFetching;

  return (
    <Pagination className="mt-4 flex-col gap-3 border-t border-card-separator pt-4 sm:flex-row sm:items-center sm:justify-between">
      <Text className="text-sm text-muted" aria-live="polite">
        {rangeLabel} · Page {page + 1}
      </Text>
      <PaginationList>
        <PaginationItem>
          <PaginationButton
            type="button"
            aria-label="Previous page"
            aria-controls={targetId}
            disabled={previousDisabled}
            onClick={
              previousDisabled ? undefined : () => changePage(onPrevious)
            }
          >
            <IconChevronLeft /> Previous
          </PaginationButton>
        </PaginationItem>
        <PaginationItem>
          <PaginationButton active aria-label={`Page ${page + 1}`}>
            {page + 1}
          </PaginationButton>
        </PaginationItem>
        <PaginationItem>
          <PaginationButton
            type="button"
            aria-label="Next page"
            aria-controls={targetId}
            disabled={nextDisabled}
            onClick={nextDisabled ? undefined : () => changePage(onNext)}
          >
            Next <IconChevronRight />
          </PaginationButton>
        </PaginationItem>
      </PaginationList>
    </Pagination>
  );
}
