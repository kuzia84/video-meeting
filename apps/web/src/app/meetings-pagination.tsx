import { Pagination } from '@heroui/react';
import { ELLIPSIS, paginationRange } from './pagination-range';

/** Windowed page navigation for the home meeting list (capped at 7 slots). */
export function MeetingsPagination({
  page,
  pageCount,
  isPaging,
  onPage,
}: {
  page: number;
  pageCount: number;
  isPaging: boolean;
  onPage: (page: number) => void;
}) {
  return (
    <Pagination className="justify-center" aria-label="Навигация по страницам встреч">
      <Pagination.Content>
        <Pagination.Item>
          <Pagination.Previous isDisabled={page === 1 || isPaging} onPress={() => onPage(page - 1)}>
            <Pagination.PreviousIcon />
            <span>Назад</span>
          </Pagination.Previous>
        </Pagination.Item>
        {paginationRange(page, pageCount).map((slot, index) =>
          slot === ELLIPSIS ? (
            // Index as key is safe here: the ellipses have no identity of their own and
            // never reorder relative to the numbers.
            <Pagination.Item key={`gap-${index}`}>
              <Pagination.Ellipsis />
            </Pagination.Item>
          ) : (
            <Pagination.Item key={slot}>
              <Pagination.Link
                isActive={slot === page}
                isDisabled={isPaging}
                onPress={() => onPage(slot)}
              >
                {slot}
              </Pagination.Link>
            </Pagination.Item>
          ),
        )}
        <Pagination.Item>
          <Pagination.Next
            isDisabled={page === pageCount || isPaging}
            onPress={() => onPage(page + 1)}
          >
            <span>Вперёд</span>
            <Pagination.NextIcon />
          </Pagination.Next>
        </Pagination.Item>
      </Pagination.Content>
    </Pagination>
  );
}
